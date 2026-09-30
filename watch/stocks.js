/* ============================================================================
   OWN BOOK — stocks reaction (30 Sep 2026, v4.19)

   Runs on GitHub Actions once a week (and on demand). For every holding it
     1. reads the hand-kept facts in watch/stocks-events.json,
     2. fetches two years of daily closes + dividends from Yahoo (chart API, no key),
     3. fetches the reported earnings dates and EPS surprise from Nasdaq (US names),
     4. appends any new earnings date to watch/stocks-history.json so the record
        grows past Nasdaq's four quarters — this is the "learning" store,
     5. measures what the share price did around each event, from closes only:
          earnings  → move = first close AFTER the release vs the last close BEFORE it
                      (AMC: report-day close → next session; BMO: prior close → same day),
                      plus the close five sessions later vs the same reference,
          dividend  → ex-date close vs the previous close, and the amount,
     6. writes watch/stocks.json for the app.

   Rules: nothing is displayed that was not fetched or measured. A date with no
   close after it yet is written as pending, not guessed. If a source fails, the
   previous stocks.json stays and the run exits non-zero so the phone is told.

     node watch/stocks.js              live
     node watch/stocks.js --fixture    offline, from watch/fixtures/stocks-*.json
   ========================================================================= */
'use strict';
const fs = require('fs'), path = require('path');
const W = __dirname;
const FIX = process.argv.includes('--fixture');
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) own-book-stocks/1.0', 'accept': 'application/json' };

const EV = JSON.parse(fs.readFileSync(path.join(W, 'stocks-events.json'), 'utf8'));
const HP = path.join(W, 'stocks-history.json');
const HIST = fs.existsSync(HP) ? JSON.parse(fs.readFileSync(HP, 'utf8')) : { _: 'earnings dates seen so far, appended by stocks.js — never edited by hand', syms: {} };

async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  const t = await r.text();
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  try { return JSON.parse(t); } catch (e) { throw new Error(url + ' → not JSON: ' + t.slice(0, 80)); }
}
async function chart(y) {
  if (FIX) return JSON.parse(fs.readFileSync(path.join(W, 'fixtures', 'stocks-px.json'), 'utf8'))[y];
  const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(y) + '?range=2y&interval=1d&events=div');
  const r = j.chart.result[0], c = r.indicators.quote[0].close;
  return {
    ccy: r.meta.currency,
    px: r.timestamp.map((ts, i) => [new Date(ts * 1000).toISOString().slice(0, 10), c[i] == null ? null : +c[i].toFixed(4)]).filter(x => x[1] != null),
    div: Object.values((r.events || {}).dividends || {}).map(d => [new Date(d.date * 1000).toISOString().slice(0, 10), d.amount])
  };
}
/* upcoming date: Nasdaq/Zacks. 'est' when their algorithm guessed it from past dates. */
async function nasdaqNext(t) {
  if (FIX) return null;
  try {
    const j = await getJSON('https://api.nasdaq.com/api/analyst/' + t + '/earnings-date');
    const d = j.data || {}, m = (d.announcement || '').match(/:\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
    if (!m) return null;
    const mon = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }[m[1]];
    const eps = ((d.reportText || '').match(/consensus EPS forecast for the quarter is \$([\d.]+)/) || [])[1];
    return { d: m[3] + '-' + mon + '-' + m[2].padStart(2, '0'), est: /derived from an algorithm/.test(d.reportText || ''), eps: eps ? +eps : null, src: 'Nasdaq / Zacks' };
  } catch (e) { return null; }
}
async function nasdaq(t) {
  if (FIX) return JSON.parse(fs.readFileSync(path.join(W, 'fixtures', 'stocks-nasdaq.json'), 'utf8'))[t] || [];
  const j = await getJSON('https://api.nasdaq.com/api/company/' + t + '/earnings-surprise');
  return ((j.data || {}).earningsSurpriseTable || {}).rows || [];
}
const iso = us => { const m = us.match(/^(\d+)\/(\d+)\/(\d{4})$/); return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : us; };

/* index helpers on a [date, close] array */
function idxOnOrBefore(px, d) { let k = -1; for (let i = 0; i < px.length; i++) { if (px[i][0] <= d) k = i; else break; } return k; }
function idxAfter(px, d) { for (let i = 0; i < px.length; i++) if (px[i][0] > d) return i; return -1; }
function idxOn(px, d) { for (let i = 0; i < px.length; i++) if (px[i][0] === d) return i; return -1; }
const pct = (a, b) => (a == null || b == null || !b) ? null : +((a / b - 1) * 100).toFixed(2);

/* earnings reaction from closes. rep = 'AMC' | 'BMO' */
function react(px, d, rep) {
  let iRef, iAft;
  if (rep === 'AMC') { iRef = idxOn(px, d); if (iRef < 0) iRef = idxOnOrBefore(px, d); iAft = iRef >= 0 ? iRef + 1 : -1; }
  else { iAft = idxOn(px, d); if (iAft < 0) iAft = idxAfter(px, d); iRef = iAft > 0 ? iAft - 1 : -1; }
  if (iRef < 0 || iAft < 0 || iAft >= px.length) return { pending: true };
  const ref = px[iRef][1], a1 = px[iAft][1], a5 = px[iAft + 4] ? px[iAft + 4][1] : null;
  /* worst and best close over the five sessions after, vs the reference */
  let lo = a1, hi = a1; for (let k = iAft; k < Math.min(px.length, iAft + 5); k++) { lo = Math.min(lo, px[k][1]); hi = Math.max(hi, px[k][1]); }
  return { ref, refD: px[iRef][0], d1: pct(a1, ref), d1D: px[iAft][0], d5: a5 == null ? null : pct(a5, ref), lo5: pct(lo, ref), hi5: pct(hi, ref) };
}

(async () => {
  const out = { asOf: new Date().toISOString().slice(0, 10), src: 'Yahoo daily closes · Nasdaq reported dates · company IR (hand-kept)', syms: {} };
  const fails = [];
  for (const [sym, S] of Object.entries(EV.syms)) {
    try {
      const C = await chart(S.y);
      const px = C.px, last = px[px.length - 1];
      const o = { y: S.y, ccy: S.ccy, rep: S.rep, ir: S.ir, kind: S.kind || null, last: { d: last[0], p: last[1] }, next: S.next || null, earn: [], div: [] };
      /* next date: hand-kept confirmed date wins while it is still ahead; else Nasdaq/Zacks (US names) */
      if (S.rep && S.ccy === 'USD') { const nx = await nasdaqNext(sym); if (nx && !(o.next && o.next.d >= out.asOf)) o.next = nx; }
      if (o.next && o.next.d < out.asOf) o.next = null;

      /* dividends: amount + ex-date drop */
      for (const [d, amt] of (C.div || [])) {
        const i = idxOn(px, d); const prev = i > 0 ? px[i - 1][1] : null;
        o.div.push({ d, amt, drop: i > 0 ? pct(px[i][1], prev) : null });
      }
      o.div.sort((a, b) => a.d < b.d ? 1 : -1);

      /* earnings dates: Nasdaq (US) + manual + history */
      const H = HIST.syms[sym] = HIST.syms[sym] || {};
      if (S.rep) {
        if (S.ccy === 'USD') {
          for (const r of await nasdaq(sym)) { const d = iso(r.dateReported); if (!H[d]) H[d] = { eps: r.eps, est: r.consensusForecast == null ? null : +r.consensusForecast, sur: r.percentageSurprise == null ? null : +r.percentageSurprise, src: 'Nasdaq', seen: out.asOf }; }
        }
        for (const m of (S.manual || [])) if (!H[m.d]) H[m.d] = { what: m.what, src: m.src, seen: out.asOf };
        for (const d of Object.keys(H).sort().reverse()) {
          const h = H[d], rx = react(px, d, S.rep);
          o.earn.push(Object.assign({ d }, h, rx));
        }
        /* the summary the app reads first: how big, and did a beat mean up */
        const done = o.earn.filter(e => !e.pending && e.d1 != null);
        if (done.length) {
          const abs = done.map(e => Math.abs(e.d1)).sort((a, b) => a - b);
          const beats = done.filter(e => e.sur != null && e.sur > 0), beatUp = beats.filter(e => e.d1 > 0).length;
          o.sum = { n: done.length, medAbs: abs[Math.floor(abs.length / 2)], maxAbs: abs[abs.length - 1], up: done.filter(e => e.d1 > 0).length, beats: beats.length, beatUp };
        }
      }
      out.syms[sym] = o;
    } catch (e) { fails.push(sym + ': ' + e.message); }
  }
  if (fails.length) { console.error('stocks: FAILED\n  ' + fails.join('\n  ')); if (Object.keys(out.syms).length === 0) process.exit(1); }
  out.failed = fails;
  fs.writeFileSync(path.join(W, 'stocks.json'), JSON.stringify(out));
  fs.writeFileSync(HP, JSON.stringify(HIST, null, 1));
  const n = Object.values(out.syms).reduce((a, s) => a + s.earn.filter(e => !e.pending).length, 0);
  console.log('stocks: ok · ' + Object.keys(out.syms).length + ' holdings · ' + n + ' earnings reactions measured · ' + fails.length + ' failed');
  if (fails.length) process.exit(1);
})().catch(e => { console.error('stocks: ' + e.message); process.exit(1); });
