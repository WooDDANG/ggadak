import { expect, test } from 'vitest';
import { chrome, runFrontendJourney } from './support/frontend-browser.js';

test.skipIf(!chrome)(
  'real frontend OAuth, cookie restore, server installation events and draft recovery cross the actual backend',
  async () => {
    const result = await runFrontendJourney(`
    await wait(() => visible(document.querySelector('#serverSelect')));
    check(document.querySelector('#serverSelect').options.length===1,'uninstalled or unjoined server leaked');
    check(document.querySelector('#serverSelect').value==='guild-1','installed member server missing');
    check(!document.cookie.includes('ggaddak_session'),'session cookie is readable by JavaScript');
    if(phase==='restored') {
      check(document.querySelector('#serverSelect').value==='guild-1','cookie restore lost selection');
    } else {
      await wait(()=>Boolean(document.querySelector('.channel-checks input')));
      check(document.querySelector('.channel-checks input').disabled,'normal member unexpectedly gained management controls');
      await control('manage',true);
      button('서버 목록 새로고침').click();
      await wait(()=>visible(document.querySelector('.channel-checks input:not(:disabled)')));
      document.querySelector('.channel-checks input').click();
      await wait(()=>document.querySelector('.channel-checks input').checked);
      const before=(await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length;
      window.dispatchEvent(new Event('focus'));
      await wait(async()=> (await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length>before && visible(document.querySelector('#serverSelect')));
      check(document.querySelector('.channel-checks input').checked,'same-server channel draft was lost');
      await control('inventory',null);
      button('서버 목록 새로고침').click();
      await wait(()=>Boolean(button('다시 시도')));
      check(!visible(document.querySelector('#serverSelect')),'unverified server data remained visible');
      await control('inventory',['guild-1']);
      button('다시 시도').click();
      await wait(()=>visible(document.querySelector('#serverSelect')));
      check(document.querySelector('.channel-checks input').checked,'draft was lost after inventory recovery');
      await control('inventory',[]);
      button('서버 목록 새로고침').click();
      await wait(()=>document.body.textContent.includes('봇이 설치된 가입 서버가 없습니다'));
      check(!document.querySelector('#serverSelect'),'empty inventory retained old selector');
      await control('inventory',['guild-1','guild-2']);
      button('서버 목록 새로고침').click();
      await wait(()=>visible(document.querySelector('#serverSelect')) && document.querySelector('#serverSelect').options.length===2);
      await control('event',null,{kind:'reset',sequence:0,guildIds:['guild-1','guild-2','foreign-installed'],connected:true,membersIntent:true});
      await control('event',null,{kind:'guild_remove',sequence:1,guildId:'guild-1'});
      button('서버 목록 새로고침').click();
      await wait(()=>visible(document.querySelector('#serverSelect')) && document.querySelector('#serverSelect').value==='guild-2');
      await control('event',null,{kind:'guild_available',sequence:2,guildId:'guild-1'});
      button('서버 목록 새로고침').click();
      await wait(()=>visible(document.querySelector('#serverSelect')) && document.querySelector('#serverSelect').options.length===2);
      check(document.querySelector('#serverSelect').value==='guild-2','eligible current selection changed after reinstall');
      await control('event',null,{kind:'member_remove',sequence:3,guildId:'guild-2',userId:'alice'});
      button('서버 목록 새로고침').click();
      await wait(()=>visible(document.querySelector('#serverSelect')) && document.querySelector('#serverSelect').value==='guild-1');
      let denied=false;try { await api.getChannelSettings('guild-2'); } catch(error) { denied=error.status===403; }
      check(denied,'removed membership retained backend data access');
      await wait(()=>visible(document.querySelector('#serverSelect')));
      sessionStorage.setItem('journey-phase','restored');window.location.reload();await new Promise(()=>{});
    }
  `);
    expect(result.requests.some(r => r.path === '/api/v1/auth/login' && r.status === 200)).toBe(
      true,
    );
    expect(result.requests.some(r => r.path === '/api/v1/auth/session' && r.status === 200)).toBe(
      true,
    );
    expect(
      result.requests.filter(r => r.path === '/api/v1/internal/guild-access/events'),
    ).toHaveLength(4);
    expect(result.requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  },
);

test.skipIf(!chrome)(
  'actual Decision Record draft survives unchanged server verification and never crosses an OAuth account change',
  async () => {
    const result = await runFrontendJourney(
      `
    await wait(()=>visible(document.querySelector('#serverSelect')));
    if(phase==='bob') {
      check(document.querySelector('#serverSelect').value==='guild-2','new account received previous account selection');
      check(document.querySelector('#serverSelect').options.length===1,'new account received foreign memberships');
      check(!document.querySelector('#f-rationale'),'previous account editor survived login');
      let denied=false;try { await api.getDecision('guild-2','card-1'); } catch(error) { denied=error.status===403; }
      check(denied,'new account read a foreign Decision Record');
    } else {
      window.location.hash='/decision/card-1';
      await wait(()=>visible(document.querySelector('#f-rationale')));
      const input=document.querySelector('#f-rationale');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Unsaved rationale');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      const before=(await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length;
      button('서버 목록 새로고침').click();
      await wait(async()=> (await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length>before && visible(document.querySelector('#f-rationale')));
      check(document.querySelector('#f-rationale')===input && input.value==='Unsaved rationale','actual BE refresh discarded Decision Record draft');
      await oauth('bob','bob');
    }
  `,
      { withDecision: true },
    );
    expect(result.requests.filter(r => r.path === '/api/v1/auth/login')).toHaveLength(2);
    expect(
      result.requests.some(r => r.path === '/api/v1/decisions/card-1' && r.status === 403),
    ).toBe(true);
    expect(result.requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  },
);

test.skipIf(!chrome)(
  'real callback cancellation returns to landing, then a valid cookie session survives later cancellation',
  async () => {
    const result = await runFrontendJourney(
      `
    if(!phase) {
      await wait(()=>Boolean(button('처음 화면으로')));button('처음 화면으로').click();
      await wait(()=>Boolean(button('Discord로 시작하기')));
      await oauth('alice','logged-in');
    } else if(phase==='logged-in') {
      await wait(()=>visible(document.querySelector('#serverSelect')));
      sessionStorage.setItem('journey-phase','canceled-again');
      window.location.assign('/?state=unused&error=access_denied');await new Promise(()=>{});
    } else {
      await wait(()=>Boolean(button('처음 화면으로')));button('처음 화면으로').click();
      await wait(()=>Boolean(button('서버 목록 새로고침')));
      check(document.querySelector('.user-select')?.textContent.includes('Installed project'),'existing cookie account was not restored');
    }
  `,
      { autoLogin: false, suffix: '/?state=unused&error=access_denied' },
    );
    expect(result.requests.filter(r => r.path === '/api/v1/auth/login')).toHaveLength(1);
    expect(
      result.requests.filter(r => r.path === '/api/v1/auth/session' && r.status === 401),
    ).toHaveLength(1);
    expect(result.requests.some(r => r.path === '/api/v1/auth/session' && r.status === 200)).toBe(
      true,
    );
  },
);

test.skipIf(!chrome)(
  'actual JWT renewal and expired-token mutation recovery preserve the cookie without replaying writes or polling guilds',
  async () => {
    const result = await runFrontendJourney(
      `
    await wait(()=>visible(document.querySelector('#serverSelect')));
    const initial=(await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length;
    await wait(async()=> (await stats()).arrivals.some(r=>r.path==='/api/v1/auth/token'));
    const readPaths=['/api/v1/discord/channels','/api/v1/dashboard','/api/v1/decisions'];
    const beforeReads=(await stats()).requests;
    const beforeCounts=readPaths.map(path=>beforeReads.filter(r=>r.path===path).length);
    await control('advance',16*60*1000);
    const reads=await Promise.all([api.getChannelSettings('guild-1'),api.getDashboard('guild-1'),api.getDecisions('guild-1')]);
    check(Array.isArray(reads[0].monitoredChannelIds),'expired safe read did not recover');
    const recovered=await stats();
    check(recovered.arrivals.filter(r=>r.path==='/api/v1/auth/token').length===1,'scheduled and 401 recovery did not share the actual BE request');
    for(let i=0;i<readPaths.length;i++) {
      const completed=recovered.requests.filter(r=>r.path===readPaths[i]);
      check(completed.length===beforeCounts[i]+2,'safe read did not retry exactly once');
      check(completed.slice(beforeCounts[i]).map(r=>r.status).filter(status=>status===401).length===1,'safe read did not cross actual expired-token validation');
    }
    check((await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length===initial,'scheduled JWT renewal polled guilds');
    await control('manage',true);
    button('서버 목록 새로고침').click();
    await wait(()=>visible(document.querySelector('.channel-checks input:not(:disabled)')));
    await control('advance',16*60*1000);
    let denied=false;try { await api.saveChannelSettings('guild-1',['guild-1-channel']); } catch(error) { denied=error.status===401; }
    check(denied,'expired mutation was silently replayed or succeeded');
    const settings=await api.getChannelSettings('guild-1');
    check(settings.monitoredChannelIds.length===0,'rejected mutation changed server settings');
    const after=await stats();
    check(after.requests.filter(r=>r.method==='PUT').length===1,'mutation was replayed');
    check(after.requests.filter(r=>r.path==='/api/v1/auth/guilds').length===initial+1,'JWT recovery queried guild inventory');
  `,
      { tokenDueSoon: true, tokenDelayMs: 1500 },
    );
    expect(result.requests.filter(r => r.method === 'PUT').map(r => r.status)).toEqual([401]);
    expect(
      result.requests.filter(r => r.path === '/api/v1/auth/token' && r.status === 200),
    ).toHaveLength(2);
    expect(result.arrivals.filter(r => r.path === '/api/v1/auth/token')).toHaveLength(2);
  },
);
