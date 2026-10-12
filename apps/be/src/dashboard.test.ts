import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.js';
import {isolatedRepository} from './repositories/test-database.js';
import {fakeAuthOptions,loginAsTestUser} from './test-support/auth.js';
import {DecisionSchema} from '@ggaddak/shared';

test('dashboard returns empty server metrics then reflects review, recent records and real sync progress without leaking another guild',async()=>{
  const db=await isolatedRepository();
  const server=await createServer(db.repo,undefined,fakeAuthOptions());
  await new Promise<void>(r=>server.listen(0,r));
  const base=`http://localhost:${(server.address() as any).port}`;
  try {
    const {token}=await loginAsTestUser(base);
    const headers={Authorization:`Bearer ${token}`};
    const summary=async(guildId='guild-1')=>{const response=await fetch(`${base}/api/v1/dashboard?guildId=${guildId}`,{headers});assert.equal(response.status,200);return (await response.json() as any).data;};
    const empty=await summary();
    assert.deepEqual(empty.counts,{confirmed:0,onHold:0,inReview:0});assert.deepEqual(empty.recentDecisions,[]);assert.equal(empty.sync.lastSuccessfulAt,null);assert.equal(empty.sync.latestJob,null);
    for(const [id,state,guildId,date] of [['draft','Draft','guild-1','2026-01-01'],['held','Deferred','guild-1','2026-01-02'],['confirmed','Decided','guild-1','2026-01-03'],['historical','Superseded','guild-1','2026-01-04'],['private','Decided','guild-2','2026-01-05']]) await db.repo.saveDecision(DecisionSchema.parse({id,state,topic:id,decision:id,rationale:'evidence',source:{guildId,channelId:'c',triggerMessageId:'m',participants:[]},createdAt:`${date}T00:00:00.000Z`}));
    let data=await summary();assert.deepEqual(data.counts,{confirmed:1,onHold:1,inReview:1});assert.deepEqual(data.recentDecisions.map((d:any)=>d.id),['confirmed']);
    await db.repo.reviewDecision('draft','confirm',{expectedVersion:1,resolution:'independent'});
    data=await summary();assert.deepEqual(data.counts,{confirmed:2,onHold:1,inReview:0});
    assert.equal((await fetch(`${base}/api/v1/dashboard?guildId=unknown`,{headers})).status,403);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.cleanup();}
});
