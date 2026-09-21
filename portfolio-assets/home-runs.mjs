/** Keep the existing hero, result table and evidence handoffs on one run identity. */
const hero=document.getElementById('about'),holder=document.getElementById('p2-run-map');
if(hero&&holder){
  try{
    const mapping=JSON.parse(holder.textContent);let selected='';
    const update=()=>{
      const symbol=hero.getAttribute('data-th-symbol')||mapping.defaultSymbol;
      if(symbol===selected)return;const run=mapping.runs[symbol];if(!run)return;selected=symbol;
      const id=run.runId,base='/training.html?market=historical',tail='&run='+encodeURIComponent(id);
      const text=`${symbol} · ${run.title} · completed run ${id.slice(0,8)}`;
      document.getElementById('p2-current-label').textContent=text;
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
    update();new MutationObserver(update).observe(hero,{attributes:true,attributeFilter:['data-th-symbol']});
  }catch(error){/* The generated AAPL evidence links remain usable if enhancement cannot start. */}
}
