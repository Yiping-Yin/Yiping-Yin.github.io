/** Read-only public on_bar comparison. No execution, resampling or curve interpolation. */
const finite = v => typeof v === 'number' && Number.isFinite(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const stable = value => JSON.stringify(sort(value));
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,sort(value[k])])) : value; }
const close = (a,b,tolerance=0.000001) => finite(a) && finite(b) && Math.abs(a-b)<=tolerance;
const delta = (a,b) => Number((b-a).toFixed(10));

/** Decode the documented v1 transport. Times are bar-close instants; labels use the bar's open. */
export function readRuns(pack) {
  if (pack?.version !== 1 || !pack.markets || typeof pack.markets !== 'object') throw new Error('Unsupported published-run envelope.');
  return Object.entries(pack.markets).flatMap(([kind,market]) => {
    if (!['historical','synthetic'].includes(kind) || market.marketKind!==kind || market.$transport?.kind!=='pbook-published-runs' || market.$transport.version!==1) throw new Error('Unsupported published-run transport.');
    if (!Array.isArray(market.runs)) throw new Error('Missing published runs.');
    return market.runs.map(run => {
      const result=run?.result;
      if (!result || !Number.isSafeInteger(result.barStart) || !Array.isArray(result.equity) || result.equity.length<2) throw new Error('Malformed equity transport.');
      const points=result.equity.map((row,index) => {
        if (!Array.isArray(row) || row.length!==6 || !row.every(finite)) throw new Error('Equity tuples require six finite numbers.');
        return {time:result.barStart+index*60000,equity:row[0],cash:row[1],position:row[2],close:row[3],drawdown:row[4],benchmark:row[5]};
      });
      return {...run,points,meta:{timezone:market.timezone,session:market.session,marketKind:kind,currency:market.currency,
        engineVersion:market.provenance?.engineVersion,runtimeSha256:market.provenance?.runtimeSha256,
        instruments:market.provenance?.instruments},sourcePath:`/data/published-runs-${kind}.json`};
    });
  });
}

/** Reject incomplete evidence rather than treating matching missing fields as equality. */
export function validateRun(run) {
  const errors=[]; const check=(ok,text)=>{if(!ok) errors.push(text);};
  const r=run?.result, meta=run?.meta, p=run?.points;
  if(!r||!meta||!Array.isArray(p)||p.length<2) return ['Run or complete equity path is missing.'];
  const c=r.config||{}, policy=r.policy||{}, m=r.metrics||{};
  check(['trend','hold','range'].includes(run.taskId),'Only published on_bar starters are supported.');
  check(digest(r.runId)&&digest(r.datasetChecksum)&&digest(run.codeSha256),'Run, tape or source digest is missing.');
  check(typeof r.code==='string'&&r.code.length>0,'Published source is missing.');
  check(typeof r.datasetId==='string'&&r.datasetId.length>0,'Dataset identity is missing.');
  check(['historical','synthetic'].includes(run.marketKind)&&run.marketKind===meta.marketKind,'Market type is missing or inconsistent.');
  check(run.currency===meta.currency&&run.currency===policy.currency&&['USD','SIM'].includes(run.currency),'Currency is missing or inconsistent.');
  check(typeof run.symbol==='string'&&run.symbol===policy.symbol,'Instrument identity is inconsistent.');
  for(const key of ['initialCash','feeBps','slippageBps','maxPosition']) check(finite(c[key])&&c[key]>=0,`Missing or invalid ${key}.`);
  check(c.initialCash>0&&Number.isInteger(c.maxPosition),'Initial capital and position limit must be valid.');
  for(const key of ['version','instrument','symbol','currency','timing','execution','rounding','funding','terminal','benchmarkDescription']) check(typeof policy[key]==='string'&&policy[key].length>0,`Missing execution policy: ${key}.`);
  check(finite(policy.multiplier)&&policy.multiplier>0&&finite(policy.benchmarkUnits)&&policy.benchmarkUnits>=0,'Unit multiplier or benchmark units are missing.');
  check(meta.engineVersion===policy.version&&typeof meta.engineVersion==='string','Engine version is missing or inconsistent.');
  check(meta.runtimeSha256&&Object.keys(meta.runtimeSha256).length>0&&Object.values(meta.runtimeSha256).every(digest),'Runtime source digests are missing.');
  const tape=meta.instruments?.find(i=>i.symbol===run.symbol);
  check(tape&&tape.checksum===r.datasetChecksum&&tape.barCount===p.length,'Equity path must cover the complete identified instrument tape.');
  check(typeof meta.timezone==='string'&&typeof meta.session==='string','Session or timezone is missing.');
  check(Array.isArray(r.decisions)&&r.decisions.length===p.length,'A fully evaluated decision path is required.');
  let peak=c.initialCash, drawdown=0;
  for(let i=0;i<p.length;i++) {
    const v=p[i];
    if(!v||!['time','equity','cash','position','close','drawdown','benchmark'].every(k=>finite(v[k]))) {errors.push('Non-finite equity observation.');break;}
    if(v.time!==r.barStart+i*60000) {errors.push('Equity timestamps are not a complete aligned minute sequence.');break;}
    peak=Math.max(peak,v.equity);drawdown=Math.max(drawdown,(peak-v.equity)/peak*100);
    if(!close(v.drawdown,(peak-v.equity)/peak*100,1e-8)) {errors.push('Drawdown path does not reconcile to equity.');break;}
  }
  const first=p[0],last=p.at(-1),f=r.finalAccount||{};
  check(first.position===0&&close(first.cash,c.initialCash)&&close(first.equity,c.initialCash),'Starting ledger must be all cash at stated initial capital.');
  check(close(m.initialEquity,c.initialCash)&&close(m.finalEquity,last.equity)&&close(m.netPnl,last.equity-c.initialCash),'Reported net P&L or final equity does not reconcile.');
  check(close(m.returnPct,m.netPnl/c.initialCash*100)&&close(m.maxDrawdownPct,drawdown,1e-8),'Reported return or maximum drawdown does not reconcile.');
  check(close(f.equity,last.equity)&&close(f.cash,last.cash)&&f.position===last.position&&close(f.initialCash,c.initialCash),'Final account does not match the path.');
  check(close(m.benchmarkPnl,last.benchmark-c.initialCash)&&close(m.benchmarkReturnPct,m.benchmarkPnl/c.initialCash*100)&&m.benchmarkUnits===policy.benchmarkUnits,'Benchmark summary does not reconcile.');
  check(Array.isArray(r.fills)&&r.fills.every(v=>finite(v.fee)&&finite(v.quantity)&&v.quantity>0&&['BUY','SELL'].includes(v.side)),'Invalid fill records.');
  if(Array.isArray(r.fills))check(r.fills.length===m.fillCount&&close(r.fills.reduce((a,v)=>a+v.fee,0),m.fees),'Fees or fill count do not reconcile to fill records.');
  return [...new Set(errors)];
}

export function compareRuns(a,b) {
  const reasons=[...validateRun(a).map(x=>'A: '+x),...validateRun(b).map(x=>'B: '+x)];
  if(!a?.result||!b?.result) return {ok:false,reasons};
  const need=(same,text)=>{if(!same) reasons.push(text);};
  need(a.result.runId!==b.result.runId,'Choose two different published runs.');
  for(const key of ['symbol','marketKind','currency']) need(a[key]===b[key],`Different ${key}.`);
  for(const key of ['datasetId','datasetChecksum','barStart']) need(a.result[key]===b.result[key],`Different ${key}.`);
  for(const key of ['initialCash','feeBps','slippageBps','maxPosition']) need(a.result.config?.[key]===b.result.config?.[key],`Different ${key}.`);
  need(stable(a.result.config)===stable(b.result.config),'Trading configurations differ.');
  need(stable(a.result.policy)===stable(b.result.policy),'Execution policy or benchmark definition differs.');
  need(a.meta?.session===b.meta?.session&&a.meta?.timezone===b.meta?.timezone,'Sessions or timezones differ.');
  need(stable(a.meta?.runtimeSha256)===stable(b.meta?.runtimeSha256),'Runtime source digests differ.');
  need(a.points?.length===b.points?.length,'Evaluated windows differ.');
  if(a.points?.length===b.points?.length)need(a.points.every((p,i)=>p.time===b.points[i].time&&p.close===b.points[i].close&&p.benchmark===b.points[i].benchmark),'Minute sequence, price path or common benchmark differs.');
  if(reasons.length) return {ok:false,reasons:[...new Set(reasons)]};
  const keys=['netPnl','returnPct','maxDrawdownPct','fees','fillCount','finalEquity'];
  return {ok:true,a,b,delta:Object.fromEntries(keys.map(k=>[k,delta(a.result.metrics[k],b.result.metrics[k])])),
    rows:a.points.map((p,i)=>({time:p.time,a:p.equity,b:b.points[i].equity,benchmark:p.benchmark,difference:delta(p.equity,b.points[i].equity)}))};
}

export function runLinks(run) {
  const base=`/training.html?market=${encodeURIComponent(run.marketKind)}`;
  const id=encodeURIComponent(run.result.runId);
  return {report:`${base}#/market?view=review&run=${id}`,replay:`${base}#/market?view=replay&run=${id}`,source:`${base}#/studio?source=${encodeURIComponent(run.taskId)}`};
}

export function selectPair(runs,query) {
  const find=id=>{const r=runs.find(r=>r.result.runId===id);if(!r)throw new Error('Unknown published run ID. Reset the selection to continue.');return r;};
  const a=query.has('a')?find(query.get('a')):runs.find(r=>r.symbol==='AAPL'&&r.taskId==='trend');
  const b=query.has('b')?find(query.get('b')):runs.find(r=>r.symbol===a?.symbol&&r.marketKind===a?.marketKind&&r.result.runId!==a?.result.runId);
  if(!a||!b)throw new Error('Two published runs are required.');
  return {a,b};
}
