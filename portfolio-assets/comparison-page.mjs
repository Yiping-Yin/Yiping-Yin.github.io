import {timeTickIndices} from './chart-ticks.mjs';
import {readRuns,validateRun,compareRuns,runLinks,selectPair} from './comparison-model.mjs';
const $=id=>document.getElementById(id);
const make=(tag,text='',attrs={})=>{const n=document.createElement(tag);n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const money=v=>(Math.abs(v)<1e-9?0:v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=(v,dp=2)=>(Math.abs(v)<1e-9?0:v).toFixed(dp);
const signed=(v,dp=2)=>(v>0?'+':'')+num(v,dp);
const time=(instant,zone)=>new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone}).format(new Date(instant-60000));
let runs=[],comparison=null;
function status(text,error=false){$('comparison-status').textContent=text;$('comparison-status').dataset.error=String(error);}
async function getBytes(path){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(path,{cache:'no-cache',signal:controller.signal});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());}finally{clearTimeout(timer);}}
async function sha(bytes){if(!globalThis.crypto?.subtle)throw new Error('This browser cannot verify the source digests. Use a current browser over HTTPS.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
function decode(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
async function load(){
  $('comparison-result').hidden=true;$('retry-load').hidden=true;$('a-run').disabled=$('b-run').disabled=$('swap-runs').disabled=true;
  status('Loading and checking published evidence…');
  try{
    const release=decode(await getBytes('/release.json'));
    const packs=await Promise.all(['historical','synthetic'].map(async kind=>{
      const path=`data/published-runs-${kind}.json`,record=release.publishedRuns?.files?.find(f=>f.path===path);
      if(!record?.sha256)throw new Error('Published data checksum is missing.');
      const bytes=await getBytes('/'+path);
      if(bytes.length!==record.bytes||await sha(bytes)!==record.sha256)throw new Error('Published data checksum does not match release.json. Reload after the deployment has settled.');
      return decode(bytes);
    }));
    runs=packs.flatMap(readRuns);
    if(new Set(runs.map(r=>r.result.runId)).size!==runs.length)throw new Error('Duplicate published run identities.');
    for(const r of runs){
      const errors=validateRun(r);if(errors.length)throw new Error(`${r.symbol} / ${r.title}: ${errors.join(' ')}`);
      if(await sha(new TextEncoder().encode(r.result.code))!==r.codeSha256)throw new Error('Published source digest does not match its code.');
    }
    for(const id of ['a-run','b-run']){
      const select=$(id);select.replaceChildren(make('option','Choose a published run',{value:''}));
      for(const kind of ['historical','synthetic']){
        const group=make('optgroup','',{label:kind==='historical'?'Historical · 10 Sep 2026':'Synthetic teaching scenario · 14 Sep 2026'});
        for(const r of runs.filter(r=>r.marketKind===kind))group.append(make('option',`${r.symbol} · ${r.title}`,{value:r.result.runId}));
        select.append(group);
      }
      select.disabled=false;
    }
    $('swap-runs').disabled=false;renderFromURL();
  }catch(error){comparison=null;status('Comparison unavailable. '+(error.name==='AbortError'?'The request timed out.':error.message),true);$('retry-load').hidden=false;}
}
function moveSelection(a,b){const u=new URL(location.href);u.searchParams.set('a',a);u.searchParams.set('b',b);history.pushState(null,'',u);renderFromURL();}
function renderFromURL(){
  comparison=null;$('comparison-result').hidden=true;
  try{
    const pair=selectPair(runs,new URLSearchParams(location.search));
    $('a-run').value=pair.a.result.runId;$('b-run').value=pair.b.result.runId;
    const link=new URL(location.href);link.searchParams.set('a',pair.a.result.runId);link.searchParams.set('b',pair.b.result.runId);$('share-comparison').href=link.href;
    const c=compareRuns(pair.a,pair.b);
    if(!c.ok){status('Cannot compare these runs.\n'+c.reasons.join('\n'),true);return;}
    comparison=c;const a=c.a,b=c.b,config=a.result.config;
    status(`Matched conditions verified · ${a.symbol} · ${a.marketKind} · ${a.meta.session}. Values below are published records, not a new backtest.`);
    $('comparison-title').textContent=`${a.symbol} · ${a.title} / ${b.title}`;
    $('comparison-context').textContent=`${money(config.initialCash)} ${a.currency} starting cash · ${config.feeBps} bp fee · ${config.slippageBps} bp adverse slippage · ${config.maxPosition}-unit position limit · ${a.result.policy.version} · ${a.points.length} completed minutes.`;
    $('legend-a').textContent='A · '+a.title+' · solid';$('legend-b').textContent='B · '+b.title+' · dashed';
    $('benchmark-note').textContent='Common benchmark: '+a.result.policy.benchmarkDescription+' Time labels: '+a.meta.timezone+'. Equity includes uninvested cash; the vertical axis is fitted to the observed range.';
    renderMetrics(c);renderEvidence(c);renderData(c);
    $('minute').max=String(c.rows.length-1);$('minute').value=String(c.rows.length-1);
    $('comparison-result').hidden=false;drawChart();readMinute();$('comparison-result').dataset.ready='true';
  }catch(error){status(error.message,true);const q=new URLSearchParams(location.search);$('a-run').value=q.get('a')||'';$('b-run').value=q.get('b')||'';}
}
function renderMetrics(c){
  const tbody=$('metrics').querySelector('tbody');tbody.replaceChildren();const unit=c.a.currency;
  const defs=[['finalEquity',`Final equity · ${unit}`,2],['netPnl',`Net P&L · ${unit}`,2],['returnPct','Return · %',5],['maxDrawdownPct','Maximum drawdown · %',5],['fees',`Fees · ${unit}`,2],['fillCount','Fills',0]];
  for(const [key,title,dp] of defs){const tr=make('tr','',{'data-metric':key});tr.append(make('th',title,{scope:'row'}),make('td',num(c.a.result.metrics[key],dp)),make('td',num(c.b.result.metrics[key],dp)),make('td',signed(c.delta[key],dp)));tbody.append(tr);}
  for(const side of ['BUY','SELL']){const total=r=>r.result.fills.filter(f=>f.side===side).reduce((n,f)=>n+f.quantity,0),a=total(c.a),b=total(c.b),tr=make('tr');tr.append(make('th',side==='BUY'?'Units bought':'Units sold',{scope:'row'}),make('td',String(a)),make('td',String(b)),make('td',signed(b-a,0)));tbody.append(tr);}
  const tr=make('tr');tr.append(make('th','Ending position · units',{scope:'row'}),make('td',String(c.a.result.finalAccount.position)),make('td',String(c.b.result.finalAccount.position)),make('td',signed(c.b.result.finalAccount.position-c.a.result.finalAccount.position,0)));tbody.append(tr);
}
function renderEvidence(c){
  $('run-evidence').replaceChildren();
  for(const [label,r] of [['A',c.a],['B',c.b]]){
    const article=make('article','',{class:'p2-evidence'});article.append(make('h3',label+' · '+r.title));
    const actions=make('div','',{class:'p2-actions'}),links=runLinks(r);
    for(const [key,text] of [['report','Report'],['replay','Replay'],['source','Source']])actions.append(make('a',text+' '+label,{href:links[key]}));
    article.append(actions);const dl=make('dl','',{class:'p2-meta'});
    for(const [key,value] of [['Run ID',r.result.runId],['Source SHA-256',r.codeSha256],['Tape SHA-256',r.result.datasetChecksum],['Engine',r.result.policy.version],['Market / unit',r.marketKind+' / '+r.currency],['Dataset',r.result.datasetId]]){dl.append(make('dt',key));const dd=make('dd');dd.append(make(key.includes('SHA')||key==='Run ID'?'code':'span',value));dl.append(dd);}
    article.append(dl);const detail=make('details','',{class:'p2-details'});detail.append(make('summary','Published source '+label));const pre=make('pre');pre.append(make('code',r.result.code));detail.append(pre);article.append(detail,make('p','Published source is verified against its SHA-256. The IDE may contain your separate editable draft; editing it does not change these results.',{class:'p2-note'}),make('a','Original run records · JSON',{href:r.sourcePath}));
    $('run-evidence').append(article);
  }
}
function renderData(c){const fragment=document.createDocumentFragment();for(const r of c.rows){const tr=make('tr');tr.append(make('th',time(r.time,c.a.meta.timezone),{scope:'row'}));for(const k of ['a','b','benchmark'])tr.append(make('td',money(r[k])));tr.append(make('td',signed(r.difference)));fragment.append(tr);}$('comparison-data').querySelector('tbody').replaceChildren(fragment);}
function drawChart(){
  if(!comparison||$('comparison-result').hidden)return;
  const box=$('comparison-chart'),w=Math.max(240,Math.floor(box.getBoundingClientRect().width)),h=w<600?290:350;
  const margin={left:86,right:16,top:30,bottom:36},pw=w-margin.left-margin.right,ph=h-margin.top-margin.bottom;
  const values=comparison.rows.flatMap(r=>[r.a,r.b,r.benchmark]),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.12,.2),low=lo-pad,high=hi+pad;
  const x=i=>margin.left+i/(comparison.rows.length-1)*pw,y=v=>margin.top+(high-v)/(high-low)*ph;
  const path=key=>comparison.rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(r[key]).toFixed(2)).join(' ');
  let svg=`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="p2-chart-title p2-chart-desc"><title id="p2-chart-title">Recorded equity of A, B and the common benchmark</title><desc id="p2-chart-desc">Three un-smoothed paths in ${comparison.a.currency}, fitted vertical scale. Use the minute slider or complete data table to inspect exact values.</desc><text x="0" y="14">Equity · ${comparison.a.currency}</text>`;
  for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);svg+=`<line class="p2-grid" x1="${margin.left}" y1="${yy}" x2="${w-margin.right}" y2="${yy}"/><text x="${margin.left-8}" y="${yy+4}" text-anchor="end">${money(v)}</text>`;}
  for(const i of timeTickIndices(comparison.rows.length,pw))svg+=`<text x="${x(i)}" y="${h-10}" text-anchor="${i===0?'start':i===comparison.rows.length-1?'end':'middle'}">${time(comparison.rows[i].time,comparison.a.meta.timezone)}</text>`;
  svg+=`<path class="p2-line-ref" d="${path('benchmark')}"/><path class="p2-line-a" d="${path('a')}"/><path class="p2-line-b" d="${path('b')}"/><line class="p2-cursor" x1="${x(Number($('minute').value))}" x2="${x(Number($('minute').value))}" y1="${margin.top}" y2="${h-margin.bottom}"/></svg>`;
  box.innerHTML=svg;
}
function readMinute(){if(!comparison)return;const i=Number($('minute').value),r=comparison.rows[i],label=time(r.time,comparison.a.meta.timezone);$('minute').setAttribute('aria-valuetext',label+' '+comparison.a.meta.timezone);$('minute-values').textContent=`${label} · A ${money(r.a)} · B ${money(r.b)} · Benchmark ${money(r.benchmark)} · B minus A ${signed(r.difference)} ${comparison.a.currency}`;drawChart();}
$('compare-controls').addEventListener('submit',event=>event.preventDefault());
for(const id of ['a-run','b-run'])$(id).addEventListener('change',()=>moveSelection($('a-run').value,$('b-run').value));
$('swap-runs').addEventListener('click',()=>moveSelection($('b-run').value,$('a-run').value));$('retry-load').addEventListener('click',load);$('minute').addEventListener('input',readMinute);
window.addEventListener('popstate',()=>{if(runs.length)renderFromURL();});
if(globalThis.ResizeObserver)new ResizeObserver(drawChart).observe($('comparison-chart'));else window.addEventListener('resize',drawChart);
load();
