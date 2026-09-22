import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const refined=path.join(root,'portfolio-assets/market-refine-v1.js');
const source=fs.readFileSync(fs.existsSync(refined)?refined:path.join(root,'portfolio-assets/market-quality-v1.js'),'utf8');
function mount(hidden=false) {
  const match=source.match(/o\.useEffect\(\(\)=>\{(if\(!v\|\|x!=="trading"[\s\S]*?)\},\[v,x,U,t,C,c,u,L\]\)/);
  assert.ok(match,'Expected actual replay interval effect');
  const doc=new EventTarget();doc.hidden=hidden;
  const win=new EventTarget();let next=0,cursor=39,playing=true;
  const timers=new Map();
  win.setInterval=fn=>{timers.set(++next,fn);return next};
  win.clearInterval=id=>timers.delete(id);
  const cleanup=new Function('v','x','t','C','c','u','L','j','U','window','document',match[1])(
    true,'trading',{},true,false,389,fn=>{cursor=fn(cursor)},v=>{playing=v},5,win,doc);
  return {doc,win,timers,cleanup,tick:()=>[...timers.values()].forEach(fn=>fn()),cursor:()=>cursor,playing:()=>playing};
}
test('hidden document immediately stops actual replay interval and requires explicit resume',()=>{
  const h=mount();h.tick();assert.equal(h.cursor(),40);
  h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));
  const at=h.cursor();h.tick();assert.equal(h.cursor(),at);
  assert.equal(h.playing(),false);assert.equal(h.timers.size,0);
  h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));h.tick();assert.equal(h.cursor(),at);
  h.cleanup();
});
test('starting while already hidden never schedules progress',()=>{
  const h=mount(true);h.tick();assert.equal(h.cursor(),39);assert.equal(h.playing(),false);h.cleanup();
});
test('pagehide pauses before bfcache and cleanup removes listeners',()=>{
  const h=mount();h.win.dispatchEvent(new Event('pagehide'));h.tick();assert.equal(h.cursor(),39);
  assert.equal(h.playing(),false);h.cleanup();assert.equal(h.timers.size,0);
});
test('visible replay still progresses and unmount cancels interval',()=>{
  const h=mount();h.tick();h.tick();assert.equal(h.cursor(),41);assert.equal(h.playing(),true);
  h.cleanup();h.tick();assert.equal(h.cursor(),41);
});
