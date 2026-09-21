"""Read-only reconciliation of exported tapes, source bytes and reported ledgers.

This is publication consistency, NOT execution of the producing runtime or
independent authentication of external data. Nothing is executed or edited.
"""
from __future__ import annotations
import argparse,hashlib,json,math,re
from decimal import Decimal,ROUND_HALF_UP,localcontext
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
D=lambda x:Decimal(str(x))
Q=lambda x:x.quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
def require(condition,message):
    if not condition:raise ValueError(message)
def numeric(value):return type(value) in (int,float) and math.isfinite(value)
def near(a,b,tolerance=Decimal('0.00000001')):return numeric(a) and abs(D(a)-D(b))<=tolerance

def verify_tapes(pack,kind):
    require(isinstance(pack,dict) and isinstance(pack.get('instruments'),list),'Missing instrument catalogue')
    result={}
    for tape in pack['instruments']:
        symbol=tape['symbol'];require(symbol not in result,'Duplicate instrument')
        require(tape.get('$transport')=={'kind':'pbook-tape-bars','version':1},'Unsupported tape transport')
        bars=tape['bars'];require(len(bars)==tape['barCount'] and len(bars)>1,'Truncated tape')
        require(type(tape['barStart']) is int and tape['interval']=='1m','Invalid tape timing')
        require(re.fullmatch('[a-f0-9]{64}',tape['checksum']) is not None,'Missing tape digest')
        require(tape.get('marketKind','historical')==kind,'Wrong market type')
        start=datetime.fromtimestamp(tape['barStart']/1000,ZoneInfo(tape['timezone']))
        require(start.date().isoformat()==tape['session'],'Tape session mismatch')
        for i,row in enumerate(bars):
            require(isinstance(row,list) and len(row)==5,'Malformed OHLCV tuple')
            o,h,l,c,v=row
            require(all(numeric(n) and n>0 for n in (o,h,l,c)),f'{symbol}: invalid price at {i}')
            require(l<=min(o,c)<=max(o,c)<=h,f'{symbol}: inconsistent OHLC at {i}')
            require(v is None or numeric(v) and v>=0,f'{symbol}: invalid volume')
        result[symbol]=tape
    return result

def verify_book(book,tapes,strategies,kind):
    source=strategies[book['taskId']]
    require(book['codeSha256']==source['codeSha256'],'Book source digest mismatch')
    entries=book['trials']['entries'];require(len(entries)==1,'Unsupported book trial count')
    workspace=entries[0]['workspace'];strategy=workspace['strategy'];session=workspace['session']
    require(workspace['marketKind']==strategy['marketKind']==kind,'Book market mismatch')
    require(strategy['code']==source['code'] and strategy['codeHash']==source['codeSha256'],'Book source bytes mismatch')
    require(strategy['id']==book['strategyId'],'Book strategy identity mismatch')
    require(session['datasetChecksums']=={k:t['checksum'] for k,t in tapes.items()},'Book tape identity mismatch')
    start=strategy['trial']['baseline']['session']
    require(not start['fills'] and not start['orders'] and all(a['position']==0 for a in start['assets'].values()),'Unsupported nonempty book baseline')
    cash=D(start['cashCents'])/100;fees=D(0);positions={k:0 for k in tapes};orders={o['id']:o for o in session['orders']}
    require(len(orders)==len(session['orders']),'Duplicate book order')
    seen=set();filled={};last=-1
    for fill in session['fills']:
        symbol=fill['symbol'];i=fill['cursor'];qty=fill['quantity'];side=fill['side'];order=orders.get(fill['orderId'])
        require(fill['id'] not in seen and type(i) is int and last<=i<=session['cursor'] and type(qty) is int and qty>0,'Invalid book fill sequence')
        seen.add(fill['id']);last=i
        require(order is not None and order['symbol']==symbol and order['side']==side and order['strategyId']==strategy['id'],'Book fill order mismatch')
        require(order['createdAtCursor']<=i and fill['time']==tapes[symbol]['barStart']+(i+1)*60000,'Book fill timing mismatch')
        require(numeric(fill['price']) and fill['price']>0 and side in ('BUY','SELL'),'Invalid book price')
        if order['type']=='LIMIT':
            require(near(order['limitPrice'],D(order['limitPriceCents'])/100),'Book limit fields disagree')
            require(fill['price']<=order['limitPrice'] if side=='BUY' else fill['price']>=order['limitPrice'],'Book limit violated')
        else:require(order['type']=='MARKET','Unsupported book order')
        fee=Q(D(fill['price'])*qty*D(session['feeBps'])/10000)
        require(near(fill['fee'],fee),'Book fill fee mismatch')
        direction=1 if side=='BUY' else -1;cash-=D(fill['price'])*qty*direction+fee;positions[symbol]+=qty*direction;fees+=fee
        require(cash>=0 and 0<=positions[symbol]<=session['maxPosition'],'Book funding or position constraint')
        require(near(fill['cashAfter'],cash) and fill['positionAfter']==positions[symbol],'Book fill cash or inventory mismatch')
        total=filled.setdefault(order['id'],[0,D(0)]);total[0]+=qty;total[1]+=D(fill['price'])*qty
    for order in orders.values():
        qty,notional=filled.get(order['id'],[0,D(0)])
        require(qty==order['filledQuantity'] and near(order['filledNotionalCents'],notional*100),'Book order fill total mismatch')
        require(order['quantity']==qty+order['cancelledQuantity'] or order['quantity']==qty+order['remainingQuantity'],'Book order quantities inconsistent')
    require(near(session['cash'],cash) and near(session['cashCents'],cash*100) and near(session['feesCents'],fees*100),'Book final cash or fee mismatch')
    equity=cash
    for symbol,asset in session['assets'].items():
        require(asset['position']==positions[symbol] and asset['datasetId']==tapes[symbol]['id'],'Book final inventory mismatch')
        equity+=Q(D(tapes[symbol]['bars'][session['cursor']][3])*positions[symbol])
    summary=book['summary']
    require(near(summary['endEquity'],equity) and near(summary['equityChange'],equity-D(start['cashCents'])/100),'Book final summary mismatch')
    require(summary['fills']==len(seen) and summary['orders']==len(orders) and summary['steps']==len(strategy['log']),'Book summary count mismatch')
    require(near(summary['fees'],fees) and summary['endCursor']==session['cursor']==strategy['lastCursor'],'Book ending context mismatch')
    return len(seen)

def verify_decision_orders(result, reasons):
    """Bind decision intent to the already reconciled execution ledger."""
    by_decision = {}
    last = len(result['decisions']) - 1
    for order in result['orders']:
        index = order.get('decisionBarIndex')
        require(type(index) is int and 0 <= index <= last and index not in by_decision,
                'Order has invalid or duplicate decision index')
        require(type(order.get('target')) is int, 'Order target must be an integer')
        by_decision[index] = order
    for index, (target, reason_index, state) in enumerate(result['decisions']):
        require(target <= result['config']['maxPosition'], 'Decision target exceeds position limit')
        position = result['equity'][index][2]
        order = by_decision.pop(index, None)
        if state in ('HOLD', 'UNCHANGED'):
            require(target == position and order is None, 'Hold decision contradicts inventory or order')
            continue
        require(order is not None and order['target'] == target and target != position,
                'Decision target differs from its order or requires no position change')
        if state == 'QUEUED':
            require(index < last and order['executionBarIndex'] == index + 1
                    and order['status'] in ('FILLED', 'REJECTED'), 'Queued decision has incompatible order')
        else:
            require(state == 'EXPIRED' and index == last and order['status'] == 'EXPIRED'
                    and order['executionBarIndex'] is None, 'Expired decision has incompatible order')
        # Rejection/expiry reasons describe execution, not strategy intent.
        if order['status'] == 'FILLED':
            require(order['reason'] == reasons[reason_index], 'Filled order reason differs from decision')
    require(not by_decision, 'Order has no decision')

def verify_market(pack,tape_pack,kind):
    require(pack.get('version')==1 and set(pack.get('markets',{}))=={kind},'Unexpected run envelope')
    market=pack['markets'][kind];tapes=verify_tapes(tape_pack,kind)
    require(market.get('$transport')=={'kind':'pbook-published-runs','version':1},'Unsupported run transport')
    require(market['marketKind']==kind,'Market identity mismatch')
    provenance=market['provenance'];strategies={}
    for source in provenance['strategies']:
        digest=hashlib.sha256(source['code'].encode('utf-8')).hexdigest()
        require(digest==source['codeSha256'],'Published strategy source digest mismatch')
        require(source['taskId'] not in strategies or (strategies[source['taskId']]['code']==source['code'] and strategies[source['taskId']]['codeSha256']==digest),'Conflicting published strategy')
        strategies[source['taskId']]=source
    declared={t['symbol']:t for t in provenance['instruments']}
    for symbol,tape in tapes.items():
        require(symbol in declared and declared[symbol]['checksum']==tape['checksum'] and declared[symbol]['barCount']==len(tape['bars']),'Provenance catalogue mismatch')
    require(provenance['runtimeSha256'] and all(re.fullmatch('[a-f0-9]{64}',x) for x in provenance['runtimeSha256'].values()),'Missing runtime digests')
    run_ids=set();fill_count=0
    with localcontext() as ctx:
        ctx.prec=40
        for run in market['runs']:
            r=run['result'];tag=run['symbol']+'/'+run['taskId']
            require(r['runId'] not in run_ids and re.fullmatch('[a-f0-9]{64}',r['runId']),'Duplicate or invalid run id');run_ids.add(r['runId'])
            require(run['taskId'] in strategies,'Unknown strategy');src=strategies[run['taskId']]
            require(r['code']==src['code'] and run['codeSha256']==src['codeSha256'],'Run source does not match published source')
            tape=tapes[run['symbol']];bars=tape['bars'];policy=r['policy'];config=r['config']
            require(r['datasetId']==tape['id'] and r['datasetChecksum']==tape['checksum'],'Run tape identity mismatch')
            require(run['marketKind']==kind and run['currency']==market['currency']==policy['currency'],'Currency or market mismatch')
            require(policy['symbol']==run['symbol'] and policy['version']==provenance['engineVersion'] and policy['multiplier']==1,'Unsupported or mismatched execution policy')
            require(len(r['equity'])==len(r['decisions'])==len(bars) and r['barStart']==tape['barStart']+60000,'Run window differs from tape')
            require(all(numeric(config.get(k)) and config[k]>=0 for k in ('initialCash','feeBps','slippageBps','maxPosition')) and config['initialCash']>0 and type(config['maxPosition']) is int,'Invalid run config')
            cash=D(config['initialCash']);initial=cash;position=0;fees=D(0);peak=cash;maxdd=D(0)
            units=policy['benchmarkUnits'];require(type(units) is int and units in (0,1),'Unsupported benchmark')
            require(units==int(initial>=Q(D(bars[0][0]))),'Benchmark funding mismatch')
            benchmark_cash=initial-Q(D(bars[0][0]))*units
            orders={o['id']:o for o in r['orders']};require(len(orders)==len(r['orders']),'Duplicate order')
            by_bar={};used=set();filled_orders=set();last_index=-1
            for fill in r['fills']:
                i=fill['barIndex'];require(type(i) is int and 0<i<len(bars) and i>=last_index,'Fill sequence invalid');last_index=i
                require(fill['id'] not in used and fill['orderId'] not in filled_orders,'Duplicate fill');used.add(fill['id']);filled_orders.add(fill['orderId'])
                require(fill['orderId'] in orders and orders[fill['orderId']]['status']=='FILLED','Fill has no filled order');order=orders[fill['orderId']]
                require(fill['decisionBarIndex']==order['decisionBarIndex']==i-1 and order['executionBarIndex']==i,'Fill violates next-open causality')
                require(fill['time']==tape['barStart']+i*60000 and near(fill['referencePrice'],bars[i][0]),'Fill reference differs from tape open')
                by_bar.setdefault(i,[]).append(fill)
            require(filled_orders=={o['id'] for o in r['orders'] if o['status']=='FILLED'},'Filled order has no fill')
            for i,(bar,row,decision) in enumerate(zip(bars,r['equity'],r['decisions'])):
                for fill in by_bar.get(i,[]):
                    qty=fill['quantity'];side=fill['side'];require(type(qty) is int and qty>0 and side in ('BUY','SELL'),'Invalid fill quantity/side')
                    direction=1 if side=='BUY' else -1;price=Q(D(bar[0])*(1+D(config['slippageBps'])/10000*direction));fee=Q(price*qty*D(config['feeBps'])/10000)
                    require(near(fill['price'],price) and near(fill['fee'],fee),'Fill price or fee does not reconcile')
                    cash-=direction*price*qty+fee;position+=direction*qty;fees+=fee
                    require(cash>=0 and 0<=position<=config['maxPosition'],'Funding or position constraint violated')
                    require(near(fill['cashAfter'],cash) and fill['positionAfter']==position==orders[fill['orderId']]['target'],'Fill ledger does not reconcile')
                equity=cash+Q(D(bar[3])*position);peak=max(peak,equity);dd=(peak-equity)/peak*100;maxdd=max(maxdd,dd);benchmark=benchmark_cash+Q(D(bar[3])*units)
                require(isinstance(row,list) and len(row)==6 and all(numeric(n) for n in row),'Invalid equity tuple')
                expected=(equity,cash,position,D(bar[3]),dd,benchmark)
                require(all(near(actual,target) for actual,target in zip(row,expected)),f'{tag}: ledger/price mismatch at minute {i}')
                require(isinstance(decision,list) and len(decision)==3 and type(decision[0]) is int and decision[0]>=0 and type(decision[1]) is int and 0<=decision[1]<len(market['reasonDict']) and decision[2] in ('HOLD','UNCHANGED','QUEUED','EXPIRED'),'Invalid decision tuple')
            metrics=r['metrics'];final=r['finalAccount']
            expected={'initialEquity':initial,'finalEquity':equity,'netPnl':equity-initial,'returnPct':(equity-initial)/initial*100,'maxDrawdownPct':maxdd,'fees':fees,'fillCount':len(r['fills']),'benchmarkPnl':benchmark-initial,'benchmarkReturnPct':(benchmark-initial)/initial*100,'benchmarkUnits':units}
            require(all(near(metrics.get(k),v) for k,v in expected.items()),tag+': metric mismatch')
            require(all(near(final.get(k),v) for k,v in {'cash':cash,'position':position,'equity':equity,'initialCash':initial}.items()),tag+': final account mismatch')
            verify_decision_orders(r, market['reasonDict'])
            fill_count+=len(r['fills'])
    book_fills=verify_book(market['book'],tapes,strategies,kind) if market.get('book') else 0
    return {'market':kind,'tapes':len(tapes),'bars':sum(len(t['bars']) for t in tapes.values()),'runs':len(run_ids),'fillsReconciled':fill_count,'sources':len(strategies),'sourceDigests':{k:v['codeSha256'] for k,v in strategies.items()},'bookFillsReconciled':book_fills,'runtimeSha256':provenance['runtimeSha256']}

def audit(root=ROOT):
    root=Path(root);baseline=json.loads((root/'scripts/presentation_copy.json').read_text())['immutableInputs']
    for name,digest in baseline.items():require(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,'Retained file changed: '+name)
    results=[]
    for kind,tape in [('historical','historical-instruments'),('synthetic','instruments')]:results.append(verify_market(json.loads((root/f'data/published-runs-{kind}.json').read_text()),json.loads((root/f'data/{tape}.json').read_text()),kind))
    return {'version':1,'status':'passed','scope':'Exported tape, strategy-source and reported ledger consistency','runtimeReproduction':'not performed; declared runtime digests are retained, not substituted','bookScope':'Source, reported fills, cash, inventory and summary reconciled; matching/queue events and on_tick execution are not reproduced','markets':results}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--output',type=Path);a=p.parse_args();result=audit(a.root);text=json.dumps(result,indent=2)+'\n'
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(text)
    print(text)
