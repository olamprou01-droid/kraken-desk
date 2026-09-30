/* one-off patch script for v4.14 — applied identically to kraken-desk.html and mobile/index.html.
   Each replacement must match exactly once in each file or the script aborts. */
'use strict';
const fs = require('fs');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node patch-4.14.js <file> [<file>...]'); process.exit(2); }

const R = [
/* ---- fix 4: offRule ---------------------------------------------------- */
[`function closes(){return mine().filter(function(t){return t.status==='WIN'||t.status==='LOSS';});}`,
`function closes(){return mine().filter(function(t){return t.status==='WIN'||t.status==='LOSS';});}
/* OFF-RULE (28 Sep 2026). A trade logged by hand that the rule did not signal, or
   was logged more than staleLimit above the signal, is real money and counts in
   equity and P&L - but it is not evidence about the rule. It is excluded from the
   go-live count, the learning pool and Tier 2b. AVAX 11.152 against a signal at
   8.307 was the case that made this necessary. */
function onRule(t){return !t.offRule;}
function evidence(){return closes().filter(onRule);}
function offRuleWhy(sym,entry){
  var g=null;((WATCH.st&&WATCH.st.signals)||[]).forEach(function(s){if(s.sym===sym&&s.status==='OPEN')g=s;});
  if(g&&g.entry){var over=entry/g.entry-1;return over>RULES.staleLimit?('entry '+nf(over*100,1)+'% over the '+g.date+' signal at '+px(sym,g.entry)):null;}
  var sc=scan(),o=null;sc.all.forEach(function(x){if(x.sym===sym)o=x;});
  if(!sc.regime||!sc.regime.on)return 'regime off';
  if(!o||!o.f||!o.f.breakout||!o.f.breakout.ok)return 'no breakout signal';
  if(o.f.fresh&&!o.f.fresh.ok)return 'stale: '+o.f.fresh.v;
  return null;}`],

[`function learnPool(){return resolvedOf(mine()).concat(resolvedOf(backfilled()));}`,
 `function learnPool(){return resolvedOf(mine()).filter(function(t){return !t.offRule;}).concat(resolvedOf(backfilled()));}`],

[`function stats(){return statsOf(closes(),true);}`,
 `function stats(){return statsOf(evidence(),true);}`],

[`  var risk=notional*(entry-k.stop)/entry;
  var t={id:'T'+T.getTime(),origin:'me',sym:sym,day:dayBefore,t:T.toISOString(),entry:entry,stop:k.stop,tp:k.tp,
    size:Math.round(notional),riskAmt:risk,status:'OPEN',mode:isLive()?'live':'paper',
    reason:'logged by hand · '+k.from,level:k.level,logged:true,regimeOff:!(scan().regime&&scan().regime.on),`,
 `  var risk=notional*(entry-k.stop)/entry,off=offRuleWhy(sym,entry);
  var t={id:'T'+T.getTime(),origin:'me',sym:sym,day:dayBefore,t:T.toISOString(),entry:entry,stop:k.stop,tp:k.tp,
    size:Math.round(notional),riskAmt:risk,status:'OPEN',mode:isLive()?'live':'paper',offRule:off||undefined,
    reason:'logged by hand · '+k.from,level:k.level,logged:true,regimeOff:!(scan().regime&&scan().regime.on),`],

[`  JOURNAL.push(t);save();syncPush(t);toast('Logged '+sym+' '+usd(Math.round(notional))+' · stop '+px(sym,k.stop));render();return true;}`,
 `  JOURNAL.push(t);save();syncPush(t);toast('Logged '+sym+' '+usd(Math.round(notional))+' · stop '+px(sym,k.stop)+(off?' · OFF RULE: '+off:''));render();return true;}`],

/* desktop Open table tag */
[`    (hit?'<span class="tag r">SELL</span>':(nr?'<span class="tag" style="color:var(--warn);border-color:var(--warn)">NEAR '+Math.round(nr.prog*100)+'%</span>':'<span class="tag g">OPEN</span>'))+'</td>'+`,
 `    (hit?'<span class="tag r">SELL</span>':(nr?'<span class="tag" style="color:var(--warn);border-color:var(--warn)">NEAR '+Math.round(nr.prog*100)+'%</span>':'<span class="tag g">OPEN</span>'))+
    (t.offRule?' <span class="tag" title="'+t.offRule+'" style="color:var(--dim);border-color:var(--line3)">OFF RULE</span>':'')+'</td>'+`],

/* mobile row: dim OFF RULE marker */
[`    h+='<div class="mrow"'+_nr+'><div class="av">'+t.sym+'</div><div class="nm"><b>'+t.sym+'</b>'+`,
 `    h+='<div class="mrow"'+_nr+'><div class="av">'+t.sym+'</div><div class="nm"><b>'+t.sym+(t.offRule?' <span style="color:var(--dim);font-size:9px;letter-spacing:1px">OFF RULE</span>':'')+'</b>'+`],
];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  R.forEach(([a, b], i) => {
    const n = s.split(a).length - 1;
    if (n !== 1) { console.error(f + ': replacement #' + (i + 1) + ' matched ' + n + ' times (need 1)'); process.exit(1); }
    s = s.replace(a, b);
  });
  fs.writeFileSync(f, s);
  console.log(f + ': ' + R.length + ' replacements applied');
}
