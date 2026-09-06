// Hero visual — "Pen and Drum". A drum of daily candlesticks steps one session
// clockwise per beat; a pen fixed at the point of the ring nearest the camera
// prints the newest session, and the three slots on the pen's other side are
// the erased gap the oldest session dissolves into. The dial (rim, ticks, gap
// boundaries, pen) is fixed in the world; only the drum turns.
//
// The pure rules live in market-model.mjs; this file owns the scene graph,
// the beat clock and input.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import series, { meta } from './market-data.mjs';
import {
  TAU, COLOURS, EASE, TIMING, GLYPH_RATIO, DEFAULT_APERTURE,
  ringPosition, seriesBounds, priceLevel, candleMetrics, volumeBar,
  cubicBezier, weekStarts, windowOf, isVisible, clampOffset, slotOf,
  penAzimuth, drumAngle, offsetFromAngle, slotFromLocal, detentTarget,
  dragAngle, beatPhase, depthFade, retarget, tweenValue, captionLines, formatPrice
} from './market-model.mjs';

// Geometry — the three radii and the tilt are the reference composition's.
const SCALE = 1.2;
const RADIUS = 6;
const CANDLE_RING = (RADIUS - 0.6) * SCALE;  // 6.48
const BAR_RING = RADIUS * SCALE;             // 7.20, also the dial's rim
const LABEL_RING = (RADIUS + 0.3) * SCALE;   // 7.56
const TICK_RING = BAR_RING + 0.12;           // 7.32
const GAP_RING = BAR_RING + 0.30;            // 7.50
const CURSOR_INNER = 1.2;
const CURSOR_OUTER = BAR_RING + 0.65;        // 7.85
const TILT = 0.045 * SCALE;                  // ±0.054 rad on the outer group

// Camera. The composition never changes: the eye only dollies in along the
// (13, 8, 4) direction, so every frame is the frame the still was designed as.
const EYE = [13, 8, 4];
const CAMERA_NEAR_DISTANCE = Math.hypot(EYE[0], EYE[1], EYE[2]); // 15.78
const CAMERA_FAR_DISTANCE = 17.4;
const BASE_FOV = 75;
const VIEW_FOV = 82;          // horizontal field of view used for framing; wider than the reference so the near labels clear the box
const MIN_VERTICAL_FOV = 52;  // very wide boxes would otherwise crop the ring top and bottom
const LOOK_AT = [0, -0.5, 0]; // aim a little below the ring so it sits higher in the box

// Dial and drum opacities — one four-step ladder, all tone-mapping disabled so
// the whites stay in step with each other.
const RIM_ALPHA = 0.22;
const TICK_ALPHA = 0.24;
const GAP_ALPHA = 0.50;
const PEN_ALPHA = 0.90;
const CURSOR_ALPHA = 0.55;
const BLADE_ALPHA = 0.30;
const LABEL_ALPHA = 0.85;
const RIM_POINTS = 221;       // 220 segments; first and last vertex coincide
const RIM_Y = 0.004;
const TICK_Y = 0.002;
const PEN_Y = 0.008;
const NIB_SIZE = 0.06;

// Depth cue: instance colours are pulled toward the page's navy once per step,
// never per frame, and never through a fog that would touch the line materials.
const DEPTH_FADE = 0.30;
const DEPTH_COLOUR = 0x0b2a4c;
const DEPTH_SAMPLES = 32;

const MOBILE_QUERY = '(max-width: 850px)';          // the stylesheet's 260 px box: no labels, no ticks, aperture 2
const CAPTION_COMPACT_QUERY = '(max-width: 1100px)'; // the hero box narrows below the full source line
const MOBILE_APERTURE = 2;
const LABEL_FACING = 0.30;    // a date is drawn only when its plane faces the camera
const LABEL_FONT = '500 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const LABEL_WIDTH = 320;
const LABEL_HEIGHT = 56;
const LABEL_FONT_PX = 40;
const LABEL_EM = 0.22 * SCALE; // 0.264 world units per em

// Print timings the shared TIMING table does not carry: the candle follows its
// volume bar out of the ring 0.06 s later and takes 0.22 s to grow.
const CANDLE_DELAY = 0.06;
const CANDLE_SECONDS = 0.22;

// Interaction
const EMPHASIS = 0.28;        // hovered body and wick widen ×1.28, height never changes
const HOVER_SLOP = 3;         // px of pointer travel before the slot is re-picked
const HOVER_RELEASE = 0.55;   // s the cursor and the caption survive a pointerleave
const CURSOR_FADE = 0.12;
const TOUCH_SLOP = 12;        // px of horizontal travel before a touch becomes a drag
const MOUSE_SLOP = 3;
const DRAG_GAIN = 2.4;
const RUBBER = 0.3;           // beyond the ends the drum follows at 0.3 of the pointer
const DRAG_PRINT = 0.15;      // s to print or dissolve a session crossed while dragging
const CROSS_SECONDS = 0.04;   // at most one slot per 40 ms
const DETENT_SECONDS = 0.42;
const DETENT_EASE = cubicBezier(0.34, 1.02, 0.36, 1);
const NIB_POP = 0.12;

// The arrival choreography, in seconds from the moment the canvas is ready.
// The first visit builds the instrument; a revisit only fades it up.
const ARRIVAL = {
  first: {
    dollySeconds: 2.2, tiltSeconds: 1.6, drawRim: true,
    dialFrom: 0, dialTo: 0.60, penFrom: 0.30, penTo: 0.45,
    printFrom: 0.45, printStagger: 0.033, barSeconds: 0.30,
    candleDelay: CANDLE_DELAY, candleSeconds: CANDLE_SECONDS,
    nibAt: 2.45, chromeFrom: 2.30, chromeTo: 2.80, captionAt: 2.80, beatAt: 3.30
  },
  revisit: {
    dollySeconds: 0.001, tiltSeconds: 0.001, drawRim: false,
    dialFrom: 0, dialTo: 0.45, penFrom: 0.20, penTo: 0.55,
    printFrom: 0, printStagger: 0, barSeconds: 0.45,
    candleDelay: 0, candleSeconds: 0.45,
    nibAt: 0.43, chromeFrom: 0, chromeTo: 0.45, captionAt: 0, beatAt: 1.10
  }
};

const STORE_OFFSET = 'market-offset';
const STORE_SEEN = 'market-seen';

const canvas = document.getElementById('market-canvas');
if (canvas) boot(canvas);

function boot(canvas) {
  const figure = canvas.closest('.hero-visual') || canvas.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compact = window.matchMedia(MOBILE_QUERY);
  const narrow = window.matchMedia(CAPTION_COMPACT_QUERY);

  // Series shape ---------------------------------------------------------
  const bounds = seriesBounds(series);
  const total = bounds.total;
  const slots = bounds.slots;
  const aperture = compact.matches ? MOBILE_APERTURE : DEFAULT_APERTURE;
  const count = slots - aperture;                                  // sessions on the drum
  const maxOffset = clampOffset(total, total, slots, aperture);    // 58 for 110/55/3
  const pen = penAzimuth(EYE[0], EYE[2], slots);                   // −3 slots
  const stepAngle = TAU / slots;
  let timing = compact.matches ? TIMING.mobile : TIMING.desktop;
  let chromeOn = !compact.matches;   // ticks and date labels are for the wide box only
  const nibIndex = total * 2;                                      // the one extra box instance

  // Caption first, so it is right even when WebGL is not there ------------
  const captionEl = figure ? figure.querySelector('.market-caption') : null;
  const sourceEl = captionEl ? captionEl.querySelector('.market-caption-source') : null;
  const sessionEl = captionEl ? captionEl.querySelector('.market-caption-session') : null;
  if (count < 1) {
    if (captionEl) captionEl.classList.remove('is-pending');
    console.warn('market-visual: the series needs at least ' + (slots - aperture + 1) + ' rows; the still stays.');
    return;
  }
  const stored = recall();
  const startOffset = reducedMotion.matches ? maxOffset : (stored.seen ? stored.offset : 0);
  writeSource();
  writeSession(total - 1);  // the still shows the end of the record; the live caption is written once the renderer exists

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    if (captionEl) captionEl.classList.remove('is-pending');
    return; // The static fallback image stays visible and the caption is already correct.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  writeSession(startOffset + count - 1);

  // Scene graph ----------------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 1000);
  const focus = new THREE.Group();
  const outer = new THREE.Group();   // holds the tilt; the dial rides here, fixed
  const inner = new THREE.Group();   // the drum; its rotation.y is the only motion
  const dial = new THREE.Group();
  scene.add(focus);
  focus.add(outer);
  outer.add(inner, dial);

  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.position.set(0, 1, 0);
  scene.add(sun);

  // Instances: one box mesh holds bodies (0..n), volume bars (n..2n) and the
  // nib (2n); one cylinder mesh holds the wicks.
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), total * 2 + 1);
  const wicks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), total);
  inner.add(boxes, wicks);

  const accent = new THREE.Color(COLOURS.accent);
  const faded = new THREE.Color(DEPTH_COLOUR);
  const swatch = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  const weeks = new Set(weekStarts(series));
  const items = series.map((row, index) => {
    const slot = slotOf(index, slots);
    const candle = candleMetrics(row, bounds, SCALE);
    const bar = volumeBar(row, bounds, SCALE);
    const candlePos = ringPosition(CANDLE_RING, slots, slot);
    const barPos = ringPosition(BAR_RING, slots, slot);
    const item = {
      index, row, slot, candle, bar, candlePos, barPos,
      close: priceLevel(row.close, bounds, SCALE),
      colour: new THREE.Color(candle.colour),
      p: 0,            // volume bar, blade and label printedness
      candleP: 0,      // body and wick printedness, 0.06 s behind the bar
      emphasis: 0,     // 0..1, hover widening
      facing: false,
      tween: null, candleTween: null, emphasisTween: null,
      blade: null, label: null
    };
    boxes.setColorAt(index, item.colour);
    boxes.setColorAt(total + index, accent);
    wicks.setColorAt(index, item.colour);

    // Blades and dates stand on the first session of each ISO week, so their
    // uneven spacing is the trading calendar rather than a modulus.
    if (weeks.has(index)) {
      const geometry = new LineGeometry();
      geometry.setPositions([0, 0, 0, 0, bar.height, 0, barPos.x, bar.height, barPos.z, barPos.x, 0, barPos.z, 0, 0, 0]);
      const blade = new Line2(geometry, lineMaterial(0xffffff, 0));
      blade.scale.y = 0.0001;
      blade.visible = false;
      inner.add(blade);
      item.blade = blade;

      const label = makeLabel(row.label, renderer);
      const labelPos = ringPosition(LABEL_RING, slots, slot);
      label.position.set(labelPos.x, 0, labelPos.z);
      label.rotation.y = stepAngle * slot;
      label.visible = false;
      inner.add(label);
      item.label = label;
    }
    return item;
  });
  const weekItems = items.filter((item) => item.blade || item.label);
  boxes.setColorAt(nibIndex, new THREE.Color(0xffffff)); // the nib never fades
  boxes.instanceColor.needsUpdate = true;
  wicks.instanceColor.needsUpdate = true;

  // The dial ------------------------------------------------------------
  const gapFar = pen + (aperture + 0.5) * stepAngle;   // the far edge of the erased slots
  const gapNear = pen + 0.5 * stepAngle;

  const rimGeometry = new THREE.BufferGeometry();
  const rimPositions = new Float32Array(RIM_POINTS * 3);
  for (let i = 0; i < RIM_POINTS; i += 1) {
    const t = gapFar + TAU * i / (RIM_POINTS - 1);
    rimPositions[i * 3] = BAR_RING * Math.cos(t);
    rimPositions[i * 3 + 1] = RIM_Y;
    rimPositions[i * 3 + 2] = -BAR_RING * Math.sin(t);
  }
  rimGeometry.setAttribute('position', new THREE.BufferAttribute(rimPositions, 3));
  const rimMaterial = basicLineMaterial(RIM_ALPHA);
  const rim = new THREE.Line(rimGeometry, rimMaterial);
  rim.renderOrder = 1;
  dial.add(rim);

  let ticks = null;
  {
    const points = [];
    for (let k = 0; k < slots; k += 1) {
      const t = stepAngle * k;
      points.push(BAR_RING * Math.cos(t), TICK_Y, -BAR_RING * Math.sin(t));
      points.push(TICK_RING * Math.cos(t), TICK_Y, -TICK_RING * Math.sin(t));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    ticks = new THREE.LineSegments(geometry, basicLineMaterial(TICK_ALPHA));
    ticks.renderOrder = 1;
    ticks.visible = chromeOn;
    dial.add(ticks);
  }

  const gapPoints = [];
  for (const t of [gapNear, gapFar]) {
    gapPoints.push(BAR_RING * Math.cos(t), RIM_Y, -BAR_RING * Math.sin(t));
    gapPoints.push(GAP_RING * Math.cos(t), RIM_Y, -GAP_RING * Math.sin(t));
  }
  const gapGeometry = new THREE.BufferGeometry();
  gapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gapPoints, 3));
  const gaps = new THREE.LineSegments(gapGeometry, basicLineMaterial(GAP_ALPHA));
  gaps.renderOrder = 1;
  dial.add(gaps);

  // The pen is the only line lying flat on the y = 0 plane, so it differs from
  // the blades in kind rather than in brightness.
  const penGeometry = new LineGeometry();
  penGeometry.setPositions([0, PEN_Y, 0, BAR_RING, PEN_Y, 0]);
  const penLine = new Line2(penGeometry, lineMaterial(0xffffff, PEN_ALPHA));
  penLine.rotation.y = pen;
  penLine.renderOrder = 2;
  penLine.visible = false;
  dial.add(penLine);

  const cursorGeometry = new LineGeometry();
  cursorGeometry.setPositions([CURSOR_INNER, PEN_Y, 0, CURSOR_OUTER, PEN_Y, 0]);
  const cursorLine = new Line2(cursorGeometry, lineMaterial(0xffffff, 0));
  cursorLine.renderOrder = 2;
  cursorLine.visible = false;
  dial.add(cursorLine);

  dial.userData = { rim, ticks, gaps, pen: penLine, cursor: cursorLine };

  // State ----------------------------------------------------------------
  const state = { offset: startOffset, mode: 'idle', beatStart: 0, R: drumAngle(startOffset, slots, pen, aperture) };
  const beat = { active: false, from: state.R, to: state.R, stepped: true, nibFrom: 0, nibTo: 0 };
  const arrival = { active: false, begun: false, start: 0, plan: ARRIVAL.first, captioned: false };
  const glide = { active: false, from: 0, to: 0, start: 0, duration: DETENT_SECONDS };
  const nib = { level: items[startOffset + count - 1].close, scale: 0, tween: null };
  const drag = { id: -1, down: false, captured: false, touch: false, x0: 0, y0: 0, R0: 0, targetR: 0, crossed: 0, moved: false };
  const hover = { item: null, x: 0, y: 0, releaseId: 0, inside: false };
  const cursor = { value: 0, tween: null };
  const clock = { frameId: 0, wakeId: 0 };
  const depth = { near: -1, far: -2 };
  const size = { width: 0, height: 0 };
  // The candle band's middle, 2.46: the height the pointer picks at and the
  // depth the fade is measured at.
  const pickY = (priceLevel(bounds.minLow, bounds, SCALE) + priceLevel(bounds.maxLow, bounds, SCALE)) / 2;
  const raycaster = new THREE.Raycaster();
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pickY);
  const pickPoint = new THREE.Vector3();
  const pickRay = new THREE.Ray();
  const outerInverse = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const PICK_INNER = 0.6 * CANDLE_RING;
  const PICK_OUTER = CURSOR_OUTER;
  const ndc = new THREE.Vector2();
  let chrome = 0;   // blades and labels fade up together at the end of the arrival
  let inView = true;
  let dirty = true;

  function now() { return performance.now() / 1000; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function span(t, from, to) { return clamp01((t - from) / Math.max(to - from, 1e-6)); }
  function penItem() { return items[state.offset + count - 1]; }
  // The caption's second line reads the hovered session, or the one under the pen.
  function sessionIndex() { return hover.item ? hover.item.index : state.offset + count - 1; }

  // Drawing --------------------------------------------------------------
  function applyItem(item) {
    const p = Math.max(item.p, 1e-4);
    const q = Math.max(item.candleP, 1e-4);
    const wide = 1 + EMPHASIS * item.emphasis;  // width only; height never encodes the hover
    const { candle, bar, candlePos, barPos, index } = item;
    quaternion.identity();
    position.set(candlePos.x, candle.body.y, candlePos.z);
    scale.set(candle.body.width * q * wide, Math.max(candle.body.height * q, 1e-4), candle.body.width * q * wide);
    boxes.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    position.set(candlePos.x, candle.wick.y, candlePos.z);
    scale.set(candle.wick.diameter * q * wide, Math.max(candle.wick.height * q, 1e-4), candle.wick.diameter * q * wide);
    wicks.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    const barHeight = bar.height * p;
    position.set(barPos.x, barHeight / 2, barPos.z);
    scale.set(bar.width, barHeight, bar.depth);
    boxes.setMatrixAt(total + index, matrix.compose(position, quaternion, scale));
    applyChromeItem(item);
  }

  function applyChromeItem(item) {
    if (item.blade) {
      const alpha = BLADE_ALPHA * item.p * chrome;
      item.blade.scale.y = Math.max(item.p, 1e-4);
      item.blade.material.opacity = alpha;
      item.blade.visible = alpha > 0.001;
    }
    if (item.label) {
      const alpha = LABEL_ALPHA * item.p * chrome;
      item.label.material.opacity = alpha;
      item.label.visible = chromeOn && item.facing && alpha > 0.001;
    }
  }

  function applyChrome() {
    for (const item of weekItems) applyChromeItem(item);
    dirty = true;
  }

  function setNib() {
    const angle = pen - state.R;  // the nib is a fixed world point, so it walks the drum backwards
    quaternion.identity();
    position.set(CANDLE_RING * Math.cos(angle), nib.level, -CANDLE_RING * Math.sin(angle));
    scale.setScalar(Math.max(nib.scale, 1e-4));
    boxes.setMatrixAt(nibIndex, matrix.compose(position, quaternion, scale));
    boxes.instanceMatrix.needsUpdate = true;
    dirty = true;
  }

  function setDrumAngle(R) {
    state.R = R;
    inner.rotation.y = R;
    setNib();
    if (cursor.value > 0 && hover.item) cursorLine.rotation.y = stepAngle * hover.item.slot + R;
    dirty = true;
  }

  // The near and far edges of the view-space depth band. The candle ring is a
  // full circle, so they do not depend on the drum's angle.
  function updateDepthRange() {
    outer.updateWorldMatrix(true, false);
    let near = -Infinity;
    let far = Infinity;
    for (let i = 0; i < DEPTH_SAMPLES; i += 1) {
      const t = TAU * i / DEPTH_SAMPLES;
      probe.set(CANDLE_RING * Math.cos(t), pickY, -CANDLE_RING * Math.sin(t));
      outer.localToWorld(probe).applyMatrix4(camera.matrixWorldInverse);
      if (probe.z > near) near = probe.z;
      if (probe.z < far) far = probe.z;
    }
    depth.near = near;
    depth.far = far === near ? near - 1 : far;
  }

  // Written once per step, never per frame: no fog, no material flags, and the
  // designed opacities of the blades and labels are left alone.
  function writeDepthFade() {
    inner.updateWorldMatrix(true, false);
    for (const item of items) {
      probe.set(item.candlePos.x, pickY, item.candlePos.z);
      probe.applyMatrix4(inner.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const f = depthFade(probe.z, depth.near, depth.far, DEPTH_FADE);
      swatch.copy(item.colour).lerp(faded, f);
      boxes.setColorAt(item.index, swatch);
      wicks.setColorAt(item.index, swatch);
      swatch.copy(accent).lerp(faded, f);
      boxes.setColorAt(total + item.index, swatch);
    }
    boxes.instanceColor.needsUpdate = true;
    wicks.instanceColor.needsUpdate = true;
    dirty = true;
  }

  // A date is legible only when its plane faces the camera; mirrored and
  // edge-on ones are hidden rather than drawn backwards.
  function updateLabels() {
    for (const item of weekItems) {
      if (!item.label) continue;
      item.label.getWorldPosition(toCamera);
      toCamera.subVectors(camera.position, toCamera).normalize();
      item.label.getWorldDirection(normal);
      item.facing = normal.dot(toCamera) > LABEL_FACING;
    }
    applyChrome();
  }

  function afterStep() {
    updateDepthRange();
    writeDepthFade();
    updateLabels();
  }

  function placeCamera(dolly, tilt = dolly) {
    const eased = EASE.camera(clamp01(dolly));
    const distance = CAMERA_FAR_DISTANCE + (CAMERA_NEAR_DISTANCE - CAMERA_FAR_DISTANCE) * eased;
    camera.position.set(EYE[0], EYE[1], EYE[2]).setLength(distance);
    camera.lookAt(LOOK_AT[0], LOOK_AT[1], LOOK_AT[2]);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const lean = EASE.camera(clamp01(tilt));
    outer.rotation.x = TILT * lean;
    outer.rotation.z = -TILT * lean;
    outer.updateMatrixWorld(true);
    dirty = true;
  }

  // Tweens ---------------------------------------------------------------
  // Written exactly as tweenValue's own end test, so a tween is never dropped
  // on a frame where it still reports an interior value and the item is left
  // a hair away from its target for good.
  function ended(tween, time) { return (time - tween.start) / tween.duration >= 1; }

  function updateTweens(time) {
    let running = false;
    let changed = false;
    for (const item of items) {
      let touched = false;
      if (item.tween) {
        const v = tweenValue(item.tween, time);
        if (v !== item.p) { item.p = v; touched = true; }
        if (ended(item.tween, time)) item.tween = null; else running = true;
      }
      if (item.candleTween) {
        const v = tweenValue(item.candleTween, time);
        if (v !== item.candleP) { item.candleP = v; touched = true; }
        if (ended(item.candleTween, time)) item.candleTween = null; else running = true;
      }
      if (item.emphasisTween) {
        const v = tweenValue(item.emphasisTween, time);
        if (v !== item.emphasis) { item.emphasis = v; touched = true; }
        if (ended(item.emphasisTween, time)) item.emphasisTween = null; else running = true;
      }
      if (touched) { applyItem(item); changed = true; }
    }
    if (changed) {
      boxes.instanceMatrix.needsUpdate = true;
      wicks.instanceMatrix.needsUpdate = true;
      dirty = true;
    }
    if (nib.tween) {
      const v = tweenValue(nib.tween, time);
      if (v !== nib.level) { nib.level = v; setNib(); }
      if (ended(nib.tween, time)) nib.tween = null; else running = true;
    }
    return running || changed;
  }

  function updateCursor(time) {
    if (!cursor.tween) return false;
    const v = tweenValue(cursor.tween, time);
    if (v !== cursor.value) {
      cursor.value = v;
      cursorLine.material.opacity = v;
      cursorLine.visible = v > 0.001;
      if (hover.item) cursorLine.rotation.y = stepAngle * hover.item.slot + state.R;
      dirty = true;
    }
    if (ended(cursor.tween, time)) { cursor.tween = null; return false; }
    return true;
  }

  // Window bookkeeping ---------------------------------------------------
  function applyWindow(previous, next, at, duration) {
    for (const item of items) {
      const was = isVisible(previous, item.index, slots, aperture);
      const is = isVisible(next, item.index, slots, aperture);
      if (was === is) continue;
      const target = is ? 1 : 0;
      const ease = is ? EASE.easeOut : EASE.easeIn;
      item.tween = retarget(item.p, target, duration, ease, 0, at);
      item.candleTween = retarget(item.candleP, target, duration, ease, 0, at);
    }
  }

  function itemAtSlot(slot) {
    const first = windowOf(state.offset, total, slots, aperture).first;
    const index = first + ((slot - slotOf(first, slots)) % slots + slots) % slots;
    return index <= state.offset + count - 1 ? items[index] : null;  // the gap holds nothing
  }

  // Beats ----------------------------------------------------------------
  function startBeat(at) {
    if (state.offset >= maxOffset || reducedMotion.matches) { beat.active = false; return false; }
    const previous = state.offset;
    const next = previous + 1;
    state.offset = next;
    state.beatStart = at;
    beat.active = true;
    beat.stepped = false;
    beat.from = state.R;
    beat.to = drumAngle(next, slots, pen, aperture);
    beat.nibFrom = nib.level;
    beat.nibTo = items[next + count - 1].close;
    nib.tween = null;
    // The oldest session dissolves as it enters the gap, out of the reader's eye.
    const leaving = items[previous];
    leaving.tween = retarget(leaving.p, 0, timing.dissolve, EASE.easeIn, 0, at);
    leaving.candleTween = retarget(leaving.candleP, 0, timing.dissolve, EASE.easeIn, 0, at);
    // The newest grows out of the rim under the pen, the candle a beat behind the bar.
    const arriving = items[next + count - 1];
    arriving.tween = retarget(0, 1, timing.printEnd - timing.printStart, EASE.easeOut, timing.printStart, at);
    arriving.candleTween = retarget(0, 1, CANDLE_SECONDS, EASE.easeOut, timing.printStart + CANDLE_DELAY, at);
    remember(next);
    return true;
  }

  function updateBeat(time) {
    if (!beat.active) return false;
    const phase = beatPhase(time - state.beatStart, timing);
    setDrumAngle(beat.from + (beat.to - beat.from) * EASE.easeInOut(phase.stepU));
    nib.level = beat.nibFrom + (beat.nibTo - beat.nibFrom) * EASE.easeInOut(phase.printU);
    setNib();
    if (!beat.stepped && phase.stepU >= 1) {
      beat.stepped = true;
      afterStep();
      writeSession(sessionIndex());
      writeAria();
    }
    if (phase.done) {
      beat.active = false;
      if (state.mode === 'idle') return startBeat(state.beatStart + timing.period);
      return false;
    }
    return !phase.resting;
  }

  function stopBeats() {
    beat.active = false;
    clearWake();
  }

  function resumeBeats() {
    if (state.mode !== 'idle' || beat.active || arrival.active || glide.active) return;
    if (startBeat(now())) requestFrame();
  }

  function toggleBeats() {
    if (reducedMotion.matches) return;
    if (state.mode === 'frozen') { state.mode = hover.inside ? 'held' : 'idle'; resumeBeats(); }
    else {
      // An active beat finishes its step (updateBeat will not chain while frozen);
      // only an idle wake-up is cancelled.
      state.mode = 'frozen';
      if (!beat.active) clearWake();
    }
  }

  // Arrival --------------------------------------------------------------
  function startArrival(plan, at) {
    arrival.active = true;
    arrival.plan = plan;
    arrival.start = at;
    arrival.captioned = false;
    arrival.begun = false;
    chrome = 0;
    nib.scale = 0;
    nib.tween = null;
    beat.active = false;
    setDrumAngle(drumAngle(state.offset, slots, pen, aperture));
    nib.level = penItem().close;
    const window_ = windowOf(state.offset, total, slots, aperture);
    for (const item of items) {
      item.tween = null;
      item.candleTween = null;
      item.p = 0;
      item.candleP = 0;
      if (!isVisible(state.offset, item.index, slots, aperture)) { applyItem(item); continue; }
      const k = item.index - window_.first;
      const delay = plan.printFrom + k * plan.printStagger;
      item.tween = retarget(0, 1, plan.barSeconds, EASE.easeOut, delay, at);
      item.candleTween = retarget(0, 1, plan.candleSeconds, EASE.easeOut, delay + plan.candleDelay, at);
      applyItem(item);
    }
    boxes.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    // Measure the depth band and the label facings against the camera the
    // arrival ends on, so nothing changes colour when it gets there.
    placeCamera(1, 1);
    afterStep();
    placeCamera(0);
    if (captionEl) captionEl.classList.toggle('is-pending', plan.captionAt > 0);
    requestFrame();
  }

  function updateArrival(time) {
    const t = time - arrival.start;
    const plan = arrival.plan;
    placeCamera(t / plan.dollySeconds, t / plan.tiltSeconds);
    const drawn = span(t, plan.dialFrom, plan.dialTo);
    if (plan.drawRim) {
      rimGeometry.setDrawRange(0, Math.max(2, Math.round(RIM_POINTS * drawn)));
      rim.visible = drawn > 0;
    } else {
      rimMaterial.opacity = RIM_ALPHA * drawn;
    }
    if (ticks) ticks.material.opacity = TICK_ALPHA * drawn;
    gaps.material.opacity = GAP_ALPHA * drawn;
    const drawnPen = span(t, plan.penFrom, plan.penTo);
    penLine.scale.x = Math.max(drawnPen, 1e-4);
    penLine.visible = drawnPen > 0;
    nib.scale = NIB_SIZE * EASE.easeOut(span(t, plan.nibAt, plan.nibAt + NIB_POP));
    setNib();
    chrome = EASE.easeOut(span(t, plan.chromeFrom, plan.chromeTo));
    applyChrome();
    if (!arrival.captioned && t >= plan.captionAt) {
      arrival.captioned = true;
      if (captionEl) captionEl.classList.remove('is-pending');
    }
    dirty = true;
    if (t >= plan.beatAt) finishArrival(time);
    return true;
  }

  function finishArrival(time, autoBeat = true) {
    const plan = arrival.plan;
    arrival.active = false;
    placeCamera(1, 1);
    // Whatever the arrival had not printed yet is printed now.
    for (const item of items) {
      item.tween = null;
      item.candleTween = null;
      const v = isVisible(state.offset, item.index, slots, aperture) ? 1 : 0;
      item.p = v;
      item.candleP = v;
      applyItem(item);
    }
    boxes.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    rimGeometry.setDrawRange(0, RIM_POINTS);
    rimMaterial.opacity = RIM_ALPHA;
    rim.visible = true;
    if (ticks) ticks.material.opacity = TICK_ALPHA;
    gaps.material.opacity = GAP_ALPHA;
    penLine.scale.x = 1;
    penLine.visible = true;
    nib.scale = NIB_SIZE;
    chrome = 1;
    setNib();
    afterStep();
    remember(state.offset);
    if (captionEl) captionEl.classList.remove('is-pending');
    // A tab that was hidden through the arrival lands here with a stale clock,
    // so anchor the first beat to now rather than to a time long past.
    const anchor = arrival.start + plan.beatAt;
    if (autoBeat && state.mode === 'idle') startBeat(time - anchor > timing.period ? time : anchor);
  }

  // Terminal state: reduced motion, and the end of the record ------------
  function setOffset(o) {
    const next = clampOffset(o, total, slots, aperture);
    state.offset = next;
    stopBeats();
    glide.active = false;
    nib.tween = null;
    for (const item of items) {
      item.tween = null;
      item.candleTween = null;
      const v = isVisible(next, item.index, slots, aperture) ? 1 : 0;
      item.p = v;
      item.candleP = v;
      applyItem(item);
    }
    boxes.instanceMatrix.needsUpdate = true;
    wicks.instanceMatrix.needsUpdate = true;
    nib.level = penItem().close;
    nib.scale = NIB_SIZE;
    setDrumAngle(drumAngle(next, slots, pen, aperture));
    afterStep();
    writeSession(sessionIndex());
    writeAria();
    dirty = true;
  }

  function showTerminal() {
    arrival.active = false;
    chrome = 1;
    placeCamera(1, 1);
    rimGeometry.setDrawRange(0, RIM_POINTS);
    rimMaterial.opacity = RIM_ALPHA;
    rim.visible = true;
    if (ticks) ticks.material.opacity = TICK_ALPHA;
    gaps.material.opacity = GAP_ALPHA;
    penLine.scale.x = 1;
    penLine.visible = true;
    if (captionEl) captionEl.classList.remove('is-pending');
    setOffset(maxOffset);
    state.mode = 'frozen';
  }

  // Frame loop -----------------------------------------------------------
  function frame(stamp) {
    clock.frameId = 0;
    if (canvas.clientWidth !== size.width || canvas.clientHeight !== size.height) resize();
    const time = stamp / 1000;
    let busy = false;
    // A hidden or throttled tab returns with a stale beat: land it and rest,
    // never fast-forward a run of beats at frame rate.
    if (beat.active && !arrival.active && time - state.beatStart > timing.period * 2) {
      const settled = state.beatStart + timing.printEnd;
      updateBeat(settled);
      updateTweens(settled);
      state.beatStart = time - timing.printEnd;
    }
    if (arrival.active && !arrival.begun) {
      // The canvas may have been offscreen or the tab hidden since boot; the
      // arrival begins on the first frame that actually runs, not at load.
      startArrival(arrival.plan, time);
      arrival.begun = true;
    }
    if (arrival.active) busy = updateArrival(time) || busy;
    else {
      if (updateDrag(time)) busy = true;
      else if (updateGlide(time)) busy = true;
      else if (updateBeat(time)) busy = true;
    }
    if (updateTweens(time)) busy = true;
    if (updateCursor(time)) busy = true;
    if (dirty) render();
    if (busy) requestFrame();
    else if (beat.active) scheduleBeat(state.beatStart + timing.period);
  }

  function render() {
    renderer.render(scene, camera);
    dirty = false;
  }

  function canDraw() { return inView && !document.hidden; }

  function requestFrame() {
    if (!clock.frameId && canDraw()) clock.frameId = window.requestAnimationFrame(frame);
  }

  function stopFrame() {
    if (clock.frameId) window.cancelAnimationFrame(clock.frameId);
    clock.frameId = 0;
    clearWake();
  }

  function clearWake() {
    if (clock.wakeId) window.clearTimeout(clock.wakeId);
    clock.wakeId = 0;
  }

  // The rest between beats is 38% of the period and draws nothing at all.
  function scheduleBeat(at) {
    clearWake();
    if (!canDraw()) return;
    clock.wakeId = window.setTimeout(() => { clock.wakeId = 0; requestFrame(); }, Math.max(0, (at - now()) * 1000));
  }

  // Sizing ---------------------------------------------------------------
  function resize() {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
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
    dirty = true;
    requestFrame();
  }

  // Hover ----------------------------------------------------------------
  // One plane intersection and an atan2, so the mouse, the pen and the finger
  // all take the same path and no 2 px instance is ever ray-tested.
  function pickItem(event) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    ndc.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // The candle band lives in the tilted outer group, so intersect in that
    // frame rather than against a world-horizontal plane.
    outer.updateWorldMatrix(true, false);
    outerInverse.copy(outer.matrixWorld).invert();
    pickRay.copy(raycaster.ray).applyMatrix4(outerInverse);
    if (!pickRay.intersectPlane(pickPlane, pickPoint)) return null;
    const radius = Math.hypot(pickPoint.x, pickPoint.z);
    if (radius < PICK_INNER || radius > PICK_OUTER) return null;
    pickPoint.applyAxisAngle(UP, -state.R);  // outer-local → drum-local
    return itemAtSlot(slotFromLocal(pickPoint.x, pickPoint.z, slots));
  }

  function setHover(item) {
    if (hover.item === item) return;
    const at = now();
    if (hover.item) hover.item.emphasisTween = retarget(hover.item.emphasis, 0, CURSOR_FADE, EASE.easeOut, 0, at);
    hover.item = item;
    if (item) {
      item.emphasisTween = retarget(item.emphasis, 1, CURSOR_FADE, EASE.easeOut, 0, at);
      cursorLine.rotation.y = stepAngle * item.slot + state.R;
    }
    cursor.tween = retarget(cursor.value, item ? CURSOR_ALPHA : 0, CURSOR_FADE, EASE.easeOut, 0, at);
    writeSession(sessionIndex());
    requestFrame();
  }

  function clearHover() {
    hover.inside = false;
    if (hover.releaseId) { window.clearTimeout(hover.releaseId); hover.releaseId = 0; }
    setHover(null);
    if (state.mode === 'held') { state.mode = 'idle'; resumeBeats(); }
    requestFrame();
  }

  function onHoverMove(event) {
    if (event.pointerType === 'touch' || drag.captured) return;
    // A pointer already over the canvas at load gets no pointerenter.
    if (!hover.inside) { hover.inside = true; if (state.mode === 'idle') state.mode = 'held'; }
    if (Math.hypot(event.clientX - hover.x, event.clientY - hover.y) <= HOVER_SLOP) return;
    hover.x = event.clientX;
    hover.y = event.clientY;
    setHover(pickItem(event));
  }

  // Drag -----------------------------------------------------------------
  function updateDrag(time) {
    if (!drag.captured) return false;
    const wanted = clampOffset(offsetFromAngle(drag.targetR, slots, pen, aperture), total, slots, aperture);
    // A held-still drag costs nothing until the pointer moves or a crossing is due.
    if (!drag.moved && wanted === state.offset) return false;
    drag.moved = false;
    setDrumAngle(drag.targetR);
    updateLabels();
    if (wanted !== state.offset && time - drag.crossed >= CROSS_SECONDS) {
      const next = state.offset + (wanted > state.offset ? 1 : -1);
      applyWindow(state.offset, next, time, DRAG_PRINT);
      state.offset = next;
      drag.crossed = time;
      nib.tween = retarget(nib.level, items[next + count - 1].close, DRAG_PRINT, EASE.easeOut, 0, time);
      writeDepthFade();
      writeSession(sessionIndex());
      writeAria();
      remember(next);
    }
    return true;
  }

  function updateGlide(time) {
    if (!glide.active) return false;
    const u = clamp01((time - glide.start) / glide.duration);
    setDrumAngle(glide.from + (glide.to - glide.from) * DETENT_EASE(u));
    updateLabels();
    if (u >= 1) {
      glide.active = false;
      setDrumAngle(glide.to);
      afterStep();
      if (state.mode === 'idle') resumeBeats();
      return false;
    }
    return true;
  }

  // Every user-driven move lands on a tick and freezes the beat until the
  // reader gives it back.
  function goTo(o, time, duration = DETENT_SECONDS) {
    const next = clampOffset(o, total, slots, aperture);
    if (next !== state.offset) {
      applyWindow(state.offset, next, time, DRAG_PRINT);
      state.offset = next;
      remember(next);
    }
    if (hover.item && !isVisible(next, hover.item.index, slots, aperture)) setHover(null);
    glide.from = state.R;
    glide.to = drumAngle(next, slots, pen, aperture);
    glide.start = time;
    glide.duration = duration;
    glide.active = true;
    nib.tween = retarget(nib.level, items[next + count - 1].close, duration, EASE.easeInOut, 0, time);
    state.mode = 'frozen';
    stopBeats();
    writeSession(sessionIndex());
    writeAria();
    requestFrame();
  }

  // `cancelled` ends the gesture without reading it as a tap, for a pointer
  // that left the canvas or was taken away before it ever became a drag.
  function endDrag(cancelled) {
    if (!drag.down) return;
    drag.down = false;
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    canvas.style.cursor = 'grab';
    if (!drag.captured) {
      if (!cancelled) { toggleBeats(); requestFrame(); }  // a tap with no travel toggles the beat
      return;
    }
    drag.captured = false;
    // Snap to the nearest tick that still lies inside the record.
    const snapped = detentTarget(state.R, slots, pen);
    goTo(clampOffset(offsetFromAngle(snapped, slots, pen, aperture), total, slots, aperture), now());
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    if (arrival.active) finishArrival(now(), false);  // a gesture ends the performance early, frozen
    drag.id = event.pointerId;
    drag.moved = false;
    drag.down = true;
    drag.captured = false;
    drag.touch = event.pointerType === 'touch';
    drag.x0 = event.clientX;
    drag.y0 = event.clientY;
    drag.crossed = 0;
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag.down) { onHoverMove(event); return; }
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.captured) {
      // A finger must travel 12 px sideways before the page stops scrolling.
      const moved = drag.touch ? Math.abs(dx) >= TOUCH_SLOP : Math.hypot(dx, dy) >= MOUSE_SLOP;
      if (!moved) return;
      drag.captured = true;
      state.mode = 'frozen';
      stopBeats();
      glide.active = false;
      // Grip the drum where it is now, not where it was at pointerdown.
      drag.R0 = state.R;
      drag.targetR = state.R;
      drag.x0 = event.clientX;
      drag.y0 = event.clientY;
      setHover(null);
      canvas.style.cursor = 'grabbing';
      if (canvas.setPointerCapture) canvas.setPointerCapture(drag.id);
    }
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, box.width);
    let R = drag.R0 + dragAngle(dx, width, DRAG_GAIN);  // positive dx walks the near candles right
    const high = drumAngle(0, slots, pen, aperture);
    const low = drumAngle(maxOffset, slots, pen, aperture);
    if (R > high) R = high + (R - high) * RUBBER;
    else if (R < low) R = low + (R - low) * RUBBER;
    drag.targetR = R;
    drag.moved = true;
    requestFrame();
  });

  canvas.addEventListener('pointerup', (event) => { if (event.pointerId === drag.id) endDrag(false); });
  canvas.addEventListener('pointercancel', (event) => { if (event.pointerId === drag.id) endDrag(true); });
  canvas.addEventListener('lostpointercapture', (event) => { if (event.pointerId === drag.id && drag.down && drag.captured) endDrag(true); });
  window.addEventListener('blur', () => { if (drag.down) endDrag(true); });
  canvas.addEventListener('pointerleave', (event) => {
    // A captured drag keeps running outside the box; only a gesture that never
    // became one is cancelled here.
    if (drag.down && !drag.captured && event.pointerId === drag.id) endDrag(true);
    if (event.pointerType === 'touch' || !hover.inside) return;
    if (hover.releaseId) window.clearTimeout(hover.releaseId);
    hover.releaseId = window.setTimeout(clearHover, HOVER_RELEASE * 1000);
  });
  canvas.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    if (hover.releaseId) { window.clearTimeout(hover.releaseId); hover.releaseId = 0; }
    hover.inside = true;
    hover.x = event.clientX;
    hover.y = event.clientY;
    // The drum finishes the step it is in and then waits.
    if (state.mode === 'idle') state.mode = 'held';
    setHover(pickItem(event));
  });
  canvas.style.cursor = 'grab';

  // Keyboard: the canvas is a slider whose value is the session under the pen.
  canvas.addEventListener('keydown', (event) => {
    if (arrival.active && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Spacebar'].includes(event.key)) finishArrival(now(), false);
    const jump = event.shiftKey ? 5 : 1;
    let next = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = state.offset - jump;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = state.offset + jump;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maxOffset;
    else if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); toggleBeats(); return; }
    else if (event.key === 'Escape') { clearHover(); return; }
    if (next === null) return;
    event.preventDefault();
    goTo(next, now());
  });

  // Caption --------------------------------------------------------------
  function writeSource() {
    if (!sourceEl) return;
    // The phone keeps one line, so the window's opening date goes.
    sourceEl.textContent = (compact.matches || narrow.matches)
      ? `${meta.name} · ${meta.interval} · to ${series[total - 1].label} · captured ${meta.capturedAt} · not live`
      : captionLines(meta, series, slots, aperture, GLYPH_RATIO, total - 1)[0];
  }

  function writeSession(index) {
    if (!sessionEl) return;
    const line = captionLines(meta, series, slots, aperture, GLYPH_RATIO, index)[1];
    const cut = line.indexOf(' · ');
    const date = document.createElement('span');
    date.className = 'market-caption-date';
    date.textContent = cut < 0 ? line : line.slice(0, cut);
    sessionEl.textContent = '';
    sessionEl.append(date, cut < 0 ? '' : line.slice(cut));
  }

  function writeAria() {
    const row = penItem().row;
    canvas.setAttribute('aria-valuenow', String(state.offset + count - 1));
    const reading = `O ${formatPrice(row.open)}, H ${formatPrice(row.high)}, L ${formatPrice(row.low)}, C ${formatPrice(row.close)}`;
    canvas.setAttribute('aria-valuetext', `${row.label}, ${reading}`);
  }

  // Session storage: the second visit does not perform ---------------------
  function recall() {
    try {
      const seen = window.sessionStorage.getItem(STORE_SEEN) === '1';
      const parsed = Number.parseInt(window.sessionStorage.getItem(STORE_OFFSET), 10);
      return { seen, offset: Number.isFinite(parsed) ? clampOffset(parsed, total, slots, aperture) : 0 };
    } catch (error) {
      return { seen: false, offset: 0 };
    }
  }

  function remember(offset) {
    try {
      window.sessionStorage.setItem(STORE_OFFSET, String(offset));
      window.sessionStorage.setItem(STORE_SEEN, '1');
    } catch (error) {
      /* private browsing or blocked storage: the visit simply is not remembered */
    }
  }

  // Lifecycle ------------------------------------------------------------
  function onMotionPreference() {
    if (reducedMotion.matches) { stopFrame(); showTerminal(); requestFrame(); }
    else { state.mode = 'idle'; resumeBeats(); requestFrame(); }
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', onMotionPreference);
  else reducedMotion.addListener(onMotionPreference);
  function onCompactChange() {
    chromeOn = !compact.matches;
    timing = compact.matches ? TIMING.mobile : TIMING.desktop;
    if (ticks) ticks.visible = chromeOn;
    applyChrome();
    writeSource();
    requestFrame();
  }
  if (compact.addEventListener) compact.addEventListener('change', onCompactChange);
  if (narrow.addEventListener) narrow.addEventListener('change', writeSource);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFrame();
    else { resize(); requestFrame(); }
  });
  window.addEventListener('pagehide', stopFrame);
  window.addEventListener('pageshow', requestFrame);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) { dirty = true; requestFrame(); } else stopFrame();
    }).observe(canvas);
  }
  canvas.addEventListener('webglcontextlost', () => {
    // three.js allows the restore itself; show the still until it happens.
    stopFrame();
    clearWake();
    if (figure) figure.classList.remove('market-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (figure) figure.classList.add('market-ready');
    dirty = true;
    resize();
    requestFrame();
  });
  if (figure && 'ResizeObserver' in window) new ResizeObserver(resize).observe(figure);
  window.addEventListener('resize', resize, { passive: true });

  canvas.setAttribute('aria-valuemin', String(count - 1));
  canvas.setAttribute('aria-valuemax', String(total - 1));
  resize();
  if (reducedMotion.matches) showTerminal();
  else startArrival(stored.seen ? ARRIVAL.revisit : ARRIVAL.first, now());
  canvas.removeAttribute('aria-hidden');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'slider');
  canvas.setAttribute('aria-label', 'Session under the pen');
  writeAria();
  if (figure) figure.classList.add('market-ready');
  requestFrame();
  if (/[?&]debug\b/.test(window.location.search)) {
    canvas.__market = { items, camera, renderer, scene, inner, outer, dial, resize, render, state, setOffset, placeCamera, captionEl, frame, showTerminal, arrival, beat };
  }
}

// Shared line material shape: never tone-mapped, never depth-writing, so the
// dial's four opacities read as one ladder over the candles.
function lineMaterial(colour, opacity) {
  return new LineMaterial({ color: colour, linewidth: 1, transparent: true, opacity, toneMapped: false, depthWrite: false });
}

function basicLineMaterial(opacity) {
  return new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, toneMapped: false, depthWrite: false });
}

// A date label is a textured plane standing in the vertical plane that
// contains its radius, anchored at its left edge on the label ring.
function makeLabel(text, renderer) {
  const source = document.createElement('canvas');
  source.width = LABEL_WIDTH;
  source.height = LABEL_HEIGHT;
  const context = source.getContext('2d');
  context.font = LABEL_FONT;
  context.textBaseline = 'middle';
  context.fillStyle = COLOURS.accent;
  context.fillText(text, 0, LABEL_HEIGHT / 2);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const planeHeight = LABEL_EM * LABEL_HEIGHT / LABEL_FONT_PX;
  const planeWidth = planeHeight * LABEL_WIDTH / LABEL_HEIGHT;
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
  geometry.translate(planeWidth / 2, 0, 0);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, side: THREE.FrontSide, alphaTest: 0.02, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}
