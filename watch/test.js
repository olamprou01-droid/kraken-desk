/* Proves rule.js agrees with the app on real bars.
   Expected values were computed independently in a browser from the same Coinbase
   candles on 17 Sep 2026 (see MASTER-PROMPT-v4 §autonomy). Run:  node watch/test.js  */
'use strict';
const R = require('./rule.js');
const fx = require('./fixture.json');

let fails = 0;
function eq(name, got, want, tol) {
  tol = tol == null ? 0.005 : tol;
  const ok = Math.abs(got - want) <= tol;
  console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(46) + String(got).padStart(14) + '  want ' + want);
  if (!ok) fails++;
}
function is(name, got, want) {
  const ok = got === want;
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

/* sizing at a fresh $10,000 book: cushion 500, risk 125 */
eq ('equity, empty journal',  ev.equity,  10000);
eq ('cushion',                ev.cushion, 500);
const sz = R.sizeFor(7.4831, 7.4831 - 1.5*by.UNI.atr, emptyJournal, live);
eq ('UNI ticket risk $',      sz.risk,     125);
eq ('UNI ticket notional $',  sz.notional, 920.68, 0.5);

/* stop watch on a journal with an open trade */
const j = { trades: [{ id:'T1', origin:'me', sym:'UNI', entry:5.879, stop:5.1665, tp:10.154, size:1031, riskAmt:125, status:'OPEN' }] };
const ev2 = R.evaluate(bars, live, j);
is ('one open position seen',              ev2.stops.length, 1);
is ('UNI 7.2637 has not hit stop 5.1665',  ev2.stops[0].hitStop, false);
eq ('UNI open R multiple',                 ev2.stops[0].r, ((7.2637/5.879-1)*1031)/125, 0.001);
const ev3 = R.evaluate(bars, Object.assign({}, live, {UNI: 5.10}), j);
is ('UNI 5.10 HAS hit stop',               ev3.stops[0].hitStop, true);
is ('slot gate blocks a second UNI',       R.evalSym('UNI', bars, live, rg, j).f.slot, false);

/* a synthetic regime-ON case: lift the last BTC close above the SMA */
const btc2 = bars.BTC.map(b => b.slice()); btc2[btc2.length-1][4] = 79000;
const rg2 = R.regime(btc2);
is ('synthetic: regime turns ON when close > sma', rg2.on, true);

console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASS') + '  (' + (24 - fails) + '/24)');
process.exit(fails ? 1 : 0);
