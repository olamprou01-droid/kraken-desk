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
  /* 5 Oct 2026: his plan screen reads "Fail at (-3%) $9,700". One position at 35% of the
     buffer is the lab's plateau on that floor (91/0/11 of 102 starts) - same as the app. */
  start: 10000, floor: 9400, target: 11000,
  /* 7 Oct 2026: a 2nd position only once every open one is >= +2.5R, at 0.3x (lab 98/0/4) */
  cushionRisk: 0.35, slot2Risk: 0.3, slot2GateR: 2.5, maxConc: 2, maxAlloc: 0.60,
  /* fee 0.04% each side (28 Sep 2026): Kraken Funded charges no commission - cost is a
     0.04% spread built into the price (support.kraken.com/articles/funded). Was 0.26%. */
  slip: 0.004, fee: 0.0004,
  lookback: 20, atrMult: 1.5, rr: 6,
  extLimit: 0.12, staleLimit: 0.02,
  momN: 60, momThr: 0.10,
  /* 4 Nov 2026 - TREND PLAN (Prop Starter: +10% pass, -6% static floor, 3% daily loss).
     The breakout rule is retired for new entries: under the 3% daily limit it failed 40-53%
     of 2022-24 challenge starts (a winner's stop stays far below, one crash day loses >3%).
     legacyBuy:false switches its BUY off everywhere; the plan below replaces it. */
  legacyBuy: false,
  plan: { syms: ['BTC', 'ETH'], hullN: 55, smaN: 200, volN: 30, mult: 12, maxLev: 1, dayKill: 0.015, orderHourUTC: 6 }
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
/* challenge start (5 Oct 2026, same as inBook() in the app): once journal.challenge.start is set,
   the book is only the trades logged at or after it; earlier ones are paper history. */
function inBook(journal, t) { const c = journal && journal.challenge; return !(c && c.start) || String(t.t || t.day) >= c.start; }
function mine(journal)   { return (journal && journal.trades ? journal.trades : []).filter(t => t.origin === 'me'); }
function opens(journal)  { return mine(journal).filter(t => t.status === 'OPEN' && inBook(journal, t)); }
function closes(journal) { return mine(journal).filter(t => t.status === 'WIN' || t.status === 'LOSS'); }
function realised(journal) { return closes(journal).filter(t => inBook(journal, t)).reduce((a, t) => a + (t.pnl || 0), 0); }
function floatPnl(journal, live) { return opens(journal).reduce((a, t) => { const p = live[t.sym]; return a + (p != null ? (p / t.entry - 1) * t.size : 0); }, 0); }
function equity(journal, live) { return RULES.start + realised(journal) + floatPnl(journal, live); }
function cashFree(journal, live) { return Math.max(0, equity(journal, live) - opens(journal).reduce((a, t) => a + t.size, 0)); }

/* ---- size: 25% of the remaining buffer ---- */
function sizeFor(entry, stop, journal, live) {
  const eq = equity(journal, live), cu = Math.max(0, eq - RULES.floor);
  if (entry <= stop) return null;
  /* second slot risks slot2Risk x (28 Sep 2026, lab: 102 starts) - same as sizeFor() in the app */
  const nOpen = opens(journal).length;
  const risk = RULES.cushionRisk * cu * (nOpen >= 1 ? (RULES.slot2Risk || 1) : 1), dist = (entry - stop) / entry;
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
  o.f.regime   = !!(R && R.on) && RULES.legacyBuy !== false;
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
  /* the 2nd position is earned: every open trade >= slot2GateR in profit at the live price (= slot2Open() in the app) */
  const gateOk = opens(journal).every(t => { const p = live[t.sym]; return p != null && t.riskAmt > 0 && ((p / t.entry - 1) * t.size) / t.riskAmt >= RULES.slot2GateR; });
  o.f.slot     = opens(journal).length < RULES.maxConc && !held && gateOk;
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
             hitStop: p != null && p <= t.stop, hitTp: p != null && t.tp != null && p >= t.tp,
             pnl: p != null ? (p / t.entry - 1) * t.size : null,
             r: (p != null && t.riskAmt) ? ((p / t.entry - 1) * t.size) / t.riskAmt : null };
  });
  return { regime: R, coins: coins, stops: stops,
           equity: equity(journal, live), cushion: Math.max(0, equity(journal, live) - RULES.floor) };
}

/* ---- formatting, same decimals as the app ---- */
function px(s, v) { if (v == null) return '—'; const d = DEC[s] != null ? DEC[s] : 2; return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function usd(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

/* ---- TREND PLAN v4.30 (6 Nov 2026) ----------------------------------------------------------
   One check a day on the last COMPLETE daily bar. A coin is ON when its 55-day Hull moving average is
   rising AND its close is above its 200-day average. ON and not held -> BUY; OFF and held -> SELL.
   Orders from 06:00 UTC (08:00 Cyprus winter). Size: total = min(12 x cushion above $9,400, 1 x equity),
   shared between ON coins by 1/volatility (30-day stdev of daily returns). No top-ups after entry.
   Day stop: every held coin gets a stop the same % below its reference price (last close; live price
   for a coin bought today) so that together they lose at most 1.5% of the day's opening equity.
   Tested 6 Nov 2026 (Claude, Bot project, OKX hourly 2021-26, every start day from 1 Jul 2022, up to a
   year each): pass 71% / fail 0% / median 94 days; 2022-24 starts 60%/0%, last two years 71%/0%.
   Neighbours: x10 72%, x15 64%, day stop 2% 70%, 1% 68%, orders 10:00 UTC 69%. Fees x2: 68%.
   Weak spot: slippage on stop exits (0.3% -> 56%, 0.5% -> 48%) - use resting stop orders. */
function sd(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); }
function wmaArr(x, n, i) { let num = 0, den = 0; for (let j = 0; j < n; j++) { num += (j + 1) * x[i - n + 1 + j]; den += j + 1; } return num / den; }
/* Hull MA of closes cs at index i: WMA(2*WMA(n/2) - WMA(n), sqrt(n)), n=55 -> 27, 55, 7 (same as the backtest) */
function hullAt(cs, i, n) {
  const h = Math.floor(n / 2), q = Math.floor(Math.sqrt(n));
  if (i < n - 1 + q - 1) return null;
  const d = []; for (let k = i - q + 1; k <= i; k++) d.push(2 * wmaArr(cs, h, k) - wmaArr(cs, n, k));
  return wmaArr(d, q, q - 1);
}
function trendAt(b, i) {
  const P = RULES.plan;
  if (!b || i < P.smaN - 1 || i < P.volN || i < P.hullN + 8) return null;
  const cs = b.slice(0, i + 1).map(x => x[4]);
  const c = cs[i], hu = hullAt(cs, i, P.hullN), hp = hullAt(cs, i - 1, P.hullN), avg = sma(b, i, P.smaN);
  const rets = []; for (let k = i - P.volN + 1; k <= i; k++) rets.push(cs[k] / cs[k - 1] - 1);
  /* tomorrow's close needed to switch ON: the Hull is linear in the newest close, so solve hull(next) > hull(today);
     and the 200-day average including that close must stay below it: close > (sum of the last 199 closes) / 199 */
  const f = x => hullAt(cs.concat([x]), i + 1, P.hullN) - hu;
  const f0 = f(0), f1 = f(c), xHull = -f0 * c / (f1 - f0);
  let s199 = 0; for (let k = i - 198; k <= i; k++) s199 += cs[k];
  return { date: b[i][0], close: c, hull: hu, hullPrev: hp, sma: avg, vol: sd(rets), on: hu > hp && c > avg,
           next: Math.max(xHull, s199 / 199) };
}
function plan(bars, live, journal) {
  const P = RULES.plan, op = opens(journal);
  const eqLive = equity(journal, live);
  const eqOpen = RULES.start + realised(journal) +
    op.reduce((a, t) => { const b = bars[t.sym]; const c = b && b.length ? b[b.length - 1][4] : null; return a + (c != null ? (c / t.entry - 1) * t.size : 0); }, 0);
  const cushion = Math.max(0, eqLive - RULES.floor);
  const total = Math.min(P.mult * cushion, P.maxLev * eqLive);
  const coins = {};
  for (const s of P.syms) {
    const b = bars[s], T = b ? trendAt(b, b.length - 1) : null;
    const held = op.filter(t => t.sym === s);
    coins[s] = { sym: s, ok: !!T, on: !!(T && T.on), date: T ? T.date : null, close: T ? T.close : null, ref: T ? T.ref : null,
                 sma: T ? T.sma : null, hull: T ? T.hull : null, hullPrev: T ? T.hullPrev : null, vol: T ? T.vol : null, next: T ? T.next : null, live: live[s] != null ? live[s] : null,
                 held: held.length > 0, units: held.reduce((a, t) => a + t.size / t.entry, 0) };
  }
  const onSyms = P.syms.filter(s => coins[s].on && coins[s].vol > 0);
  const inv = onSyms.reduce((a, s) => a + 1 / coins[s].vol, 0);
  let after = 0;
  for (const s of P.syms) {
    const c = coins[s];
    c.share = c.on && inv > 0 ? (1 / c.vol) / inv : 0;
    if (!c.ok) c.action = 'NO DATA';
    else if (c.on && !c.held) { c.action = c.live != null ? 'BUY' : 'NO PRICE'; c.notional = total * c.share; c.refPx = c.live; }
    else if (!c.on && c.held) c.action = 'SELL';
    else if (c.on && c.held) { c.action = 'HOLD'; c.refPx = c.close; }
    else c.action = 'WAIT';
    if (c.action === 'BUY') after += c.notional;
    if (c.action === 'HOLD') after += c.units * c.close;
  }
  const killAmt = eqOpen * P.dayKill;
  const move = after > 0 ? Math.min(0.5, killAmt / after) : null;
  for (const s of P.syms) {
    const c = coins[s];
    c.stop = (move != null && (c.action === 'BUY' || c.action === 'HOLD') && c.refPx > 0) ? c.refPx * (1 - move) : null;
    if (c.action === 'BUY' && c.notional > 0) c.passPx = c.refPx * (1 + Math.max(0, RULES.target - eqLive) / c.notional);
  }
  return { at: bars.BTC ? bars.BTC[bars.BTC.length - 1][0] : null, eqOpen: eqOpen, eqLive: eqLive, cushion: cushion, total: total,
           killEq: eqOpen * (1 - P.dayKill), killed: op.length > 0 && eqLive <= eqOpen * (1 - P.dayKill),
           passed: eqLive >= RULES.target, move: move, coins: coins };
}

module.exports = { RULES, trendAt, hullAt, plan, sd, SYMS, CBP, KRQ, KRK, DEC, sma, atr, hiHigh, regimeAt, regime,
                   inBook, mine, opens, closes, realised, equity, sizeFor, evalSym, evaluate, px, usd };
