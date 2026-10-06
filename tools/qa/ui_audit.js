// UI audit: every screen of the RBAC sheet, opened by the role that uses it,
// at desktop (1440px) and phone (390px) width. Measured on each page:
//   - overflow: the page scrolls sideways, and which elements stick out
//   - squeezed: the page's content gets well under the screen's width on a phone
//   - unstyled controls: form fields left in the browser's default look
//   - broken images
//   - controls with no name (icon buttons without a label, inputs without one)
//   - text below WCAG AA contrast against its background
//   - tap targets smaller than 24px on the phone
//   - page errors
//
//   node ui_audit.js [screen ids]  ->  out/ui_audit.json, out/ui/<screen>-<width>.png
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const { DIR, OUT, BASE, rec, ACCOUNTS, log, signIn } = require('./lib');

const only = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(`${DIR}/rbac_cases.json`, 'utf8'))
  .filter(c => c.scenario === 'authorized' && (!only.length || only.includes(c.scr)));
const WIDTHS = [[1440, 900], [390, 844]];

function measure(phone) {
  const W = innerWidth;
  const out = { unstyled: [], squeezed: 0, overflow: 0, stickOut: [], broken: [], unnamed: [], contrast: [], small: [] };
  const name = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = [...el.classList].slice(0, 2).map(c => '.' + c).join('');
    const t = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls}${t ? ` "${t}"` : ''}`;
  };
  const visible = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0;
  };
  const scrollsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const main = document.querySelector('main.main, .main, main');
  const mw = main ? main.getBoundingClientRect().width : W;
  if (phone && mw < W * 0.8) out.squeezed = Math.round(mw);
  out.overflow = Math.max(0, document.documentElement.scrollWidth - W);
  if (out.overflow > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 && r.width > 0 && visible(el) && !scrollsX(el) && !(el.parentElement && el.parentElement.getBoundingClientRect().right > W + 1)) out.stickOut.push(`${name(el)} (+${Math.round(r.right - W)}px)`);
      if (out.stickOut.length >= 4) break;
    }
  }
  for (const el of document.querySelectorAll('select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]):not([type=color])')) {
    if (!visible(el)) continue;
    const st = getComputedStyle(el);
    if (st.borderTopLeftRadius === '0px' && /rgb\((118|133), (118|133), (118|133)\)/.test(st.borderTopColor)) out.unstyled.push(name(el));
    if (out.unstyled.length >= 6) break;
  }
  for (const img of document.images) if (img.complete && img.naturalWidth === 0 && visible(img)) out.broken.push(img.getAttribute('src'));
  for (const el of document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea')) {
    if (!visible(el)) continue;
    const tag = el.tagName;
    let named;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      named = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.getAttribute('placeholder') || ['submit', 'button'].includes(el.type) && el.value;
    } else {
      named = (el.innerText || '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby') || el.querySelector('img[alt]:not([alt=""])');
    }
    if (!named) out.unnamed.push(name(el) + (el.querySelector('svg') ? ' (icon)' : ''));
    if (phone) {
      const r = el.getBoundingClientRect();
      const inText = tag === 'A' && getComputedStyle(el).display === 'inline';
      if (!inText && (r.width < 24 || r.height < 24) && tag !== 'INPUT' || (tag === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && (r.width < 16))) out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
  }
  // contrast of text against the first opaque background behind it
  const rgb = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = el => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.backgroundImage !== 'none') return null; const c = rgb(s.backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) return c; } return [255, 255, 255]; };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); const el = n.parentElement;
    if (!t || !el || seen.has(el) || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el); const fg = rgb(s.color); const bg = bgOf(el);
    if (!fg || !bg || (fg.length > 3 && fg[3] < 0.2)) continue;
    const a = fg.length > 3 ? fg[3] : 1;
    const mixed = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
    const L1 = lum(mixed), L2 = lum(bg.slice(0, 3));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < need && !el.closest('[disabled], [aria-disabled=true], .disabled')) out.contrast.push(`"${t.slice(0, 30)}" ${ratio.toFixed(2)}:1 (${s.color} on rgb(${bg.slice(0, 3).join(',')}), ${Math.round(size)}px)`);
  }
  return out;
}

(async () => {
  fs.mkdirSync(`${OUT}/ui`, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const byAccount = {};
  for (const c of cases) (byAccount[c.account] ||= []).push(c);
  for (const [acct, list] of Object.entries(byAccount)) {
    const a = ACCOUNTS[acct];
    for (const [w, h] of WIDTHS) {
      const phone = w < 500;
      if (a && a.app && !phone) continue; // the parent app is a phone app
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      page.on('dialog', d => d.dismiss().catch(() => {}));
      if (a) await signIn(page, a).catch(e => log('sign-in failed', acct, e.message.split('\n')[0]));
      for (const c of list) {
        const errors = [];
        const onErr = e => errors.push(e.message.slice(0, 120));
        page.on('pageerror', onErr);
        const own = c.record ? rec.own[c.record] : null;
        await page.goto(BASE + c.path + (own != null ? `?id=${own}` : '')).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(800);
        const m = await page.evaluate(measure, phone).catch(e => ({ error: e.message }));
        page.off('pageerror', onErr);
        const shot = `${OUT}/ui/${c.scr}-${w}.png`;
        await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
        results.push({ scr: c.scr, name: c.name, module: c.module, account: acct, width: w, path: c.path, errors, ...m });
        const flags = [m.squeezed && `squeezed to ${m.squeezed}px`, m.overflow > 1 && `overflow +${m.overflow}px`, m.unstyled?.length && `${m.unstyled.length} unstyled fields`, m.broken?.length && `${m.broken.length} broken img`, m.unnamed?.length && `${m.unnamed.length} unnamed`, m.contrast?.length && `${m.contrast.length} low contrast`, m.small?.length && `${m.small.length} small targets`, errors.length && 'page error'].filter(Boolean);
        log(String(w).padEnd(5), c.scr, c.name.slice(0, 40).padEnd(40), flags.join(', '));
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/ui_audit.json`, JSON.stringify(results, null, 1));
  log('done', results.length, 'page views');
})();
