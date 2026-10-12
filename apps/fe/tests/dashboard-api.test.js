import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const bundle=buildSync({entryPoints:['src/api/dashboard.api.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {loadDashboard,dashboardQueryKey}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('dashboard client scopes metrics to the selected guild and surfaces HTTP failures',async()=>{
  const previous=globalThis.fetch;
  let fail=false;
  globalThis.fetch=async url=>{
    assert.equal(url,'/api/v1/dashboard?guildId=guild-1');
    return new Response(JSON.stringify(fail?{success:false,message:'Forbidden'}:{success:true,data:{counts:{confirmed:2,onHold:1,inReview:0},recentDecisions:[],sync:{lastSuccessfulAt:null,latestJob:{status:'FAILED',errorMessage:'AI unavailable'}}}}),{status:fail?403:200});
  };
  try {const summary=await loadDashboard('guild-1');assert.equal(summary.counts.confirmed,2);assert.equal(summary.sync.latestJob.errorMessage,'AI unavailable');assert.notDeepEqual(dashboardQueryKey('guild-1'),dashboardQueryKey('guild-2'));fail=true;await assert.rejects(loadDashboard('guild-1'),/Forbidden/);}finally{globalThis.fetch=previous;}
});
