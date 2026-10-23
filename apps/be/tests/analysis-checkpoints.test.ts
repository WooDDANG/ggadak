import { expect, test } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { AnalysisRequestRepository } from '../src/repositories/analysis-request.repository.js';
import { prepareAnalysis } from '../src/services/discussion-preprocessing.js';
import { AiAdapter } from '../src/adapters/ai.adapter.js';

test('session checkpoints preserve immutable input and independent sibling state', async () => {
  const db = await isolatedRepository();
  const input = {
    requestId: 'checkpoint',
    guildId: 'g',
    channelId: 'c',
    isManualOverride: true,
    rawMessages: [{ id: '1', author: 'Lee', content: 'DB를 선택해야 합니다' }],
  };
  const repo = new AnalysisRequestRepository(db.repo);
  try {
    const { owner } = await repo.claim(input);
    const workflow = prepareAnalysis(input, new AiAdapter({ provider: 'mock' }, 'test').settings);
    workflow.sessions.push({ ...structuredClone(workflow.sessions[0]), id: 'second' });
    // An in-progress version-1 request from the previous release remains resumable.
    await db.client.analysisRequest.update({
      where: { id: input.requestId },
      data: { workflowJson: JSON.stringify(workflow) },
    });
    await repo.checkpoint(input.requestId, owner, workflow, input);
    const raw = await db.client.analysisRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });
    expect(JSON.parse(raw.workflowJson!).version).toBe(2);
    expect(raw.workflowJson).not.toContain('DB를 선택해야');
    expect(raw.workflowJson!.length).toBeLessThan(JSON.stringify(workflow).length);
    workflow.sessions[0].phase = 'verify';
    workflow.sessions[1].phase = 'check';
    await Promise.all(
      workflow.sessions.map(session =>
        repo.checkpoint(input.requestId, owner, workflow, input, session),
      ),
    );
    const restored = JSON.parse((await repo.get(input.requestId))!.workflowJson!);
    expect(restored.sessions.map((session: { phase: string }) => session.phase)).toEqual([
      'verify',
      'check',
    ]);
    expect(restored.sessions[0].transcript).toContain('DB를 선택해야');
    const rows = await db.client.analysisSessionState.findMany();
    expect(rows.every(row => !row.stateJson.includes('DB를 선택해야'))).toBe(true);
  } finally {
    await db.cleanup();
  }
});
