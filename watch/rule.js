/* ============================================================================
   OWN BOOK — the rule, standalone.

   This file is the desk's rule with the screen removed. Every function here is
   a line-for-line port of the same-named function in index.html (regimeAt,
   evalSym, sizeFor, sma, atr, hiHigh). If the two ever disagree, the app is
   the reference and this file is wrong. test.js proves they agree on real bars.

   Bars are arrays exactly as the app stores them:  [date, open, high, low, close, volume]
   The LAST bar must be a COMPLETE day. Callers drop the in-progress candle
   before calling anything here, exactly as the app does at fetch time.
   ========================================================================= */
'use strict';

const RULES = {
  start: 10000, floor: 9500, target: 11200,
  cushionRisk: 0.25, maxConc: 2, maxAlloc: 0.60,
  slip: 0.004, fee: 0.0026,
  lookback: 20, atrMult: 1.5, rr: 6,
  extLimit: 0.12, staleLimit: 0.02,
  momN: 60, momThr: 0.10
};

const SYMS = ['BTC','ETH','XRP','ADA','SOL','DOGE','LINK','LTC','AVAX','DOT','ATOM','UNI'];
const CBP  = {BTC:'BTC-USD',ETH:'ETH-USD',XRP:'XRP-USD',ADA:'ADA-USD',SOL:'SOL-USD',DOGE:'DOGE-USD',
              LINK:'LINK-USD',LTC:'LTC-USD',AVAX:'AVAX-USD',DOT:'DOT-USD',ATOM:'ATOM-USD',UNI:'UNI-USD'};
const KRQ  = {BTC:'XBTUSD',ETH:'ETHUSD',XRP:'XRPUSD',ADA:'ADAUSD',SOL:'SOLUSD',DOGE:'XDGUSD',
              LINK:'LINKUSD',LTC:'LTCUSD',AVAX:'AVAXUSD',DOT:'DOTUSD',ATOM:'ATOMUSD',UNI:'UNIUSD'};
const KRK  = {XXBTZUSD:'BTC',XETHZUSD:'ETH',XXRPZUSD:'XRP',ADAUSD:'ADA',SOLUSD:'SOL',XDGUSD:'DOGE',
              LINKUSD:'LINK',XLTCZUSD:'LTC',AVAXUSD:'AVAX',DOTUSD:'DOT',ATOMUSD:'ATOM',UNIUSD:'UNI'};
const DEC  = {BTC:2,ETH:2,XRP:4,ADA:5,SOL:2,DOGE:6,LINK:3,LTC:3,AVAX:3,DOT:4,ATOM:3,UNI:4};

/* ---- indicators, identical to the app ---- */
function sma(b, i, n) { if (!b || i < n - 1) return null; let t = 0; for (let k = i - n + 1; k <= i; k++) t += b[k][4]; return t / n; }
function atr(b, i, n) { n = n || 14; if (!b || i < n) return null; let t = 0;
  for (let k = i - n + 1; k <= i; k++) { const p = b[k - 1][4]; t += Math.max(b[k][2] - b[k][3], Math.abs(b[k][2] - p), Math.abs(b[k][3] - p)); }
  return t / n; }
function hiHigh(b, i, n) { if (!b || i - n < 0) return null; let m = -Infinity; for (let k = i - n; k < i; k++) if (b[k][2] > m) m = b[k][2]; return m; }

/* ---- regime: two gates on BTC's last complete bar ---- */
function regimeAt(btc, i) {
  if (!btc || i < 0) return { on: false, txt: 'no BTC data' };
  const s = sma(btc, i, 20);
  if (s == null || i < RULES.momN) return { on: false, txt: 'not enough history' };
  const c = btc[i][4], ref = btc[i - RULES.momN][4], mom = c / ref - 1;
  const g1 = c > s, g2 = mom > RULES.momThr;
  return { on: g1 && g2, px: c, sma: s, mom: mom, g1: g1, g2: g2, close60: ref, date: btc[i][0] };
}
function regime(btc) { return regimeAt(btc, btc ? btc.length - 1 : -1); }

/* ---- book state from the journal (origin 'me' only, as the app) ---- */
function mine(journal)   { return (journal && journal.trades ? journal.trades : []).filter(t => t.origin === 'me'); }
function opens(journal)  { return mine(journal).filter(t => t.status === 'OPEN'); }
function closes(journal) { return mine(journal).filter(t => t.status === 'WIN' || t.status === 'LOSS'); }
function realised(journal) { return closes(journal).reduce((a, t) => a + (t.pnl || 0), 0); }
function floatPnl(journal, live) { return opens(journal).reduce((a, t) => { const p = live[t.sym]; return a + (p != null ? (p / t.entry - 1) * t.size : 0); }, 0); }
function equity(journal, live) { return RULES.start + realised(journal) + floatPnl(journal, live); }
function cashFree(journal, live) { return Math.max(0, equity(journal, live) - opens(journal).reduce((a, t) => a + t.size, 0)); }

/* ---- size: 25% of the remaining buffer ---- */
function sizeFor(entry, stop, journal, live) {
  const eq = equity(journal, live), cu = Math.max(0, eq - RULES.floor);
  if (entry <= stop) return null;
  const risk = RULES.cushionRisk * cu, dist = (entry - stop) / entry;
  if (risk < 5 || dist <= 0) return null;
  const n = Math.min(risk / dist, RULES.maxAlloc * eq, cashFree(journal, live));
  if (n < 25) return null;
  return { risk: risk, notional: n, dist: dist };
}

/* ---- one coin, every gate. Same order as FACTORS in the app. ----
   'live' gate is omitted: the watcher only runs when it has just fetched. */
function evalSym(s, bars, live, R, journal) {
  const o = { sym: s, f: {}, buyable: false, state: '' };
  const b = bars[s];
  const i = b ? b.length - 1 : -1;
  const a = b ? atr(b, i) : null, h = b ? hiHigh(b, i, RULES.lookback) : null;
  const close = b ? b[i][4] : null, now = live[s];
  o.level = h; o.close = close; o.buy = now; o.sigDate = b ? b[i][0] : null; o.atr = a;
  const dataOK = !!(b && a != null && h != null && a > 0 && close != null && now != null && now > 0);
  o.f.data     = dataOK;
  o.f.regime   = !!(R && R.on);
  o.f.breakout = !!(dataOK && close > h);
  if (dataOK) {
    o.ext = close / h - 1; o.drift = now / close - 1;
    o.stop = now - RULES.atrMult * a; o.tp = now + RULES.rr * (now - o.stop);
    o.size = (o.stop > 0 && now > o.stop) ? sizeFor(now, o.stop, journal, live) : null;
    o.distPct = (h / now - 1) * 100;                       // how far live is from the buy level
  } else { o.ext = null; o.drift = null; o.stop = null; o.tp = null; o.size = null; o.distPct = null; }
  o.f.vertical = dataOK && o.ext <= RULES.extLimit;
  o.f.fresh    = dataOK && o.drift <= RULES.staleLimit;
  o.f.holding  = dataOK && now >= h;
  o.f.size     = !!o.size;
  const held = opens(journal).some(t => t.sym === s);
  o.f.slot     = opens(journal).length < RULES.maxConc && !held;
  const order  = ['data','regime','breakout','vertical','fresh','holding','size','slot'];
  o.buyable = order.every(k => o.f[k]);
  o.firstFail = order.find(k => !o.f[k]) || null;
  return o;
}

/* ---- every coin + every open position, one pass ---- */
function evaluate(bars, live, journal) {
  const R = regime(bars.BTC);
  const coins = SYMS.map(s => evalSym(s, bars, live, R, journal));
  const stops = opens(journal).map(t => {
    const p = live[t.sym];
    return { id: t.id, sym: t.sym, entry: t.entry, stop: t.stop, tp: t.tp, size: t.size, live: p,
             hitStop: p != null && p <= t.stop, hitTp: p != null && p >= t.tp,
             pnl: p != null ? (p / t.entry - 1) * t.size : null,
             r: (p != null && t.riskAmt) ? ((p / t.entry - 1) * t.size) / t.riskAmt : null };
  });
  return { regime: R, coins: coins, stops: stops,
           equity: equity(journal, live), cushion: Math.max(0, equity(journal, live) - RULES.floor) };
}

/* ---- formatting, same decimals as the app ---- */
function px(s, v) { if (v == null) return '—'; const d = DEC[s] != null ? DEC[s] : 2; return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function usd(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

module.exports = { RULES, SYMS, CBP, KRQ, KRK, DEC, sma, atr, hiHigh, regimeAt, regime,
                   mine, opens, closes, realised, equity, sizeFor, evalSym, evaluate, px, usd };
