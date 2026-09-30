import io
F='kraken-desk.html'
s=io.open(F,encoding='utf-8').read()
def rep(old,new):
    global s
    n=s.count(old); assert n==1,(n,old[:70]); s=s.replace(old,new)

# 1) HTML: the 4.17 "Holdings" panel becomes STOCKS REACTION; "Coming up" stays below it
rep('''  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Coming up — earnings · central banks · Forex Factory</h3><div class="sp"></div>
    <span class="meta" id="pfevmeta">—</span></div>
    <div class="pb scroll"><table id="pfevt"></table></div></div>
  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Holdings — results · dividends · investor relations</h3></div>
    <div class="pb scroll"><table id="pfevh"></table></div></div>
''','''  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Stocks reaction</h3><div class="sp"></div>
    <span class="meta" id="stxmeta">—</span></div>
    <div class="pb scroll"><table id="stx"></table></div>
    <div class="note" id="stxn"></div></div>
  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Coming up — earnings · central banks · Forex Factory</h3><div class="sp"></div>
    <span class="meta" id="pfevmeta">—</span></div>
    <div class="pb scroll"><table id="pfevt"></table></div></div>
''')

# 2) JS: loader + renderer, placed right after renderPFEV
STX=r"""
/* ==== STOCKS REACTION (30 Sep 2026, v4.19) ====
   watch/stocks.json is written by watch/stocks.js on GitHub Actions once a week:
   Yahoo daily closes + dividends, Nasdaq reported dates + EPS surprise, and the
   hand-kept facts in watch/stocks-events.json. Every move shown is close-to-close
   around the release (AMC: report-day close → next session; BMO: prior close →
   same day) and five sessions later. Fetched once when the page opens; no timers.
   If the file is not reachable (opened from disk) the panel says so. */
var STX=null,STX_REQ=0;
function loadSTX(){
 STX_REQ=1;
 fetch('watch/stocks.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
  .then(function(j){STX=j;renderSTX();try{renderMobile();}catch(e){}})
  .catch(function(){STX={err:1};renderSTX();try{renderMobile();}catch(e){}});
}
function stxPct(v,b){if(v==null)return '<span class="dim">—</span>';return '<span style="color:'+(v>0?'var(--up)':v<0?'var(--dn)':'var(--dim)')+(b?';font-weight:700':'')+'">'+(v>0?'+':'')+nf(v,1)+'%</span>';}
function stxD(d){try{return new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short'});}catch(e){return d;}}
function stxSyms(){var a=[];OPEN.forEach(function(r){if(a.indexOf(r.sym)<0)a.push(r.sym);});return a;}
function renderSTX(){
 var T=$('stx'),M=$('stxmeta'),N=$('stxn');if(!T)return;
 if(!STX){M.textContent='loading…';return;}
 if(STX.err){M.textContent='no data';T.innerHTML='';
  N.innerHTML='<b>watch/stocks.json not reachable</b> — the hosted page loads it; a copy opened from disk cannot. It is written on GitHub every Monday 05:00 UTC by the stocks job.';return;}
 M.textContent='measured '+STX.asOf+' · refreshes Mondays';
 var h='<thead><tr><th>Instrument</th><th>Next report</th><th>Last reports — surprise → day move · 5 sessions</th>'+
  '<th class="n">Typical</th><th class="n">Beat → up</th><th>Dividend</th><th class="n">Yours / yr</th><th>IR</th></tr></thead><tbody>';
 var pend=[];
 stxSyms().forEach(function(sym){var o=STX.syms[sym];if(!o)return;
  var nx=o.next?stxD(o.next.d)+(o.rep?' · '+(o.rep==='AMC'?'after close':'before open'):''):(o.rep?'<span class="dim">not announced</span>':'<span class="dim">'+esc(o.kind||'—')+'</span>');
  var hot=o.next&&(Date.parse(o.next.d+'T23:59:59Z')-Date.now())<7*864e5&&(Date.parse(o.next.d+'T23:59:59Z')-Date.now())>-864e5;
  var rep='';
  (o.earn||[]).slice(0,4).forEach(function(e){
   if(e.pending){pend.push(sym+' '+e.d);rep+='<span class="tag y" title="reported, first close after it not in the data yet">'+e.d.slice(5)+' pending</span> ';return;}
   var sur=e.sur!=null?('<span class="dim">'+(e.sur>0?'beat +':'miss ')+nf(e.sur,0)+'%</span> → '):(e.what?'<span class="dim">'+esc(e.what)+'</span> → ':'');
   rep+='<span class="tag" style="margin:1px 4px 1px 0;font-size:10px" title="reference close '+e.refD+' '+nf(e.ref)+' → '+e.d1D+'">'+e.d.slice(2,10)+' '+sur+stxPct(e.d1,true)+' · '+stxPct(e.d5)+'</span>';});
  var sm=o.sum;
  var q=pfevQty(sym),dv=(o.div||[])[0],perYr=null,dvt='<span class="dim">'+esc(o.kind||(o.rep?'none':'—'))+'</span>';
  if(dv){var yr=(o.div||[]).filter(function(x){return (Date.now()-Date.parse(x.d))<366*864e5;}).reduce(function(a,x){return a+x.amt;},0);
   perYr=q*yr;dvt=nf(dv.amt,2)+' '+esc(o.ccy)+' <span class="dim">ex '+dv.d.slice(5)+' · '+(dv.drop!=null?('stock '+(dv.drop>0?'+':'')+nf(dv.drop,1)+'% that day'):'')+'</span>';}
  h+='<tr><td><span class="tick">'+sym+'</span></td>'+
   '<td'+(hot?' style="color:var(--warn);font-weight:700"':'')+'>'+nx+'</td>'+
   '<td style="white-space:normal;min-width:340px">'+(rep||'<span class="dim">no results — moves with the metal / sector</span>')+'</td>'+
   '<td class="n">'+(sm?('±'+nf(sm.medAbs,1)+'% <span class="dim">max '+nf(sm.maxAbs,1)+'</span>'):'—')+'</td>'+
   '<td class="n">'+(sm&&sm.beats?(sm.beatUp+'/'+sm.beats):'<span class="dim">—</span>')+'</td>'+
   '<td>'+dvt+'</td>'+
   '<td class="n" style="color:'+(perYr?'var(--up)':'var(--dim)')+'">'+(perYr?(nf(perYr,perYr<1?3:2)+' '+esc(o.ccy==='GBX'?'GBp':o.ccy)):'—')+'</td>'+
   '<td><a class="tag b" href="'+esc(o.ir)+'" target="_blank" rel="noopener">IR ↗</a></td></tr>';});
 h+='</tbody>';T.innerHTML=h;
 N.innerHTML='Move = first close after the release vs the last close before it, then five sessions later. "Typical" is the median of those day moves; "Beat → up" counts reports that beat the EPS estimate and closed higher. '+
  'Yahoo closes · Nasdaq reported dates · company calendars.'+(pend.length?' <b>Pending:</b> '+pend.join(', ')+' — measured on the next Monday run.':'')+
  (STX.failed&&STX.failed.length?' <span style="color:var(--warn)">Last run could not fetch: '+esc(STX.failed.join('; '))+'</span>':'');
}
"""
rep(" $('pfevmeta').textContent='checked '+PFEV.asof;\n}", " $('pfevmeta').textContent='checked '+PFEV.asof;\n if(!STX_REQ)loadSTX();else renderSTX();\n}"+STX)

# 3) renderPFEV no longer builds the old holdings table
rep(""" var syms=[];OPEN.forEach(function(r){if(syms.indexOf(r.sym)<0)syms.push(r.sym);});
 var g='<thead><tr><th>Instrument</th><th>Next</th><th>Last result</th><th>Dividend</th><th class="n">Yours / qtr</th><th>IR</th></tr></thead><tbody>';
 syms.forEach(function(s){var H=PFEV.h[s];if(!H)return;var dv=pfevDiv(s);
  g+='<tr><td><span class="tick">'+s+'</span></td>'+
   '<td style="white-space:normal;max-width:220px'+(/TONIGHT/.test(H.next)?';color:var(--warn);font-weight:700':'')+'">'+H.next+'</td>'+
   '<td class="sub" style="white-space:normal;max-width:360px">'+(H.last||'—')+'</td>'+
   '<td class="sub" style="white-space:normal;max-width:200px">'+dv.t+'</td>'+
   '<td class="n" style="color:'+(dv.v?'var(--up)':'var(--dim)')+'">'+(dv.v?('$'+nf(dv.v,dv.v<0.1?3:2)):'—')+'</td>'+
   '<td><a class="tag b" href="'+H.ir+'" target="_blank" rel="noopener">IR ↗</a></td></tr>';});
 g+='</tbody>';
 $('pfevh').innerHTML=g;
""","")

# 4) mobile: the Dividends list becomes Stocks reaction
rep("""  var _dv=[];OPEN.forEach(function(r){if(_dv.indexOf(r.sym)<0){var d=pfevDiv(r.sym);if(d.v)_dv.push(r.sym);}});
  if(_dv.length){
   h+='<div class="msec"><h4>Dividends</h4><div class="sp"></div><span>your qty</span></div><div class="mlist">';
   _dv.forEach(function(s){var d=pfevDiv(s);
    h+='<div class="mrow"><div class="av">'+s.slice(0,4)+'</div><div class="nm"><b>'+s+'</b><span>'+d.t+'</span></div>'+
       '<div class="rt"><b class="g">$'+nf(d.v,d.v<0.1?3:2)+'</b><span class="d">per quarter</span></div></div>';});
   h+='</div>';}
""","""  h+='<div class="msec"><h4>Stocks reaction</h4><div class="sp"></div><span>'+(STX&&!STX.err?('measured '+STX.asOf):(STX?'no data':'loading…'))+'</span></div><div class="mlist">';
  if(STX&&!STX.err){stxSyms().forEach(function(s){var o=STX.syms[s];if(!o||!o.rep)return;var sm=o.sum,e=(o.earn||[])[0];
    h+='<div class="mrow"><div class="av">'+s.slice(0,4)+'</div>'+
       '<div class="nm"><b>'+s+(o.next?' <span style="font-size:11px;font-weight:700;color:var(--warn)">'+o.next.d.slice(5)+'</span>':'')+'</b>'+
       '<span>'+(sm?('typical ±'+nf(sm.medAbs,1)+'% on results · beat→up '+sm.beatUp+'/'+sm.beats):'no results measured')+'</span></div>'+
       '<div class="rt"><b class="'+(e&&!e.pending?mCls(e.d1):'d')+'">'+(e&&!e.pending?((e.d1>0?'+':'')+nf(e.d1,1)+'%'):(e?'pending':'—'))+'</b><span class="d">'+(e?('last · '+e.d.slice(5)):'')+'</span></div></div>';});}
  else h+='<div class="mempty">'+(STX?'watch/stocks.json not reachable — open the hosted page':'…')+'</div>';
  h+='</div>';
""")

rep("var APP_VERSION='4.18'","var APP_VERSION='4.19'")
rep('v4.18 SYNC','v4.19 STOCKS')
io.open(F,'w',encoding='utf-8',newline='').write(s)
print('ok',len(s))
