import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.js';
import {isolatedRepository} from './repositories/test-database.js';
import {fakeAuthOptions,loginAsTestUser} from './test-support/auth.js';
import {SyncJobService} from './services/sync-job.service.js';
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
    await db.client.monitoredChannel.create({data:{id:'channel-sync',guildId:'guild-1',name:'Sync'}});
    const jobs=new SyncJobService(db.repo);
    const completed=await jobs.create('guild-1',false);
    await jobs.claim();await jobs.update(completed.jobId,{completedChannels:1,status:'COMPLETED'});
    const successful=(await jobs.get(completed.jobId,'guild-1')).completedAt;
    data=await summary();assert.equal(data.sync.lastSuccessfulAt,successful);assert.equal(data.sync.latestJob.status,'COMPLETED');
    const active=await jobs.create('guild-1',false);
    data=await summary();assert.equal(data.sync.latestJob.jobId,active.jobId);assert.equal(data.sync.latestJob.status,'QUEUED');assert.equal(data.sync.lastSuccessfulAt,successful);
    await jobs.claim();data=await summary();assert.equal(data.sync.latestJob.status,'PROCESSING');
    await jobs.update(active.jobId,{failedChannels:1,status:'FAILED',errorMessage:'AI unavailable'});
    data=await summary();assert.equal(data.sync.latestJob.status,'FAILED');assert.equal(data.sync.latestJob.errorMessage,'AI unavailable');assert.equal(data.sync.lastSuccessfulAt,successful);
    const other=await summary('guild-2');assert.equal(other.sync.latestJob,null);assert.equal(other.sync.lastSuccessfulAt,null);
    for(let index=0;index<6;index++)await db.repo.saveDecision(DecisionSchema.parse({id:`recent-${index}`,state:'Decided',topic:'Recent',decision:'Choice',rationale:'Evidence',source:{guildId:'guild-1',channelId:'c',triggerMessageId:'m',participants:[]},createdAt:'2026-01-01T00:00:00.000Z',decisionConfirmedDate:`2027-01-0${index+1}T00:00:00.000Z`}));
    data=await summary();assert.deepEqual(data.recentDecisions.map((d:any)=>d.id),['recent-5','recent-4','recent-3','recent-2','recent-1']);
    assert.equal((await fetch(`${base}/api/v1/dashboard?guildId=guild-1`)).status,401);
    assert.equal((await fetch(`${base}/api/v1/dashboard?guildId=unknown`,{headers})).status,403);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await db.cleanup();}
});
