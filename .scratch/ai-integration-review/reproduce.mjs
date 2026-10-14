// Historical pre-Agentic reproduction; run only against the reviewed b327749 checkout.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { AiAdapter } from '../../apps/be/dist/adapters/ai.adapter.js';
import { ExtractionResultSchema } from '../../apps/be/dist/extractor/schemas.js';
import { DiscussionService } from '../../apps/be/dist/services/discussion.service.js';
import { DecisionExtractorCore } from '../../apps/be/dist/engine/extractor-core.js';
import { isolatedRepository } from '../../apps/be/dist/repositories/test-database.js';

// All provider responses are injected. Real network access is forbidden in this probe.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Live AI is disabled in review probes'); };
const gemini = result => new AiAdapter(
  { provider: 'gemini', geminiApiKey: 'fixture' }, 'production',
  async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }),
);
const transcript = 'Lee: We have decided to adopt SQLite because local deployment is simple.';
const valid = { topic: 'Storage', decision: 'Use SQLite', rationale: 'Simple deployment' };
try {
  const missing = await gemini({ found: true, summary: 'A decision exists' }).analyzeTranscript(transcript);
  assert.deepEqual(missing.decisions, []);
  console.log('CONFIRMED: found=true with missing decisions is accepted as an empty list');
  assert.equal(ExtractionResultSchema.safeParse({ found: false, summary: 'None', decisions: [valid] }).success, true);
  console.log('CONFIRMED: found=false with a nonempty decisions list passes the response schema');

  const db = await isolatedRepository();
  try {
    const adapter = gemini({ found: true, summary: 'Blank', decisions: [{ topic: '', decision: '', rationale: '' }] });
    const service = new DiscussionService(db.repo, adapter, new DecisionExtractorCore());
    const result = await service.analyzeDiscussion({
      requestId: 'blank-provider-response', guildId: 'review', channelId: 'channel', isManualOverride: true,
      rawMessages: [{ id: '101', author: 'Lee', content: transcript, createdAt: '2026-10-13T00:00:00Z' }],
    });
    assert.equal(result.decisions.length, 1);
    assert.equal((await db.repo.getDecisionById(result.decisions[0].id)).decision, '');
    console.log('CONFIRMED: empty topic/decision/rationale from production AiAdapter becomes a persisted Draft');
  } finally { await db.cleanup(); }

  const response = text => Response.json({
    object: 'chat.completion', choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [
      { id: 'call_fixture', type: 'function', function: { name: 'json', arguments: text } },
    ] } }], usage: { prompt_tokens: 10, completion_tokens: 10 },
  });
  let globalCalls = 0;
  let injectedCalls = 0;
  globalThis.fetch = async () => { globalCalls++; return response(JSON.stringify({ found: false, summary: 'None', decisions: [] })); };
  const openai = new AiAdapter({ provider: 'openai', openaiApiKey: 'fixture' }, 'production', async () => {
    injectedCalls++; throw new Error('The injected transport should be used');
  });
  await openai.analyzeTranscript(transcript);
  assert.equal(globalCalls, 1);
  assert.equal(injectedCalls, 0);
  console.log('CONFIRMED: OpenAI uses global fetch instead of the injected transport');
  for (const [label, text] of [
    ['malformed JSON', '{invalid'],
    ['wrong schema', JSON.stringify({ found: 'yes', summary: 'bad', decisions: [] })],
  ]) {
    globalThis.fetch = async () => response(text);
    await assert.rejects(openai.analyzeTranscript(transcript), error => {
      assert.equal(error.statusCode, 503);
      console.log(`CONFIRMED: OpenAI ${label} is classified as retryable 503`);
      return true;
    });
  }
} finally { globalThis.fetch = originalFetch; }
