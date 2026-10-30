import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserAvailable, runBrowserFixture } from '../../test-support/browser-harness.mjs';

test(
  'review loads one page, defers replacement/history reads and stops polling off-screen',
  { skip: !browserAvailable, timeout: 30000 },
  async () => {
    const html = await runBrowserFixture(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {App} from '../../src/App';
import {QueryPolicy} from '../../src/config';
QueryPolicy.reviewPollMs=150;QueryPolicy.dashboardPollMs=150;
const queue=[],records=[],reviews=[];
let listBytes=0;
const card=(id,state='Draft')=>({id,version:1,title:id,topic:'기술 선택',decision:'채택',rationale:'근거',
  state,status:state==='Decided'?'CONFIRMED':state==='Deferred'?'ON_HOLD':'IN_REVIEW',category:'기술',categoryTag:'기술',
  createdAt:'2026-01-01T00:00:00Z',alternatives:[],actionItems:[],source:{participants:[],rawMessages:[]},
  confirmedDate:null,dates:{createdDate:'2026-01-01T00:00:00Z',confirmedDate:null,feedbackDate:null}});
window.fetch=async(input,options={})=>{
 const url=new URL(String(input),location.origin),path=url.pathname,q=url.searchParams;
 let data;
 if(path.endsWith('/auth/session'))data={accessToken:'fixture',user:{id:'u'},guilds:[{id:'g1',name:'G1'},{id:'g2',name:'G2'}]};
 else if(path.endsWith('/dashboard'))data={counts:{confirmed:41,inReview:41,onHold:41},recentDecisions:[],sync:{lastSuccessfulAt:null,latestJob:null}};
 else if(path.endsWith('/analysis-deliveries'))data={available:false,requests:[]};
 else if(path.endsWith('/review')){reviews.push(JSON.parse(options.body));data={...card(path.split('/').at(-2)),state:'Decided'};}
 else if(path.endsWith('/review-queue')){
  const request=Object.fromEntries(q);queue.push(request);
  const page=Number(q.get('page')||1),size=Number(q.get('size')||20);
  data={items:Array.from({length:page===3?1:20},(_,i)=>card(q.get('guildId')+'-candidate-'+page+'-'+i,q.get('status')==='ON_HOLD'?'Deferred':'Draft')),
    pageInfo:{currentPage:page,pageSize:size,totalElements:41,totalPages:3}};
 }else if(path.endsWith('/decisions')){
  const request=Object.fromEntries(q);records.push(request);
  const page=Number(q.get('page')||1);
  const items=Array.from({length:20},(_,i)=>({...card('record-'+page+'-'+i,'Decided'),version:2}));
  data={items,decisions:items,pageInfo:{currentPage:page,pageSize:20,totalElements:41,totalPages:3}};
 }else throw new Error('Unexpected request '+path);
 const body=JSON.stringify({success:true,code:'OK',message:'Success',data});
 if(path.endsWith('/decisions')||path.endsWith('/review-queue'))listBytes+=new TextEncoder().encode(body).length;
 return new Response(body,{headers:{'Content-Type':'application/json'}});
};
const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(check,label)=>{for(let i=0;i<200;i++){if(check())return;await pause(20);}throw new Error(label);};
const button=text=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===text||b.firstElementChild?.textContent===text);
const change=(select,value)=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={cache}><App/></QueryClientProvider>);
(async()=>{try{
 await wait(()=>document.querySelector('h1')?.textContent==='서버 대시보드','dashboard');
 await pause(350);
 if(queue.length||records.length)throw new Error('Hidden review fetched complete lists');
 button('검토 대기 큐').click();
 await wait(()=>queue.length&&document.querySelector('select[aria-label="검수 상태"]'),'queue');
 if(queue.some(q=>q.page!=='1'||q.size!=='20'||q.status!=='IN_REVIEW'))throw new Error('Queue fetched more than its selected page');
 if(records.length)throw new Error('Closed picker/history fetched records');
 change(document.querySelector('select[aria-label="검수 상태"]'),'ON_HOLD');
 await wait(()=>queue.some(q=>q.status==='ON_HOLD'),'held page');
 await wait(()=>document.querySelector('nav[aria-label="페이지 이동"]'),'held page controls');
 document.querySelector('nav[aria-label="페이지 이동"]').querySelectorAll('button')[1].click();
 await wait(()=>queue.some(q=>q.status==='ON_HOLD'&&q.page==='2'),'second page');
 await wait(()=>button('교체할 기존 결정 찾기'),'replacement button');
 button('교체할 기존 결정 찾기').click();
 await wait(()=>records.length&&document.querySelector('select[aria-label$="확정 방식"]')?.options.length>1,'confirmed choices');
 if(records.some(q=>q.status!=='CONFIRMED'||q.size!=='20'))throw new Error('Replacement fetched non-confirmed/full records');
 const select=document.querySelector('select[aria-label$="확정 방식"]');change(select,'record-1-0');
 document.querySelectorAll('nav[aria-label="페이지 이동"]')[1].querySelectorAll('button')[1].click();
 await wait(()=>records.some(q=>q.page==='2'),'replacement next page');await pause(30);
 if(select.value!=='record-1-0')throw new Error('Paging discarded selected predecessor');
 button('교체 확정').click();
 await wait(()=>reviews.length===1,'review');
 if(reviews[0].predecessorId!=='record-1-0'||reviews[0].predecessorVersion!==2)throw new Error('Selected version snapshot changed');
 await pause(100);
 const beforeHistory=records.length;
 Array.from(document.querySelectorAll('summary')).find(s=>s.textContent==='확정·반려 이력 조회').click();
 await wait(()=>records.length>beforeHistory,'history lazily loaded');
 const historySelect=Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='DISCARDED'));
 change(historySelect,'DISCARDED');
 await wait(()=>records.some(q=>q.status==='DISCARDED'),'rejected history');
 button('대시보드').click();
 await wait(()=>document.querySelector('h1')?.textContent==='서버 대시보드','return dashboard');
 await pause(50);const queueCount=queue.length,recordCount=records.length;
 await pause(450);
 if(queue.length!==queueCount||records.length!==recordCount)throw new Error('Unmounted review kept polling');
 change(document.getElementById('guild'),'g2');
 await pause(50);button('검토 대기 큐').click();
 await wait(()=>queue.some(q=>q.guildId==='g2'),'second guild');
 if(queue.filter(q=>q.guildId==='g2').some(q=>q.page!=='1'))throw new Error('Guild change retained old page');
 document.getElementById('result').textContent='PASS';
 const metrics=document.createElement('pre');metrics.id='metrics';metrics.textContent=JSON.stringify({queueRequests:queue.length,recordRequests:records.length,listBytes,reviewRequests:reviews.length});document.body.append(metrics);
}catch(error){document.getElementById('result').textContent='FAIL: '+error.message;}})();
`);
    assert.match(
      html,
      /<pre id="result">PASS<\/pre>/,
      html.match(/<pre id="result">([^<]*)/)?.[1] || 'Browser did not load',
    );
    console.log(html.match(/<pre id="metrics">([^<]*)/)?.[1]);
  },
);
