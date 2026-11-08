import { expect, test } from 'vitest';
import { chrome, runFrontendJourney } from './support/frontend-browser.js';

test.skipIf(!chrome)(
  'actual backend permission failures stop automatic recovery and recover only on explicit retry',
  async () => {
    const result = await runFrontendJourney(`
    await wait(()=>visible(document.querySelector('#serverSelect')));
    await control('verificationRateLimited',true);
    window.location.hash='/dashboard';
    await wait(()=>Boolean(button('다시 시도')) && !visible(document.querySelector('.shell')));
    const before=await stats();
    const guildReads=before.requests.filter(r=>r.path==='/api/v1/auth/guilds').length;
    check(guildReads<=1,'persistent verification restarted automatic server checks');
    window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));
    await new Promise(r=>setTimeout(r,400));
    const idle=await stats();
    check(idle.requests.length===before.requests.length,'blocked workspace kept issuing requests');
    check(idle.provider.guilds===before.provider.guilds,'blocked workspace kept calling Discord');
    button('다시 시도').click();
    await wait(async()=> (await stats()).requests.filter(r=>r.path==='/api/v1/auth/guilds').length>guildReads && Boolean(button('다시 시도')));
    await new Promise(r=>setTimeout(r,300));
    const failed=await stats();
    check(failed.requests.filter(r=>r.path==='/api/v1/auth/guilds').length===guildReads+1,'manual failure started another automatic cycle');
    check(failed.requests.filter(r=>r.path==='/api/v1/auth/logout').length===0,'transient verification logged out the user');
    await control('verificationRateLimited',false);
    button('다시 시도').click();
    await wait(()=>visible(document.querySelector('.shell')) && !button('다시 시도'));
    await wait(async()=> (await stats()).requests.some(r=>r.path==='/api/v1/dashboard' && r.status===200));
    check(document.querySelector('.user-select')?.textContent.includes('Installed project'),'manual recovery lost the authenticated account');
  `);
    expect(result.requests.some(r => r.path === '/api/v1/dashboard' && r.status === 502)).toBe(
      true,
    );
    expect(result.requests.some(r => r.path === '/api/v1/dashboard' && r.status === 200)).toBe(
      true,
    );
    expect(result.requests.filter(r => r.path === '/api/v1/auth/login')).toHaveLength(1);
  },
);
