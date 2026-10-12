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
test('Why flow carries authorized guild and natural-language query through generated clients and opens the result card', async()=>{
  const sessionUrl = moduleUrl('./session.ts');
  const transportUrl = moduleUrl('./transport.ts', s=>s.replace("'./session'",JSON.stringify(sessionUrl)));
  const generatedUrl = moduleUrl('./generated/index.ts', s=>s.replace("'../transport'",JSON.stringify(transportUrl)).replace("'@tanstack/react-query'",JSON.stringify(pathToFileURL(require.resolve('@tanstack/react-query')).href)));
  const {searchApi} = await import(moduleUrl('./search.api.ts',s=>s.replace("'./generated'",JSON.stringify(generatedUrl))));
  const {getV1Decision} = await import(generatedUrl);
  const session = await import(sessionUrl);
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({success:true,data: requests.length===2 ? {id:'DEC-cache',rationale:'Latency',source:{messageUrl:'https://discord.com/channels/g/c/m'}} : {items:[{decision:{id:'DEC-cache',status:'CONFIRMED'},score:0.91,excerpt:'Latency',sourceUrl:'https://discord.com/channels/g/c/m'}]}}),{status:200});
  };
  try {
    session.setAccessToken('member-token');
    const result = await searchApi.search('g1','왜 빠르게 응답하나요?',5);
    assert.equal(result.items[0].decision.id,'DEC-cache');
    assert.equal(result.items[0].score,0.91);
    const query = new URL(requests[0].url,'http://local').searchParams;
    assert.equal(query.get('guildId'),'g1');assert.equal(query.get('query'),'왜 빠르게 응답하나요?');assert.equal(query.get('limit'),'5');
    assert.equal(requests[0].options.headers.get('Authorization'),'Bearer member-token');
    const card = await getV1Decision(result.items[0].decision.id,{guildId:'g1'});
    assert.equal(card.data.data.id,'DEC-cache');
    assert.equal(card.data.data.source.messageUrl,result.items[0].sourceUrl);
    assert.equal(requests[1].url,'/api/v1/decisions/DEC-cache?guildId=g1');
  } finally {globalThis.fetch=previousFetch;}
});
