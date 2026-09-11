// The hero: three arcs of one instant. A year of days, a month of hours and a
// day of 5-minute bars rise from the bottom edge of the box as three
// concentric arcs; one pen at the top reads the same moment on all three. The
// data turns under the pen: the day arc steps one bar per beat through the
// captured session, the month arc creeps one hourly bar every twelve, the year
// arc holds its session. Candles are imc.com's hand — thin, flat, planted on
// their floor line — and sink toward the ground as they age.
//
// The pure model lives in market-arcs-model.mjs; this file is only three.js,
// the DOM and the clock.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { meta, year, month, day } from './market-arcs-data.mjs?v=arcs-1';
import {
  TAU, PEN, SEAM, ARCS, TIMING, CAMERA, EASE, PARALLAX,
  calendarSlots, sessionSlots, intradaySlots, bearingAt, slotFromBearing,
  priceBand, candle, ageSink, replayState, frameCamera, pickArc, barSpan,
  formatPrice, captionLines, pointerNormal, damp, clamp01
} from './market-arcs-model.mjs?v=arcs-1';

const WINDOWS = { year, month, day };
const COLOURS = { up: '#73E27F', down: '#DC7A88', accent: '#819CC6', ground: '#10294A', silver: '#c9d6e6', numeral: '#e6eef7', dim: '#7f97b5' };
const BAND = 0.5;              // each arc's own price axis, in world units: a low ribbon, not a wall
const GLYPH = [5, 5, 4.5];     // candle exaggeration per arc, outer to inner: the eye should land on the pen, not the inner arc
const CANDLE_W = 0.075;        // widest a body may be; narrower where the slots are close
const FILL = 0.55;             // share of a slot a body may fill
const WICK_W = 0.22;           // wick width as a share of the body's
const FADE = 0.72, FADE_POWER = 0.8;
const LINE_WIDTH = 1.4;        // the pen, in CSS px (LineMaterial's resolution is the logical viewport)
const ARC_ALPHA = 0.34, TICK_ALPHA = 0.26, JOINT_ALPHA = 0.5, HORIZON_ALPHA = 0.3, SEAM_ALPHA = 0.35, PEN_ALPHA = 0.75;
const TRACK_INSET = 0.2;       // the hairline runs this far inside the candles' radius
const SHIFT_X = 1.2;           // the disc sits a little right of centre, under the copy's opposite column
const LABEL_FONT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PRINT_EASE = EASE.easeOut;
const DISSOLVE = 0.4;          // s to clear the day arc before a replay
const REST = TIMING.rest;      // s the close holds before the replay
const PERF_WINDOW = 120, PERF_SLOW_MS = 40;
const HOVER_RELEASE = 0.55;    // s the caption survives a pointerleave

function boot(canvas) {
  const figure = canvas.closest('figure');
  const captionEl = figure ? figure.querySelector('.market-caption') : null;
  const sourceEl = captionEl ? captionEl.querySelector('.market-caption-source') : null;
  const sessionEl = captionEl ? captionEl.querySelector('.market-caption-session') : null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverEl = document.getElementById('market-hover');

  // Caption first, so it is right even when WebGL is not there.
  function writeCaption(key, index) {
    const [line1, line2] = captionLines(meta, WINDOWS, key, index);
    if (sourceEl) sourceEl.textContent = line1;
    if (sessionEl) {
      sessionEl.textContent = '';
      const span = document.createElement('span');
      span.className = 'market-caption-date';
      span.textContent = barSpan(key, WINDOWS[key][index]);
      sessionEl.append(span, document.createTextNode(line2.slice(barSpan(key, WINDOWS[key][index]).length)));
    }
  }
  writeCaption('day', day.length - 1);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    return;   // no WebGL: the still and the caption stand
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 2, 0.1, 200);
  const disc = new THREE.Group();     // everything that belongs to the disc; its centre is the origin
  disc.position.x = SHIFT_X;
  scene.add(disc);

  const up = new THREE.Color(COLOURS.up), down = new THREE.Color(COLOURS.down), ground = new THREE.Color(COLOURS.ground);
  const at = (r, th, y) => [r * Math.cos(th), y, -r * Math.sin(th)];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  const LOOK = new THREE.Vector3(), NDC = new THREE.Vector2();
  const lineMaterials = [];

  function lineSegments(points, alpha) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: alpha, depthWrite: false, toneMapped: false }));
  }
  function fatLine(points, alpha, width) {
    const g = new LineGeometry(); g.setPositions(points.flat());
    const material = new LineMaterial({ color: 0xffffff, linewidth: width, transparent: true, opacity: alpha, toneMapped: false, depthWrite: false });
    lineMaterials.push(material);
    return new Line2(g, material);
  }
  function label(text, em, colour, align = 'left', weight = 400) {
    const W = 1024, H = 64, px = 40;
    const source = document.createElement('canvas'); source.width = W; source.height = H;
    const c = source.getContext('2d');
    c.font = `${weight} ${px}px ${LABEL_FONT}`;
    c.textBaseline = 'middle'; c.textAlign = align; c.fillStyle = colour;
    c.fillText(text, align === 'left' ? 4 : align === 'right' ? W - 4 : W / 2, H / 2, W - 8);
    const texture = new THREE.CanvasTexture(source);
    texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false }));
    const h = em * H / px; sprite.scale.set(h * W / H, h, 1);
    sprite.center.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    let current = text;
    sprite.redraw = (next) => {   // the numerals follow the replay
      if (next === current) return;
      current = next;
      c.clearRect(0, 0, W, H);
      c.fillText(next, align === 'left' ? 4 : align === 'right' ? W - 4 : W / 2, H / 2, W - 8);
      texture.needsUpdate = true;
    };
    return sprite;
  }

  // The arcs ------------------------------------------------------------------
  const arcs = ARCS.map((spec, ai) => {
    const rows = WINDOWS[spec.key];
    const layout = spec.key === 'year' ? calendarSlots(rows) : spec.key === 'month' ? sessionSlots(rows) : intradaySlots(rows);
    const n = rows.length;
    const slotOf = (i) => layout.slotOf(i);
    const penSlot = slotOf(n - 1);                       // the terminal layout: the newest bar under the pen
    const band = priceBand(rows);
    const group = new THREE.Group();
    disc.add(group);
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const wicks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const arcLength = TAU / layout.slots * spec.radius;
    const width = Math.min(arcLength * FILL, CANDLE_W);
    const items = rows.map((row, i) => {
      const th = bearingAt(slotOf(i), penSlot, layout.slots);
      const glyph = candle(row, band, BAND, GLYPH[ai]);
      const sink = ageSink(i, n, FADE, FADE_POWER);
      const colour = (glyph.up ? up : down).clone().lerp(ground, sink);
      bodies.setColorAt(i, colour);
      wicks.setColorAt(i, colour.clone().lerp(ground, 0.15));
      return { i, row, slot: slotOf(i), theta: th, glyph, p: 1 };
    });
    const place = (item, p) => {
      const { theta: th, glyph } = item;
      E.set(0, th, 0); Q.setFromEuler(E);
      const bh = (glyph.body.y1 - glyph.body.y0) * p, wh = (glyph.wick.y1 - glyph.wick.y0) * p;
      P.set(...at(spec.radius, th, glyph.body.y0 * p + bh / 2)); S.set(width * (0.2 + 0.8 * p), Math.max(bh, 1e-4), width * (0.2 + 0.8 * p)); bodies.setMatrixAt(item.i, M.compose(P, Q, S));
      P.set(...at(spec.radius, th, glyph.wick.y0 + wh / 2)); S.set(width * WICK_W, Math.max(wh, 1e-4), width * WICK_W); wicks.setMatrixAt(item.i, M.compose(P, Q, S));
    };
    for (const item of items) place(item, 1);
    bodies.instanceMatrix.needsUpdate = true; wicks.instanceMatrix.needsUpdate = true;
    group.add(bodies, wicks);
    // The hairline track, the joints of this scale, the month names.
    const rt = spec.radius - TRACK_INSET, track = [];
    for (let i = 0; i < 240; i += 1) { const a = TAU * i / 240, b = TAU * (i + 1) / 240; track.push(at(rt, a, 0.003), at(rt, b, 0.003)); }
    group.add(lineSegments(track, ARC_ALPHA));
    const ticks = [], joints = [];
    items.forEach((item, i) => {
      let joint = false;
      if (spec.key === 'year') joint = i === 0 || rows[i].label.slice(0, 7) !== rows[i - 1].label.slice(0, 7);
      if (spec.key === 'month') joint = i === 0 || rows[i].label.slice(0, 10) !== rows[i - 1].label.slice(0, 10);
      if (spec.key === 'day') joint = i === 0 || slotOf(i) - slotOf(i - 1) > 1;   // the hour gaps the layout leaves
      if (joint) joints.push(at(rt, item.theta, 0.003), at(rt - 0.2, item.theta, 0.003));
      else if (spec.key !== 'year') ticks.push(at(rt, item.theta, 0.003), at(rt - 0.09, item.theta, 0.003));
      if (spec.key === 'year' && joint && i > 0) {
        const away = ((item.theta - PEN) % TAU + TAU) % TAU;
        if (Math.min(away, TAU - away) > 0.32) {
          const yy = rows[i].label.slice(2, 4), mo = MONTHS[+rows[i].label.slice(5, 7) - 1];
          const ml = label(`${mo} ’${yy}`, 0.15, COLOURS.dim, 'center');
          ml.position.set(...at(rt - 0.5, item.theta, 0.03)); group.add(ml);
        }
      }
    });
    if (ticks.length) group.add(lineSegments(ticks, TICK_ALPHA));
    if (joints.length) group.add(lineSegments(joints, JOINT_ALPHA));
    const bySlot = new Map(items.map((item) => [item.slot, item.i]));
    return { spec, rows, layout, n, slotOf, penSlot, band, group, bodies, wicks, items, place, width, bySlot, shown: n - 1, printing: null };
  });
  const radii = ARCS.map((a) => a.radius);
  const rOut = radii[0], rIn = radii[radii.length - 1];

  // The fixed parts: the horizon the arcs rise from, the seam, the pen and its numerals.
  disc.add(lineSegments([[-(rOut + 0.6), 0.002, 0], [rOut + 0.6, 0.002, 0]], HORIZON_ALPHA));
  const seamTheta = PEN + SEAM * TAU / arcs[0].layout.slots;   // the oldest side of the seam on the outer arc
  disc.add(lineSegments([at(rIn - TRACK_INSET - 0.15, seamTheta, 0.003), at(rOut + 0.25, seamTheta, 0.003)], SEAM_ALPHA));
  disc.add(fatLine([at(rIn - 0.35, PEN, 0.006), at(rOut + 0.35, PEN, 0.006)], PEN_ALPHA, LINE_WIDTH));
  const numerals = { price: label(formatPrice(day[day.length - 1].close), 0.2, COLOURS.numeral, 'left', 500), spans: [], names: [] };
  numerals.price.position.set(...at(rOut + 0.42, PEN - 0.01, BAND + 0.62)); disc.add(numerals.price);
  arcs.forEach((arc) => {
    const span = label(barSpan(arc.spec.key, arc.rows[arc.n - 1]), 0.13, COLOURS.silver, 'left');
    span.position.set(...at(arc.spec.radius + 0.05, PEN - 0.012, BAND + 0.26)); disc.add(span); numerals.spans.push(span);
    const name = label(`${arc.spec.name} · ${arc.spec.unit}`, 0.11, COLOURS.dim, 'right');
    name.position.set(...at(arc.spec.radius + 0.05, PEN + 0.012, BAND + 0.26)); disc.add(name); numerals.names.push(name);
  });

  // The clock ---------------------------------------------------------------
  const state = { beat: day.length - 1, phase: 'rest', phaseAt: 0 };
  const view = { az: 0, el: 0, azTarget: 0, elTarget: 0 };
  const clock = { frameId: 0, lastStamp: 0, inView: !('IntersectionObserver' in window), hidden: document.hidden, contextLost: false, dpr: Math.min(window.devicePixelRatio || 1, 2), perfFrames: 0, perfMs: 0 };
  const hover = { arc: -1, index: -1, until: 0 };
  let framing = null;

  // Apply the replay state to the arcs: rotations, which bars are printed.
  function applyBeat(beat, fraction = 0) {
    const s = replayState(beat, { day: day.length, month: month.length, year: year.length });
    const pens = { day: s.day.pen, month: s.month.pen, year: s.year.pen };
    arcs.forEach((arc) => {
      const pen = pens[arc.spec.key];
      const extra = arc.spec.key === 'month' ? s.month.fraction : 0;
      arc.group.rotation.y = (arc.penSlot - arc.slotOf(pen) - extra) * TAU / arc.layout.slots;
      const shown = pen;
      if (shown !== arc.shown) {
        for (const item of arc.items) {
          const p = item.i <= shown ? 1 : 0;
          if (p !== item.p) { item.p = p; arc.place(item, p); }
        }
        arc.bodies.instanceMatrix.needsUpdate = true; arc.wicks.instanceMatrix.needsUpdate = true;
        arc.shown = shown;
      }
    });
  }
  // The printing bar: the day arc's newest grows in over TIMING.print.
  function updatePrint(time) {
    const arc = arcs[2];
    if (!arc.printing) return;
    const u = clamp01((time - arc.printing.at) / TIMING.print);
    const item = arc.items[arc.printing.index];
    item.p = PRINT_EASE(u); arc.place(item, item.p);
    arc.bodies.instanceMatrix.needsUpdate = true; arc.wicks.instanceMatrix.needsUpdate = true;
    if (u >= 1) arc.printing = null;
  }
  function writeNumerals(beat) {
    const s = replayState(beat, { day: day.length, month: month.length, year: year.length });
    const pens = { day: s.day.pen, month: s.month.pen, year: s.year.pen };
    numerals.price.redraw(formatPrice(day[s.day.pen].close));
    arcs.forEach((arc, i) => numerals.spans[i].redraw(barSpan(arc.spec.key, arc.rows[pens[arc.spec.key]])));
  }
  function setBeat(beat, time, animate) {
    const previous = state.beat;
    state.beat = beat;
    applyBeat(beat);
    writeNumerals(beat);
    if (animate && beat === previous + 1) { const arc = arcs[2]; arc.printing = { index: beat, at: time }; const item = arc.items[beat]; item.p = 0; arc.place(item, 0); }
    if (hover.arc < 0) writeCaption('day', beat);
  }
  function showTerminal() {
    state.phase = 'rest'; state.phaseAt = performance.now() / 1000;
    for (const arc of arcs) { arc.printing = null; arc.shown = -1; }   // rebuild every bar, whatever a dissolve left
    setBeat(day.length - 1, state.phaseAt, false);
  }
  // After a stop (hidden tab, offscreen canvas, lost context) the clock resumes where it was, not where the wall clock says.
  function resume() {
    const now = performance.now() / 1000;
    if (state.phase === 'replay') state.phaseAt = now - state.beat * TIMING.beat;
    else if (state.phase === 'dissolve') { arcs[2].shown = -1; state.phase = 'replay'; state.phaseAt = now; setBeat(0, now, false); }
    else state.phaseAt = now;
    requestFrame();
  }
  function motionOn() { return !reducedMotion.matches; }
  // The replay loop: hold the close, dissolve the day, print it again bar by bar.
  function updateClock(time) {
    if (!motionOn()) return;
    if (state.phase === 'rest') {
      if (time - state.phaseAt >= REST) { state.phase = 'dissolve'; state.phaseAt = time; }
    } else if (state.phase === 'dissolve') {
      const u = clamp01((time - state.phaseAt) / DISSOLVE);
      const arc = arcs[2];
      for (const item of arc.items) { const p = 1 - u; if (item.i > 0) { item.p = p; arc.place(item, p); } }
      arc.bodies.instanceMatrix.needsUpdate = true; arc.wicks.instanceMatrix.needsUpdate = true;
      if (u >= 1) { arc.shown = -1; state.phase = 'replay'; state.phaseAt = time; setBeat(0, time, false); }
    } else if (state.phase === 'replay') {
      const target = Math.min(day.length - 1, Math.floor((time - state.phaseAt) / TIMING.beat));
      if (target > state.beat) setBeat(state.beat + 1, time, true);   // one bar per frame at most: a tab that was away catches up gently
      if (state.beat >= day.length - 1 && !arcs[2].printing) { state.phase = 'rest'; state.phaseAt = time; }
    }
    updatePrint(time);
  }

  // The camera ----------------------------------------------------------------
  function placeCamera() {
    if (!framing) return;
    const el = (framing.elevation * Math.PI / 180) + view.el;
    const az = -Math.PI / 2 + view.az;     // straight in front of the disc, looking across it at the pen
    const look = LOOK.set(SHIFT_X, 0.2, -framing.lookZ);
    const flat = framing.distance * Math.cos(el);
    camera.position.set(look.x + flat * Math.cos(az), look.y + framing.distance * Math.sin(el), look.z - flat * Math.sin(az));
    camera.lookAt(look);
  }
  function resize() {
    const box = figure ? figure.getBoundingClientRect() : canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(canvas.clientWidth || box.width)), height = Math.max(1, Math.round(canvas.clientHeight || box.height));
    renderer.setPixelRatio(clock.dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    framing = frameCamera(width, height, rOut);
    camera.fov = framing.fov; camera.updateProjectionMatrix();
    for (const material of lineMaterials) material.resolution.set(width, height);
    placeCamera();
    render();
  }

  // Pointer: a lean, and a reading of the bar under the pointer.
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function pick(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    NDC.set(2 * (clientX - box.left) / box.width - 1, 1 - 2 * (clientY - box.top) / box.height);
    raycaster.setFromCamera(NDC, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const x = hit.x - SHIFT_X, z = hit.z;
    const radius = Math.hypot(x, z);
    const ai = pickArc(radius, radii, 0.5);
    if (ai < 0) return null;
    const arc = arcs[ai];
    const theta = Math.atan2(-z, x) - arc.group.rotation.y;
    const slot = slotFromBearing(theta, arc.penSlot, arc.layout.slots);
    // the nearest occupied slot at or below this one
    for (let s = slot; s >= 0 && s > slot - 4; s -= 1) if (arc.bySlot.has(s)) { const index = arc.bySlot.get(s); return index <= arc.shown ? { arc: ai, index } : null; }
    return null;
  }
  function setHover(found, time) {
    if (found) {
      hover.arc = found.arc; hover.index = found.index; hover.until = Infinity;
      writeCaption(arcs[found.arc].spec.key, found.index);
      if (hoverEl) hoverEl.textContent = captionLines(meta, WINDOWS, arcs[found.arc].spec.key, found.index)[1];
    } else if (hover.arc >= 0) {
      hover.until = time + HOVER_RELEASE;
    }
  }
  function updateHover(time) {
    if (hover.arc >= 0 && time >= hover.until) { hover.arc = -1; hover.index = -1; writeCaption('day', state.beat); if (hoverEl) hoverEl.textContent = ''; }
  }
  canvas.addEventListener('pointermove', (event) => {
    const { nx, ny } = pointerNormal(event.clientX, event.clientY, canvas.getBoundingClientRect());
    view.azTarget = nx * PARALLAX.azimuth; view.elTarget = -ny * PARALLAX.elevation;
    setHover(pick(event.clientX, event.clientY), performance.now() / 1000);
    requestFrame();
  });
  canvas.addEventListener('pointerleave', () => { view.azTarget = 0; view.elTarget = 0; setHover(null, performance.now() / 1000); requestFrame(); });

  // Frames --------------------------------------------------------------------
  function render() {
    renderer.render(scene, camera);
    if (figure && !figure.classList.contains('market-ready')) figure.classList.add('market-ready');
  }
  function frame(stamp) {
    clock.frameId = 0;
    const time = stamp / 1000;
    const dt = clock.lastStamp ? Math.min((stamp - clock.lastStamp) / 1000, 0.1) : 0;
    clock.lastStamp = stamp;
    updateClock(time);
    updateHover(time);
    view.az = damp(view.az, view.azTarget, dt, PARALLAX.tau); view.el = damp(view.el, view.elTarget, dt, PARALLAX.tau);
    placeCamera();
    render();
    samplePerf(dt);
    const moving = motionOn() || Math.abs(view.az - view.azTarget) > 1e-4 || Math.abs(view.el - view.elTarget) > 1e-4 || (hover.arc >= 0 && hover.until !== Infinity);
    if (moving) requestFrame();
  }
  function samplePerf(dt) {
    if (dt <= 0) return;
    clock.perfFrames += 1; clock.perfMs += dt * 1000;
    if (clock.perfFrames >= PERF_WINDOW) {
      if (clock.perfMs / clock.perfFrames > PERF_SLOW_MS && clock.dpr > 1) { clock.dpr = 1; resize(); }
      clock.perfFrames = 0; clock.perfMs = 0;
    }
  }
  function canDraw() { return clock.inView && !clock.hidden && !clock.contextLost; }
  function requestFrame() { if (!clock.frameId && canDraw()) clock.frameId = window.requestAnimationFrame(frame); }
  function stopFrame() { if (clock.frameId) { window.cancelAnimationFrame(clock.frameId); clock.frameId = 0; } clock.lastStamp = 0; }

  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); clock.contextLost = true; stopFrame(); if (figure) figure.classList.remove('market-ready'); });
  canvas.addEventListener('webglcontextrestored', () => { clock.contextLost = false; resize(); resume(); });
  document.addEventListener('visibilitychange', () => { clock.hidden = document.hidden; if (clock.hidden) stopFrame(); else resume(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      clock.inView = entries.some((entry) => entry.isIntersecting);
      if (clock.inView) resume(); else stopFrame();
    }, { threshold: 0.05 }).observe(canvas);
  }
  if (figure && 'ResizeObserver' in window) new ResizeObserver(() => resize()).observe(figure);
  window.addEventListener('resize', resize);
  reducedMotion.addEventListener('change', () => { if (!motionOn()) showTerminal(); requestFrame(); });

  showTerminal();
  resize();
  requestFrame();

  if (new URLSearchParams(location.search).has('debug')) {
    canvas.__market = {
      scene, camera, renderer, disc, arcs, state, view, clock, hover, meta, windows: WINDOWS,
      frame, render, resize, showTerminal, resume, setBeat: (b) => setBeat(b, performance.now() / 1000, false), applyBeat, placeCamera, pick,
      framing: () => framing, captionEl
    };
  }
}

const canvas = document.getElementById('market-canvas');
if (canvas) boot(canvas);
