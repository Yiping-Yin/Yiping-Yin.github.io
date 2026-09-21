import {r as React, j as jsx} from './training-copy-v1.js';
import {replayLink, readReplayMoment} from './quality-model.mjs';
const h = jsx.jsx, hs = jsx.jsxs;
const number = value => value.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

/** Keep the original equity and benchmark curves; annotate only the actual drawdown. */
export function DrawdownChart({result, e: analysis}) {
  const rows = result.equity, dd = analysis.drawdown;
  const values = rows.flatMap(row => [row.equity, row.benchmarkEquity]);
  if (dd.peak) values.push(dd.peak.equity);
  const low = Math.min(...values), span = Math.max(...values) - low || 1;
  const x = index => index / Math.max(1, rows.length - 1) * 1000;
  const y = value => 190 - (value - low) / span * 170;
  const line = key => rows.map((row,index) => `${index?'L':'M'}${x(index)} ${y(row[key])}`).join(' ');
  const summary = dd.trough
    ? `Maximum drawdown: peak ${number(dd.peak.equity)} at ${dd.peak.label}, trough ${number(dd.trough.equity)} at ${dd.trough.label}.`
    : 'No decline from a prior equity peak.';
  return hs('div', {className:'rr-chart quality-drawdown-chart', children:[
    hs('svg', {className:'rr-equity', viewBox:'0 0 1000 210', preserveAspectRatio:'none', role:'img', 'aria-label':`Account equity and one-unit benchmark. ${summary}`, children:[
      h('path', {d:line('benchmarkEquity'), className:'rr-bench', vectorEffect:'non-scaling-stroke'}),
      h('path', {d:line('equity'), className:'rr-run', vectorEffect:'non-scaling-stroke'}),
      dd.trough && hs('g', {'data-dd-peak':dd.peak.barIndex, 'data-dd-trough':dd.trough.barIndex, children:[
        h('path', {d:`M${x(dd.peak.barIndex)} ${y(dd.peak.equity)}V205M${x(dd.trough.barIndex)} ${y(dd.trough.equity)}V205`, className:'rr-drop', vectorEffect:'non-scaling-stroke'}),
        h('circle', {cx:x(dd.peak.barIndex), cy:y(dd.peak.equity), r:3}),
        h('circle', {cx:x(dd.trough.barIndex), cy:y(dd.trough.equity), r:3})
      ]})
    ]}),
    hs('div', {className:'rr-x', children:[h('span',{children:rows[0].label}),h('span',{children:rows[Math.floor(rows.length/2)].label}),h('span',{children:rows.at(-1).label})]}),
    h('div', {className:'quality-dd-labels', children:dd.trough ? [
      h('span',{children:`Drawdown peak ${dd.peak.label} · ${number(dd.peak.equity)}`},'peak'),
      h('span',{children:`Drawdown trough ${dd.trough.label} · ${number(dd.trough.equity)}`},'trough')
    ] : h('span',{children:summary})})
  ]});
}

/** No account export, analytics request or clipboard read. Copy is user initiated. */
export function ReplayShare({entry, cursor, onPause, loading}) {
  const [href,setHref] = React.useState(() => location.href);
  const [feedback,setFeedback] = React.useState(null);
  const sequence = React.useRef(0);
  React.useEffect(() => {
    const update = () => setHref(location.href);
    addEventListener('hashchange',update); addEventListener('popstate',update);
    return () => {removeEventListener('hashchange',update);removeEventListener('popstate',update);};
  },[]);
  React.useEffect(() => {sequence.current++;setFeedback(null);return () => {sequence.current++;};},[entry?.result?.runId]);
  if (!entry?.published || !entry.result?.equity?.length) return null;
  const bookmark = readReplayMoment(href,entry);
  const share = async () => {
    onPause();
    const request = ++sequence.current;
    let link;
    try {link=replayLink(location.href,entry,cursor);} catch {
      setFeedback({message:'This published replay is not available to share.'});return;
    }
    const state={link,minute:cursor+1,message:`Copying link to minute ${cursor+1}…`};
    setFeedback(state);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (sequence.current===request) setFeedback({...state,message:`Link copied · minute ${cursor+1}.`});
    } catch {
      if (sequence.current===request) setFeedback({...state,message:`Automatic copy unavailable. Select and copy the link to minute ${cursor+1} below.`});
    }
  };
  return hs('div',{className:'quality-replay-share',children:[
    h('button',{type:'button',onClick:share,children:'Share this moment'}),
    !loading && bookmark.status==='invalid' && h('p',{role:'alert',className:'quality-link-error',children:'Shared replay link could not be restored. Check its run, market, tape and minute. The selected run is shown at its starting position.'}),
    !loading && bookmark.status==='valid' && h('span',{className:'quality-link-context',children:`Link opened at minute ${bookmark.cursor+1}.`}),
    feedback && hs('div',{className:'quality-share-result',children:[
      h('p',{role:'status',children:feedback.message}),
      feedback.link && hs('label',{children:[`Public replay link · minute ${feedback.minute}`,
        h('textarea',{rows:3,readOnly:true,value:feedback.link,'aria-label':'Public replay link',onFocus:event=>event.currentTarget.select()}),
        h('a',{href:feedback.link,children:'Open this moment'})
      ]})
    ]})
  ]});
}
