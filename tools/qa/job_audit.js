// The job audit (build_job_audit.py -> job_audit_cases.json): each job's
// holder, office staff with only that job's permissions, opens every screen
// the job's menu promises. It passes as a role's own screen does in the smoke
// run: loads with no API or page errors and nothing from the other school.
//
//   node job_audit.js [job permissions]  ->  out/job_audit_results.json, out/job_evidence/*.png
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const { DIR, OUT, log, signIn, checkAuthorized } = require('./lib');

const cases = JSON.parse(fs.readFileSync(`${DIR}/job_audit_cases.json`, 'utf8'));
const accounts = JSON.parse(fs.readFileSync(`${DIR}/job_audit_accounts.json`, 'utf8'));
const only = process.argv.slice(2);

(async () => {
  fs.mkdirSync(`${OUT}/job_evidence`, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const byJob = {};
  for (const c of cases) if (!only.length || only.includes(c.job)) (byJob[c.job] ||= []).push(c);
  for (const [job, list] of Object.entries(byJob)) {
    const acc = accounts[job];
    const a = { form: '/welcome/sign-in?role=staff', email: acc.email, pw: acc.password, who: `${acc.email} (office staff holding only: ${acc.permissions.join(', ')})` };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    let signInError = null;
    await signIn(page, a).catch(e => { signInError = e.message.split('\n')[0]; });
    for (const c of list) {
      const file = `${OUT}/job_evidence/${c.id.replace(/[^\w-]/g, '_')}.png`;
      const got = signInError ? { problems: [`Could not sign in as ${a.who}: ${signInError}`], summary: '' } : await checkAuthorized(page, c, a, file);
      const status = got.problems.length ? 'Fail' : 'Pass';
      results.push({ ...c, status, problems: got.problems, actual: status === 'Pass' ? got.summary : got.problems.join('; ') });
      log(status, c.id, c.path, status === 'Fail' ? '— ' + got.problems.slice(0, 2).join(' | ').slice(0, 220) : '');
    }
    await ctx.close();
  }
  await browser.close();
  const file = `${OUT}/job_audit_results.json`;
  let all = results;
  if (only.length && fs.existsSync(file)) {
    const redone = new Map(results.map(r => [r.id, r]));
    all = JSON.parse(fs.readFileSync(file, 'utf8')).filter(r => !only.includes(r.job)).concat(results);
  }
  fs.writeFileSync(file, JSON.stringify(all, null, 1));
  log(`${all.filter(r => r.status === 'Pass').length} pass, ${all.filter(r => r.status === 'Fail').length} fail`);
})();
