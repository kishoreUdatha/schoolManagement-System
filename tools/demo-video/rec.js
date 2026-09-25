// Recording helpers shared by the menu tour: one browser context per chapter,
// a caption box, narrated scenes, and a highlight ring round whatever is clicked.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { execSync } = require('child_process');
const fs = require('fs');

const DIR = __dirname, BASE = process.env.BASE || 'http://localhost:3100';
const W = 1440, H = 900;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wavSeconds = f => { const b = fs.readFileSync(f); return (b.length - 44) / b.readUInt32LE(28); };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

let clipNo = 0;
function speak(text, out) {
  fs.mkdirSync(`${out}/audio`, { recursive: true });
  const f = `${out}/audio/s${String(++clipNo).padStart(4, '0')}.wav`;
  fs.writeFileSync(`${out}/audio/tmp.txt`, text);
  execSync(`${process.env.PY || 'python3'} ${DIR}/tts.py ${out}/audio/tmp.txt ${f}`, { stdio: ['ignore', 'pipe', 'inherit'] });
  return { f, d: wavSeconds(f) };
}

async function chapter(out, { fast = false } = {}) {
  fs.mkdirSync(`${out}/video`, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(fast ? {} : { recordVideo: { dir: `${out}/video`, size: { width: W, height: H } } }) });
  // The caption survives full page loads: it is re-drawn from localStorage.demo_cap.
  await ctx.addInitScript(() => {
    const draw = () => {
      let c; try { c = JSON.parse(localStorage.getItem('demo_cap') || 'null'); } catch { c = null; }
      if (!c || !document.body) return;
      let d = document.getElementById('__demo_cap');
      if (!d) { d = document.createElement('div'); d.id = '__demo_cap'; document.body.appendChild(d); }
      Object.assign(d.style, {
        position: 'fixed', zIndex: 2147483647, pointerEvents: 'none', boxSizing: 'border-box',
        background: 'rgba(12,20,42,.94)', color: '#fff', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,.25)',
        font: '500 17px/1.45 Inter, system-ui, sans-serif', padding: '14px 18px',
        ...(c.side ? { left: '40px', top: '50%', transform: 'translateY(-50%)', width: '400px', bottom: 'auto' } : { left: 'calc(50% + 120px)', bottom: '18px', transform: 'translateX(-50%)', width: 'min(900px, 70vw)', top: 'auto' }),
      });
      d.innerHTML = `<div style="font:700 12px/1 Inter,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;margin-bottom:7px">${c.badge}</div><div>${c.text}</div>`;
    };
    window.__demoDraw = draw;
    document.addEventListener('DOMContentLoaded', draw);
    setInterval(draw, 700);
  });
  const page = await ctx.newPage();
  const t0 = Date.now(), timeline = [], problems = [];
  let where = '';
  page.on('dialog', d => d.accept().catch(() => {}));
  page.on('pageerror', e => problems.push({ where, kind: 'page error', detail: e.message.slice(0, 200) }));
  page.on('response', r => {
    if (r.url().includes('/api/') && r.status() >= 400) problems.push({ where, kind: `HTTP ${r.status()}`, detail: `${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}` });
  });

  const pause = ms => page.waitForTimeout(fast ? Math.min(ms, 150) : ms);
  const settle = async (ms = 500) => { await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await pause(ms); };
  const state = { side: false, badge: '' };
  const cap = text => page.evaluate(([t, b, s]) => { localStorage.setItem('demo_cap', JSON.stringify({ text: t, badge: b, side: s })); window.__demoDraw && window.__demoDraw(); }, [esc(text), esc(state.badge), state.side]).catch(() => {});
  // One narrated step: caption and voice, then the actions; waits for the voice to finish.
  const scene = async (badge, text, fn = async () => {}, { hold = 500 } = {}) => {
    state.badge = badge;
    if (fast) { log(`${badge}: ${text.slice(0, 80)}`); await fn(); return; }
    const { f, d } = speak(text, out);
    const start = Date.now();
    timeline.push({ file: f, at: (start - t0) / 1000, dur: d });
    await cap(text);
    log(`${badge} (${d.toFixed(1)}s): ${text.slice(0, 80)}`);
    await fn();
    const left = d * 1000 - (Date.now() - start);
    if (left > 0) await pause(left);
    await pause(hold);
  };
  const ring = async loc => {
    await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await loc.evaluate(e => { e.__o = e.style.outline; e.style.outline = '3px solid #f59e0b'; e.style.outlineOffset = '2px'; }).catch(() => {});
    await pause(450);
    await loc.evaluate(e => { e.style.outline = e.__o || ''; }).catch(() => {});
  };
  const click = async loc => { await ring(loc); await loc.click({ timeout: 10000 }); };
  const type = async (loc, text, delay = 25) => { await ring(loc); await loc.click(); await loc.fill(''); await loc.pressSequentially(text, { delay }); };
  const go = async (path, ms = 800) => { await page.goto(BASE + path); await settle(ms); };
  // Scroll the page body down and back, so the viewer sees the whole screen.
  const browse = async () => {
    const h = await page.evaluate(() => { const m = document.querySelector('main') || document.scrollingElement; return Math.max(m.scrollHeight - m.clientHeight, document.scrollingElement.scrollHeight - innerHeight); }).catch(() => 0);
    if (h < 80) return;
    const scrollTo = y => page.evaluate(y => { const m = document.querySelector('main'); (m && m.scrollHeight > m.clientHeight ? m : window).scrollTo({ top: y, behavior: 'smooth' }); }, y).catch(() => {});
    await scrollTo(Math.min(h, 700)); await pause(1400); await scrollTo(0); await pause(500);
  };
  const finish = async () => {
    fs.writeFileSync(`${out}/timeline.json`, JSON.stringify({ t0, scenes: timeline }, null, 1));
    const v = page.video(); await ctx.close(); await browser.close();
    if (v) fs.writeFileSync(`${out}/video_path.txt`, await v.path());
  };
  const abort = () => browser.close().catch(() => {});
  return { abort, page, ctx, pause, settle, cap, scene, ring, click, type, go, browse, finish, problems, state, setWhere: w => { where = w; } };
}

module.exports = { chapter, log, BASE, DIR };
