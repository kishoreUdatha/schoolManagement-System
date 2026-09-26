// Runs the RBAC Tests sheet (tools/qa/build_rbac.py -> rbac_cases.json).
//
// Authorized access: as in the smoke run — the role opens its screen, which
// loads with no errors and nothing from the second school; a page about one
// record also refuses the second school's record.
//
// Unauthorized access: a signed-in user who must not have the screen opens it
// directly (with a real record of their own school where the page takes one).
// Every API answer is watched. It passes when the screen's protected calls are
// refused and nothing protected reaches the page: no protected API answered
// with data, and none of the people the intruder has no business seeing shown.
//
//   node rbac.js [case ids]   ->  out/rbac_results.json, out/rbac_evidence/*.png
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const { DIR, OUT, rec, ACCOUNTS, log, signIn, open, checkAuthorized } = require('./lib');

const cases = JSON.parse(fs.readFileSync(`${DIR}/rbac_cases.json`, 'utf8'));
const only = process.argv.slice(2);

// What each intruder may legitimately be answered on any page (their own
// account, the school's name and logo), and what is protected from them.
const INTRUDER = {
  // a parent on a school screen: only their own parent API is theirs
  parent_web: {
    // (my-permissions and the staff dashboard answer about the caller: [] and "nothing assigned" for a parent)
    own: /^\/api\/v1\/(parent\/|branding\/me|account\/|[a-z-]+\/auth\/|staff\/my-permissions|staff\/dashboard)/,
    // children and parents of the school other than Neha's own family
    people: ['Diya Singh', 'Kabir Shah', 'Vikram Singh', 'Ritu Shah'],
  },
  // a school admin on a platform screen: anything of the platform is protected
  school_admin: { protectedOnly: /^\/api\/v1\/(super-admin|platform)\//, people: [rec.other.school_name] },
  // a teacher on the parent's screens: the parent API is protected
  teacher: { protectedOnly: /^\/api\/v1\/parent\//, people: [] },
};
const isProtected = (who, path) => {
  const rule = INTRUDER[who];
  return rule.protectedOnly ? rule.protectedOnly.test(path) : !rule.own.test(path);
};

async function checkDenied(page, c) {
  const own = c.record ? rec.own[c.record] : null;
  const path = c.path + (own != null ? `?id=${own}` : '');
  const r = await open(page, path);
  const served = r.ok.map(x => x.split(' ')).filter(([, , p]) => isProtected(c.account, p)).map(x => x.join(' '));
  const shown = INTRUDER[c.account].people.filter(n => n && r.text.includes(n));
  const refused = r.http.filter(h => /^(401|403|404)/.test(h));
  const problems = [];
  if (served.length) problems.push(`Protected data returned: ${served.slice(0, 3).join(', ')}${served.length > 3 ? ` (+${served.length - 3} more)` : ''}`);
  if (shown.length) problems.push(`Page shows people this user must not see: ${shown.join(', ')}`);
  const where = r.url !== path ? `; the app moved them to ${r.url}` : '';
  const summary = `Signed in as ${ACCOUNTS[c.account].who}, who must not have this screen; opened ${path} directly${where}. `
    + (refused.length ? `The server refused its data (${refused.length} call${refused.length > 1 ? 's' : ''}, e.g. ${refused[0]})` : 'No protected data was requested or returned')
    + '; nothing protected reached the page.';
  return { problems, r, path, summary, served, refused };
}

(async () => {
  fs.mkdirSync(`${OUT}/rbac_evidence`, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const byAccount = {};
  for (const c of cases) if (!only.length || only.includes(c.id)) (byAccount[`${c.account}`] ||= []).push(c);
  for (const [acct, list] of Object.entries(byAccount)) {
    const a = ACCOUNTS[acct];
    let page = null, ctx = null, signInError = null;
    if (acct !== 'null') {
      ctx = await browser.newContext({ viewport: a && a.app ? { width: 412, height: 915 } : { width: 1440, height: 900 } });
      page = await ctx.newPage();
      page.on('dialog', d => d.dismiss().catch(() => {}));
      if (a) await signIn(page, a).catch(e => { signInError = e.message.split('\n')[0]; });
    }
    for (const c of list) {
      let status, actual, problems = [], extra = {};
      if (c.scenario === 'unauthorized' && !c.account) {
        status = 'Not Applicable';
        actual = 'Public page (All Users): there is no role to lack and no protected data on it.';
      } else if (signInError) {
        status = 'Fail'; problems = [`Could not sign in as ${a.who}: ${signInError}`]; actual = problems[0];
      } else {
        const got = c.scenario === 'authorized' ? await checkAuthorized(page, c, a) : await checkDenied(page, c);
        await page.screenshot({ path: `${OUT}/rbac_evidence/${c.id}.png` }).catch(() => {});
        problems = got.problems;
        status = problems.length ? 'Fail' : c.mismatch ? 'Blocked' : 'Pass';
        actual = status === 'Fail' ? problems.join('; ') : `${c.mismatch ? `Not run as written: ${c.mismatch} Run instead as the role that uses it — ` : ''}${got.summary}`;
        extra = { served: got.served, refused: got.refused, ok: got.r.ok, url: got.r.url };
      }
      results.push({ ...c, status, actual, problems, ...extra, tester: 'Automated RBAC run (tools/qa/rbac.js)', evidence: `tools/qa/out/rbac_evidence/${c.id}.png` });
      log(status.padEnd(7), c.id, c.scr, c.scenario.padEnd(12), c.name, status === 'Fail' ? '— ' + problems[0].slice(0, 150) : '');
    }
    if (ctx) await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/rbac_results.json`, JSON.stringify(results, null, 1));
  const n = s => results.filter(r => r.status === s).length;
  log(`${n('Pass')} pass, ${n('Fail')} fail, ${n('Not Applicable')} not applicable`);
})();
