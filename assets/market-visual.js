(function () {
  'use strict';

  var canvas = document.getElementById('market-canvas');
  if (!canvas) return;
  var context = canvas.getContext('2d');
  if (!context) return;

  var button = document.getElementById('market-motion');
  var status = document.getElementById('market-status');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var paused = reducedMotion.matches;
  var inView = true;
  var frameId = 0;
  var lastTime = 0;
  var elapsed = 0;
  var width = 0;
  var height = 0;
  var ratio = 1;
  var ready = false;
  var pointer = { inside: false, x: 0, y: 0, targetX: 0, targetY: 0 };
  var parallax = { x: 0, y: 0 };

  var tau = Math.PI * 2;
  var clockDate = new Date();
  var selectedCity = 'beijing';
  var clockMinute = -1;
  var clockSecond = -1;
  var cityTimes = {};
  var cities = [
    { id: 'beijing', label: 'Beijing', zone: 'Asia/Shanghai', color: '#a1cbbb' },
    { id: 'sydney', label: 'Sydney', zone: 'Australia/Sydney', color: '#c8a3a7' }
  ];
  cities.forEach(function (city) {
    city.formatter = new Intl.DateTimeFormat('en-GB', { timeZone: city.zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' });
  });

  function updateClock() {
    clockDate = new Date();
    var second = Math.floor(clockDate.getTime() / 1000);
    if (second === clockSecond) return;
    clockSecond = second;
    var minute = Math.floor(clockDate.getTime() / 60000);
    cities.forEach(function (city) {
      var parts = {};
      city.formatter.formatToParts(clockDate).forEach(function (part) { parts[part.type] = part.value; });
      cityTimes[city.id] = { hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
      if (minute !== clockMinute) {
        var time = document.getElementById('clock-' + city.id);
        var control = document.querySelector('[data-clock-city="' + city.id + '"]');
        if (time) time.textContent = parts.hour + ':' + parts.minute;
        if (control) control.setAttribute('aria-label', city.label + ', ' + parts.hour + ':' + parts.minute + ', ' + parts.timeZoneName + '. Emphasize this timeline.');
      }
    });
    clockMinute = minute;
  }
  updateClock();
  document.querySelectorAll('[data-clock-city]').forEach(function (control) {
    control.addEventListener('click', function () {
      selectedCity = control.dataset.clockCity;
      document.querySelectorAll('[data-clock-city]').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === control));
      });
      requestFrame();
    });
  });

  function updateControl(announce) {
    if (button) {
      var label = button.querySelector('[data-motion-label]');
      (label || button).textContent = paused ? 'Play' : 'Pause';
      button.setAttribute('aria-label', (paused ? 'Play' : 'Pause') + ' visualization motion');
      button.setAttribute('aria-pressed', String(paused));
    }
    if (announce && status) {
      status.textContent = paused ? 'Visualization paused. Local times continue to update.' : 'Visualization playing.';
    }
  }

  function canDraw() {
    return inView && !document.hidden && width > 0 && height > 0;
  }

  function requestFrame() {
    if (!frameId && canDraw()) frameId = window.requestAnimationFrame(frame);
  }

  function stopFrame() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    lastTime = 0;
  }

  function resize() {
    var bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    var nextWidth = Math.max(1, Math.round(width * ratio));
    var nextHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    requestFrame();
  }

  // A sequence of open measurement planes. Their signals are illustrative;
  // only the city readouts below the canvas represent live information.
  function makeProjector() {
    var elevation = 0.51 + Math.sin(elapsed * 0.13) * 0.035 + parallax.y * 0.11;
    var turn = -0.22 + Math.sin(elapsed * 0.11) * 0.14 + parallax.x * 0.21;
    var roll = -0.16;
    var ce = Math.cos(elevation), se = Math.sin(elevation);
    var ca = Math.cos(turn), sa = Math.sin(turn);
    var cr = Math.cos(roll), sr = Math.sin(roll);
    var scale = Math.min(width / 7.6, (height - 52) / 5.05);
    return function (x, y, z) {
      var rx = x * ca - y * sa;
      var ry = x * sa + y * ca;
      var depth = ry * ce - z * se;
      var vertical = -ry * se - z * ce;
      var perspective = 17 / (17 + depth);
      return {
        x: width * 0.54 + (rx * cr - vertical * sr) * scale * perspective,
        y: (height - 42) * 0.61 + (rx * sr + vertical * cr) * scale * perspective,
        depth: depth,
        scale: scale * perspective
      };
    };
  }

  function polar(angle, radius, z) {
    return [Math.sin(angle) * radius, Math.cos(angle) * radius, z || 0];
  }

  function line(project, points, color, weight, alpha) {
    var depth = 0;
    context.beginPath();
    points.forEach(function (point, index) {
      var p = project.apply(null, point);
      depth += p.depth;
      if (index === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });
    context.globalAlpha = Math.max(0.12, Math.min(1, 0.79 - depth / points.length * 0.105)) * (alpha === undefined ? 1 : alpha);
    context.strokeStyle = color;
    context.lineWidth = weight || 0.8;
    context.stroke();
    context.globalAlpha = 1;
  }

  function pointDistance(x, y, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.pow(x - a.x - t * dx, 2) + Math.pow(y - a.y - t * dy, 2);
  }

  function label(project, angle, radius, z, text, alpha) {
    var p = project.apply(null, polar(angle, radius, z));
    var q = project.apply(null, polar(angle, radius + 0.1, z));
    var rotation = Math.atan2(q.y - p.y, q.x - p.x);
    if (rotation > Math.PI / 2) rotation -= Math.PI;
    if (rotation < -Math.PI / 2) rotation += Math.PI;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(rotation);
    context.scale(1, 0.78);
    context.font = (width < 450 ? 8 : 9) + 'px "SFMono-Regular", Consolas, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(185,208,234,' + alpha + ')';
    context.fillText(text, 0, 0);
    context.restore();
  }

  function render() {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.lineJoin = 'round';
    context.lineCap = 'round';
    var project = makeProjector();
    updateClock();

    var count = 14;
    var slices = [];
    var nearest = -1, nearestDistance = 18 * 18;
    var accent = cities[selectedCity === 'beijing' ? 0 : 1].color;
    for (var i = 0; i < count; i += 1) {
      var angle = -1.40 + i / (count - 1) * Math.PI * 1.62;
      var base = 0.38 - i / (count - 1) * 0.78;
      var signal = 0.52 + Math.sin(i * 0.66 + elapsed * 0.16) * 0.23 + Math.cos(i * 1.51 + elapsed * 0.09) * 0.12;
      var roof = base + 0.22 + signal * 0.42;
      var outer = 2.40 + Math.sin(i * 0.73) * 0.30 + Math.cos(i * 0.2) * 0.16;
      var inner = 0.16 + Math.pow(Math.sin(i * 0.73), 2) * 0.26;
      // Each section exposes only the edges of a thin measurement plane.
      var points = [polar(angle, inner, base), polar(angle, outer, base),
        polar(angle, outer, roof), polar(angle, inner, roof)];
      var projected = points.map(function (point) { return project.apply(null, point); });
      var depth = projected.reduce(function (sum, p) { return sum + p.depth; }, 0) / projected.length;
      if (pointer.inside) {
        for (var edge = 0; edge < projected.length - 1; edge += 1) {
          var distance = pointDistance(pointer.x, pointer.y, projected[edge], projected[edge + 1]);
          if (distance < nearestDistance) { nearestDistance = distance; nearest = i; }
        }
      }
      slices.push({ index: i, angle: angle, base: base, roof: roof, outer: outer, signal: signal, points: points, depth: depth });
    }

    // Transparent sections stay open at the centre; there is no dial, axle or hand.
    slices.slice().sort(function (a, b) { return b.depth - a.depth; }).forEach(function (slice) {
      var a = slice.angle, r = slice.outer, b = slice.base;
      var active = slice.index === nearest;
      var terminal = slice.index === count - 1;
      var color = active ? '#edf5ff' : terminal ? accent : '#d0e0f3';
      line(project, slice.points.slice(0, 3), color, active ? 1.25 : 0.95, active ? 1 : 0.86);
      line(project, slice.points.slice(2), color, active ? 1.1 : 0.75, active ? 0.95 : 0.43);

      // Marks lie on the lower edge of the same plane, like a calibrated ruler.
      for (var tick = 0; tick < 8; tick += 1) {
        var radius = 1.21 + tick * 0.19;
        line(project, [polar(a, radius, b), polar(a, radius, b + (tick % 3 === 0 ? 0.065 : 0.035))],
          '#a4c1e0', 0.65, active ? 0.85 : 0.40);
      }
      // Sparse traces make the planes readable without covering their open interiors.
      if (slice.index % 3 === 0 || active || terminal) {
        var trace = [];
        for (var sample = 0; sample <= 10; sample += 1) {
          var u = sample / 10;
          var value = 0.12 + u * (0.37 + 0.17 * Math.sin(sample * 1.65 + slice.index * 0.68 + elapsed * 0.16));
          trace.push(polar(a, 0.82 + u * (r - 0.96), b + value * (slice.roof - b)));
        }
        line(project, trace, terminal ? accent : '#96b4d8', 0.75, active ? 0.85 : 0.42);
      }

      // Each outer staff belongs to its section, not to a surrounding clock face.
      line(project, [polar(a, r + 0.20, b - 0.015), polar(a, r + 0.20, b + 0.23)], '#b7cce6', 0.9, 0.62);
      if (slice.index % 4 === 1 || terminal) {
        label(project, a, r + 0.55, b, terminal ? 't\u2080' : 't\u2212' + (count - 1 - slice.index), 0.44);
      }
    });

    // One suspended, open signal contour connects the time sections. Its shape
    // evolves continuously through the same coordinates as the measuring planes.
    var ridge = slices.map(function (s) { return polar(s.angle, s.outer + 0.20, s.roof + 0.23); });
    line(project, ridge.slice(0, 6), '#9bbbdc', 0.7, 0.26);
    line(project, ridge.slice(7), '#9bbbdc', 0.7, 0.28);
    slices.forEach(function (s) {
      var color = s.index % 4 === 0 || s.index % 4 === 3 ? '#cf929d' : '#8fcbb4';
      var low = s.roof + 0.10;
      var high = low + 0.21 + s.signal * 0.19;
      var bodyStart = low + 0.06, bodyEnd = high - 0.06;
      var radius = s.outer + 0.20;
      line(project, [polar(s.angle, radius, low - 0.06), polar(s.angle, radius, high + 0.07)], color, 0.75, 0.9);
      line(project, [polar(s.angle, radius, bodyStart), polar(s.angle, radius, bodyEnd)], color, width < 450 ? 1.9 : 2.4, 0.92);
    });

    // A small travelling observation exposes the sequential reading direction.
    var progress = (elapsed * 0.19) % (count - 1);
    var index = Math.floor(progress), fraction = progress - index;
    var from = ridge[index], to = ridge[index + 1];
    var dot = project(from[0] + (to[0] - from[0]) * fraction,
      from[1] + (to[1] - from[1]) * fraction, from[2] + (to[2] - from[2]) * fraction);
    context.beginPath();
    context.arc(dot.x, dot.y, 1.7, 0, tau);
    context.fillStyle = '#d4e7f9';
    context.globalAlpha = Math.min(1, progress * 2, (count - 1 - progress) * 2);
    context.fill();
    context.globalAlpha = 1;

    if (!ready) {
      ready = true;
      var figure = canvas.closest('.hero-visual');
      if (figure) figure.classList.add('market-ready');
      if (button) button.hidden = false;
      var controls = document.querySelector('.clock-cities');
      if (controls) controls.hidden = false;
    }
  }

  function frame(time) {
    frameId = 0;
    if (!canDraw()) { lastTime = 0; return; }
    if (!paused) {
      var delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
      elapsed += delta;
      var easing = 1 - Math.exp(-delta * 5);
      parallax.x += (pointer.targetX - parallax.x) * easing;
      parallax.y += (pointer.targetY - parallax.y) * easing;
    }
    lastTime = time;
    render();
    if (!paused) requestFrame();
  }

  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerType === 'touch') return;
    var bounds = canvas.getBoundingClientRect();
    pointer.inside = true;
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.targetX = Math.max(-1, Math.min(1, pointer.x / width * 2 - 1));
    pointer.targetY = Math.max(-1, Math.min(1, pointer.y / height * 2 - 1));
    requestFrame();
  }, { passive: true });
  canvas.addEventListener('pointerleave', function () {
    pointer.inside = false;
    pointer.targetX = 0;
    pointer.targetY = 0;
    requestFrame();
  });

  if (button) button.addEventListener('click', function () {
    paused = !paused;
    lastTime = 0;
    updateControl(true);
    stopFrame();
    requestFrame();
  });

  function onMotionPreference(event) {
    // A new reduced-motion preference immediately stops the scene. Play is an
    // explicit, reversible opt-in; hover highlighting remains available paused.
    if (event.matches) {
      paused = true;
      stopFrame();
      updateControl(true);
      requestFrame();
    }
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', onMotionPreference);
  else reducedMotion.addListener(onMotionPreference);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopFrame();
    else requestFrame();
  });
  window.addEventListener('pagehide', stopFrame);
  window.addEventListener('pageshow', requestFrame);
  // Minute updates keep the real city clocks accurate while decorative motion is paused.
  function updatePausedClock() {
    if (paused && inView && !document.hidden) { updateClock(); requestFrame(); }
    window.setTimeout(updatePausedClock, 60000 - Date.now() % 60000 + 20);
  }
  updatePausedClock();
  window.addEventListener('resize', resize, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) requestFrame();
      else stopFrame();
    }).observe(canvas);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);

  updateControl(false);
  resize();
})();
