// Hero visual: a ring of daily candlesticks with volume bars, radial blades
// and date labels, rendered with three.js. The pure rules live in
// market-model.mjs; this file only owns the scene graph, timing and input.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import series from './market-data.mjs';
import {
  TAU, COLOURS, ringPosition, seriesBounds, candleMetrics, volumeBar,
  inWindow, slotTransition, EASE, spinStep
} from './market-model.mjs';

const SCALE = 1.2;
const RADIUS = 6;
const CANDLE_RING = (RADIUS - 0.6) * SCALE;
const BAR_RING = RADIUS * SCALE;
const LABEL_RING = (RADIUS + 0.3) * SCALE;
const TILT = 0.045 * SCALE;
const INTRO_SECONDS = 2.5;
const TICK_MS = 200;
const BASE_FOV = 75;
const VIEW_FOV = 82;          // horizontal field of view used for framing; wider than the reference so the near labels clear the box
const MIN_VERTICAL_FOV = 52;  // very wide boxes would otherwise crop the ring top and bottom
const LOOK_AT = [0, -0.5, 0]; // aim a little below the ring so it sits higher in the box
const LABEL_FONT = '500 80px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const canvas = document.getElementById('market-canvas');
if (canvas) boot(canvas);

function boot(canvas) {
  const figure = canvas.closest('.hero-visual') || canvas.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    return; // The static fallback image stays visible.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  const focus = new THREE.Group();
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  scene.add(focus);
  focus.add(outer);
  outer.add(inner);

  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.position.set(0, 1, 0);
  scene.add(sun);

  const path = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 40, 0),
    new THREE.Vector3(0, 30, 4),
    new THREE.Vector3(0, 20, 16),
    new THREE.Vector3(13, 8, 4)
  );

  // Instanced geometry: one box mesh holds bodies (0..n) and volume bars (n..2n),
  // one cylinder mesh holds wicks.
  const bounds = seriesBounds(series);
  const total = bounds.total;
  const slots = bounds.slots;
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), total * 2);
  const wicks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), total);
  inner.add(boxes, wicks);

  const accent = new THREE.Color(COLOURS.accent);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const lineMaterials = [];

  const items = series.map((row, index) => {
    const slot = index % slots;
    const candle = candleMetrics(row, bounds, SCALE);
    const bar = volumeBar(row, bounds, SCALE);
    const candlePos = ringPosition(CANDLE_RING, slots, slot);
    const barPos = ringPosition(BAR_RING, slots, slot);
    const item = { index, candle, bar, candlePos, barPos, p: 0, animating: false, firstPass: true, tween: null, blade: null, label: null };
    boxes.setColorAt(index, new THREE.Color(candle.colour));
    boxes.setColorAt(total + index, accent);
    wicks.setColorAt(index, new THREE.Color(candle.colour));

    if (index % 3 === 0) {
      const geometry = new LineGeometry();
      geometry.setPositions([0, 0, 0, 0, bar.height, 0, barPos.x, bar.height, barPos.z, barPos.x, 0, barPos.z, 0, 0, 0]);
      const material = new LineMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0 });
      lineMaterials.push(material);
      const blade = new Line2(geometry, material);
      blade.scale.y = 0.0001;
      blade.visible = false;
      inner.add(blade);
      item.blade = blade;
    }
    if (index % 2 === 0) {
      const label = makeLabel(row.label, renderer);
      const labelPos = ringPosition(LABEL_RING, slots, slot);
      label.position.set(labelPos.x, 0, labelPos.z);
      label.rotation.y = TAU / slots * slot;
      label.visible = false;
      inner.add(label);
      item.label = label;
    }
    return item;
  });
  boxes.instanceColor.needsUpdate = true;
  wicks.instanceColor.needsUpdate = true;

  function applyItem(item) {
    const p = Math.max(item.p, 0.0001);
    const { candle, bar, candlePos, barPos, index } = item;
    quaternion.identity();
    position.set(candlePos.x, candle.body.y, candlePos.z);
    scale.set(candle.body.width * p, candle.body.height * p, candle.body.width * p);
    boxes.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    position.set(candlePos.x, candle.wick.y, candlePos.z);
    scale.set(candle.wick.diameter * p, candle.wick.height * p, candle.wick.diameter * p);
    wicks.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    const barHeight = bar.height * p;
    position.set(barPos.x, barHeight / 2, barPos.z);
    scale.set(bar.width, barHeight, bar.depth);
    boxes.setMatrixAt(total + index, matrix.compose(position, quaternion, scale));
    if (item.blade) {
      item.blade.scale.y = p;
      item.blade.material.opacity = 0.6 * item.p;
      item.blade.visible = item.p > 0;
    }
    if (item.label) {
      item.label.material.opacity = item.p;
      item.label.visible = item.p > 0;
    }
  }
  items.forEach(applyItem);
  boxes.instanceMatrix.needsUpdate = true;
  wicks.instanceMatrix.needsUpdate = true;

  // Timing --------------------------------------------------------------
  const clock = { start: 0, progress: 0, offset: 0, intervalId: 0, timeoutId: 0, frameId: 0, last: 0 };
  let inView = true;
  let dirty = true;
  let spin = { speed: 0, dir: -1, originX: 0 };
  const pointer = { x: 0, dragging: false };
  const size = { width: 0, height: 0 };

  function now() { return performance.now() / 1000; }

  function startTween(item, transition, time) {
    item.tween = { from: item.p, to: transition.target, start: time + transition.delay, duration: transition.duration, ease: EASE[transition.ease] };
    item.animating = true;
  }

  function onTick() {
    clock.offset += 1;
    const time = now();
    for (const item of items) {
      const visible = inWindow(clock.offset, total, slots, item.index);
      const transition = slotTransition(item, visible, item.index);
      if (!transition) continue;
      if (transition.clearFirstPass) item.firstPass = false;
      else startTween(item, transition, time);
    }
    dirty = true;
    requestFrame();
  }

  function updateTweens(time) {
    let changed = false;
    for (const item of items) {
      const tween = item.tween;
      if (!tween) continue;
      const t = (time - tween.start) / tween.duration;
      const next = t <= 0 ? tween.from : t >= 1 ? tween.to : tween.from + (tween.to - tween.from) * tween.ease(t);
      if (next !== item.p) { item.p = next; applyItem(item); changed = true; }
      if (t >= 1) { item.tween = null; item.animating = false; item.firstPass = false; }
    }
    if (changed) { boxes.instanceMatrix.needsUpdate = true; wicks.instanceMatrix.needsUpdate = true; }
    return changed;
  }

  function placeCamera(progress) {
    const eased = EASE.camera(progress);
    const u = 1e-5 + eased * (0.999999 - 1e-5);
    camera.position.copy(path.getPointAt(u));
    camera.lookAt(LOOK_AT[0], LOOK_AT[1], LOOK_AT[2]);
    outer.rotation.x = TILT * eased;
    outer.rotation.z = -TILT * eased;
  }

  function showEverythingAtRest() {
    // Reduced motion: no fly-in, no spin, no ticker; the first window is fully grown.
    clock.progress = 1;
    placeCamera(1);
    for (const item of items) {
      item.tween = null;
      item.animating = false;
      item.p = inWindow(0, total, slots, item.index) ? 1 : 0;
      applyItem(item);
    }
    boxes.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    dirty = true;
  }

  function stopTicker() {
    window.clearTimeout(clock.timeoutId);
    window.clearInterval(clock.intervalId);
    clock.timeoutId = 0;
    clock.intervalId = 0;
  }

  function startMotion() {
    stopTicker();
    clock.start = now();
    clock.progress = 0;
    spin = { speed: 0, dir: -1, originX: 0 };
    clock.timeoutId = window.setTimeout(() => {
      clock.intervalId = window.setInterval(onTick, TICK_MS);
    }, 0.1 * slots * 30);
    requestFrame();
  }

  function frame(stamp) {
    clock.frameId = 0;
    if (canvas.clientWidth !== size.width || canvas.clientHeight !== size.height) resize();
    const time = stamp / 1000;
    const dt = clock.last ? time - clock.last : 0;
    clock.last = time;
    const moving = !reducedMotion.matches;
    if (moving) {
      if (clock.progress < 1) {
        clock.progress = Math.min(1, (time - clock.start) / INTRO_SECONDS);
        placeCamera(clock.progress);
        dirty = true;
      }
      const step = spinStep(spin, { dt, dragging: pointer.dragging, pointerX: pointer.x });
      spin = step.state;
      if (step.rotate) { inner.rotateY(step.rotate); dirty = true; }
    }
    if (updateTweens(time)) dirty = true;
    if (dirty) { renderer.render(scene, camera); dirty = false; }
    if (moving || items.some((item) => item.tween)) requestFrame();
  }

  function canDraw() { return inView && !document.hidden; }
  function requestFrame() {
    if (!clock.frameId && canDraw()) clock.frameId = window.requestAnimationFrame(frame);
  }
  function stopFrame() {
    if (clock.frameId) window.cancelAnimationFrame(clock.frameId);
    clock.frameId = 0;
    clock.last = 0;
  }

  // Sizing --------------------------------------------------------------
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    size.width = canvas.clientWidth;
    size.height = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    // Keep the horizontal field of view of a square 75° view, so the ring
    // fills the same share of the width whatever the box's shape.
    const half = Math.tan(THREE.MathUtils.degToRad(VIEW_FOV / 2));
    camera.fov = aspect >= 1 ? Math.max(MIN_VERTICAL_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(half / aspect))) : BASE_FOV;
    camera.updateProjectionMatrix();
    for (const material of lineMaterials) material.resolution.set(width, height);
    dirty = true;
    requestFrame();
  }

  // Input ---------------------------------------------------------------
  function pointerX(event) {
    const bounds = canvas.getBoundingClientRect();
    return ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  }
  function onPointerMove(event) {
    pointer.x = pointerX(event);
  }
  function onPointerUp() {
    pointer.dragging = false;
    canvas.style.cursor = 'grab';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || reducedMotion.matches) return;
    pointer.x = pointerX(event);
    spin.originX = pointer.x;
    pointer.dragging = true;
    canvas.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    requestFrame();
  });
  canvas.style.cursor = 'grab';

  // Lifecycle -----------------------------------------------------------
  function onMotionPreference() {
    if (reducedMotion.matches) { stopTicker(); showEverythingAtRest(); requestFrame(); }
    else startMotion();
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', onMotionPreference);
  else reducedMotion.addListener(onMotionPreference);

  document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrame(); else { resize(); requestFrame(); } });
  window.addEventListener('pagehide', stopFrame);
  window.addEventListener('pageshow', requestFrame);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) requestFrame(); else stopFrame();
    }).observe(canvas);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(figure);
  window.addEventListener('resize', resize, { passive: true });

  resize();
  if (reducedMotion.matches) showEverythingAtRest();
  else startMotion();
  figure.classList.add('market-ready');
  requestFrame();
  if (/[?&]debug\b/.test(window.location.search)) {
    canvas.__market = { items, camera, clock, renderer, scene, inner, outer, frame, placeCamera, updateTweens, showEverythingAtRest, resize };
  }
}

// A date label is a textured plane standing in the vertical plane that
// contains its radius, anchored at its left edge. Far-side labels therefore
// read mirrored, as the reference does.
function makeLabel(text, renderer) {
  const width = 640, height = 112, fontPx = 80;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const context = source.getContext('2d');
  context.font = LABEL_FONT;
  context.textBaseline = 'middle';
  context.fillStyle = COLOURS.accent;
  context.fillText(text, 0, height / 2);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const em = 0.15 * SCALE;
  const planeHeight = em * height / fontPx;
  const planeWidth = planeHeight * width / height;
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  geometry.translate(planeWidth / 2, 0, 0);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, side: THREE.DoubleSide, alphaTest: 0.02 });
  return new THREE.Mesh(geometry, material);
}
