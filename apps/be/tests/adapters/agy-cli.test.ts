import { test, expect } from 'vitest';
import { mkdtemp, writeFile, chmod, rm, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';
import { runAgyCli } from '../../src/adapters/agy-cli.js';

test('AGY adapter routes all workflow stages without API credentials or HTTP fallback', async () => {
  const requests: any[] = [];
  const graph = { summary: '대화', nodes: [], edges: [], discussionProblems: [] };
  const adapter = new AiAdapter(
    { provider: 'agy' },
    'production',
    async () => {
      throw new Error('No HTTP');
    },
    async request => {
      requests.push(request);
      return {
        value: requests.length === 2 ? { valid: true, issues: [] } : graph,
        usage: { inputTokens: 10, outputTokens: 3 },
      };
    },
  );
  const context = { settings: adapter.settings, signal: new AbortController().signal };
  expect((await adapter.extractGraph('PostgreSQL로 가자', context)).value).toEqual(graph);
  await adapter.verifyGraph('input', graph, context);
  await adapter.repairGraph('input', graph, ['missing proposal'], context);
  expect(requests).toHaveLength(3);
  expect(requests[0]).toMatchObject({
    executable: 'agy',
    model: 'gemini-3.8-flash-low',
    signal: context.signal,
  });
  expect(requests[0].prompt).toContain('PostgreSQL로 가자');
  expect(requests[2].prompt).toContain('missing proposal');
  expect(JSON.stringify(requests[0].schema)).not.toContain('maxItems');
});

test('stage models can differ while omitted stages and legacy settings keep the base model', async () => {
  const models: string[] = [];
  const adapter = new AiAdapter(
    { provider: 'agy', model: 'default', stageModels: { extract: 'fast', verify: 'critic' } },
    'production',
    undefined,
    async request => {
      models.push(request.model);
      return { value: {}, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  );
  const context = { settings: adapter.settings, signal: new AbortController().signal };
  await adapter.extractGraph('input', context);
  await adapter.verifyGraph('input', {}, context);
  await adapter.repairGraph('input', {}, [], context);
  await adapter.generateStructured(
    'baseline',
    'system',
    { transcript: 'input' },
    context,
    (await import('../../src/domain/decision-graph.js')).GraphSchema,
  );
  const { stageModels: _models, ...legacy } = adapter.settings;
  await adapter.verifyGraph('input', {}, { ...context, settings: legacy });
  expect(models).toEqual(['fast', 'critic', 'default', 'default', 'default']);
});

async function fakeCli(body: string) {
  const directory = await mkdtemp(join(tmpdir(), 'ggaddak-fake-agy-'));
  const executable = join(directory, 'agy');
  await writeFile(executable, '#!/usr/bin/env node\n' + body);
  await chmod(executable, 0o700);
  return { executable, cleanup: () => rm(directory, { recursive: true, force: true }) };
}
const request = (executable: string, signal = new AbortController().signal) => ({
  executable,
  signal,
  model: 'fixture',
  prompt: '한국어 입력',
  schema: { type: 'object' },
});

test('CLI uses isolated directory, stdin/schema file and finish-only agent; secrets are excluded', async () => {
  const fixture = await fakeCli(`
const fs = require('node:fs');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const agent = fs.readFileSync('.agents/agents/ggaddak-analysis.md', 'utf8');
  const good = agent.includes('tools: [finish]') && args.includes('--new-project') && !args.includes('--continue') && !args.includes('--dangerously-skip-permissions') && JSON.parse(input).message.content === '한국어 입력' && !process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.BOT_SERVICE_TOKEN;
  console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',structured_output:{good,cwd:process.cwd()},usage:{input_tokens:11,output_tokens:3}}}));
});`);
  try {
    const result = await runAgyCli(request(fixture.executable));
    expect(result).toMatchObject({
      value: { good: true },
      usage: { inputTokens: 11, outputTokens: 3 },
    });
    await expect(access((result.value as { cwd: string }).cwd)).rejects.toThrow();
  } finally {
    await fixture.cleanup();
  }
});

test.each([
  ['malformed', `process.stdout.write('not json\\n');`, 422],
  [
    'missing structured output',
    `console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'{}'}}));`,
    422,
  ],
  [
    'login',
    `console.log(JSON.stringify({event:'result',result:{status:'ERROR',error:'authentication required'}}));process.exitCode=1;`,
    422,
  ],
  [
    'quota',
    `console.log(JSON.stringify({event:'result',result:{status:'ERROR',error:'quota exceeded'}}));process.exitCode=1;`,
    503,
  ],
])('CLI %s fails explicitly', async (_name, body, statusCode) => {
  const fixture = await fakeCli(body);
  try {
    await expect(runAgyCli(request(fixture.executable))).rejects.toMatchObject({ statusCode });
  } finally {
    await fixture.cleanup();
  }
});

test('canceling a CLI attempt terminates its process instead of leaving work running', async () => {
  const fixture = await fakeCli('process.stdin.resume();setInterval(() => {},1000);');
  const abort = new AbortController();
  try {
    const call = runAgyCli(request(fixture.executable, abort.signal));
    const timer = setTimeout(() => abort.abort(), 100);
    await expect(call).rejects.toMatchObject({ statusCode: 503, message: 'AGY analysis canceled' });
    clearTimeout(timer);
  } finally {
    await fixture.cleanup();
  }
});

test('missing CLI executable and quota failures have distinct operational errors', async () => {
  await expect(runAgyCli(request('/__ggaddak_no_such_executable__'))).rejects.toMatchObject({
    statusCode: 503,
    message: 'AGY executable not found',
  });
  const fixture = await fakeCli(
    `console.log(JSON.stringify({event:'result',result:{status:'ERROR',error:'quota exceeded'}}));process.exitCode=1;`,
  );
  try {
    await expect(runAgyCli(request(fixture.executable))).rejects.toMatchObject({
      statusCode: 503,
      message: 'AGY quota exhausted; retry later',
    });
  } finally {
    await fixture.cleanup();
  }
});

test.each(['cancel', 'complete'])(
  'CLI %s terminates descendants that ignore SIGTERM after the leader exits',
  async mode => {
    const directory = await mkdtemp(join(tmpdir(), 'ggaddak-agy-descendant-'));
    const pidPath = join(directory, 'pid');
    const fixture = await fakeCli(`
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);console.log('ready');"],{stdio:['ignore','pipe','ignore']});
child.stdout.once('data',()=>{fs.writeFileSync(${JSON.stringify(pidPath)},String(child.pid));child.stdout.destroy();child.unref();
if (${JSON.stringify(mode)} === 'complete') process.stdout.write(JSON.stringify({event:'result',result:{status:'SUCCESS',structured_output:{ok:true},usage:{input_tokens:1,output_tokens:1}}})+'\\n',()=>process.exit(0));
});
process.stdin.resume();setInterval(()=>{},1000);
`);
    const abort = new AbortController();
    let pid: number | undefined;
    const call = runAgyCli(request(fixture.executable, abort.signal));
    const outcome =
      mode === 'cancel'
        ? expect(call).rejects.toMatchObject({ statusCode: 503 })
        : expect(call).resolves.toMatchObject({ value: { ok: true } });
    try {
      for (let i = 0; i < 100 && !pid; i++) {
        try {
          pid = Number(await readFile(pidPath, 'utf8'));
        } catch {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      expect(pid).toBeDefined();
      if (mode === 'cancel') abort.abort();
      await outcome;
      let alive = true;
      for (let i = 0; i < 50 && alive; i++) {
        try {
          process.kill(pid!, 0);
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      abort.abort();
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* Already gone. */
        }
      }
      await outcome;
      await fixture.cleanup();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
