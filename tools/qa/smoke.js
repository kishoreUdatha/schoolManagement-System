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
const { DIR, OUT, ACCOUNTS, log, signIn, checkAuthorized } = require('./lib');

const cases = JSON.parse(fs.readFileSync(`${DIR}/cases.json`, 'utf8'));
const only = process.argv.slice(2);

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
      const got = signInError
        ? { problems: [`Could not sign in as ${a.who}: ${signInError}`], r: { url: '', title: '' }, summary: '' }
        : await checkAuthorized(page, c, a, `${OUT}/evidence/${c.id}.png`);
      const { problems } = got;
      const status = problems.length ? 'Fail' : c.mismatch ? 'Blocked' : 'Pass';
      const actual = status !== 'Fail'
        ? `${c.mismatch ? `Not run as written: ${c.mismatch} Run instead as the role that uses it — ` : ''}${got.summary}`
        : problems.join('; ');
      results.push({ ...c, status, actual, problems, notes: got.notes || [], url: got.r.url, title: got.r.title, tester: 'Automated smoke run (tools/qa/smoke.js)', evidence: `tools/qa/out/evidence/${c.id}.png` });
      log(status, c.id, c.scr, c.name, status === 'Fail' ? '— ' + problems[0] : '');
    }
    await ctx.close();
  }
  await browser.close();
  // a run of some cases replaces just those in the last full run
  const file = `${OUT}/results.json`;
  if (only.length && fs.existsSync(file)) {
    const redone = new Map(results.map(r => [r.id, r]));
    const all = JSON.parse(fs.readFileSync(file, 'utf8')).map(r => redone.get(r.id) || r);
    results.splice(0, results.length, ...all);
  }
  fs.writeFileSync(file, JSON.stringify(results, null, 1));
  log(`${results.filter(r => r.status === 'Pass').length} pass, ${results.filter(r => r.status === 'Fail').length} fail`);
})();
