import io,sys
F='kraken-desk.html'
s=io.open(F,encoding='utf-8').read()
def rep(old,new):
    global s
    n=s.count(old); assert n==1,(n,old[:60]); s=s.replace(old,new)

DATA=r"""
/* ==== PFEV — earnings, dividends, Forex Factory and IR for every holding (30 Sep 2026, v4.17)
   Every line below was read from a named source on 30 Sep 2026; nothing is estimated
   unless it says "est." with where the estimate came from. Dates are UTC; the page
   shows them in Cyprus time and counts days from the moment it renders (no timers).
   FF red folders = the Desk Book's Forex Factory calendar (asOf 28 Sep). ECB = ECB
   decision 29 Oct 14:15 CET; BoE = official 2026 MPC dates. ETH "typical move" = median
   absolute day-close move of ETH on the Desk Book's measured prints (2024-2026). */
var PFEV={asof:'2026-09-30',
 ev:[
  {d:'2026-09-30T12:30:00Z',k:'FF',t:'Core PCE · Final GDP',on:'USD',src:'Forex Factory'},
  {d:'2026-09-30T20:30:00Z',k:'EARN',sym:'MU',t:'Micron fiscal Q4 results',x:'guided revenue $50.0bn ±1.0 · EPS $31 ±1',src:'Micron IR, 26 Aug'},
  {d:'2026-10-02T12:30:00Z',k:'FF',t:'Non-Farm Payrolls',on:'USD',src:'Forex Factory'},
  {d:'2026-10-07T18:00:00Z',k:'FF',t:'FOMC Minutes',on:'USD',src:'Forex Factory'},
  {d:'2026-10-14T12:30:00Z',k:'FF',t:'CPI',on:'USD',src:'Forex Factory'},
  {d:'2026-10-15T12:30:00Z',k:'FF',t:'PPI · Retail Sales',on:'USD',src:'Forex Factory'},
  {d:'2026-10-22T06:00:00Z',k:'EARN',sym:'RMS',t:'Hermès Q3 revenue',x:'Q2 missed by €30m and the stock fell 7.9%',src:'Hermès finance calendar'},
  {d:'2026-10-28T18:00:00Z',k:'FF',t:'FOMC rate decision + press conference',on:'USD',src:'Forex Factory'},
  {d:'2026-10-29T12:30:00Z',k:'FF',t:'Advance GDP · Core PCE',on:'USD',src:'Forex Factory'},
  {d:'2026-10-29T13:15:00Z',k:'CB',t:'ECB rate decision',on:'EUR',x:'deposit 2.50% · ~60% priced for a hike (24 Sep)',src:'ECB calendar via Admiral Markets'},
  {d:'2026-11-05T12:00:00Z',k:'CB',t:'Bank of England rate decision',on:'GBP',src:'Bank of England 2026 MPC dates'}
 ],
 /* which holdings each currency's news moves */
 on:{USD:['ETH','PLTR','MU','LMT','XOM','OKLO','EGLN','SSLN'],EUR:['EGLN','ISOD','RMS'],GBP:['SSLN','NUCG']},
 h:{
  MU:{next:'Q4 results TONIGHT 23:30 Cyprus',last:'Q3 (24 Jun): revenue $41.46bn, EPS $25.11 — stock +15%',div:{ps:0.15,f:4,when:'last paid 21 Jul'},ir:'https://investors.micron.com/'},
  PLTR:{next:'Q3 date not announced yet',last:'Q2 (3 Aug): revenue $1.94bn vs $1.80bn est, EPS $0.41 vs $0.35; FY guide raised to $8.15bn; Q3 guide ~$2.16bn',div:null,ir:'https://investors.palantir.com/'},
  LMT:{next:'Q3 date not announced yet (Q2 was 23 Jul)',last:'Q2: sales $20.1bn +11%, EPS $7.94, record $230bn backlog, FY EPS guide $29.95–30.65 — stock +5%',div:{ps:3.45,f:4,when:'last paid 25 Sep'},ir:'https://investors.lockheedmartin.com/'},
  XOM:{next:'Q3 not confirmed — est. 30 Oct–3 Nov (MarketChameleon, from past dates)',last:'Q2 (31 Jul): adjusted EPS $3.52; $5.1bn buybacks in the quarter',div:{ps:1.03,f:4,when:'last paid 10 Sep'},ir:'https://investor.exxonmobil.com/'},
  OKLO:{next:'Q3 date not announced yet (Q2 was 7 Aug)',last:'Q2: loss $0.28/share vs $0.16 est; ~$3bn cash; Groves reactor first criticality 6 Aug — stock +7.6%',div:null,ir:'https://investor.oklo.com/overview/default.aspx'},
  RMS:{next:'Q3 revenue 22 Oct, 09:00 Cyprus',last:'Q2 (29 Jul): revenue €4.05bn vs €4.08bn est, +7% at constant currency — shares −7.9%',div:{ps:null,when:'annual, next amount not announced'},ir:'https://finance.hermes.com/en/'},
  EGLN:{next:'no company events — moves with gold (USD news) and EUR/USD',last:'',div:{none:'physical gold ETC — pays nothing'},ir:'https://www.ishares.com/'},
  SSLN:{next:'no company events — moves with silver (USD news) and GBP/USD',last:'',div:{none:'physical silver ETC — pays nothing'},ir:'https://www.ishares.com/'},
  ISOD:{next:'no company events — moves with oil & gas producers',last:'',div:{none:'accumulating — income reinvested in the price'},ir:'https://www.ishares.com/'},
  NUCG:{next:'no company events — moves with uranium & nuclear names (OKLO is in the theme)',last:'',div:{none:'accumulating — income reinvested in the price'},ir:'https://www.vaneck.com/'},
  ETH:{next:'no earnings — the USD red folders are what move it',last:'',div:{none:'no dividend (spot, not staked)'},ir:'https://ethereum.org/'}
 },
 /* ETH, measured: median |day-close move| on Desk Book prints, n = prints */
 ethRx:{'Non-Farm Payrolls':[2.04,32],'FOMC rate decision + press conference':[1.70,22],'CPI':[1.56,32],'PPI · Retail Sales':[1.48,32],
        'Core PCE · Final GDP':[1.21,54],'Advance GDP · Core PCE':[1.21,54],'FOMC Minutes':[0.79,22]}
};
function pfevCy(iso){try{return new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Nicosia',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return iso.slice(0,16).replace('T',' ');}}
function pfevIn(iso){var h=(Date.parse(iso)-Date.now())/36e5;
 if(h<0)return 'done';if(h<24)return (h<1?'<1h':Math.round(h)+'h');return Math.round(h/24)+'d';}
function pfevUpcoming(n){var now=Date.now()-3*36e5;   /* keep a print 3h after it lands */
 return PFEV.ev.filter(function(e){return Date.parse(e.d)>now;}).slice(0,n||99);}
function pfevTouch(e){return e.sym?[e.sym]:(PFEV.on[e.on]||[]);}
function pfevQty(sym){return OPEN.filter(function(r){return r.sym===sym;}).reduce(function(a,r){return a+r.qty;},0);}
function pfevDiv(sym){var d=(PFEV.h[sym]||{}).div;if(!d)return{t:'none',v:null};if(d.none)return{t:d.none,v:null};
 if(d.ps==null)return{t:d.when,v:null};var q=pfevQty(sym),per=q*d.ps;
 return{t:'$'+nf(d.ps)+'/share · '+d.when,v:per,yr:per*(d.f||1)};}
function renderPFEV(){
 var E=$('pfevt');if(!E)return;
 var up=pfevUpcoming(12);
 var h='<thead><tr><th>When (Cyprus)</th><th class="n">In</th><th>What</th><th>Moves</th><th>Note</th></tr></thead><tbody>';
 up.forEach(function(e){var hrs=(Date.parse(e.d)-Date.now())/36e5;
  var col=e.k==='EARN'?(hrs<168?'y':'b'):(e.k==='CB'?'b':'');
  var lab=e.k==='EARN'?'EARNINGS':(e.k==='CB'?'CENTRAL BANK':'FF RED');
  var rx=PFEV.ethRx[e.t];
  h+='<tr><td class="mono">'+pfevCy(e.d)+'</td>'+
   '<td class="n" style="color:'+(hrs<24?'var(--warn)':'var(--txt2)')+'"><b>'+pfevIn(e.d)+'</b></td>'+
   '<td><span class="tag '+col+'">'+lab+'</span> <b>'+e.t+'</b></td>'+
   '<td class="sub">'+pfevTouch(e).join(' ')+'</td>'+
   '<td class="sub" style="white-space:normal">'+(e.x||'')+(rx?((e.x?' · ':'')+'ETH typically ±'+nf(rx[0])+'% on the day ('+rx[1]+' prints)'):'')+'</td></tr>';});
 h+='</tbody>';
 $('pfevt').innerHTML=h;
 var syms=[];OPEN.forEach(function(r){if(syms.indexOf(r.sym)<0)syms.push(r.sym);});
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
 $('pfevmeta').textContent='checked '+PFEV.asof;
}
"""
anchor="/* ==== helpers ==== */\nfunction $(i)"
rep(anchor, DATA.strip()+"\n\n"+anchor)
rep('<div class="note" id="pfn"></div></div>\n',
 '<div class="note" id="pfn"></div></div>\n'
 '  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Coming up — earnings · central banks · Forex Factory</h3><div class="sp"></div>\n'
 '    <span class="meta" id="pfevmeta">—</span></div>\n'
 '    <div class="pb scroll"><table id="pfevt"></table></div></div>\n'
 '  <div class="pnl" style="margin-bottom:10px"><div class="ph"><h3>Holdings — results · dividends · investor relations</h3></div>\n'
 '    <div class="pb scroll"><table id="pfevh"></table></div></div>\n')
rep(" $('pfc').innerHTML=hc;\n}", " $('pfc').innerHTML=hc;\n try{renderPFEV();}catch(e){}\n}")
MOB=r"""  h+='</div>';
  var _up=pfevUpcoming(6);
  if(_up.length){
   h+='<div class="msec"><h4>Coming up</h4><div class="sp"></div><span>earnings · FF · central banks</span></div><div class="mlist">';
   _up.forEach(function(e){var hrs=(Date.parse(e.d)-Date.now())/36e5;var rx=PFEV.ethRx[e.t];
    h+='<div class="mrow"><div class="av">'+(e.sym||e.on)+'</div>'+
       '<div class="nm"><b>'+e.t+'</b><span>'+pfevCy(e.d)+' · '+pfevTouch(e).join(' ')+
       (rx?(' · ETH ±'+nf(rx[0])+'%'):'')+'</span></div>'+
       '<div class="rt"><b style="color:'+(hrs<24?'var(--warn)':'var(--txt)')+'">'+pfevIn(e.d)+'</b><span class="d">'+
       (e.k==='EARN'?'earnings':(e.k==='CB'?'rates':'FF red'))+'</span></div></div>';});
   h+='</div>';}
  var _dv=[];OPEN.forEach(function(r){if(_dv.indexOf(r.sym)<0){var d=pfevDiv(r.sym);if(d.v)_dv.push(r.sym);}});
  if(_dv.length){
   h+='<div class="msec"><h4>Dividends</h4><div class="sp"></div><span>your qty</span></div><div class="mlist">';
   _dv.forEach(function(s){var d=pfevDiv(s);
    h+='<div class="mrow"><div class="av">'+s.slice(0,4)+'</div><div class="nm"><b>'+s+'</b><span>'+d.t+'</span></div>'+
       '<div class="rt"><b class="g">$'+nf(d.v,d.v<0.1?3:2)+'</b><span class="d">per quarter</span></div></div>';});
   h+='</div>';}
  if(CLOSED.length){
   h+='<div class="msec"><h4>Closed</h4>"""
rep("""  h+='</div>';
  if(CLOSED.length){
   h+='<div class="msec"><h4>Closed</h4>""", MOB)
rep("var APP_VERSION='4.16'","var APP_VERSION='4.17'")
rep('v4.16 SIGNED','v4.17 SIGNED')
io.open(F,'w',encoding='utf-8',newline='').write(s)
print('ok',len(s))
