/** Keep the hero, result table and handoffs on one identity; distinguish replay time from final results. */
const hero=document.getElementById('about'),holder=document.getElementById('p2-run-map');
if(hero&&holder){
  try{
    const mapping=JSON.parse(holder.textContent);let selected='';
    const update=()=>{
      const symbol=hero.getAttribute('data-th-symbol')||mapping.defaultSymbol;
      const rawCursor=hero.getAttribute('data-th-cursor'),cursor=Number(rawCursor);
      const at=document.getElementById('p2-replay-at');
      if(at&&rawCursor!==null&&Number.isInteger(cursor)&&cursor>=0)at.textContent=`Replay position: completed minute ${cursor+1} · chart and account above`;
      if(symbol===selected)return;const run=mapping.runs[symbol];if(!run)return;selected=symbol;
      const id=run.runId,base='/training.html?market=historical',tail='&run='+encodeURIComponent(id);
      document.getElementById('p2-current-label').textContent=`${symbol} · ${run.title}`;
      const identity=document.getElementById('p2-current-id'),outcome=document.getElementById('p2-completed-outcome');
      if(identity)identity.textContent=id;
      if(outcome)outcome.textContent=`Full-run outcome: ${run.netPnl>=0?'+':''}${run.netPnl.toFixed(2)} USD · ${run.fillCount} fills`;
      document.getElementById('p2-current-report').href=base+'#/market?view=review'+tail;
      document.getElementById('p2-current-replay').href=base+'#/market?view=replay'+tail;
      document.getElementById('p2-current-source').href=base+'#/studio?source='+encodeURIComponent(run.taskId);
      document.getElementById('p2-current-compare').href='/compare.html?a='+encodeURIComponent(id);
      document.getElementById('p2-table-compare').href='/compare.html?a='+encodeURIComponent(id);
      document.querySelectorAll('#published-runs .p2-current-cell, #published-runs .s1-playing').forEach(n=>n.classList.remove('p2-current-cell','s1-playing'));
      document.querySelectorAll('#published-runs [data-p2-run]').forEach(a=>{
        const current=a.dataset.p2Run===id;
        if(current){a.setAttribute('aria-current','true');(a.closest('td')||a.closest('tr')).classList.add('p2-current-cell');}
        else a.removeAttribute('aria-current');
      });
      const legend=document.querySelector('#published-runs .s1-legend');
      if(legend)legend.textContent=`Highlighted: ${symbol} / ${run.title}, the run in the terminal. Completed outcome: ${run.netPnl>=0?'+':''}${run.netPnl.toFixed(2)} USD, ${run.fillCount} fills, on 100,000 USD initial cash. Select any result to open its own replay.`;
    };
    update();new MutationObserver(update).observe(hero,{attributes:true,attributeFilter:['data-th-symbol','data-th-cursor']});
  }catch(error){/* Generated AAPL handoffs remain usable if enhancement cannot start. */}
}
