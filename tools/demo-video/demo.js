// Narrated desktop demo: a new school from onboarding to its first day, every role.
// Records one continuous browser video; writes timeline.json for the voiceover.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const DIR = __dirname, BASE = 'http://localhost:3100';
const W = 1440, H = 900;
const CODE = process.env.CODE || 'SUNRISE'; const DOM = CODE.toLowerCase() + '.test';
const timeline = [];
let t0 = 0, sceneNo = 0, page;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function wavSeconds(f) { const b = fs.readFileSync(f); return (b.length - 44) / b.readUInt32LE(28); }
const NARRATION = JSON.parse(fs.readFileSync(`${DIR}/narration.json`, 'utf8'));
function speak(text, i) {
  const f = `${DIR}/audio/s${String(i).padStart(3, '0')}.wav`;
  fs.writeFileSync(`${DIR}/audio/tmp.txt`, NARRATION[i - 1] || text);
  execSync(`${process.env.PY || 'python3'} ${DIR}/tts.py ${DIR}/audio/tmp.txt ${f}`, { stdio: ['ignore', 'pipe', 'inherit'] });
  return { f, d: wavSeconds(f) };
}

(async () => {
  fs.mkdirSync(`${DIR}/audio`, { recursive: true }); fs.mkdirSync(`${DIR}/video`, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: `${DIR}/video`, size: { width: W, height: H } } });
  // Caption box survives full page loads: it is re-drawn from localStorage.demo_cap.
  await ctx.addInitScript(() => {
    const draw = () => {
      let c; try { c = JSON.parse(localStorage.getItem('demo_cap') || 'null'); } catch { c = null; }
      if (!c || !document.body) return;
      let d = document.getElementById('__demo_cap');
      if (!d) { d = document.createElement('div'); d.id = '__demo_cap'; document.body.appendChild(d); }
      const side = c.side;
      Object.assign(d.style, {
        position: 'fixed', zIndex: 2147483647, pointerEvents: 'none', boxSizing: 'border-box',
        background: 'rgba(12,20,42,.94)', color: '#fff', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,.25)',
        font: '500 17px/1.45 Inter, system-ui, sans-serif', padding: '14px 18px',
        ...(side ? { left: '40px', top: '50%', transform: 'translateY(-50%)', width: '400px', bottom: 'auto' } : { left: '50%', bottom: '18px', transform: 'translateX(-50%)', width: 'min(980px, 80vw)', top: 'auto' }),
      });
      d.innerHTML = `<div style="font:700 12px/1 Inter,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;margin-bottom:7px">${c.badge}</div><div>${c.text}</div>`;
    };
    window.__demoDraw = draw;
    document.addEventListener('DOMContentLoaded', draw);
    setInterval(draw, 700);
  });
  page = await ctx.newPage();
  t0 = Date.now();
  page.on('pageerror', e => log('PAGEERROR', e.message));
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) log('HTTP', r.status(), r.url().replace(/^https?:\/\/[^/]+/, '')); });

  const pause = ms => page.waitForTimeout(ms);
  const settle = async (ms = 500) => { await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await pause(ms); };
  let side = false, badge = '';
  const cap = async (text) => {
    await page.evaluate(([t, b, s]) => { localStorage.setItem('demo_cap', JSON.stringify({ text: t, badge: b, side: s })); window.__demoDraw && window.__demoDraw(); }, [text, badge, side]).catch(() => {});
  };
  // One narrated step: caption + voice, then the actions; waits so the voice finishes.
  const scene = async (b, text, fn = async () => {}, { hold = 700 } = {}) => {
    badge = b; sceneNo++;
    const { f, d } = speak(text.replace(/<[^>]+>/g, ''), sceneNo);
    const start = Date.now();
    timeline.push({ file: f, at: (start - t0) / 1000, dur: d });
    await cap(NARRATION[sceneNo - 1] || text);
    log(`scene ${sceneNo} (${d.toFixed(1)}s): ${text.replace(/<[^>]+>/g, '').slice(0, 70)}`);
    await fn();
    const left = d * 1000 - (Date.now() - start);
    if (left > 0) await pause(left);
    await pause(hold);
  };
  const ring = async (loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.evaluate(e => { e.__o = e.style.outline; e.style.outline = '3px solid #f59e0b'; e.style.outlineOffset = '3px'; e.style.transition = 'outline .2s'; }).catch(() => {});
    await pause(650);
    await loc.evaluate(e => { e.style.outline = e.__o || ''; }).catch(() => {});
  };
  const click = async (loc) => { await ring(loc); await loc.click(); };
  const type = async (loc, text, delay = 28) => { await ring(loc); await loc.click(); await loc.fill(''); await loc.pressSequentially(text, { delay }); };
  const setv = async (loc, v) => { await ring(loc); await loc.fill(v); };
  const go = async (path, ms = 900) => { await page.goto(BASE + path); await settle(ms); };
  const signOut = async () => { await page.evaluate(() => { const c = localStorage.getItem('demo_cap'); localStorage.clear(); sessionStorage.clear(); if (c) localStorage.setItem('demo_cap', c); }); };
  const btn = (name, scope = page) => scope.getByRole('button', { name, exact: typeof name === 'string' });
  const L = (label, exact = false) => page.getByLabel(label, { exact }).first();
  const confirmDialog = async () => { const d = page.getByRole('dialog'); if (await d.count()) { await click(d.getByRole('button').filter({ hasText: /Confirm|Approve|Publish|Yes/ }).last()); await settle(1200); } };
  const firstLogin = async (tmp, next) => {
    await type(page.locator('input[name=current_password]'), tmp, 10); await type(page.locator('input[name=new_password]'), next, 20); await type(page.locator('input[name=confirm_password]'), next, 20);
    await click(btn('Set password')); await settle(1500);
  };
  const pw = {};

  // ---------- intro ----------
  await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#1d4ed8,#38bdf8);font-family:Inter,system-ui,sans-serif;color:#fff">
    <div style="text-align:center"><div style="font-size:22px;letter-spacing:.2em;opacity:.85">BRIGHTCAMPUS SCHOOL ERP</div>
    <h1 style="font-size:60px;margin:18px 0 10px">A new school, from sign-up to its first day</h1>
    <p style="font-size:24px;opacity:.9">Platform · School admin · Teacher · Parent · Student · Accountant · Principal</p></div></body></html>`);
  await scene('Demo', 'Welcome to BrightCampus. In this demo we onboard a brand new school, set it up, and then run its first school day through every role: the platform team, the school admin, a teacher, parents, a student, the accountant and the principal.', async () => {}, { hold: 400 });

  // ---------- 1. platform ----------
  await go('/welcome/sign-in?role=super_admin');
  await scene('Step 1 · Platform super admin', 'We start as the BrightCampus platform team. The super admin signs in to the platform workspace.', async () => {
    await type(page.locator('input[name=email]'), 'admin@sms.local'); await type(page.locator('input[name=password]'), 'ChangeMe123!', 20);
    await click(btn('Sign in')); await settle(1500);
  });
  await scene('Step 1 · Platform super admin', 'This is the platform dashboard. Every school on BrightCampus is an organization here, with its own subscription plan, usage and billing.', async () => { await pause(1200); });
  await go('/platform/subscription-plans');
  await scene('Step 1 · Subscription plan', 'First, a plan to sell. The super admin creates the Standard School plan: its tier, monthly and yearly price, limits, and the modules it includes.', async () => {
    await click(btn('Create plan').first()); await settle(600);
    await type(page.locator('input[name=name]'), 'Standard School', 22); await page.selectOption('select[name=tier]', 'standard');
    await setv(page.locator('input[name=price_monthly]'), '15000'); await setv(page.locator('input[name=price_yearly]'), '150000');
    await type(page.locator('input[name=description]'), 'Everything a K-12 school needs', 12);
    await click(page.locator('form').getByRole('button', { name: 'Create plan' })); await settle(1200);
  });
  await go('/platform/add-organization');
  await scene('Step 2 · Onboard a new school', 'A new school has signed up: Sunrise Public School. The super admin enters the school, its office contact and the person who will run it, the school admin.', async () => {
    const f = { name: 'Sunrise Public School', code: CODE, contact_person: 'Kavitha Rao', contact_email: `office@${DOM}`, contact_mobile: '9845000001', address: '45 MG Road, Pune', school_admin_name: 'Kavitha Rao', school_admin_email: `admin@${DOM}`, school_admin_phone: '9845000002' };
    for (const [k, v] of Object.entries(f)) await type(page.locator(`input[name=${k}]`), v, 14);
  });
  await scene('Step 2 · Onboard a new school', 'We pick the Standard plan, billed yearly, and create the organization. BrightCampus creates the tenant, the school and the admin login in one go.', async () => {
    const opts = await page.locator('select[name=plan_id] option').allTextContents(); const i = opts.findIndex(o => o.includes('Standard School'));
    await ring(page.locator('select[name=plan_id]')); if (i >= 0) await page.selectOption('select[name=plan_id]', { index: i });
    await click(page.locator('#org-form').getByRole('button', { name: 'Create organization' })); await settle(2000);
    const t = await page.locator('body').innerText(); pw.admin = (t.match(/Temporary password\s*\n\s*(\S+)/) || [])[1];
    await ring(page.getByText('Temporary password').first());
  });
  await scene('Step 2 · Onboard a new school', 'The admin\'s temporary password is shown only once. It is never stored in plain text. WhatsApp and SMS delivery are not configured on this test server, so we hand the password over ourselves.', async () => { await pause(1500); });

  // ---------- 2. school admin ----------
  await signOut(); await go('/welcome/sign-in?role=school_admin');
  await scene('Step 3 · School admin first sign-in', 'Now we are Kavitha, the school admin. She signs in with the temporary password.', async () => {
    await type(page.locator('input[name=email]'), `admin@${DOM}`); await type(page.locator('input[name=password]'), pw.admin, 20);
    await click(btn('Sign in')); await settle(1500);
  });
  await scene('Step 3 · School admin first sign-in', 'Because the password was issued by someone else, BrightCampus makes her choose her own before going any further.', async () => { await firstLogin(pw.admin, 'Sunrise@2026'); });
  await scene('Step 3 · School admin dashboard', 'Her dashboard is empty: no students and no teachers yet. A setup guide shows what is left to do. We continue the setup.', async () => {
    await pause(800); await click(page.getByRole('button', { name: /Continue setup/ }).or(page.getByRole('link', { name: /Continue setup/ })).first()); await settle(1200);
  });

  // ---------- 3. setup wizard ----------
  await scene('Step 4 · Setup wizard', 'The setup wizard walks through eleven steps. Step one, school details, is already done: the address, phone and email came across from onboarding, so the admin does not type them twice.', async () => {
    await ring(page.getByRole('button', { name: /School$/ }).first()); await pause(1500);
  });
  await scene('Step 4 · Setup wizard · Academic year', 'Step two, the academic year. 2026 to 27, June to March, split into two semesters.', async () => {
    await type(L('Year name'), '2026-27'); await page.getByLabel('Split into').selectOption('2');
    await setv(L('Starts'), '2026-06-01'); await setv(L('Ends'), '2027-03-31');
    await click(btn('Create the year and its terms')); await settle(1200);
  });
  await scene('Step 4 · Setup wizard · Classes', 'Step three, classes and sections. For this demo the school runs Grade 3, with one section, A, of up to 35 students.', async () => {
    const names = ['Nursery', 'LKG', 'UKG'].concat([...Array(12)].map((_, i) => `Grade ${i + 1}`));
    for (const n of names) { const c = page.getByLabel(n, { exact: true }); if (await c.count()) { if (n === 'Grade 3') await c.check(); else await c.uncheck(); } }
    await ring(page.getByLabel('Grade 3', { exact: true })); await type(page.getByLabel('Sections in each class'), 'A'); await type(page.getByLabel('Students per section'), '35');
    await click(page.getByRole('button', { name: /^Create \d+ class/ })); await settle(1200);
  });
  await scene('Step 4 · Setup wizard · Subjects', 'Step four, subjects. The common ones are ticked: English, Hindi, Mathematics, Science, Social Studies and Computer Science. They are added to Grade 3.', async () => {
    await pause(800); await click(page.getByRole('button', { name: /^Add \d+ subjects/ })); await settle(1200);
  });
  await scene('Step 4 · Setup wizard · Periods', 'Step five, the school day. Six periods of 45 minutes from 8:45, with a 15 minute break after period three, for every working day.', async () => {
    await setv(L('First period starts'), '08:45'); await type(L('Periods a day'), '6'); await type(L('Minutes per period'), '45');
    await type(L('Break after period'), '3'); await type(L('Break minutes'), '15');
    await click(btn('Create this day for every working day')); await settle(1200);
  });
  await scene('Step 4 · Setup wizard · Grading', 'Step six, grading. One click sets up the CBSE grading scale.', async () => { await click(btn('Use the CBSE scale')); await settle(1200); });
  await scene('Step 4 · Setup wizard · Staff', 'Step seven, staff. Each person gets their own login. We add two teachers, Meera and Rohan, then the accountant, the principal, and Suresh, the librarian, as office staff.', async () => {
    const people = [['Meera Joshi', `meera@${DOM}`, 'teacher', 'Class teacher'], ['Rohan Kulkarni', `rohan@${DOM}`, 'teacher', 'Science teacher'], ['Farah Khan', `accounts@${DOM}`, 'accountant', 'Accountant'], ['Anil Deshpande', `principal@${DOM}`, 'principal', 'Principal'], ['Suresh Patil', `library@${DOM}`, 'staff', 'Librarian']];
    for (const [n, e, r, d] of people) {
      await type(L('Full name'), n, 18); await type(L('Email (their login)'), e, 12); await page.getByLabel('Role').selectOption(r); await L('Designation').fill(d);
      await click(btn('Add this person')); await settle(900);
    }
    const t = await page.locator('body').innerText();
    for (const e of [`meera@${DOM}`, `rohan@${DOM}`, `accounts@${DOM}`, `principal@${DOM}`, `library@${DOM}`]) pw[e] = (t.match(new RegExp(e.replace(/\./g, '\\.') + ' · (\\S+)')) || [])[1];
  });
  await scene('Step 4 · Setup wizard · Staff', 'Their temporary passwords are listed once, to hand over. Everyone will be asked to change theirs at first sign-in.', async () => { await ring(page.locator('.wizard-passwords').first()); await pause(600); await click(btn('Next step')); await settle(1000); });
  await scene('Step 4 · Setup wizard · Fees', 'Step eight, fees. Monthly tuition of 3,200 rupees and a one time admission fee of 8,000 rupees for Grade 3, due on the tenth of the month.', async () => {
    await type(L('Tuition Fee for Grade 3', true), '3200'); await type(L('Admission Fee for Grade 3', true), '8000'); await type(page.getByLabel('Due on day of the month'), '10');
    const b = (await page.getByRole('button').allInnerTexts()).map(x => x.trim()).find(x => /^Save \d+ fee/.test(x)); await click(btn(b)); await settle(1200);
  });
  await scene('Step 4 · Setup wizard · Students', 'Step nine, students. Each child joins Grade 3 A, and a parent email creates the parent\'s login at the same time. We add Aarav, Diya and Kabir.', async () => {
    const kids = [['Aarav Mehta', 'male', '04122018', 'Neha Mehta', 'neha.mehta@family.test', '9811000011', 'mother'], ['Diya Singh', 'female', '07302018', 'Vikram Singh', 'vikram.singh@family.test', '9811000012', 'father'], ['Kabir Shah', 'male', '01152019', 'Ritu Shah', 'ritu.shah@family.test', '9811000013', 'mother']];
    for (const [n, g, dob, pn, pe, pm, rel] of kids) {
      await type(L('Student’s full name'), n, 18); await page.getByLabel('Gender').selectOption(g); await setv(L('Date of birth'), `${dob.slice(4)}-${dob.slice(0,2)}-${dob.slice(2,4)}`);
      await type(L('Parent’s name'), pn, 14); await type(L('Parent’s email'), pe, 10); await L('Parent’s mobile').fill(pm); await page.getByLabel('Relation').selectOption(rel);
      await click(btn('Add this student')); await settle(1000);
    }
    const t = await page.locator('body').innerText();
    for (const e of ['neha.mehta@family.test', 'vikram.singh@family.test', 'ritu.shah@family.test']) pw[e] = (t.match(new RegExp('\\(' + e.replace(/\./g, '\\.') + '\\) · (\\S+)')) || [])[1];
  });
  await scene('Step 4 · Setup wizard · Done', 'Three students and three parent logins. The one time admission fee has already been charged to each child, due on the next tenth. Setup shows nine of nine essential steps done.', async () => {
    await ring(page.locator('.wizard-passwords').first()); await click(btn('Next step')); await settle(900);
    const skip = btn('Skip for now'); if (await skip.count()) { await click(skip); await settle(700); } if (await skip.count()) { await click(skip); await settle(900); }
  }, { hold: 1200 });

  // ---------- 4. teachers, timetable ----------
  await go('/staff/teacher-allocation', 1200);
  await scene('Step 5 · Class teacher', 'Next, who looks after the class. Meera becomes the class teacher of Grade 3 A. She will mark its daily register and approve its leave requests.', async () => {
    const s = page.getByLabel('Class teacher for Grade 3 A'); await ring(s); await s.selectOption({ label: 'Meera Joshi' }); await settle(900);
  });
  await go('/staff/subject-class-assignment', 1200);
  await scene('Step 6 · Subject teachers', 'Now each subject gets a teacher and a number of periods a week. Meera takes English, Hindi and Maths, and Rohan takes Science, Social Studies and Computer Science.', async () => {
    const plan = { English: ['Meera Joshi', 5], Hindi: ['Meera Joshi', 3], Mathematics: ['Meera Joshi', 5], Science: ['Rohan Kulkarni', 4], 'Social Studies': ['Rohan Kulkarni', 4], 'Computer Science': ['Rohan Kulkarni', 3] };
    for (const [s, [who, n]] of Object.entries(plan)) { const sel = page.getByLabel(`Teacher for ${s}`); await ring(sel); await sel.selectOption({ label: who }); await settle(300); const p = page.getByLabel(`Periods a week for ${s}`); await p.fill(String(n)); await p.blur(); await settle(300); }
  });
  await go('/timetable/generate-timetable', 1200);
  await scene('Step 7 · Timetable', 'With teachers and periods in place, BrightCampus can build the timetable itself. We choose Grade 3 A and generate.', async () => {
    const c = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select class' }) }); await ring(c); await c.selectOption({ label: 'Grade 3' }); await settle(600);
    const s = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select section' }) }); await s.selectOption({ label: 'A' }); await settle(900);
    await click(page.locator('main').getByRole('button', { name: 'Generate timetable' }).last()); await settle(700); await confirmDialog();
  });
  await scene('Step 7 · Timetable', 'Every subject got the periods it needs, with no teacher in two places at once. Let\'s look at the week, and publish it so teachers, parents and students can see it.', async () => {
    const sid = execSync(`PGPASSWORD=sms psql -h localhost -U sms -d erp -Atc "select sec.id from sections sec join school_classes c on c.id=sec.class_id join schools s on s.id=sec.school_id where s.code='${CODE}' and c.name='Grade 3' and sec.name='A'"`).toString().trim();
    await go(`/timetable/timetable-setup?section=${sid}`, 1500); await pause(1200); await click(btn('Publish')); await settle(1000); await confirmDialog();
  }, { hold: 1500 });
  await go('/students/student-logins', 1200);
  await scene('Step 8 · Student logins', 'Older students get their own app login too. One click creates passwords for the whole class. Students sign in with the school code, their admission number and this password.', async () => {
    await click(btn('Logins for a class')); await settle(500);
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Choose a class' }) }).selectOption({ label: 'Grade 3' });
    await click(btn('Create passwords')); await settle(1500);
    const t = await page.locator('body').innerText(); for (const m of t.matchAll(/(S\d{5})\t(\S{8,16})\tNew/g)) pw[m[1]] = m[2];
  });
  await go('/communication/notification-campaigns', 1200);
  await scene('Step 9 · Welcome notice', 'Before the first day, the admin sends a welcome notice to all parents. It reaches the parent app straight away.', async () => {
    await type(page.locator('input[name=title]'), 'Welcome to Sunrise Public School!', 18);
    await page.getByLabel('Audience', { exact: false }).selectOption('all_parents');
    await type(page.locator('textarea[name=body]'), 'Dear parents, classes begin on Monday. Please install the BrightCampus app and sign in with the details from the office.', 8);
    await click(btn('Send now')); await settle(1500); await confirmDialog();
  });

  // ---------- 5. teacher ----------
  await signOut(); side = true; await go('/teacher/sign-in');
  await scene('Step 10 · Teacher app', 'It is the first school day. Meera opens the BrightCampus teacher app, shown here in a desktop browser, and signs in with her temporary password.', async () => {
    await type(page.locator('input[name=email]'), `meera@${DOM}`); await type(page.locator('input[name=password]'), pw[`meera@${DOM}`], 18);
    await click(page.locator('button[type=submit]')); await settle(1500);
  });
  side = false;
  await scene('Step 10 · Teacher first sign-in', 'She sets her own password, and is taken straight back into the teacher app.', async () => { await firstLogin(pw[`meera@${DOM}`], 'Meera@2026'); });
  side = true;
  await scene('Step 10 · Teacher · Today', 'Her Today screen shows the Grade 3 A register still to mark, today\'s classes from the published timetable, and quick actions.', async () => { await pause(1500); });
  await scene('Step 11 · Daily register', 'She marks the register. Aarav and Kabir are present. Diya is absent. When she saves, Diya\'s father is alerted automatically.', async () => {
    await click(page.locator('#screen-body button.item').first()); await settle(1200);
    const rows = page.locator('.mark-row'); const n = await rows.count();
    for (let i = 0; i < n; i++) { const who = await rows.nth(i).locator('.who strong').innerText(); await click(rows.nth(i).getByRole('radio', { name: /Diya/.test(who) ? 'Absent' : 'Present' })); }
    await click(page.getByRole('button', { name: /Save/ })); await settle(1500);
  }, { hold: 1200 });
  await go('/teacher/new-homework', 1000);
  await scene('Step 12 · Homework', 'Next, homework for English: a short paragraph about my family, marked out of ten, due tomorrow. Parents are told as soon as it is set.', async () => {
    const opts = await page.locator('select[name=class_subject_id] option').allTextContents();
    await page.selectOption('select[name=class_subject_id]', { label: opts.find(o => o.startsWith('English')) });
    await type(page.locator('input[name=title]'), 'My family paragraph', 25); await type(page.locator('textarea[name=description]'), 'Write 8 to 10 lines about your family. Upload a photo of your notebook.', 12);
    await type(page.locator('input[name=max_marks]'), '10');
    await click(page.getByRole('button', { name: 'Set homework' })); await settle(1500);
  });

  // ---------- 6. parent ----------
  await signOut(); await go('/parent/parent-sign-in');
  await scene('Step 13 · Parent app', 'Now we are Vikram, Diya\'s father, on the BrightCampus parent app. He signs in with the details the office gave him.', async () => {
    await type(page.locator('input[name=email]'), 'vikram.singh@family.test'); await type(page.locator('input[name=password]'), pw['vikram.singh@family.test'], 18);
    await click(page.locator('button[type=submit]')); await settle(1500);
  });
  side = false;
  await scene('Step 13 · Parent first sign-in', 'Office issued passwords must be changed at first sign-in, so Vikram picks his own.', async () => { await firstLogin(pw['vikram.singh@family.test'], 'Vikram@2026'); });
  side = true;
  await scene('Step 13 · Parent · Home', 'His home screen says Diya is absent today, marked by the school, and shows the new English homework. The quick access grid below works like a payments app: attendance, homework, fees, timetable, results and more.', async () => { await pause(1500); });
  await go('/parent/notifications', 1200);
  await scene('Step 13 · Parent · Notifications', 'Notifications: the absence alert, the new homework, and the school\'s welcome notice.', async () => { await pause(1200); });
  await go('/parent/fees', 1200);
  await scene('Step 13 · Parent · Fees', 'Fees show the admission fee of 8,000 rupees, due on the tenth of October.', async () => { await pause(1200); });

  // ---------- 7. student ----------
  await signOut(); await go('/student/sign-in');
  await scene('Step 14 · Student app', 'Aarav signs in to the student app with the school code, his admission number and the password from his teacher.', async () => {
    await type(page.locator('input[name=school_code]'), CODE.toLowerCase()); await type(page.locator('input[name=admission_no]'), 'S00001'); await type(page.locator('input[name=password]'), pw['S00001'], 18);
    await click(page.locator('button[type=submit]')); await settle(1500);
    const p = page.locator('input[type=password]'); const n = await p.count();
    if (n === 3) { await p.nth(0).fill(pw['S00001']); await type(p.nth(1), 'Aarav@2026', 20); await type(p.nth(2), 'Aarav@2026', 20); } else if (n === 2) { await type(p.nth(0), 'Aarav@2026', 20); await type(p.nth(1), 'Aarav@2026', 20); }
    await click(page.locator('button[type=submit]')); await settle(1500);
  });
  await scene('Step 14 · Student · Home', 'He chose his own password, and now sees his day: today\'s lessons with teachers, and the homework that is due.', async () => { await pause(1500); });
  await scene('Step 15 · Hand in homework', 'He opens the homework, writes a note, attaches a photo of his notebook, and hands it in from the app.', async () => {
    await go('/student/homework', 1000); await click(page.getByText('My family paragraph').first()); await settle(1200);
    await type(page.locator('textarea').first(), 'Done! I wrote about my grandparents too.', 25);
    await ring(page.locator('input[type=file]')); await page.locator('input[type=file]').setInputFiles(`${DIR}/notebook.png`);
    await click(page.locator('button[type=submit]')); await settle(1800);
  }, { hold: 1200 });

  // ---------- 8. teacher reviews ----------
  await signOut(); await go('/teacher/sign-in');
  await scene('Step 16 · Teacher checks homework', 'Back to Meera. She opens the homework and sees who has handed it in.', async () => {
    await type(page.locator('input[name=email]'), `meera@${DOM}`); await type(page.locator('input[name=password]'), 'Meera@2026', 18); await click(page.locator('button[type=submit]')); await settle(1500);
    await go('/teacher/homework', 1000); await click(page.getByText('My family paragraph').first()); await settle(1200);
  });
  await scene('Step 16 · Teacher checks homework', 'She opens Aarav\'s work with the attached photo, gives nine out of ten with a remark, and approves it. Aarav and his mother see the result immediately.', async () => {
    await click(page.locator('.panel button.item').first()); await settle(600);
    await type(page.locator('input[inputmode=decimal]'), '9'); await type(page.locator('textarea'), 'Lovely writing, Aarav! Watch your full stops.', 20);
    await click(page.getByRole('button', { name: 'Approve', exact: true })); await settle(1500);
  }, { hold: 1200 });

  // ---------- 9. accountant ----------
  await signOut(); side = false; await go('/welcome/sign-in?role=accountant');
  await scene('Step 17 · Accountant', 'In the office, Farah the accountant signs in for the first time and sets her password.', async () => {
    await type(page.locator('input[name=email]'), `accounts@${DOM}`); await type(page.locator('input[name=password]'), pw[`accounts@${DOM}`], 18);
    await click(btn('Sign in')); await settle(1500); await firstLogin(pw[`accounts@${DOM}`], 'Farah@2026');
  });
  await go('/fees-finance/fee-collection', 1200);
  await scene('Step 18 · Fee at the counter', 'Aarav\'s mother pays the admission fee at the counter by UPI. Farah finds Aarav, picks the fee, records the payment with the UPI reference, and a receipt is created.', async () => {
    const st = page.getByLabel('Search student'); await ring(st); await st.click(); await st.pressSequentially('Aarav', { delay: 70 }); await settle(1200);
    await click(page.getByText(/S00001 · Grade/).first()); await settle(1200);
    await page.getByLabel('Payment method', { exact: false }).selectOption('upi'); await type(page.getByLabel('Reference', { exact: false }), 'UPI-7788120', 25);
    await click(page.getByRole('button', { name: 'Record payment' }).last()); await settle(1500); await confirmDialog();
  }, { hold: 1500 });

  // ---------- 10. parent sees it ----------
  await signOut(); side = true; await go('/parent/parent-sign-in');
  await scene('Step 19 · Parent sees it all', 'Neha, Aarav\'s mother, signs in to the parent app.', async () => {
    await type(page.locator('input[name=email]'), 'neha.mehta@family.test'); await type(page.locator('input[name=password]'), pw['neha.mehta@family.test'], 18);
    await click(page.locator('button[type=submit]')); await settle(1500); side = false; await cap('Neha, Aarav\'s mother, signs in to the parent app.'); await firstLogin(pw['neha.mehta@family.test'], 'Neha@2026');
  });
  side = true;
  await go('/parent/payments-receipts', 1200);
  await scene('Step 19 · Parent · Receipt', 'The counter payment is already in her receipts: 8,000 rupees by UPI, with the receipt number and reference.', async () => { await pause(1200); });
  await go('/parent/homework', 1200);
  await scene('Step 19 · Parent · Homework', 'And under homework, Aarav\'s paragraph shows as reviewed. Nine out of ten, with the teacher\'s remark.', async () => { await click(page.getByText('Reviewed').first()).catch(() => {}); await pause(1200); });

  // ---------- 11. principal ----------
  await signOut(); side = false; await go('/welcome/sign-in?role=principal');
  await scene('Step 20 · Principal', 'Finally, the principal signs in and sets his password.', async () => {
    await type(page.locator('input[name=email]'), `principal@${DOM}`); await type(page.locator('input[name=password]'), pw[`principal@${DOM}`], 18);
    await click(btn('Sign in')); await settle(1500); await firstLogin(pw[`principal@${DOM}`], 'Anil@2026');
  });
  await scene('Step 20 · Principal dashboard', 'His dashboard shows the school at a glance: today\'s attendance, fees collected, and anything waiting for his approval, all from what the staff did today.', async () => { await pause(2500); });

  // ---------- outro ----------
  await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0f172a,#1d4ed8);font-family:Inter,system-ui,sans-serif;color:#fff">
    <div style="max-width:900px"><h1 style="font-size:46px;margin:0 0 20px">What we just tested</h1>
    <ul style="font-size:24px;line-height:1.7;opacity:.95"><li>New school onboarded by the platform, with its admin login</li><li>Full setup: year, classes, subjects, periods, grading, staff, fees, students, parents</li><li>Teachers assigned, timetable generated and published</li><li>Register, absence alert, homework set, handed in with a photo, and marked</li><li>Fee collected at the counter, receipt in the parent app</li><li>Every first sign-in asks for a new password</li></ul></div></body></html>`);
  await scene('Summary', 'That was the whole journey: a new school onboarded, set up, and running its first day, with every role connected. Teachers, parents, students and the office all see the same live information. Thank you for watching.', async () => {}, { hold: 1500 });

  fs.writeFileSync(`${DIR}/timeline.json`, JSON.stringify({ t0, scenes: timeline, pw }, null, 1));
  const v = page.video(); await ctx.close(); await browser.close();
  fs.writeFileSync(`${DIR}/video_path.txt`, await v.path());
  log('DONE', await v.path());
})().catch(async e => {
  console.error('FAILED', e);
  if (page) { await page.screenshot({ path: `${DIR}/failed.png` }).catch(() => {}); console.error('URL', page.url()); console.error((await page.locator('main').innerText().catch(() => '')).slice(0, 1500)); }
  process.exit(1);
});
