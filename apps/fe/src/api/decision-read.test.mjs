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
