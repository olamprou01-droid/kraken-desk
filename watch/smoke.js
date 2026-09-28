/* ============================================================================
   OWN BOOK — deploy smoke test (28 Sep 2026).

   Every device reloads itself on a new APP_VERSION, so a broken index.html
   breaks every device at once. This runs before the watcher on every workflow
   run: it loads index.html in jsdom with the network stubbed out, waits for
   boot, and fails loudly if the page throws, does not render its action box,
   or its version is not what the footer says.

     node watch/smoke.js            -> exit 0 = the app boots
     exit 1 -> the workflow's failure step pushes APP BROKEN to the phone
   ========================================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const errors = [];

/* 1. syntax: every inline <script> must parse */
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
if (!scripts.length) { console.error('smoke: no inline script found'); process.exit(1); }
for (let i = 0; i < scripts.length; i++) {
  try { new Function(scripts[i]); } catch (e) { errors.push('script #' + (i + 1) + ' does not parse: ' + e.message); }
}
if (errors.length) { errors.forEach(e => console.error('smoke: ' + e)); process.exit(1); }

/* 2. version: APP_VERSION and the footer must agree */
const ver = (html.match(/var APP_VERSION='([\d.]+)'/) || [])[1];
const foot = (html.match(/OWN BOOK <b[^>]*>v([\d.]+)/) || [])[1];
if (!ver || !foot || ver !== foot) errors.push('version mismatch: APP_VERSION=' + ver + ' footer=' + foot);

/* 3. boot: load with the network stubbed, catch anything thrown */
const vc = new VirtualConsole();
vc.on('jsdomError', e => { const m = String(e && e.message || e); if (!/Not implemented|Could not load/i.test(m)) errors.push('page error: ' + m.split('\n')[0]); });
const dom = new JSDOM(html, {
  url: 'https://olamprou01-droid.github.io/kraken-desk/',
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('smoke: network off'));
    w.Notification = function () {}; w.Notification.permission = 'denied'; w.Notification.requestPermission = () => Promise.resolve('denied');
    w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.scrollTo = () => {};
    w.addEventListener('error', e => errors.push('uncaught: ' + (e.error && e.error.message || e.message)));
  }
});
setTimeout(() => {
  const d = dom.window.document;
  const act = d.getElementById('act');
  if (!act || !act.textContent.trim()) errors.push('#act did not render');
  if (!d.getElementById('dlogbtn')) errors.push('#dlogbtn missing');
  const footer = d.body.textContent.match(/OWN BOOK v[\d.]+/);
  if (!footer) errors.push('footer version text missing');
  if (errors.length) { errors.forEach(e => console.error('smoke: ' + e)); process.exit(1); }
  console.log('smoke: ok · v' + ver + ' · act "' + act.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) + '"');
  process.exit(0);
}, 2500);
