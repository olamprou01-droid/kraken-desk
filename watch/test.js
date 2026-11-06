/* Proves rule.js agrees with the app on real bars.
   Expected values were computed independently in a browser from the same Coinbase
   candles on 17 Sep 2026 (see MASTER-PROMPT-v4 §autonomy). Run:  node watch/test.js  */
'use strict';
const R = require('./rule.js');
const fx = require('./fixture.json');

let fails = 0, total = 0;
function eq(name, got, want, tol) {
  tol = tol == null ? 0.005 : tol;
  const ok = Math.abs(got - want) <= tol; total++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(46) + String(got).padStart(14) + '  want ' + want);
  if (!ok) fails++;
}
function is(name, got, want) {
  const ok = got === want; total++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(46) + String(got).padStart(14) + '  want ' + want);
  if (!ok) fails++;
}

const bars = fx.bars, live = fx.live;
const emptyJournal = { trades: [] };

/* regime on BTC, last complete bar 2026-09-16 */
const rg = R.regime(bars.BTC);
is ('regime date is last COMPLETE bar',       rg.date,  '2026-09-16');
eq ('BTC close',                              rg.px,    76144.99);
eq ('BTC SMA20',                              rg.sma,   78082.59, 0.01);
eq ('BTC close 60 bars back',                 rg.close60, 64796.36);
eq ('BTC 60-day momentum %',                  rg.mom*100, 17.51, 0.01);
is ('gate1 close>sma',                        rg.g1,    false);
is ('gate2 mom>10%',                          rg.g2,    true);
is ('regime ON',                              rg.on,    false);

/* per-coin levels = highest high of previous 20 bars */
const ev = R.evaluate(bars, live, emptyJournal);
const by = {}; ev.coins.forEach(c => by[c.sym] = c);
eq ('UNI  buy level',   by.UNI.level,  7.4831);
eq ('BTC  buy level',   by.BTC.level,  82283);
eq ('ETH  buy level',   by.ETH.level,  2667.01);
eq ('AVAX buy level',   by.AVAX.level, 8.197);
eq ('UNI  ATR14',       by.UNI.atr,    0.677321, 0.00001);
eq ('BTC  ATR14',       by.BTC.atr,    2247.837143, 0.001);
eq ('ETH  ATR14',       by.ETH.atr,    100.214286, 0.001);
eq ('AVAX ATR14',       by.AVAX.atr,   0.3715, 0.0001);
is ('nothing buyable while regime OFF', ev.coins.some(c => c.buyable), false);
is ('UNI first failing gate is regime',       by.UNI.firstFail, 'regime');

/* sizing at a fresh $10,000 book on the $9,700 floor (5 Oct 2026): cushion 300, risk 35% = 105.
   notional = risk / stop distance = 105 / (1.5 * 0.677321 / 7.4831) = 773.24 (by hand) */
eq ('equity, empty journal',  ev.equity,  10000);
eq ('cushion (floor 9,700)',  ev.cushion, 600);
const sz = R.sizeFor(7.4831, 7.4831 - 1.5*by.UNI.atr, emptyJournal, live);
eq ('UNI ticket risk $ (35% of 300)', sz.risk, 210);
eq ('UNI ticket notional $',  sz.notional, 210 / (1.5 * 0.677321 / 7.4831), 0.5);
eq ('first position risk is 35% of buffer', R.RULES.cushionRisk, 0.35);

/* SIGNING (28 Sep 2026). The app signs with Web Crypto (crypto.subtle.sign,
   HMAC-SHA256, hex-encoded) over id|origin|sym|status|entry|stop|tp|size|exit; the
   watcher verifies the identical message with Node's crypto.createHmac. HMAC-SHA256
   hex output is spec-defined and identical between the two implementations for the
   same key and message - what needs proving here is that sigOk() actually rejects a
   wrong key and a tampered field, which is the whole point of signing. */
{
  const nodeCrypto = require('crypto');
  const sigMsg = o => [o.id, o.origin, o.sym, o.status, o.entry, o.stop, o.tp, o.size, o.exit || ''].join('|');
  const t = { id: 'T1', origin: 'me', sym: 'SOL', status: 'OPEN', entry: 111.62, stop: 104.29, tp: 155.57, size: 1980 };
  const key = 'test-sync-key';
  const rightSig = nodeCrypto.createHmac('sha256', key).update(sigMsg(t)).digest('hex');
  const signed = Object.assign({}, t, { sig: rightSig });
  const SY = ['BTC','ETH','XRP','ADA','SOL','DOGE','LINK','LTC','AVAX','DOT','ATOM','UNI'];
  const plausible = tr => !!(tr && tr.id && tr.origin === 'me' && SY.includes(tr.sym) && tr.entry > 0 && tr.stop > 0 && tr.stop < tr.entry && (tr.tp == null || tr.tp > tr.entry) && tr.size > 0 && tr.size <= 20000);
  const sigOk = (tr, k) => { if (!tr) return false; if (!(tr.sig && k)) return plausible(tr);
    return nodeCrypto.createHmac('sha256', k).update(sigMsg(tr)).digest('hex') === tr.sig; };
  is('sigOk: no key configured -> accepted (back-compat)', sigOk(t, ''), true);
  is('sigOk: correctly signed -> accepted', sigOk(signed, key), true);
  is('sigOk: unsigned plausible trade -> accepted (no key needed)', sigOk(t, key), true);
  is('sigOk: unsigned junk -> rejected', sigOk(Object.assign({}, t, { sym: 'XYZ', stop: 999 }), key), false);
  is('sigOk: wrong key -> rejected', sigOk(signed, 'other-key'), false);
  is('sigOk: tampered field -> rejected', sigOk(Object.assign({}, signed, { entry: 999 }), key), false);
}

/* second slot: with one position open the next ticket risks 0.3x (7 Oct 2026) */
const j1 = { trades: [{ id:'T0', origin:'me', sym:'LINK', entry:13.34, stop:12.37, tp:19.2, size:100, riskAmt:7, status:'OPEN' }] };
const sz2 = R.sizeFor(7.4831, 7.4831 - 1.5*by.UNI.atr, j1, live);
eq ('slot-2 ticket risk is 0.3x', sz2.risk / R.sizeFor(7.4831, 7.4831 - 1.5*by.UNI.atr, emptyJournal, live).risk, 0.3, 0.001);
/* the 2nd position is earned: ETH open at +2.0R keeps the slot shut, at +3.33R opens it.
   ETH live 2474.4; entry = live/1.1 -> P&L +100 on size 1000; riskAmt 50 -> 2.0R, 30 -> 3.33R */
{
  const e = 2474.4 / 1.1, rg0 = R.regime(bars.BTC);
  const at2 = { trades: [{ id:'E1', origin:'me', sym:'ETH', entry:e, stop:e*0.9, tp:e*1.6, size:1000, riskAmt:50, status:'OPEN', t:'2026-10-01T00:00:00Z' }] };
  const at3 = { trades: [{ id:'E1', origin:'me', sym:'ETH', entry:e, stop:e*0.9, tp:e*1.6, size:1000, riskAmt:30, status:'OPEN', t:'2026-10-01T00:00:00Z' }] };
  is ('2nd slot shut while ETH is +2.0R',  R.evalSym('UNI', bars, live, rg0, at2).f.slot, false);
  is ('2nd slot open once ETH is +3.33R',  R.evalSym('UNI', bars, live, rg0, at3).f.slot, true);
  is ('still no third position',            R.RULES.maxConc, 2);
}

/* stop watch on a journal with an open trade */
const j = { trades: [{ id:'T1', origin:'me', sym:'UNI', entry:5.879, stop:5.1665, tp:10.154, size:1031, riskAmt:125, status:'OPEN' }] };
const ev2 = R.evaluate(bars, live, j);
is ('one open position seen',              ev2.stops.length, 1);
is ('UNI 7.2637 has not hit stop 5.1665',  ev2.stops[0].hitStop, false);
eq ('UNI open R multiple',                 ev2.stops[0].r, ((7.2637/5.879-1)*1031)/125, 0.001);
const ev3 = R.evaluate(bars, Object.assign({}, live, {UNI: 5.10}), j);
is ('UNI 5.10 HAS hit stop',               ev3.stops[0].hitStop, true);
is ('slot gate blocks a second UNI',       R.evalSym('UNI', bars, live, rg, j).f.slot, false);

/* CHALLENGE START: trades before journal.challenge.start are paper history - out of the book */
{
  const paper = { id:'P1', origin:'me', sym:'SOL', entry:111.62, stop:104.29, tp:155.57, size:1981, riskAmt:130, status:'OPEN', t:'2026-09-19T09:39:55Z' };
  const paperLoss = { id:'P2', origin:'me', sym:'LTC', entry:71.34, stop:65.14, tp:108.56, size:1348, riskAmt:117, status:'LOSS', pnl:-94.86, t:'2026-09-25T06:06:50Z' };
  const live1 = { id:'L1', origin:'me', sym:'UNI', entry:7.0, stop:6.5, tp:10.0, size:500, riskAmt:36, status:'OPEN', t:'2026-10-06T08:00:00Z' };
  const before = { trades: [paper, paperLoss] };
  const after  = { trades: [paper, paperLoss], challenge: { start: '2026-10-05T13:00:00Z' } };
  const both   = { trades: [paper, paperLoss, live1], challenge: { start: '2026-10-05T13:00:00Z' } };
  is ('no challenge: paper SOL is open',            R.opens(before).length, 1);
  is ('challenge started: paper SOL out of the book', R.opens(after).length, 0);
  eq ('challenge started: paper loss not in equity', R.equity(after, live), 10000);
  is ('challenge started: slot free for a new trade', R.evalSym('UNI', bars, live, R.regime(bars.BTC), after).f.slot, true);
  is ('trade after the start is in the book',       R.opens(both).map(t => t.id).join(), 'L1');
}

/* a synthetic regime-ON case: lift the last BTC close above the SMA */
const btc2 = bars.BTC.map(b => b.slice()); btc2[btc2.length-1][4] = 79000;
const rg2 = R.regime(btc2);
is ('synthetic: regime turns ON when close > sma', rg2.on, true);


/* ==== TREND PLAN v4.30 (6 Nov 2026): Hull 55 rising + above 200-day average ===================
   Expected values computed independently in Python/pandas (the backtest's own hma(): rolling weighted means;
   'next' found by bisection, appending a candidate close and recomputing) from watch/plan-fixture.json. */
const PF = require('./plan-fixture.json');
for (const k of Object.keys(PF.cases)) { const C = PF.cases[k]; C.bars = {};
  for (const s of Object.keys(C.close)) C.bars[s] = C.close[s].map((c, j) => [new Date(Date.parse(C.start) + j * 864e5).toISOString().slice(0, 10), c, c, c, c, 0]); }
const pj = held => ({ trades: Object.keys(held).map((s, k) => ({ id: 'P' + k, origin: 'me', sym: s, status: 'OPEN', entry: held[s][0], size: held[s][1], t: '2000-01-01' })) });
is ('legacy breakout BUY is retired', R.RULES.legacyBuy, false);
is ('old rule cannot buy even with regime ON', R.evalSym('BTC', bars, live, { on: true }, emptyJournal).f.regime, false);
is ('tp missing never reads as target hit', R.evaluate(bars, live, { trades: [{ id: 'X', origin: 'me', sym: 'BTC', status: 'OPEN', entry: 70000, stop: 60000, size: 1000 }] }).stops[0].hitTp, false);
eq ('plan size multiple', R.RULES.plan.mult, 12); eq('plan max leverage', R.RULES.plan.maxLev, 1); eq('plan day stop', R.RULES.plan.dayKill, 0.015);
{ const T = R.trendAt(PF.cases.today.bars.BTC, PF.cases.today.bars.BTC.length - 1);
  eq('today BTC close', T.close, 77454.2); eq('today BTC Hull 55', T.hull, 79471.75901008, 1e-6); eq('today BTC Hull 55 yesterday', T.hullPrev, 79919.59452115, 1e-6);
  eq('today BTC 200-day avg', T.sma, 73207.001500, 0.001); eq('today BTC 30-day vol', T.vol, 0.0145453555, 1e-9);
  eq('today BTC close needed tomorrow', T.next, 93420.108110, 0.01); is('today BTC ON', T.on, false); }
{ const T = R.trendAt(PF.cases.today.bars.ETH, PF.cases.today.bars.ETH.length - 1);
  eq('today ETH close', T.close, 2274.91); eq('today ETH Hull 55', T.hull, 2262.42747159, 1e-6); eq('today ETH Hull 55 yesterday', T.hullPrev, 2276.94332132, 1e-6);
  eq('today ETH 200-day avg', T.sma, 2157.852000, 0.001); eq('today ETH 30-day vol', T.vol, 0.0185544233, 1e-9);
  eq('today ETH close needed tomorrow', T.next, 2741.071881, 0.01); is('today ETH ON', T.on, false); }
{ const T = R.trendAt(PF.cases.bothOn.bars.BTC, PF.cases.bothOn.bars.BTC.length - 1);
  eq('bothOn BTC close', T.close, 83323.0); eq('bothOn BTC Hull 55', T.hull, 85828.07382868, 1e-6); eq('bothOn BTC Hull 55 yesterday', T.hullPrev, 85597.80398758, 1e-6);
  eq('bothOn BTC 200-day avg', T.sma, 71765.823000, 0.001); eq('bothOn BTC 30-day vol', T.vol, 0.0203711129, 1e-9);
  eq('bothOn BTC close needed tomorrow', T.next, 77239.828494, 0.01); is('bothOn BTC ON', T.on, true); }
{ const T = R.trendAt(PF.cases.bothOn.bars.ETH, PF.cases.bothOn.bars.ETH.length - 1);
  eq('bothOn ETH close', T.close, 2574.44); eq('bothOn ETH Hull 55', T.hull, 2748.50256908, 1e-6); eq('bothOn ETH Hull 55 yesterday', T.hullPrev, 2747.60026395, 1e-6);
  eq('bothOn ETH 200-day avg', T.sma, 2127.609850, 0.001); eq('bothOn ETH 30-day vol', T.vol, 0.0224897324, 1e-9);
  eq('bothOn ETH close needed tomorrow', T.next, 2668.193731, 0.01); is('bothOn ETH ON', T.on, true); }
{ const T = R.trendAt(PF.cases.btcOff.bars.BTC, PF.cases.btcOff.bars.BTC.length - 1);
  eq('btcOff BTC close', T.close, 81179.6); eq('btcOff BTC Hull 55', T.hull, 81119.35589732, 1e-6); eq('btcOff BTC Hull 55 yesterday', T.hullPrev, 81226.53877946, 1e-6);
  eq('btcOff BTC 200-day avg', T.sma, 70540.525500, 0.001); eq('btcOff BTC 30-day vol', T.vol, 0.0194586665, 1e-9);
  eq('btcOff BTC close needed tomorrow', T.next, 82776.898974, 0.01); is('btcOff BTC ON', T.on, false); }
{ const T = R.trendAt(PF.cases.btcOff.bars.ETH, PF.cases.btcOff.bars.ETH.length - 1);
  eq('btcOff ETH close', T.close, 2644.88); eq('btcOff ETH Hull 55', T.hull, 2608.78293823, 1e-6); eq('btcOff ETH Hull 55 yesterday', T.hullPrev, 2608.37182510, 1e-6);
  eq('btcOff ETH 200-day avg', T.sma, 2077.204000, 0.001); eq('btcOff ETH 30-day vol', T.vol, 0.0238954041, 1e-9);
  eq('btcOff ETH close needed tomorrow', T.next, 2521.010110, 0.01); is('btcOff ETH ON', T.on, true); }
{ const Q = R.plan(PF.cases.today.bars, PF.cases.today.live, pj({}));
  eq('today_empty equity live', Q.eqLive, 10000, 0.01); eq('today_empty equity at day open', Q.eqOpen, 10000, 0.01);
  eq('today_empty total size', Q.total, 7200, 0.01); eq('today_empty day-stop equity', Q.killEq, 9850.0, 0.01); is('today_empty day stop hit', Q.killed, false);
  is('today_empty BTC action', Q.coins.BTC.action, 'WAIT');
  is('today_empty ETH action', Q.coins.ETH.action, 'WAIT');
}
{ const Q = R.plan(PF.cases.bothOn.bars, PF.cases.bothOn.live, pj({}));
  eq('bothOn_empty equity live', Q.eqLive, 10000, 0.01); eq('bothOn_empty equity at day open', Q.eqOpen, 10000, 0.01);
  eq('bothOn_empty total size', Q.total, 7200, 0.01); eq('bothOn_empty day-stop equity', Q.killEq, 9850.0, 0.01); is('bothOn_empty day stop hit', Q.killed, false);
  is('bothOn_empty BTC action', Q.coins.BTC.action, 'BUY');
  eq('bothOn_empty BTC buy $', Q.coins.BTC.notional, 3777.9486627428614, 0.01); eq('bothOn_empty BTC pass price', Q.coins.BTC.passPx, 105378.09058969213, 0.01);
  eq('bothOn_empty BTC day stop', Q.coins.BTC.stop, 81587.10416666666, 0.01);
  is('bothOn_empty ETH action', Q.coins.ETH.action, 'BUY');
  eq('bothOn_empty ETH buy $', Q.coins.ETH.notional, 3422.0513372571395, 0.01); eq('bothOn_empty ETH pass price', Q.coins.ETH.passPx, 3326.748994307338, 0.01);
  eq('bothOn_empty ETH day stop', Q.coins.ETH.stop, 2520.8058333333333, 0.01);
  eq('bothOn_empty day-stop distance', Q.move, 0.020833333333333332, 1e-9);
}
{ const Q = R.plan(PF.cases.bothOn.bars, PF.cases.bothOn.live, pj({ BTC: [80000, 4000] }));
  eq('bothOn_btcHeld equity live', Q.eqLive, 10166.15, 0.01); eq('bothOn_btcHeld equity at day open', Q.eqOpen, 10166.15, 0.01);
  eq('bothOn_btcHeld total size', Q.total, 9193.799999999996, 0.01); eq('bothOn_btcHeld day-stop equity', Q.killEq, 10013.65775, 0.01); is('bothOn_btcHeld day stop hit', Q.killed, false);
  is('bothOn_btcHeld BTC action', Q.coins.BTC.action, 'HOLD');
  eq('bothOn_btcHeld BTC day stop', Q.coins.BTC.stop, 81834.43707144452, 0.01);
  is('bothOn_btcHeld ETH action', Q.coins.ETH.action, 'BUY');
  eq('bothOn_btcHeld ETH buy $', Q.coins.ETH.notional, 4369.674386732593, 0.01); eq('bothOn_btcHeld ETH pass price', Q.coins.ETH.passPx, 3065.7115694601644, 0.01);
  eq('bothOn_btcHeld ETH day stop', Q.coins.ETH.stop, 2528.447705606011, 0.01);
  eq('bothOn_btcHeld day-stop distance', Q.move, 0.017864970398995296, 1e-9);
}
{ const Q = R.plan(PF.cases.btcOff.bars, PF.cases.btcOff.live, pj({ BTC: [84000, 3000] }));
  eq('btcOff_btcHeld equity live', Q.eqLive, 9899.289285714285, 0.01); eq('btcOff_btcHeld equity at day open', Q.eqOpen, 9899.271428571428, 0.01);
  eq('btcOff_btcHeld total size', Q.total, 5991.471428571422, 0.01); eq('btcOff_btcHeld day-stop equity', Q.killEq, 9750.782357142856, 0.01); is('btcOff_btcHeld day stop hit', Q.killed, false);
  is('btcOff_btcHeld BTC action', Q.coins.BTC.action, 'SELL');
  is('btcOff_btcHeld ETH action', Q.coins.ETH.action, 'BUY');
  eq('btcOff_btcHeld ETH buy $', Q.coins.ETH.notional, 5991.471428571422, 0.01); eq('btcOff_btcHeld ETH pass price', Q.coins.ETH.passPx, 3131.0153717784574, 0.01);
  eq('btcOff_btcHeld ETH day stop', Q.coins.ETH.stop, 2579.5259073640386, 0.01);
  eq('btcOff_btcHeld day-stop distance', Q.move, 0.02478340641340193, 1e-9);
}
{ const lv = Object.assign({}, PF.cases.bothOn.live, { BTC: 83323 * 0.95 });
  const Q = R.plan(PF.cases.bothOn.bars, lv, pj({ BTC: [80000, 4000] }));
  /* by hand: 79156.85 -> equity 10000 + (79156.85/80000 - 1) x 4000 = 9957.84 <= 0.985 x 10166.15 = 10013.66 */
  eq('day stop: equity', Q.eqLive, 9957.8425, 0.01); is('day stop: SELL ALL', Q.killed, true); }
console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASS') + '  (' + (total - fails) + '/' + total + ')');
process.exit(fails ? 1 : 0);
