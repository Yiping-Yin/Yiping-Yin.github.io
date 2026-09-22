import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../portfolio-assets/plot-viewport.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function fixture({fallback=false, initial={width:390,height:320}}={}) {
  assert.equal(typeof api.observePlotSize, 'function', 'responsive plot observer must exist');
  let rect=initial, trigger, disconnected=0;
  const element={getBoundingClientRect:()=>rect}, sizes=[], win=new EventTarget();
  class Observer {
    constructor(callback) { trigger=callback; }
    observe(target) { assert.equal(target,element); }
    disconnect() { disconnected++; }
  }
  const cleanup=api.observePlotSize(element,size=>sizes.push(size),{ResizeObserver:fallback?undefined:Observer,window:win});
  return {sizes,cleanup,disconnected:()=>disconnected,resize(next) {rect=next;if(fallback)win.dispatchEvent(new Event('resize'));else trigger();}};
}
test('first measurement uses actual CSS-pixel dimensions',()=>{const f=fixture();assert.deepEqual(f.sizes,[{width:390,height:320}]);f.cleanup();});
test('a resize updates both coordinate dimensions',()=>{const f=fixture();f.resize({width:760,height:500});assert.deepEqual(f.sizes.at(-1),{width:760,height:500});f.cleanup();});
test('equivalent rounded dimensions do not cause a render loop',()=>{const f=fixture();f.resize({width:390.1,height:319.9});assert.equal(f.sizes.length,1);f.cleanup();});
test('hidden or invalid rectangles never replace valid dimensions',()=>{const f=fixture();for(const size of [{width:0,height:0},{width:NaN,height:320},{width:390,height:Infinity}])f.resize(size);assert.equal(f.sizes.length,1);f.cleanup();});
test('cleanup disconnects the observer and rejects late callbacks',()=>{const f=fixture();f.cleanup();f.resize({width:500,height:500});assert.equal(f.disconnected(),1);assert.equal(f.sizes.length,1);});
test('window resize provides a cleanup-safe fallback',()=>{const f=fixture({fallback:true});f.resize({width:320,height:300});assert.deepEqual(f.sizes.at(-1),{width:320,height:300});f.cleanup();f.resize({width:1440,height:600});assert.equal(f.sizes.length,2);});
test('an initially hidden plot is measured when it becomes visible',()=>{const f=fixture({initial:{width:0,height:0}});assert.equal(f.sizes.length,0);f.resize({width:390,height:320});assert.deepEqual(f.sizes,[{width:390,height:320}]);f.cleanup();});
