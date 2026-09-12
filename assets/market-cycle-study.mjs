import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { meta, year, month, day } from './market-arcs-data.mjs';
import { createReplayModel, replayFrame, observedSpan } from './market-arcs-replay.mjs';
import { cycleView } from './market-cycle-model.mjs';

const TAU=Math.PI*2;
const replay=createReplayModel({year,month,day},meta);
const UP=new THREE.Color('#71baa0'),DOWN=new THREE.Color('#c27188'),NEUTRAL=new THREE.Color('#546f84');
const P=(r,a,y=0)=>[r*Math.cos(a),y,-r*Math.sin(a)];
// The session starts on the back-left, ending on the back-right. One turn
// remains exactly 24 hours, irrespective of how much history is observed.
const dayAngle=raw=>2.60-(raw-570/1440*TAU);
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const price=value=>Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const colourFor=value=>value===null?NEUTRAL.clone():(value>=0?UP:DOWN).clone();

function boot(canvas){
  const figure=canvas.closest('figure'),stateEl=figure.querySelector('.cycle-state'),detailEl=figure.querySelector('.cycle-detail');
  const pause=figure.querySelector('.cycle-pause'),tooltip=figure.querySelector('.cycle-inspect'),live=figure.querySelector('#market-hover');
  const capture=new URLSearchParams(location.search).has('capture');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:capture});}
  catch{pause.hidden=true;stateEl.textContent='S&P 500 · Static historical view';return;}
  renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(29,1,.1,150),group=new THREE.Group();scene.add(group);
  scene.add(new THREE.HemisphereLight(0xe6f1ff,0x152e46,1.3));
  const light=new THREE.DirectionalLight(0xe8f3ff,2.0);light.position.set(-8,12,4);scene.add(light);
  const rim=new THREE.DirectionalLight(0x6d9ccb,.65);rim.position.set(6,6,-10);scene.add(rim);
  const lineMaterials=[],labels=[],annualMeshes=[],hits=[];
  let width=1140,height=560,snapshot=replayFrame(replay,59),selection=null,view=cycleView(snapshot),running=!reduced.matches;
  let activeHover=null,elapsed=0,arrival=1,annualRotation=0,rotationTarget=0,visible=true,lost=false,raf=0,lastTime=0;
  const vector=new THREE.Vector3();
  const fmtTime=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;

  function wire(opacity=.25,weight=.8,colour='#8aaec9'){
    const material=new LineMaterial({color:colour,linewidth:weight,transparent:true,opacity,depthWrite:false,toneMapped:false});lineMaterials.push(material);
    const line=new LineSegments2(new LineSegmentsGeometry(),material);line.frustumCulled=false;group.add(line);return line;
  }
  function setWire(line,points){
    line.visible=!!points.length;if(!points.length)return;
    const values=points.flat(),buffer=line.geometry.attributes.instanceStart?.data;
    if(buffer?.array.length===values.length){buffer.array.set(values);buffer.needsUpdate=true;}
    else{line.geometry.dispose();line.geometry=new LineSegmentsGeometry();line.geometry.setPositions(values);}
    line.geometry.instanceCount=values.length/6;
  }
  function arcs(r,a,b,y=0){const points=[],n=Math.max(2,Math.ceil(Math.abs(b-a)*36));for(let i=0;i<n;i++)points.push(P(r,a+(b-a)*i/n,y),P(r,a+(b-a)*(i+1)/n,y));return points;}
  function strip(r0,r1,a,b,y=0,thickness=.035){
    const shape=new THREE.Shape(),n=Math.max(2,Math.ceil(Math.abs(b-a)*32));
    for(let i=0;i<=n;i++){const t=a+(b-a)*i/n;i?shape.lineTo(r1*Math.cos(t),r1*Math.sin(t)):shape.moveTo(r1*Math.cos(t),r1*Math.sin(t));}
    for(let i=n;i>=0;i--){const t=a+(b-a)*i/n;shape.lineTo(r0*Math.cos(t),r0*Math.sin(t));}shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:1,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,y,0);return geometry;
  }
  function textLabel(text,size=.14,colour='#91abc1',align='center'){
    const source=document.createElement('canvas');source.width=1024;source.height=100;const ctx=source.getContext('2d');
    const texture=new THREE.CanvasTexture(source);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
    sprite.scale.set(size*1024/44,size*100/44,1);sprite.center.set(align==='left'?0:align==='right'?1:.5,.5);group.add(sprite);labels.push(sprite);
    let last;
    sprite.write=value=>{if(last===value)return;last=value;sprite.userData.text=value;ctx.clearRect(0,0,1024,100);ctx.font='44px -apple-system,BlinkMacSystemFont,sans-serif';ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=colour;ctx.fillText(value,align==='left'?3:align==='right'?1021:512,50);texture.needsUpdate=true;};sprite.write(text);return sprite;
  }
  const annualGroup=new THREE.Group();group.add(annualGroup);
  for(const item of cycleView(replayFrame(replay,77)).annual){
    const span=item.endAngle-item.startAngle,a=item.startAngle+span*.14,b=item.endAngle-span*.14;
    const mesh=new THREE.Mesh(strip(6.57,7.02,a,b,0,.047),new THREE.MeshStandardMaterial({color:NEUTRAL,roughness:.5,metalness:.12,toneMapped:false}));
    annualGroup.add(mesh);annualMeshes.push({mesh,item});
  }
  const rimLine=wire(.20,.7),rimPoints=[...arcs(7.12,0,TAU),...arcs(6.48,0,TAU)];setWire(rimLine,rimPoints);
  const annualMark=wire(.6,1,'#c3d9e7'),annualTicks=wire(.23,.7);
  const monthLabels=[0,3,6,9].map(()=>textLabel('',.135,'#829bb1'));
  const annualLabel=textLabel('1 YEAR / DAILY RETURN',.145,'#9db5c9');
  const dayLabel=textLabel('',.17,'#c0d3e1');
  const sessionRail=wire(.2,.7),sessionTicks=wire(.24,.7),sessionOutline=wire(.38,.85),hourWicks=wire(.62,.8);
  const hourOpenClose=wire(.65,1),selectedRange=wire(.75,1,'#d8e7ee');
  const rangeGhost=wire(.15,.6),bridge=wire(.23,.75),curveBase=wire(.22,.75),curveDrops=wire(.17,.65);
  const curveLine=wire(.9,1.5,'#b5d6e2'),curveGhost=wire(.2,.6),curveMarker=wire(.64,1,'#cce4ef');
  const openLabel=textLabel('09:30',.145),closeLabel=textLabel('16:00 ET',.145),sessionLabel=textLabel('1 DAY / HOURLY OHLC',.14,'#94aec4');
  const minuteLabel=textLabel('',.14,'#94aec4','left'),curveLow=textLabel('',.115,'#6e90ab','right'),curveHigh=textLabel('',.115,'#6e90ab','right');
  const curveStart=textLabel('',.13,'#7c9db5','left'),curveEnd=textLabel('',.13,'#7c9db5','right');
  const curveQuote=textLabel('',.16,'#b0c9dd','right');
  const chosenMinute=wire(.95,1.4,'#e2eff5');
  const hourBodies=[];
  const hourMat=new THREE.MeshStandardMaterial({roughness:.4,metalness:.12,toneMapped:false});
  for(let i=0;i<7;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),hourMat.clone());group.add(mesh);hourBodies.push(mesh);}
  // A single upright local section exposes price against a straight time axis.
  // Unlike a polar price curve, a flat price stays visibly flat in this view.
  const pane=new THREE.Mesh(new THREE.PlaneGeometry(5.6,1.78),new THREE.MeshBasicMaterial({color:'#a8cde2',transparent:true,opacity:.018,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
  const CURVE={left:-2.8,right:2.8,z:3.65,offset:-1.4};
  pane.position.set(0,.93+CURVE.offset,3.65);group.add(pane);
  let priceMin=0,priceMax=1;
  const Y=value=>.15+(value-priceMin)/(priceMax-priceMin||1)*1.68;
  const fineY=value=>Y(value)+CURVE.offset;
  function refresh(initial=false){
    view=cycleView(snapshot,selection);
    const rootIndex=view.focus?.year?.indices?.at(-1)??snapshot.pens.year;
    const root=view.annual.find(item=>item.archiveIndex===rootIndex)||view.annual.at(-1);
    if(root){const desired=Math.PI/2-root.angle;rotationTarget=annualRotation+Math.atan2(Math.sin(desired-annualRotation),Math.cos(desired-annualRotation));}
    if(initial)annualRotation=rotationTarget;
    priceMin=view.priceBand?.low??0;priceMax=view.priceBand?.high??1;
    arrival=initial||reduced.matches?1:0;
    updateText();wake();
  }
  function updateText(announce=false){
    const state=`S&P 500 · ${view.session||meta.session} · Historical replay`;
    stateEl.textContent=state;
    detailEl.textContent=view.unavailable.month?'Hourly history unavailable for this date':view.unavailable.day?'Five-minute history unavailable for this date':`${view.hourSpan?.observedLabel||view.hourSpan?.label||''} ET${selection?' · Pinned':''}`;
    detailEl.classList.toggle('sr-only',!view.unavailable.day);
    figure.querySelector('.market-caption-session').textContent=view.description;
    pause.textContent=selection?'Resume':running?'Pause':'Play';
    pause.setAttribute('aria-label',selection?'Resume historical replay':`${running?'Pause':'Play'} historical replay`);
    if(announce)live.textContent=`${state}. ${detailEl.textContent}`;
  }
  function render(dt){
    const animating=!activeHover&&(running&&!selection);
    if(animating){elapsed+=dt;arrival=Math.min(1,arrival+dt/0.55);if(elapsed>=2.2){elapsed=0;snapshot=replayFrame(replay,(snapshot.index+1)%day.length);refresh();}}
    // Geometry can settle after an explicit selection; ordinary playback and
    // reveal are frozen together when paused or when reading a hover value.
    if(!activeHover)annualRotation+=(rotationTarget-annualRotation)*(reduced.matches?1:1-Math.exp(-dt/0.45));
    annualGroup.rotation.y=annualRotation;
    hits.length=0;
    const annualByIndex=new Map(view.annual.map(item=>[item.archiveIndex,item]));
    for(const entry of annualMeshes){
      const item=annualByIndex.get(entry.item.archiveIndex);entry.mesh.visible=!!item;if(!item)continue;
      const magnitude=item.returnValue===null?0:Math.min(1,Math.abs(item.returnValue)/.022);
      const c=colourFor(item.returnValue),front=(1-Math.sin(item.angle+annualRotation))/2;
      c.lerp(new THREE.Color('#102d43'),.62-magnitude*.37-front*.1);
      if(activeHover?.key==='year'&&activeHover.index===item.archiveIndex)c.lerp(new THREE.Color('#e3eef3'),.38);
      entry.mesh.material.color.copy(c);
      hits.push({key:'year',index:item.archiveIndex,point:P(6.8,item.angle+annualRotation,.04),row:item.row,returnValue:item.returnValue});
    }
    setWire(annualMark,[P(6.41,Math.PI/2,.06),P(7.17,Math.PI/2,.06)]);
    annualLabel.position.set(...P(7.43,Math.PI/2,.25));dayLabel.write(view.session||'');dayLabel.position.set(...P(6.09,Math.PI/2,.14));
    const starts=view.annual.filter((item,i,rows)=>i===0||item.row.label.slice(0,7)!==rows[i-1].row.label.slice(0,7));
    const tickPoints=[];let labelIndex=0;
    for(let i=0;i<starts.length;i++){const item=starts[i],a=item.angle+annualRotation;tickPoints.push(P(7.13,a),P(7.24,a));if(i%3===1&&labelIndex<4){const label=monthLabels[labelIndex++];label.visible=true;label.write(new Date(item.row.label+'T12:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'}).toUpperCase());label.position.set(...P(7.57,a,.02));}}
    for(let i=labelIndex;i<4;i++)monthLabels[i].visible=false;setWire(annualTicks,tickPoints);
    const start=dayAngle(570/1440*TAU),end=dayAngle(960/1440*TAU);
    setWire(sessionRail,arcs(4.96,0,TAU,.12));
    setWire(sessionOutline,[...arcs(4.7,start,end,.12),...arcs(5.2,start,end,.12),P(4.7,start,.12),P(5.2,start,.12),P(4.7,end,.12),P(5.2,end,.12)]);
    const ticks=[];for(let t=0;t<24;t++){const a=dayAngle(t/24*TAU);ticks.push(P(4.96,a,.12),P(t>=10&&t<=16?5.1:5.01,a,.12));}setWire(sessionTicks,ticks);
    openLabel.position.set(...P(5.61,start,.15));closeLabel.position.set(...P(5.55,end,.15));sessionLabel.position.set(...P(5.45,(start+end)/2,.15));
    const wick=[],bodyEdges=[],selected=[],ghost=[];
    hourBodies.forEach(mesh=>mesh.visible=false);
    view.hours.forEach((item,i)=>{
      const a=dayAngle(item.angle),r=4.96,row=item.row,lo=Y(row.low),hi=Y(row.high),y0=Y(row.open),y1=Y(row.close),body=hourBodies[i];
      if(!body)return;
      const colour=colourFor(row.close-row.open),picked=item.archiveIndex===view.selectedHourIndex,hovered=activeHover?.key==='month'&&activeHover.index===item.archiveIndex;
      body.visible=true;body.position.set(...P(r,a,(y0+y1)/2));body.rotation.y=a;
      body.scale.set(.16,Math.max(.012,Math.abs(y1-y0)),.06);body.material.color.copy(colour).lerp(new THREE.Color('#123349'),picked||hovered?0:.2);
      wick.push(P(r,a,lo),P(r,a,hi));
      bodyEdges.push(P(r,a-.025,y0),P(r,a,y0),P(r,a,y1),P(r,a+.025,y1));
      ghost.push(P(r,a,.12),P(r,a,lo));
      if(picked)selected.push(P(r,a-.045,lo),P(r,a+.045,lo),P(r,a-.045,hi),P(r,a+.045,hi));
      hits.push({key:'month',index:item.archiveIndex,point:P(r,a,(lo+hi)/2),row});
    });
    setWire(hourWicks,wick);setWire(hourOpenClose,bodyEdges);setWire(selectedRange,selected);setWire(rangeGhost,ghost);
    const hasFine=!!view.minutes.length;
    pane.visible=hasFine;
    const base=.12+CURVE.offset,left=CURVE.left,right=CURVE.right,z=CURVE.z;
    setWire(curveBase,hasFine?[[left,base,z],[right,base,z],[left,base,z],[left,1.83+CURVE.offset,z]]:[]);
    setWire(curveGhost,hasFine?[[left,fineY(priceMax),z],[right,fineY(priceMax),z]]:[]);
    const segments=[],drops=[],marks=[];
    let previous=null;
    const first=view.minutes[0];
    if(first&&view.selectedHour&&first.startMinute===view.hourSpan?.start)previous={point:[left,fineY(view.selectedHour.row.open),z],segmentIndex:first.segmentIndex};
    for(let i=0;i<view.minutes.length;i++){
      const item=view.minutes[i],x=left+item.elapsedFraction*(right-left),p=[x,fineY(item.close),z];
      const latest=i===view.minutes.length-1&&!selection&&snapshot.index<77;
      if(previous&&(item.connectFromPrevious||i===0)){
        const end=latest&&arrival<1?previous.point.map((v,j)=>v+(p[j]-v)*smooth(arrival)):p;
        segments.push(previous.point,end);
      }
      if(i%3===0||i===view.minutes.length-1)drops.push([x,base,z],p);
      marks.push([x-.016,p[1],z],[x+.016,p[1],z]);
      hits.push({key:'day',index:item.archiveIndex,point:p,row:item.row});
      previous={point:p,segmentIndex:item.segmentIndex};
    }
    setWire(curveLine,segments);setWire(curveDrops,drops);setWire(curveMarker,marks);
    minuteLabel.visible=curveStart.visible=curveEnd.visible=curveQuote.visible=curveLow.visible=curveHigh.visible=hasFine;
    if(hasFine){
      minuteLabel.write('FIVE-MINUTE CLOSES');minuteLabel.position.set(left,2.1+CURVE.offset,z);
      curveStart.write(fmtTime(view.hourSpan.start));curveStart.position.set(left,.29+CURVE.offset,z);
      curveEnd.write(`${fmtTime(view.hourSpan.end)} ET`);curveEnd.position.set(right,.29+CURVE.offset,z);
      const chosen=selection?.key==='day'?view.minutes.find(item=>item.archiveIndex===view.selectedMinuteIndex):null;
      const quotePoint=chosen||view.minutes.at(-1);
      curveQuote.write(`${price(quotePoint.close)} · ${fmtTime(quotePoint.minute)}`);curveQuote.position.set(right,2.1+CURVE.offset,z);
      curveLow.visible=false;
      curveHigh.write(price(priceMax));curveHigh.position.set(left-.12,1.83+CURVE.offset,z);
      if(chosen){const x=left+chosen.elapsedFraction*(right-left),y=fineY(chosen.close);setWire(chosenMinute,[[x-.06,y,z],[x+.06,y,z],[x,y-.06,z],[x,y+.06,z]]);}else setWire(chosenMinute,[]);
    }else setWire(chosenMinute,[]);
    const connection=[];
    if(hasFine&&view.selectedHour){
      const selected=view.selectedHour;
      const a=dayAngle(selected.startAngle),b=dayAngle(selected.endAngle);
      // Route boundary correspondence around the quiet central typography.
      for(const [angle,x] of [[(a+b)/2,right]]){
        const origin=new THREE.Vector3(...P(4.96,angle,.12));
        const path=new THREE.CubicBezierCurve3(origin,new THREE.Vector3(x<0?-4.6:4.6,.12,0),new THREE.Vector3(x<0?-3.7:3.7,base,3.65),new THREE.Vector3(x,base,z));
        const pts=path.getPoints(38);for(let i=0;i<pts.length-1;i++)connection.push(pts[i].toArray(),pts[i+1].toArray());
      }
    }setWire(bridge,connection);
    camera.updateMatrixWorld();renderer.render(scene,camera);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;renderer.setSize(width,height,false);camera.aspect=width/height;
    // Fit a complete ring with its labels and depth, rather than clipping a
    // larger sphere at the hero boundaries. The full circle stays in blue.
    const halfWidth=8.05,halfHeight=width<600?6.3:3.2;
    let distance=Math.max(halfHeight/Math.tan(camera.fov*Math.PI/360),halfWidth/(camera.aspect*Math.tan(camera.fov*Math.PI/360)));
    const elevation=width<600?.66:.38;
    camera.updateProjectionMatrix();
    // Fit sampled geometry after perspective projection, including the near
    // rim and label margins; an orthographic diameter estimate clips the front.
    for(let attempt=0;attempt<30;attempt++){
      camera.position.set(0,distance*Math.sin(elevation),1.2+distance*Math.cos(elevation));camera.lookAt(0,.3,1.2);camera.updateMatrixWorld();
      let extent=0;
      for(let i=0;i<120;i++){vector.set(...P(7.85,i/120*TAU,.15)).project(camera);extent=Math.max(extent,Math.abs(vector.x)/.94,Math.abs(vector.y)/.94);}
      if(extent<=1)break;distance*=Math.max(1.01,extent);
    }
    lineMaterials.forEach(material=>material.resolution.set(width,height));wake();
  }
  function project(point){const rect=canvas.getBoundingClientRect();vector.set(...point).applyMatrix4(group.matrixWorld).project(camera);return{x:rect.x+(vector.x+1)*rect.width/2,y:rect.y+(1-vector.y)*rect.height/2};}
  function hitAt(x,y){let best=null,distance=width<600?20:15;for(const item of hits){const p=project(item.point),d=Math.hypot(p.x-x,p.y-y);if(d<distance){best=item;distance=d;}}return best;}
  function readHit(hit){
    const row=hit.row;
    if(hit.key==='year')return `${row.label} · ${hit.returnValue===null?'Return unavailable':`${hit.returnValue>=0?'+':''}${(hit.returnValue*100).toFixed(2)}%`}\nClose ${price(row.close)}`;
    return `${observedSpan(hit.key,row)} ET\nO ${price(row.open)} · H ${price(row.high)} · L ${price(row.low)} · C ${price(row.close)}`;
  }
  function hover(event){
    activeHover=hitAt(event.clientX,event.clientY);canvas.style.cursor=activeHover?'pointer':'default';tooltip.hidden=!activeHover;
    if(activeHover){tooltip.textContent=readHit(activeHover);tooltip.style.whiteSpace='pre';const rect=figure.getBoundingClientRect();tooltip.style.left=`${Math.max(4,Math.min(rect.width-tooltip.offsetWidth-6,event.clientX-rect.x+12))}px`;tooltip.style.top=`${Math.max(4,event.clientY-rect.y-58)}px`;}
    wake();
  }
  function select(hit){selection=hit?{key:hit.key,index:hit.index}:null;activeHover=null;tooltip.hidden=true;elapsed=0;refresh(reduced.matches);arrival=1;updateText(true);}
  canvas.addEventListener('pointermove',hover);canvas.addEventListener('pointerleave',()=>{activeHover=null;tooltip.hidden=true;wake();});
  canvas.addEventListener('pointercancel',()=>{activeHover=null;tooltip.hidden=true;wake();});
  canvas.addEventListener('click',event=>{const item=hitAt(event.clientX,event.clientY);if(item)select(item);});
  canvas.addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight',' ','Escape','Enter'].includes(event.key))event.preventDefault();
    if(event.key===' '){pause.click();return;}if(event.key==='Escape'){select(null);return;}
    if(event.key==='Enter'&&activeHover){select(activeHover);return;}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      const index=view.hours.findIndex(item=>item.archiveIndex===view.selectedHourIndex),next=view.hours[Math.max(0,Math.min(view.hours.length-1,index+(event.key==='ArrowLeft'?-1:1)))];if(next)select({key:'month',index:next.archiveIndex});
    }
  });
  pause.addEventListener('click',()=>{if(selection){selection=null;running=true;refresh(true);}else running=!running;activeHover=null;tooltip.hidden=true;updateText(true);wake();});
  function loop(now){raf=0;const dt=Math.min(.08,(now-(lastTime||now))/1000);lastTime=now;render(dt);if(visible&&!lost&&!document.hidden&&!activeHover&&((running&&!selection)||Math.abs(rotationTarget-annualRotation)>.0001))raf=requestAnimationFrame(loop);else lastTime=0;}
  function wake(){if(!raf&&visible&&!lost&&!document.hidden)raf=requestAnimationFrame(loop);}
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();},{threshold:.02}).observe(figure);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;lastTime=0;}else wake();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;figure.classList.remove('market-ready');pause.hidden=true;});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  reduced.addEventListener('change',()=>{if(reduced.matches)running=false;updateText();wake();});
  canvas.removeAttribute('aria-hidden');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Interactive circle of market time and prices');canvas.setAttribute('aria-describedby','market-keyboard-help');canvas.tabIndex=0;
  refresh(true);resize();render(0);figure.classList.add('market-ready');pause.hidden=false;
  if(new URLSearchParams(location.search).has('debug'))window.__cycle={
    state:()=>({index:snapshot.index,asOf:snapshot.asOf,selection,running,arrival,view,display:{curveQuote:curveQuote.userData.text,quoteVisible:curveQuote.visible,selectedMinuteVisible:chosenMinute.visible},hits:hits.map(h=>({...h,screen:project(h.point)})),dimensions:{width,height},camera:{position:camera.position.toArray()}}),
    seek:index=>{snapshot=replayFrame(replay,index);elapsed=0;selection=null;refresh(true);render(0);},
    select:(key,index)=>{select(key?{key,index}:null);render(0);},
    resize,render:()=>render(0),capture:()=>canvas.toDataURL('image/png')
  };
}
const canvas=document.getElementById('market-canvas');if(canvas)boot(canvas);
