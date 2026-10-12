/* Carrega o app de verdade (index.html + scripts) no jsdom para testar a tela. */
const path = require('path');
const { JSDOM, ResourceLoader } = require('jsdom');

class LocalOnly extends ResourceLoader {
  fetch(url, options) { return /^file:/.test(url) ? super.fetch(url, options) : null; } // sem internet nos testes (fontes, BrasilAPI)
}

async function loadApp() {
  const file = path.join(__dirname, '..', 'www', 'index.html');
  const dom = await JSDOM.fromFile(file, { runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true, url: 'file://' + file });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  await new Promise((res) => { if (w.document.readyState === 'complete') res(); else w.addEventListener('load', res); });
  await tick(w, 80);
  return w;
}
const tick = (w, ms) => new Promise((r) => w.setTimeout(r, ms || 0));
const q = (w, s) => w.document.querySelector(s);
const qa = (w, s) => Array.from(w.document.querySelectorAll(s));
function click(w, sel) { const el = typeof sel === 'string' ? q(w, sel) : sel; if (!el) throw new Error('não achei ' + sel); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }
function type(w, el, value) { if (typeof el === 'string') el = q(w, el); if (!el) throw new Error('campo não achado'); el.focus(); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); }
function focus(w, el) { el.dispatchEvent(new w.FocusEvent('focusin', { bubbles: true })); el.focus(); }
async function openManualReview(w) {
  click(w, '[data-act=import]'); await tick(w, 20);
  click(w, '[data-act=manual]'); await tick(w, 20);
}
module.exports = { loadApp, tick, q, qa, click, type, focus, openManualReview };
