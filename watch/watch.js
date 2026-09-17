/* ============================================================================
   OWN BOOK — the watcher.

   Runs on GitHub's servers every 30 minutes (see .github/workflows/watch.yml).
   No Claude, no usage, no cost. It does exactly what pressing ↻ in the app does,
   then pushes a notification to your phone if - and only if - something changed.

     1. fetch daily candles for the 12 coins from Coinbase, drop the in-progress bar
     2. fetch live prices from Kraken (Coinbase last-trade as fallback)
     3. read kraken-journal.json           -> your open positions
     4. read watch/last.json                -> what it already told you
     5. evaluate the rule (rule.js, proven identical to the app)
     6. notify via ntfy.sh on: SELL now · new BUY · regime flip · daily heartbeat
     7. write watch/last.json               -> the app shows it, the next run diffs it

   Dry run without network:  node watch/watch.js --fixture
   ========================================================================= */
'use strict';
const fs   = require('fs');
const path = require('path');
const R    = require('./rule.js');

const ROOT      = path.resolve(__dirname, '..');
const JOURNAL   = path.join(ROOT, 'kraken-journal.json');
const STATE     = path.join(__dirname, 'last.json');
const TOPIC     = process.env.NTFY_TOPIC || 'ownbook-356ba5c8fc6a5b7454';
const NTFY      = 'https://ntfy.sh/' + TOPIC;
const DRY       = process.argv.includes('--fixture');
const HEARTBEAT_UTC_HOUR = 6;                         // 09:00 Cyprus in summer, 08:00 in winter

const CB  = 'https://api.exchange.coinbase.com/products/';
const KR  = 'https://api.kraken.com/0/public/';

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'ownbook-watch/1.0' } });
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
  return r.json();
}

/* ---- 1. bars: exactly the app's shape, in-progress candle removed ---- */
async function fetchBars() {
  const today = new Date().toISOString().slice(0, 10);
  const bars = {}, inprog = {};
  for (const s of R.SYMS) {
    const j = await getJSON(CB + R.CBP[s] + '/candles?granularity=86400');
    j.sort((a, b) => a[0] - b[0]);
    const rows = [];
    for (const x of j) {
      const d = new Date(x[0] * 1000).toISOString().slice(0, 10);
      if (d >= today) { inprog[s] = x[4]; continue; }
      rows.push([d, x[3], x[2], x[1], x[4], x[5]]);          // [date, open, high, low, close, vol]
    }
    bars[s] = rows;
  }
  return { bars, inprog };
}

/* ---- 2. live: Kraken ticker, Coinbase in-progress close as fallback ---- */
async function fetchLive(inprog) {
  const live = {}; let src = 'kraken';
  try {
    const pairs = R.SYMS.map(s => R.KRQ[s]).join(',');
    const j = await getJSON(KR + 'Ticker?pair=' + pairs);
    for (const k of Object.keys(j.result || {})) { const s = R.KRK[k]; if (s) live[s] = +j.result[k].c[0]; }
  } catch (e) { src = 'coinbase (kraken unreachable: ' + e.message + ')'; }
  for (const s of R.SYMS) if (live[s] == null && inprog[s] != null) { live[s] = inprog[s]; if (src === 'kraken') src = 'kraken + coinbase'; }
  return { live, src };
}

function readJSON(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } }

/* ---- 6. notify ---- */
async function notify(title, body, priority, tags) {
  const line = '[' + (priority || 'default') + '] ' + title + ' — ' + body;
  if (DRY) { console.log('  NOTIFY ' + line); return true; }
  try {
    const r = await fetch(NTFY, { method: 'POST', body: body,
      headers: { 'Title': title, 'Priority': priority || 'default', 'Tags': tags || 'chart_with_upwards_trend' } });
    console.log('  notified ' + r.status + ' ' + line);
    return r.ok;
  } catch (e) { console.log('  notify FAILED ' + e.message); return false; }
}

(async function main() {
  const t0 = Date.now();
  let bars, inprog, live, liveSrc;
  if (DRY) {
    const fx = require('./fixture.json');
    bars = fx.bars; inprog = {}; live = fx.live; liveSrc = 'fixture';
    for (const s of R.SYMS) if (!bars[s]) bars[s] = null;           // fixture carries 4 coins; others read as 'no data'
  } else {
    ({ bars, inprog } = await fetchBars());
    ({ live, src: liveSrc } = await fetchLive(inprog));
  }

  const journal = readJSON(JOURNAL, { trades: [] });
  const prev    = readJSON(STATE, { alerted: {}, regimeOn: null, heartbeatDay: null, signals: [] });
  const signals = Array.isArray(prev.signals) ? prev.signals : [];
  /* virtual book: every BUY the watcher itself sent, until it hits stop or target.
     If you took the trade, this is your position. If you did not, the alert is moot. */
  const jSyms = new Set((journal.trades || []).filter(t => t.origin === 'me' && t.status === 'OPEN').map(t => t.sym));
  const virt  = { trades: (journal.trades || []).concat(
    signals.filter(g => g.status === 'OPEN' && !jSyms.has(g.sym)).map(g => ({
      id: 'W' + g.date + g.sym, origin: 'me', sym: g.sym, status: 'OPEN', entry: g.entry, stop: g.stop, tp: g.tp,
      size: g.size || 0, riskAmt: g.risk || 0, virtual: true }))) };
  const ev      = R.evaluate(bars, live, virt);
  const now     = new Date();
  const nowIso  = now.toISOString();
  const alerted = {};
  const events  = [];

  /* SELL — the one alert that repeats every run while true. A stop is a human action. */
  for (const s of ev.stops) {
    if (s.hitStop) {
      events.push({ k: 'sell', sym: s.sym });
      const isV = String(s.id).charAt(0) === 'W';
      await notify('SELL ' + s.sym + ' NOW', s.sym + ' ' + R.px(s.sym, s.live) + ' is at or under the stop ' + R.px(s.sym, s.stop) +
        (isV ? ' of the BUY signal sent ' + s.id.slice(1, 11) + ' · if you took it, sell by hand on Kraken now' :
               ' · P&L ' + (s.pnl >= 0 ? '+' : '') + R.usd(s.pnl) + ' · sell by hand on Kraken'), 'urgent', 'rotating_light');
      signals.forEach(g => { if (g.sym === s.sym && g.status === 'OPEN') { g.status = 'STOP'; g.closed = nowIso.slice(0, 10); g.exit = s.live; } });
    } else if (s.hitTp) {
      alerted['tp:' + s.sym] = true;
      if (!prev.alerted['tp:' + s.sym]) {
        events.push({ k: 'tp', sym: s.sym });
        await notify('TARGET ' + s.sym, s.sym + ' ' + R.px(s.sym, s.live) + ' reached target ' + R.px(s.sym, s.tp) +
          ' · P&L +' + R.usd(s.pnl) + ' · sell', 'high', 'tada');
        signals.forEach(g => { if (g.sym === s.sym && g.status === 'OPEN') { g.status = 'TP'; g.closed = nowIso.slice(0, 10); g.exit = s.live; } });
      }
    }
  }

  /* BUY — once per signal. Re-alerts only if it stopped being buyable and then fired again. */
  const buyable = ev.coins.filter(c => c.buyable);
  for (const c of buyable) {
    alerted['buy:' + c.sym] = true;
    if (!prev.alerted['buy:' + c.sym]) {
      events.push({ k: 'buy', sym: c.sym });
      const z = c.size;
      await notify('BUY ' + c.sym, c.sym + ' in ' + R.px(c.sym, c.buy) + ' · stop ' + R.px(c.sym, c.stop) + ' · target ' + R.px(c.sym, c.tp) +
        (z ? ' · ' + R.usd(z.notional) + ' (' + R.usd(z.risk) + ' risk)' : '') + ' · open the app and press ↻ before you buy', 'high', 'green_circle');
      if (!signals.some(g => g.sym === c.sym && g.status === 'OPEN'))
        signals.push({ sym: c.sym, date: nowIso.slice(0, 10), t: nowIso, entry: c.buy, stop: c.stop, tp: c.tp, level: c.level,
                       size: z ? z.notional : 0, risk: z ? z.risk : 0, status: 'OPEN' });
    }
  }

  /* regime flip */
  if (prev.regimeOn !== null && prev.regimeOn !== ev.regime.on) {
    events.push({ k: 'regime', on: ev.regime.on });
    await notify(ev.regime.on ? 'REGIME ON' : 'REGIME OFF',
      'BTC ' + R.px('BTC', ev.regime.px) + (ev.regime.g1 ? ' > ' : ' < ') + '20d avg ' + R.px('BTC', ev.regime.sma) +
      ' · ' + (ev.regime.mom >= 0 ? '+' : '') + (ev.regime.mom * 100).toFixed(1) + '% in 60d' +
      (ev.regime.on ? ' · breakouts can now be taken' : ' · nothing is buyable until this turns back on'), 'default', ev.regime.on ? 'white_check_mark' : 'pause_button');
  }

  /* daily heartbeat so you know it is alive */
  const day = nowIso.slice(0, 10);
  const nearest = ev.coins.filter(c => c.distPct != null).sort((a, b) => a.distPct - b.distPct)[0];
  if (now.getUTCHours() === HEARTBEAT_UTC_HOUR && prev.heartbeatDay !== day) {
    events.push({ k: 'heartbeat' });
    await notify('Own Book · ' + day,
      'regime ' + (ev.regime.on ? 'ON' : 'OFF') + ' · BTC ' + R.px('BTC', ev.regime.px) + ' vs 20d ' + R.px('BTC', ev.regime.sma) +
      (nearest ? ' · nearest ' + nearest.sym + ' ' + (nearest.distPct <= 0 ? 'AT LEVEL' : '+' + nearest.distPct.toFixed(1) + '%') : '') +
      ' · ' + ev.stops.length + ' open · equity ' + R.usd(ev.equity), 'low', 'eyes');
    prev.heartbeatDay = day;
  }

  /* 7. state for the app and for the next run */
  const state = {
    ran: nowIso, ms: Date.now() - t0, liveSrc: liveSrc, topic: TOPIC,
    barDate: bars.BTC ? bars.BTC[bars.BTC.length - 1][0] : null,
    regimeOn: ev.regime.on,
    regime: { px: ev.regime.px, sma: ev.regime.sma, mom: ev.regime.mom, g1: ev.regime.g1, g2: ev.regime.g2 },
    equity: ev.equity, cushion: ev.cushion,
    coins: ev.coins.map(c => ({ sym: c.sym, live: live[c.sym], level: c.level, distPct: c.distPct, buyable: c.buyable, fail: c.firstFail })),
    stops: ev.stops.map(s => ({ sym: s.sym, live: s.live, stop: s.stop, tp: s.tp, hitStop: s.hitStop, hitTp: s.hitTp, r: s.r })),
    events: events, alerted: alerted, heartbeatDay: prev.heartbeatDay,
    signals: signals.filter(g => g.status === 'OPEN' || (g.closed && (Date.now() - Date.parse(g.closed)) < 30 * 864e5))
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

  console.log('ran ' + nowIso + ' in ' + state.ms + 'ms · live ' + liveSrc + ' · bar ' + state.barDate +
    ' · regime ' + (ev.regime.on ? 'ON' : 'OFF') + ' · buyable ' + buyable.map(c => c.sym).join(',') +
    ' · open ' + ev.stops.length + ' · events ' + events.length +
    (nearest ? ' · nearest ' + nearest.sym + ' ' + nearest.distPct.toFixed(2) + '%' : ''));
})().catch(e => { console.error('watch failed: ' + (e && e.stack || e)); process.exit(1); });
