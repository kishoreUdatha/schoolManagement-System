// Runs the Smoke Suite of the functional test plan against the live app.
// Every smoke case is "authorized access to <screen>": the role signs in,
// opens the screen, and it must load showing only its own school's records.
//
// For each case: sign in as the account holding the role, open the page, and
// record anything that went wrong (API errors, page errors, error notes, a
// missing page, being sent to sign-in or access denied). The page must not
// show any person or the name of the second school on the platform. A page
// about one record is also opened with the second school's record: that must
// be refused, with no data served.
//
//   python3 build_cases.py && python3 records.py && node smoke.js   ->  out/results.json, out/evidence/*.png
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');

const DIR = __dirname, OUT = `${DIR}/out`, BASE = process.env.BASE || 'http://localhost:3100';
const CODE = process.env.CODE || 'SUNQA', DOM = CODE.toLowerCase() + '.test';
const cases = JSON.parse(fs.readFileSync(`${DIR}/cases.json`, 'utf8'));
const rec = JSON.parse(fs.readFileSync(`${DIR}/records.json`, 'utf8'));
const only = process.argv.slice(2);

const ACCOUNTS = {
  public: null,
  super_admin: { form: '/welcome/sign-in?role=super_admin', email: 'admin@sms.local', pw: 'ChangeMe123!', who: 'admin@sms.local (super admin)' },
  school_admin: { form: '/welcome/sign-in?role=school_admin', email: `admin@${DOM}`, pw: 'Sunrise@2026', who: `admin@${DOM} (school admin)` },
  principal: { form: '/welcome/sign-in?role=principal', email: `principal@${DOM}`, pw: 'Anil@2026', who: `principal@${DOM}` },
  teacher: { form: '/welcome/sign-in?role=teacher', email: `meera@${DOM}`, pw: 'Meera@2026', who: `meera@${DOM} (class teacher)` },
  accountant: { form: '/welcome/sign-in?role=accountant', email: `accounts@${DOM}`, pw: 'Farah@2026', who: `accounts@${DOM}` },
  student: { form: '/welcome/sign-in?role=student', admission: 'S00001', pw: 'Aarav@2026', who: `${CODE} / S00001 (student)` },
  parent: { form: '/parent/parent-sign-in', email: 'neha.mehta@family.test', pw: 'Neha@2026', app: true, who: 'neha.mehta@family.test (parent app)' },
  // a parent opening a workspace page directly (SCR-114): same account, signed in through the app, then the page
  parent_web: { form: '/parent/parent-sign-in', email: 'neha.mehta@family.test', pw: 'Neha@2026', who: 'neha.mehta@family.test (parent)' },
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const benign = t => /^(Tip|No |Nothing|Choose|Pick|Select)/i.test(t);

async function signIn(page, a) {
  await page.goto(BASE + a.form);
  if (a.admission) { await page.fill('input[name=school_code]', CODE.toLowerCase()); await page.fill('input[name=admission_no]', a.admission); }
  else await page.fill('input[name=email]', a.email);
  await page.fill('input[name=password]', a.pw);
  await page.locator('button[type=submit]').first().click();
  await page.waitForURL(u => !/sign-in/.test(String(u)), { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function open(page, path, watch) {
  const seen = { http: [], errors: [], served: [] };
  const onResp = r => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, '');
    if (!u.startsWith('/api/')) return;
    if (r.status() >= 400) seen.http.push(`${r.status()} ${r.request().method()} ${u}`);
    else if (watch && watch.test(u)) seen.served.push(`${r.status()} ${u}`);
  };
  const onErr = e => seen.errors.push(e.message.slice(0, 160));
  page.on('response', onResp); page.on('pageerror', onErr);
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({
    url: location.pathname + location.search,
    title: (document.querySelector('main .page-head h1, main h1, .phone h1, h1')?.textContent || '').trim().slice(0, 80),
    alerts: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent.trim()).filter(Boolean),
    text: document.body.innerText,
  }));
  page.off('response', onResp); page.off('pageerror', onErr);
  return { ...info, ...seen };
}

const leaks = text => rec.leak_names.filter(n => text.includes(n));

(async () => {
  fs.mkdirSync(`${OUT}/evidence`, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const byAccount = {};
  for (const c of cases) if (!only.length || only.includes(c.id)) (byAccount[c.account] ||= []).push(c);
  for (const [acct, list] of Object.entries(byAccount)) {
    const a = ACCOUNTS[acct];
    const ctx = await browser.newContext({ viewport: a && a.app ? { width: 412, height: 915 } : { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    let signInError = null;
    if (a) await signIn(page, a).catch(e => { signInError = e.message.split('\n')[0]; });
    for (const c of list) {
      const problems = [], notes = [];
      if (signInError) problems.push(`Could not sign in as ${a.who}: ${signInError}`);
      const own = c.record ? rec.own[c.record] : null;
      if (c.record && own == null) problems.push(`No ${c.record} in the test school to open`);
      const path = c.path + (own != null ? `?id=${own}` : '');
      let r = { url: path, title: '', alerts: [], text: '', http: [], errors: [], served: [] };
      if (!problems.length) {
        r = await open(page, path);
        await page.screenshot({ path: `${OUT}/evidence/${c.id}.png` });
        if (/\/sign-in|access-denied/.test(r.url) && !/sign-in|reset|forgot|workspace|^\/$/.test(c.path)) problems.push(`Sent to ${r.url} instead of the screen`);
        if (/could not be found/.test(r.text)) problems.push('Page not found (404)');
        for (const h of r.http) problems.push(`API error ${h}`);
        for (const e of r.errors) problems.push(`Page error: ${e}`);
        for (const al of r.alerts) if (!benign(al)) problems.push(`Error shown: ${al.slice(0, 160)}`);
        // the platform team sees every school by design
        const l = acct === 'super_admin' ? [] : leaks(r.text);
        if (l.length) problems.push(`Shows the other school's data: ${l.slice(0, 3).join(', ')}`);
      }
      // The same page with the other school's record: refused, nothing served.
      let cross = null;
      if (c.cross_school && !problems.length) {
        const other = rec.other[c.record];
        if (other == null) notes.push(`Other school has no ${c.record}; cross-school check not run`);
        else {
          const x = await open(page, `${c.path}?id=${other}`, new RegExp(`/${other}(?:[/?]|$)`));
          const l = leaks(x.text);
          cross = { id: other, refused: x.http.filter(h => /^(403|404)/.test(h)).length, served: x.served, leaks: l };
          if (x.served.length) problems.push(`Other school's ${c.record} #${other} was served: ${x.served[0]}`);
          if (l.length) problems.push(`Other school's ${c.record} shown: ${l.slice(0, 3).join(', ')}`);
          if (!x.served.length && !l.length) notes.push(`Other school's ${c.record} #${other} refused (${x.http.filter(h => /^(403|404)/.test(h))[0] || 'nothing shown'})`);
        }
      }
      const status = problems.length ? 'Fail' : c.mismatch ? 'Blocked' : 'Pass';
      const actual = status !== 'Fail'
        ? `${c.mismatch ? `Not run as written: ${c.mismatch} Run instead as the role that uses it — ` : ''}Signed in as ${a ? a.who : 'visitor (no sign-in)'}; opened ${path}${r.title ? ` ("${r.title}")` : ''}; loaded with no errors and no other school's data.${notes.length ? ' ' + notes.join('. ') + '.' : ''}`
        : problems.join('; ');
      results.push({ ...c, status, actual, problems, notes, url: r.url, title: r.title, cross, tester: 'Automated smoke run (tools/qa/smoke.js)', evidence: `tools/qa/out/evidence/${c.id}.png` });
      log(status, c.id, c.scr, c.name, status === 'Fail' ? '— ' + problems[0] : '');
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  log(`${results.filter(r => r.status === 'Pass').length} pass, ${results.filter(r => r.status === 'Fail').length} fail`);
})();
