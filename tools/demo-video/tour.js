// Narrated menu tour: every role signs in and opens every entry of its menu,
// every screen in each menu group, and every tab on those screens. Each role
// is its own chapter (video + timeline); problems seen on the way (API errors,
// page errors, error notes, missing pages) go to tour/report.json.
//
//   CODE=SUN1234 node tour.js [role ...]     (roles: see ROLES; default all)
//   FAST=1 ... skips the voice and the pauses: a quick check of every screen.
const fs = require('fs');
const { chapter, log, DIR } = require('./rec');

const CODE = process.env.CODE || 'SUNRISE', DOM = CODE.toLowerCase() + '.test';
const FAST = !!process.env.FAST;
const OUT = `${DIR}/tour`;
const NARR = JSON.parse(fs.readFileSync(`${DIR}/tour_narration.json`, 'utf8'));
const pwOf = (() => { try { return JSON.parse(fs.readFileSync(`${DIR}/timeline.json`, 'utf8')).pw || {}; } catch { return {}; } })();

const ROLES = [
  { key: 'super_admin', title: 'Platform super admin', who: 'the BrightCampus platform team', email: 'admin@sms.local', pw: 'ChangeMe123!' },
  { key: 'school_admin', title: 'School admin', who: 'Kavitha, the school admin', email: `admin@${DOM}`, pw: 'Sunrise@2026' },
  { key: 'principal', title: 'Principal', who: 'Anil, the principal', email: `principal@${DOM}`, pw: 'Anil@2026' },
  { key: 'accountant', title: 'Accountant', who: 'Farah, the accountant', email: `accounts@${DOM}`, pw: 'Farah@2026' },
  { key: 'teacher', title: 'Teacher', who: 'Meera, the class teacher', email: `meera@${DOM}`, pw: 'Meera@2026' },
  { key: 'staff', title: 'Office staff', who: 'Suresh, the librarian, who is office staff with the library job', email: `library@${DOM}`, pw: 'Suresh@2026', first: pwOf[`library@${DOM}`] },
  // Parents have no web workspace: signing in takes them to the parent app (APPS).
  { key: 'parent', app: true, title: 'Parent', who: 'Neha, Aarav\'s mother', email: 'neha.mehta@family.test', pw: 'Neha@2026' },
  { key: 'student', title: 'Student', who: 'Aarav, a Grade 3 student', admission: 'S00001', pw: 'Aarav@2026' },
];
const APPS = [
  { key: 'teacher_app', title: 'Teacher app', role: 'teacher', signIn: '/teacher/sign-in', more: '/teacher/more' },
  { key: 'parent_app', title: 'Parent app', role: 'parent', signIn: '/parent/parent-sign-in', more: '/parent/more' },
  { key: 'student_app', title: 'Student app', role: 'student', signIn: '/student/sign-in', more: '/student/more' },
];

const report = fs.existsSync(`${OUT}/report.json`) ? JSON.parse(fs.readFileSync(`${OUT}/report.json`, 'utf8')) : {};
const save = () => fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

// Someone signing in for the first time sets their own password.
async function firstLogin(R, r) {
  const { page, type, click, settle } = R;
  const cur = page.locator('input[name=current_password]');
  if (await cur.count()) await type(cur, r.first, 10);
  await type(page.locator('input[name=new_password]'), r.pw, 15); await type(page.locator('input[name=confirm_password]'), r.pw, 15);
  await click(page.getByRole('button', { name: 'Set password' })); await settle(1500);
}

async function signIn(R, r) {
  const { page, type, click, settle, go } = R;
  // Their own password once set; the office's temporary one the first time.
  for (const pw of [r.pw, r.first].filter(Boolean)) {
    await go(`/welcome/sign-in?role=${r.key}`);
    if (r.admission) {
      await type(page.locator('input[name=school_code]'), CODE.toLowerCase(), 15);
      await type(page.locator('input[name=admission_no]'), r.admission, 15);
    } else {
      await type(page.locator('input[name=email]'), r.email, 12);
    }
    await type(page.locator('input[name=password]'), pw, 15);
    await click(page.getByRole('button', { name: 'Sign in' }));
    await page.waitForURL(u => !/sign-in/.test(String(u)), { timeout: 15000 }).catch(() => {}); await settle(1200);
    if (await page.locator('input[name=new_password]').count()) await firstLogin(R, r);
    if (!/sign-in/.test(page.url())) return;
  }
  throw new Error(`${r.key} could not sign in: ${clean(await page.locator('[role=alert]').allInnerTexts().then(a => a.join(' ')))}`);
}

// What the screen says about itself once open: title, note, screen id, tabs.
async function readScreen(page) {
  return page.evaluate(() => {
    const t = s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim();
    const foot = document.querySelectorAll('footer.screen-note span');
    const alerts = [...document.querySelectorAll('main [role=alert]')].map(e => e.textContent.trim()).filter(Boolean);
    return {
      title: t('main .page-head h1') || t('main h1') || t('main h2'), note: t('main .page-note'),
      scr: foot.length ? foot[foot.length - 1].textContent.trim() : '',
      tabs: [...document.querySelectorAll('nav.page-tabs a')].map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim(), active: a.classList.contains('active') })),
      alerts, notFound: /could not be found/.test(document.body.innerText),
    };
  });
}

// Client-side navigation: wait until the address bar shows the link's page.
const arrive = (page, href) => page.waitForURL(u => { const x = new URL(String(u)); return x.pathname + x.search === href || x.pathname === href.split('?')[0]; }, { timeout: 15000 }).catch(() => {});

const line = (href, label, info) => NARR[href] || [label || info?.title, info?.note].filter(Boolean).join('. ') + '.';

async function tourRole(r) {
  const out = `${OUT}/${r.key}`; fs.rmSync(out, { recursive: true, force: true });
  const R = await chapter(out, { fast: FAST });
  try { await tourRoleIn(R, r); } finally { await R.abort(); }
}
async function tourRoleIn(R, r) {
  const { page, scene, click, settle, browse, pause } = R;
  const rep = report[r.key] = { title: r.title, screens: [], problems: R.problems };
  const seen = new Set();

  await R.go('/welcome/sign-in');
  await scene(`${r.title}`, NARR[`@intro:${r.key}`] || `Now the ${r.title.toLowerCase()} workspace. We sign in as ${r.who}, and open every item in the menu.`, async () => { R.setWhere(`${r.title} › sign in`); await signIn(R, r); });

  // Open one screen (menu entry or tab): narrate, show it, note what went wrong.
  const visit = async (loc, href, label, group) => {
    seen.add(href);
    R.setWhere(`${r.title} › ${group ? group + ' › ' : ''}${label}`);
    const before = R.problems.length;
    let info;
    await scene(`${r.title}${group ? ' · ' + group : ''} · ${label}`, line(href, label), async () => {
      await click(loc); await arrive(page, href); await settle(700);
      info = await readScreen(page);
      await browse();
    });
    info = info || {};
    for (const a of info.alerts || []) if (!/^(Tip|No |Nothing)/.test(a)) R.problems.push({ where: `${r.title} › ${label}`, kind: 'error note', detail: a.slice(0, 200) });
    if (info.notFound) R.problems.push({ where: `${r.title} › ${label}`, kind: 'missing page', detail: href });
    rep.screens.push({ group, label, href, scr: info.scr, title: info.title, problems: R.problems.length - before });
    save();
    return info;
  };
  const visitWithTabs = async (loc, href, label, group) => {
    const info = await visit(loc, href, label, group);
    for (const tab of info.tabs || []) {
      if (tab.active || seen.has(tab.href)) continue;
      await visit(page.locator(`nav.page-tabs a[href="${tab.href}"]`), tab.href, tab.text, group || label);
    }
  };

  // The menu, top to bottom. Groups open to show their screens.
  const TOP = 'aside .nav-scroll a.nav:not(.nav-group a), aside .nav-scroll .nav-group > button.nav';
  const count = await page.locator(TOP).count();
  for (let i = 0; i < count; i++) {
    const item = page.locator(TOP).nth(i);
    const tag = await item.evaluate(e => e.tagName);
    const label = clean(await item.getAttribute('title') || await item.innerText());
    if (tag === 'A') {
      const href = await item.getAttribute('href');
      if (!seen.has(href)) await visitWithTabs(item, href, label);
      continue;
    }
    const group = page.locator('aside .nav-group').filter({ has: page.locator(`button[title="${label.replace(/"/g, '\\"')}"]`) }).first();
    const open = async () => { if ((await group.locator('button.nav').getAttribute('aria-expanded')) !== 'true') { await click(group.locator('button.nav')); await pause(300); } };
    await open();
    const n = await group.locator('a.subnav').count();
    for (let j = 0; j < n; j++) {
      await open();
      const a = group.locator('a.subnav').nth(j);
      const href = await a.getAttribute('href');
      if (seen.has(href)) continue;
      await visitWithTabs(a, href, clean(await a.innerText()), label);
    }
  }
  await R.finish();
  log(`${r.key}: ${rep.screens.length} screens, ${R.problems.length} problems`);
}

// The phone apps: the bottom bar, then everything on the More screen.
async function tourApp(app) {
  const r = ROLES.find(x => x.key === app.role);
  const out = `${OUT}/${app.key}`; fs.rmSync(out, { recursive: true, force: true });
  const R = await chapter(out, { fast: FAST });
  try { await tourAppIn(R, app, r); } finally { await R.abort(); }
}
async function tourAppIn(R, app, r) {
  const { page, scene, click, type, settle, browse, go } = R;
  R.state.side = true;
  const rep = report[app.key] = { title: app.title, screens: [], problems: R.problems };
  const seen = new Set();
  await go(app.signIn);
  await scene(app.title, NARR[`@intro:${app.key}`] || `The ${app.title.toLowerCase()}, as ${r.who} sees it on the phone. We open every screen.`, async () => {
    R.setWhere(`${app.title} › sign in`);
    if (r.admission) { await type(page.locator('input[name=school_code]'), CODE.toLowerCase(), 15); await type(page.locator('input[name=admission_no]'), r.admission, 15); }
    else await type(page.locator('input[name=email]'), r.email, 12);
    await type(page.locator('input[name=password]'), r.pw, 15);
    await click(page.locator('button[type=submit]'));
    await page.waitForSelector('#bottom-nav', { timeout: 20000 }); await settle(1000);
  });
  // Entries: the bottom bar, then the More menu (its "↗" items open the web workspace, toured above).
  const home = new URL(page.url()).pathname;
  const labels = sel => page.locator(sel).evaluateAll(es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  const bar = (await labels('#bottom-nav button')).filter(t => t && t !== 'More');
  await click(page.locator('#bottom-nav button', { hasText: 'More' })); await R.pause(600);
  const more = [...new Set((await labels('#more-menu button.item strong, #more-menu button.tile .tile-label')).filter(t => t && !/↗|Sign out/.test(t)))];
  await page.locator('#more-menu [aria-label="Close menu"]').click().catch(() => {}); await R.pause(300);
  const entries = [...bar.map(t => ['bar', t]), ...more.filter(t => !bar.includes(t)).map(t => ['more', t])];
  for (const [kind, label] of entries) {
    R.setWhere(`${app.title} › ${label}`);
    const before = R.problems.length; let info = {};
    await scene(`${app.title} · ${label}`, NARR[`${app.key}:${label}`] || `${label}.`, async () => {
      if (new URL(page.url()).pathname !== home) { await go(home, 600); await page.waitForSelector('#bottom-nav', { timeout: 15000 }); }
      if (kind === 'more') { await click(page.locator('#bottom-nav button', { hasText: 'More' })); await R.pause(400); }
      const scope = kind === 'bar' ? page.locator('#bottom-nav button') : page.locator('#more-menu button.item, #more-menu button.tile');
      await click(scope.filter({ hasText: label }).first());
      await page.waitForURL(u => new URL(String(u)).pathname !== home, { timeout: 8000 }).catch(() => {}); await settle(900);
      info = await readScreen(page);
      await browse();
    });
    if (info.notFound) R.problems.push({ where: `${app.title} › ${label}`, kind: 'missing page', detail: page.url() });
    rep.screens.push({ label, href: new URL(page.url()).pathname, title: info.title, problems: R.problems.length - before }); save();
  }
  await R.finish();
  log(`${app.key}: ${rep.screens.length} screens, ${R.problems.length} problems`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = process.argv.slice(2);
  for (const r of ROLES) if (!r.app) if (!want.length || want.includes(r.key)) await tourRole(r).catch(e => { log('FAILED', r.key, e.message); (report[r.key] ||= { problems: [] }).problems.push({ where: r.key, kind: 'tour stopped', detail: e.message.slice(0, 300) }); save(); });
  for (const a of APPS) if (!want.length || want.includes(a.key)) await tourApp(a).catch(e => { log('FAILED', a.key, e.message); (report[a.key] ||= { problems: [] }).problems.push({ where: a.key, kind: 'tour stopped', detail: e.message.slice(0, 300) }); save(); });
  save();
})();
