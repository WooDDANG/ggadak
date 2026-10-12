import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
function moduleUrl(path, transform = s=>s) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
  return 'data:text/javascript;base64,'+Buffer.from(transform(compiled)).toString('base64');
}
test('Decision Card flow sends server filters and pagination through generated clients and retrieves string-ID detail', async()=>{
  const sessionUrl = moduleUrl('./session.ts');
  const transportUrl = moduleUrl('./transport.ts', s=>s.replace("'./session'",JSON.stringify(sessionUrl)));
  const generatedUrl = moduleUrl('./generated/index.ts', s=>s.replace("'../transport'",JSON.stringify(transportUrl)).replace("'@tanstack/react-query'",JSON.stringify(pathToFileURL(require.resolve('@tanstack/react-query')).href)));
  const clientUrl = moduleUrl('./client.ts',s=>s.replace("'./transport'",JSON.stringify(transportUrl)));
  const {decisionsApi} = await import(moduleUrl('./decisions.api.ts',s=>s.replace("'./generated'",JSON.stringify(generatedUrl)).replace("'./client'",JSON.stringify(clientUrl))));
  const session = await import(sessionUrl);
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({success:true,data:requests.length===1?{items:[{id:'DEC-old'}],decisions:[],pageInfo:{currentPage:2,pageSize:1,totalElements:2,totalPages:2}}:{id:'DEC-old',status:'SUPERSEDED',supersededById:'DEC-new'}}),{status:200});
  };
  try {
    session.setAccessToken('member-token');
    const cards = await decisionsApi.browse({guildId:'g1',status:'CONFIRMED',category:'기술',page:2,size:1});
    assert.equal(cards.items[0].id,'DEC-old');
    const query = new URL(requests[0].url,'http://local').searchParams;
    assert.equal(query.get('guildId'),'g1');assert.equal(query.get('status'),'CONFIRMED');assert.equal(query.get('category'),'기술');assert.equal(query.get('page'),'2');
    assert.equal(requests[0].options.headers.get('Authorization'),'Bearer member-token');
    const detail = await decisionsApi.detail('DEC-old','g1');
    assert.equal(detail.supersededById,'DEC-new');
    assert.equal(requests[1].url,'/api/v1/decisions/DEC-old?guildId=g1');
  } finally {globalThis.fetch=previousFetch;}
});

test('Review Queue client lists held tickets and sends authenticated versioned replacement with dispositions',async()=>{
  const sessionUrl=moduleUrl('./session.ts');
  const transportUrl=moduleUrl('./transport.ts',s=>s.replace("'./session'",JSON.stringify(sessionUrl)));
  const generatedUrl=moduleUrl('./generated/index.ts',s=>s.replace("'../transport'",JSON.stringify(transportUrl)).replace("'@tanstack/react-query'",JSON.stringify(pathToFileURL(require.resolve('@tanstack/react-query')).href)));
  const clientUrl=moduleUrl('./client.ts',s=>s.replace("'./transport'",JSON.stringify(transportUrl)));
  const {decisionsApi}=await import(moduleUrl('./decisions.api.ts',s=>s.replace("'./generated'",JSON.stringify(generatedUrl)).replace("'./client'",JSON.stringify(clientUrl))));
  const session=await import(sessionUrl);session.setAccessToken('reviewer-token');
  const previous=globalThis.fetch;const requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({success:true,data:requests.length===1?{items:[{id:'DEC-held',ticketId:'DEC-held',state:'Deferred',version:2,alternatives:[]}],pageInfo:{totalPages:1}}:{id:'DEC-held',state:'Decided',version:3,alternatives:[]}}),{status:200});};
  try{
    const queue=await decisionsApi.getReviewQueue('g1','ON_HOLD');assert.equal(queue[0].id,'DEC-held');
    assert.equal(new URL(requests[0].url,'http://local').searchParams.get('status'),'ON_HOLD');
    const action={action:'confirm',expectedVersion:2,resolution:'replace',predecessorId:'DEC-old',predecessorVersion:3,taskDispositions:[{actionItemId:'task',disposition:'transfer'}]};
    const confirmed=await decisionsApi.reviewDecision('DEC-held',action,'g1');assert.equal(confirmed.version,3);
    assert.equal(requests[1].url,'/api/v1/review-queue/DEC-held/review?guildId=g1');
    assert.equal(requests[1].options.headers.get('Authorization'),'Bearer reviewer-token');assert.deepEqual(JSON.parse(requests[1].options.body),action);
  }finally{globalThis.fetch=previous;}
});
