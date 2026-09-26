// Shared by the smoke and RBAC runners: the test school's accounts, signing
// in, opening a page while watching every API answer, and the check that a
// role's screen loads within its own school.
const fs = require('fs');

const DIR = __dirname, OUT = `${DIR}/out`, BASE = process.env.BASE || 'http://localhost:3100';
const CODE = process.env.CODE || 'SUNQA', DOM = CODE.toLowerCase() + '.test';
const rec = JSON.parse(fs.readFileSync(`${DIR}/records.json`, 'utf8'));
const jobs = fs.existsSync(`${DIR}/jobs.json`) ? JSON.parse(fs.readFileSync(`${DIR}/jobs.json`, 'utf8')) : {};
const job = key => jobs[key] && { form: '/welcome/sign-in?role=staff', email: jobs[key].email, pw: jobs[key].password, who: `${jobs[key].email} (office staff: ${jobs[key].job})` };

const ACCOUNTS = {
  public: null,
  super_admin: { form: '/welcome/sign-in?role=super_admin', email: 'admin@sms.local', pw: 'ChangeMe123!', who: 'admin@sms.local (super admin)' },
  school_admin: { form: '/welcome/sign-in?role=school_admin', email: `admin@${DOM}`, pw: 'Sunrise@2026', who: `admin@${DOM} (school admin)` },
  principal: { form: '/welcome/sign-in?role=principal', email: `principal@${DOM}`, pw: 'Anil@2026', who: `principal@${DOM}` },
  teacher: { form: '/welcome/sign-in?role=teacher', email: `meera@${DOM}`, pw: 'Meera@2026', who: `meera@${DOM} (class teacher)` },
  accountant: { form: '/welcome/sign-in?role=accountant', email: `accounts@${DOM}`, pw: 'Farah@2026', who: `accounts@${DOM}` },
  // office staff: the built-in role carries the library, front desk, store and hostel jobs
  staff: { form: '/welcome/sign-in?role=staff', email: `library@${DOM}`, pw: 'Office@2026', who: `library@${DOM} (office staff: library, front desk, store, hostel)` },
  hr: job('hr'), transport: job('transport'), nurse: job('nurse'),
  admissions: job('admissions'), exams: job('exams'), discipline: job('discipline'),
  student: { form: '/welcome/sign-in?role=student', admission: 'S00001', pw: 'Aarav@2026', who: `${CODE} / S00001 (student)` },
  parent: { form: '/parent/parent-sign-in', email: 'neha.mehta@family.test', pw: 'Neha@2026', app: true, who: 'neha.mehta@family.test (parent app)' },
  // a parent opening a workspace page directly: same account, signed in through the app, then the page
  parent_web: { form: '/parent/parent-sign-in', email: 'neha.mehta@family.test', pw: 'Neha@2026', who: 'neha.mehta@family.test (parent)' },
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const benign = t => /^(Tip|No |Nothing|Choose|Pick|Select)/i.test(t);
const leaks = text => rec.leak_names.filter(n => text.includes(n));

async function signIn(page, a) {
  await page.goto(BASE + a.form);
  if (a.admission) { await page.fill('input[name=school_code]', CODE.toLowerCase()); await page.fill('input[name=admission_no]', a.admission); }
  else await page.fill('input[name=email]', a.email);
  await page.fill('input[name=password]', a.pw);
  await page.locator('button[type=submit]').first().click();
  await page.waitForURL(u => !/sign-in/.test(String(u)), { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

// Open a page and note every API answer: errors, and (ok) what was served.
async function open(page, path, watch) {
  const seen = { http: [], errors: [], served: [], ok: [] };
  const onResp = r => {
    const u = r.url().replace(/^https?:\/\/[^/]+/, '');
    if (!u.startsWith('/api/')) return;
    if (r.status() >= 400) seen.http.push(`${r.status()} ${r.request().method()} ${u}`);
    else {
      seen.ok.push(`${r.status()} ${r.request().method()} ${u}`);
      if (watch && watch.test(u)) seen.served.push(`${r.status()} ${u}`);
    }
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

// A role opening its own screen: loads with no errors and nothing from the
// other school; a page about one record also refuses the other school's.
async function checkAuthorized(page, c, a, evidence) {
  const problems = [], notes = [];
  const own = c.record ? rec.own[c.record] : null;
  if (c.record && own == null) problems.push(`No ${c.record} in the test school to open`);
  const path = c.path + (own != null ? `?id=${own}` : '');
  let r = { url: path, title: '', alerts: [], text: '', http: [], errors: [], served: [], ok: [] };
  if (!problems.length) {
    r = await open(page, path);
    if (evidence) await page.screenshot({ path: evidence });
    if (/\/sign-in|access-denied/.test(r.url) && !/sign-in|reset|forgot|workspace|access-denied|first-login|otp|^\/$/.test(c.path)) problems.push(`Sent to ${r.url} instead of the screen`);
    if (/could not be found/.test(r.text)) problems.push('Page not found (404)');
    for (const h of r.http) problems.push(`API error ${h}`);
    for (const e of r.errors) problems.push(`Page error: ${e}`);
    for (const al of r.alerts) if (!benign(al)) problems.push(`Error shown: ${al.slice(0, 160)}`);
    // the platform team sees every school by design
    const l = c.account === 'super_admin' ? [] : leaks(r.text);
    if (l.length) problems.push(`Shows the other school's data: ${l.slice(0, 3).join(', ')}`);
  }
  if (c.cross_school && !problems.length) {
    const other = rec.other[c.record];
    if (other == null) notes.push(`Other school has no ${c.record}; cross-school check not run`);
    else {
      const x = await open(page, `${c.path}?id=${other}`, new RegExp(`/${other}(?:[/?]|$)`));
      const l = leaks(x.text);
      if (x.served.length) problems.push(`Other school's ${c.record} #${other} was served: ${x.served[0]}`);
      if (l.length) problems.push(`Other school's ${c.record} shown: ${l.slice(0, 3).join(', ')}`);
      if (!x.served.length && !l.length) notes.push(`Other school's ${c.record} #${other} refused (${x.http.filter(h => /^(403|404)/.test(h))[0] || 'nothing shown'})`);
    }
  }
  const summary = `Signed in as ${a ? a.who : 'visitor (no sign-in)'}; opened ${path}${r.title ? ` ("${r.title}")` : ''}; loaded with no errors and no other school's data.${notes.length ? ' ' + notes.join('. ') + '.' : ''}`;
  return { problems, notes, r, path, summary };
}

module.exports = { DIR, OUT, BASE, CODE, rec, ACCOUNTS, log, benign, leaks, signIn, open, checkAuthorized };
