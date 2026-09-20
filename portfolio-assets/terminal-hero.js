/* P.Book terminal hero. Plain ES2020, no bundler, no dependencies.
   The pure renderers below are shared: the build-time generator evaluates this
   file in Node to emit the static final frame, and the browser bootstrap at the
   bottom drives the same functions during the replay, so the markup the page
   ships with is exactly the frame the replay ends on.
   Depth, fills and P&L are simulated; only the OHLC bars are historical. */
(function (root) {
  'use strict';

  var LEVELS_MAX = 10;
  var esc = function (value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fmt = function (value, dp) {
    var n = Number(value);
    if (!isFinite(n)) return '--';
    var body = Math.abs(n).toFixed(dp);
    var parts = body.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + parts.join('.');
  };
  var signed = function (value, dp, suffix) {
    var n = Number(value);
    if (!isFinite(n)) return '--';
    return (n >= 0 ? '+' : '') + fmt(n, dp) + (suffix || '');
  };
  var signClass = function (value) { return Number(value) >= 0 ? 'num-up' : 'num-down'; };

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  // The tape carries a single US cash session, so a fixed offset derived at
  // build time from the source labels is exact and needs no timezone database.
  var localDate = function (time, offsetMinutes) { return new Date(Number(time) + Number(offsetMinutes) * 60000); };
  var clockTime = function (time, offsetMinutes) {
    var d = localDate(time, offsetMinutes);
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  };
  var clockDate = function (time, offsetMinutes) {
    var d = localDate(time, offsetMinutes);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };

  /* ---- order book: the training runtime's construction, unchanged ---- */
  var hash = function (text) {
    var value = 2166136261;
    for (var i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
  };
  var bookAt = function (instrument, cursor) {
    var tickCents = Math.round(Number(instrument.tick) * 100);
    var bar = instrument.bars[cursor];
    var center = Math.round(bar[4] * 100 / tickCents) * tickCents;
    var levels = function (side) {
      var out = [];
      for (var level = 0; level < LEVELS_MAX; level += 1) {
        var priceCents = center + (side === 'ASK' ? 1 : -1) * (level + 1) * tickCents;
        var id = side + ':' + level;
        var quantity = priceCents > 0 ? 1 + hash(instrument.checksum + ':' + cursor + ':' + id) % 8 : 0;
        out.push({ price: Math.max(0, priceCents) / 100, quantity: Math.max(0, quantity) });
      }
      return out;
    };
    return { bar: bar, bids: levels('BID'), asks: levels('ASK') };
  };

  /* ---- chart ---- */
  var chartSVG = function (instrument, cursor, options) {
    var opts = options || {};
    var width = Math.max(220, Math.round(opts.width || 780));
    var height = Math.max(120, Math.round(opts.height || 340));
    var axisWidth = opts.compact ? 46 : 54;
    var left = 2, right = width - axisWidth, top = 8, bottom = height - 16;
    var bars = instrument.bars;
    var last = bars.length - 1;
    var summary = cursor >= last;
    var slots = summary ? bars.length : Math.max(8, Math.round(opts.window || 120));
    var start = summary ? 0 : cursor - slots + 1;
    var first = Math.max(0, start);
    var low = Infinity, high = -Infinity;
    for (var i = first; i <= cursor; i += 1) {
      if (bars[i][3] < low) low = bars[i][3];
      if (bars[i][2] > high) high = bars[i][2];
    }
    if (!isFinite(low) || !isFinite(high)) { low = bars[0][4]; high = bars[0][4]; }
    var pad = Math.max((high - low) * 0.08, 0.01);
    var lo = low - pad, hi = high + pad;
    var slot = (right - left) / slots;
    var x = function (index) { return left + (index - start + 0.5) * slot; };
    var y = function (value) { return bottom - (value - lo) / (hi - lo) * (bottom - top); };
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    var body = Math.max(1, slot * 0.62);
    var parts = [];

    parts.push('<line class="th-axis-line" x1="' + r2(left) + '" y1="' + r2(bottom) + '" x2="' + r2(right) + '" y2="' + r2(bottom) + '"/>');
    parts.push('<line class="th-axis-line" x1="' + r2(right) + '" y1="' + top + '" x2="' + r2(right) + '" y2="' + r2(bottom) + '"/>');

    var open = bars[0][1];
    if (open > lo && open < hi) {
      parts.push('<line class="th-datum" x1="' + r2(left) + '" y1="' + r2(y(open)) + '" x2="' + r2(right) + '" y2="' + r2(y(open)) + '"/>');
    }

    for (var b = first; b <= cursor; b += 1) {
      var bar = bars[b];
      var cx = x(b);
      var up = bar[4] >= bar[1];
      var yo = y(bar[1]), yc = y(bar[4]);
      parts.push('<line class="th-wick" x1="' + r2(cx) + '" y1="' + r2(y(bar[2])) + '" x2="' + r2(cx) + '" y2="' + r2(y(bar[3])) + '"/>');
      parts.push('<rect class="' + (up ? 'th-up' : 'th-down') + '" x="' + r2(cx - body / 2) + '" y="' + r2(Math.min(yo, yc)) +
        '" width="' + r2(body) + '" height="' + r2(Math.max(1, Math.abs(yo - yc))) + '"/>');
    }

    var fills = instrument.run.fills;
    for (var f = 0; f < fills.length; f += 1) {
      var fill = fills[f];
      if (fill.barIndex < first || fill.barIndex > cursor) continue;
      var fx = r2(x(fill.barIndex));
      var points;
      // The marker is clamped inside the plot box: it may never reach the axis
      // line, the price gutter or the row of time labels underneath it.
      if (fill.side === 'BUY') {
        var yl = Math.min(bottom - 7, y(bars[fill.barIndex][3]) + 4);
        points = fx + ',' + r2(yl) + ' ' + r2(fx - 4) + ',' + r2(yl + 6) + ' ' + r2(fx + 4) + ',' + r2(yl + 6);
      } else {
        var yh = Math.max(top + 7, y(bars[fill.barIndex][2]) - 4);
        points = fx + ',' + r2(yh) + ' ' + r2(fx - 4) + ',' + r2(yh - 6) + ' ' + r2(fx + 4) + ',' + r2(yh - 6);
      }
      parts.push('<polygon class="th-mark" data-th-fill="' + fill.barIndex + '" points="' + points + '"/>');
    }

    var close = bars[cursor][4];
    var tagY = y(close);
    for (var t = 0; t < 4; t += 1) {
      var ty = top + (bottom - top) * (t + 0.5) / 4;
      if (Math.abs(ty - tagY) < 17) continue;
      var value = lo + (hi - lo) * (bottom - ty) / (bottom - top);
      parts.push('<text x="' + r2(right + 7) + '" y="' + r2(ty + 3.5) + '">' + esc(fmt(value, 2)) + '</text>');
    }
    parts.push('<line class="th-last" x1="' + r2(right - 6) + '" y1="' + r2(tagY) + '" x2="' + r2(right + 2) + '" y2="' + r2(tagY) + '"/>');
    parts.push('<text class="th-last-tag" x="' + r2(right + 7) + '" y="' + r2(tagY + 3.5) + '">' + esc(fmt(close, 2)) + '</text>');

    // Time labels are every 30 minutes, the step doubling until two neighbours
    // are at least a label's width apart: on a 390-bar summary in a phone panel
    // 30 minutes would overprint, and an overprinted axis states nothing.
    var gap = opts.compact ? 40 : 58;
    var stepMinutes = 30;
    while (stepMinutes < 240 && slot * stepMinutes < gap) stepMinutes *= 2;
    for (var m = first; m <= cursor; m += 1) {
      var local = localDate(bars[m][0], instrument.utcOffsetMinutes);
      if ((local.getUTCHours() * 60 + local.getUTCMinutes()) % stepMinutes !== 0) continue;
      var lx = x(m);
      if (lx < left + gap / 2 || lx > right - gap / 2) continue;
      parts.push('<text text-anchor="middle" x="' + r2(lx) + '" y="' + r2(height - 4) + '">' +
        esc(clockTime(bars[m][0], instrument.utcOffsetMinutes)) + '</text>');
    }

    var head = titleDesc(instrument, cursor, summary, slots);
    return '<svg role="img" aria-labelledby="th-chart-title th-chart-desc" viewBox="0 0 ' + width + ' ' + height +
      '" xmlns="http://www.w3.org/2000/svg"><title id="th-chart-title">' + esc(head.title) +
      '</title><desc id="th-chart-desc">' + esc(head.desc) + '</desc>' + parts.join('') + '</svg>';
  };

  var titleDesc = function (instrument, cursor, summary, windowBars) {
    var bars = instrument.bars;
    var at = clockTime(bars[cursor][0], instrument.utcOffsetMinutes);
    var shown = summary ? bars.length : Math.min(cursor + 1, windowBars);
    return {
      title: instrument.name + ' one-minute candlesticks, ' + instrument.sessionLabel + ', replayed to ' + at + ' ' + instrument.tz,
      // No venue is named: ^GSPC is an index and AAPL/MSFT/NVDA are NASDAQ
      // listings, so the exchange this description used to claim was false
      // wherever it appeared - in the visible disclosure (B7) and here, in what
      // a screen reader reads for the one hero element with role="img".
      desc: 'Historical one-minute open, high, low and close from ' + instrument.source + ' for the ' + instrument.sessionLabel +
        ' session. The window ends on the replay cursor at ' + at + ' ' + instrument.tz + ' and shows ' + shown +
        ' completed bars. Triangles mark the simulated fills of the published run "' + instrument.run.title +
        '"; the dotted line is the session open. Depth, fills and profit and loss are simulated by P.Book, not observed.'
    };
  };

  /* ---- panels ---- */
  var ladder = function (instrument, cursor, levels) {
    var book = bookAt(instrument, cursor);
    var rows = [];
    for (var a = levels - 1; a >= 0; a -= 1) {
      rows.push('<tr' + (a === 0 ? ' class="th-ask-edge"' : '') + '><td class="th-bid-col"></td><th scope="row" class="th-price-col">' + fmt(book.asks[a].price, 2) +
        '</th><td class="th-ask-col num-signed num-down">' + book.asks[a].quantity + '</td></tr>');
    }
    for (var d = 0; d < levels; d += 1) {
      rows.push('<tr><td class="th-bid-col num-signed num-up">' + book.bids[d].quantity +
        '</td><th scope="row" class="th-price-col">' + fmt(book.bids[d].price, 2) + '</th><td class="th-ask-col"></td></tr>');
    }
    return {
      rows: rows.join(''),
      spread: fmt(book.asks[0].price - book.bids[0].price, 2),
      mid: fmt((book.asks[0].price + book.bids[0].price) / 2, 2)
    };
  };

  var tapeRows = function (instrument, cursor) {
    var fills = instrument.run.fills.filter(function (fill) { return fill.barIndex <= cursor; }).slice(-3).reverse();
    var rows = [];
    for (var i = 0; i < 3; i += 1) {
      var fill = fills[i];
      if (!fill) { rows.push('<tr><th scope="row">--</th><td>--</td><td>--</td><td class="th-reason">--</td></tr>'); continue; }
      rows.push('<tr><th scope="row">' + clockTime(instrument.bars[fill.barIndex][0], instrument.utcOffsetMinutes) +
        '</th><td>' + esc(fill.side) + '</td><td>' + fill.quantity + ' @ ' + fmt(fill.price, 2) +
        '</td><td class="th-reason">' + esc(fill.reason) + '</td></tr>');
    }
    return rows.join('');
  };

  var stripValues = function (instrument, cursor) {
    var row = instrument.run.equityRows[cursor];
    var pnl = row[0] - instrument.run.metrics.initialEquity;
    return {
      position: String(row[2]),
      last: fmt(instrument.bars[cursor][4], 2),
      cash: fmt(row[1], 2),
      pnl: signed(pnl, 2),
      pnlClass: signClass(pnl)
    };
  };

  var clockMarkup = function (instrument, cursor) {
    var time = instrument.bars[cursor][0], offset = instrument.utcOffsetMinutes;
    return '<span class="th-clock-date" data-th-cdate>' + esc(clockDate(time, offset)) + '</span>' +
      '<span class="th-clock-sep" data-th-csep> \u00b7 </span>' +
      '<span data-th-ctime>' + esc(clockTime(time, offset)) + ' ' + esc(instrument.tz) + '</span>';
  };

  /* ---- the replay handoff ----
     The hero's single link hands the desk the run the hero is showing. The
     build-time frame and every later tab switch compose it here, so the static
     markup and the runtime can never disagree about which run is offered. */
  var replayHref = function (instrument) {
    return '/training.html?market=historical#/market?view=replay&run=' + instrument.run.runId;
  };

  var tabValues = function (payload, cursor) {
    return payload.instruments.map(function (instrument) {
      var close = instrument.bars[cursor][4];
      var change = (close / instrument.bars[0][1] - 1) * 100;
      return { symbol: instrument.symbol, price: fmt(close, 2), delta: signed(change, 2, '%'), deltaClass: signClass(change) };
    });
  };

  // The tab strip is a scroll container (A11Y-01), so below about 366 CSS px
  // the last tab lies outside the scrollport. Keyboard navigation moved the
  // selection and the focus ring there without moving the scrollport: at
  // 320x568 the End key left the NVDA tab selected and focused with 7.91px of
  // hit-testable width and its ring 44.72px outside the strip - hard rule 7 on
  // both counts. Selecting a tab now brings it into view. Only the strip is
  // scrolled, never the page or any other ancestor, and only when the strip
  // actually overflows; `pad` matches the strip's own scroll-padding, which is
  // the room the :focus-visible ring needs.
  var REVEAL_PAD = 4;
  var revealIn = function (strip, tab, pad) {
    if (!strip || !tab) return;
    var room = pad === undefined ? REVEAL_PAD : pad;
    if (strip.scrollWidth <= strip.clientWidth + 1) return;
    var t = tab.getBoundingClientRect(), s = strip.getBoundingClientRect();
    if (t.left < s.left + room) strip.scrollLeft += t.left - s.left - room;
    else if (t.right > s.right - room) strip.scrollLeft += t.right - s.right + room;
  };

  var TH = {
    esc: esc, fmt: fmt, signed: signed, signClass: signClass,
    clockTime: clockTime, clockDate: clockDate,
    bookAt: bookAt, chartSVG: chartSVG, titleDesc: titleDesc,
    ladder: ladder, tapeRows: tapeRows, stripValues: stripValues, tabValues: tabValues,
    clockMarkup: clockMarkup, replayHref: replayHref, revealIn: revealIn, REVEAL_PAD: REVEAL_PAD
  };

  if (typeof module === 'object' && module && module.exports) { module.exports = TH; return; }
  if (!root || !root.document) return;

  /* ---- browser bootstrap ---- */
  var doc = root.document;
  var section = doc.getElementById('about');
  var dataNode = doc.getElementById('terminal-hero-data');
  if (!section || !dataNode) return;
  var payload;
  try { payload = JSON.parse(dataNode.textContent); } catch (error) { return; }
  if (!payload || !payload.instruments || !payload.instruments.length) return;

  var pick = function (name) { return section.querySelector('[data-th="' + name + '"]'); };
  var els = {
    tabs: Array.prototype.slice.call(section.querySelectorAll('[role="tab"]')),
    panel: pick('panel'), play: pick('play'), chart: pick('chart'),
    clockDate: section.querySelector('[data-th-cdate]'), clockTime: section.querySelector('[data-th-ctime]'),
    tape: pick('tape-body'), ladder: pick('ladder-body'), bookHead: pick('book-head'),
    spread: pick('spread'), mid: pick('mid'), live: pick('live'),
    position: pick('position'), last: pick('last'), cash: pick('cash'), pnl: pick('pnl'),
    book: section.querySelector('.th-book-panel'), bookFoot: section.querySelector('.th-book-foot'),
    strip: section.querySelector('.th-strip'), tapeTable: section.querySelector('.th-tape'),
    tabStrip: section.querySelector('.th-tabs'),
    handoff: section.querySelector('.th-footer a')
  };
  if (!els.chart || !els.tabs.length) return;

  var reduceQuery = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var phoneQuery = root.matchMedia ? root.matchMedia('(max-width: 700px)') : null;
  var tabletQuery = root.matchMedia ? root.matchMedia('(max-width: 1000px)') : null;
  var reduced = function () { return !!(reduceQuery && reduceQuery.matches); };
  var phone = function () { return !!(phoneQuery && phoneQuery.matches); };
  var stacked = function () { return !!(tabletQuery && tabletQuery.matches); };
  // Beside the chart the depth costs the chart nothing, and at desktop width the
  // column had room for two more levels a side than it showed (CR-09). The
  // stacked bands are unchanged: there every level is a level the chart loses.
  var maxLevels = function () { return phone() ? 4 : (stacked() ? 5 : 8); };
  var windowBars = function () { return phone() ? payload.phoneWindowBars : payload.windowBars; };

  /* The ladder is sized to the room it has, not to the band it is in.
     Below 1000px the book sits UNDER the chart in an `auto` grid row, so every
     ladder level it keeps is a level the chart loses; at ordinary window
     heights a fixed depth leaves the chart - the subject of the hero - a
     sliver. So the depth is solved for, from measurements taken in the page:
     the chart is served first, down to a floor, and the book takes what is
     left, between MIN_LEVELS and the band's maximum. Beside the chart (above
     1000px) the depth costs the chart nothing and the only question is whether
     the ladder overruns its own column, which the same solver answers.
     Every input below is independent of the current depth - the main panel's
     height, the strip, the tape, one row's height and the book's fixed
     furniture - so the solver is a pure function of the viewport and cannot
     oscillate against the resize observer that calls it. */
  var MIN_LEVELS = 2;
  var CHART_FLOOR_PX = 160;
  var PHONE_CHART_SHARE = 0.55;
  var levels = maxLevels();
  var footDropped = false;

  var refit = function () {
    if (!els.panel || !els.ladder || !els.book || !els.ladder.rows || !els.ladder.rows.length) return;
    section.classList.remove('th-no-foot');
    var mainHeight = els.panel.clientHeight;
    // Desktop stretches the table through the book's available track. Feeding
    // that stretched row height back into this depth solver would make the
    // selected depth affect its own next input and could oscillate on relayout.
    // Read the cell's intrinsic line and padding metrics there; stacked books
    // remain content-sized and keep their established rendered measurement.
    var rowHeight = els.ladder.rows[0].getBoundingClientRect().height;
    if (!stacked()) {
      var sampleCell = els.ladder.rows[0].cells && els.ladder.rows[0].cells[0];
      var sampleStyle = sampleCell ? root.getComputedStyle(sampleCell) : null;
      var line = sampleStyle ? parseFloat(sampleStyle.lineHeight) : 0;
      var padding = sampleStyle ? (parseFloat(sampleStyle.paddingTop) || 0) + (parseFloat(sampleStyle.paddingBottom) || 0) : 0;
      if (line > 0) rowHeight = line + padding;
    }
    if (!(mainHeight > 0) || !(rowHeight > 0)) { if (footDropped) section.classList.add('th-no-foot'); return; }
    // Everything in the book that is not a ladder level: the head, the column
    // header row, the Spread/Mid rows and the panel's own borders. Summing the
    // parts rather than subtracting from the panel's box is what makes this
    // right beside the chart too, where the column is stretched to the main
    // panel and its box says nothing about what the ladder actually needs.
    var footHeight = els.bookFoot ? els.bookFoot.getBoundingClientRect().height : 0;
    var headHeight = els.bookHead ? els.bookHead.getBoundingClientRect().height : 0;
    var table = els.ladder.parentNode;
    var headRow = table && table.tHead && table.tHead.rows.length ? table.tHead.rows[0].getBoundingClientRect().height : rowHeight;
    var edges = root.getComputedStyle(els.book);
    var furniture = headHeight + headRow + footHeight +
      (parseFloat(edges.borderTopWidth) || 0) + (parseFloat(edges.borderBottomWidth) || 0);
    var ceiling = maxLevels();
    var chosen = 0;
    var drop = false;

    if (!stacked()) {
      chosen = ceiling;
      while (chosen > MIN_LEVELS && furniture + rowHeight * 2 * chosen > mainHeight) chosen -= 1;
    } else {
      var heroHeight = section.getBoundingClientRect().height;
      var stripHeight = els.strip ? els.strip.getBoundingClientRect().height : 0;
      var tapeHeight = els.tapeTable ? els.tapeTable.getBoundingClientRect().height : 0;
      var floor = Math.max(CHART_FLOOR_PX, phone() ? PHONE_CHART_SHARE * heroHeight : 0);
      var deepest = function (fixed) {
        for (var level = ceiling; level >= MIN_LEVELS; level -= 1) {
          var book = fixed + rowHeight * 2 * level;
          var chart = mainHeight - stripHeight - tapeHeight - book;
          // The chart clears its floor and is never smaller than the book
          // stacked under it: the hero is a chart with a book, not the reverse.
          if (chart >= floor && chart >= book) return level;
        }
        return 0;
      };
      chosen = deepest(furniture);
      if (!chosen && footHeight > 0) { chosen = deepest(furniture - footHeight); drop = chosen > 0; }
      if (!chosen) { chosen = MIN_LEVELS; drop = footHeight > 0; }
      // --th-chart-floor is the stylesheet's no-script backstop. If it would
      // bind here the grid would clip the book instead of the ladder shedding,
      // so shed past the usual minimum rather than show a truncated panel.
      var floorPx = parseFloat(root.getComputedStyle(section).getPropertyValue('--th-chart-floor')) || 0;
      var fixed = furniture - (drop ? footHeight : 0);
      while (chosen > 1 && mainHeight - (fixed + rowHeight * 2 * chosen) < floorPx) chosen -= 1;
    }

    if (drop) section.classList.add('th-no-foot');
    if (chosen === levels && drop === footDropped) return;
    levels = chosen;
    footDropped = drop;
    render();
  };

  var index = Math.max(0, payload.instruments.map(function (i) { return i.symbol; }).indexOf(payload.defaultSymbol));
  var state = { index: index, cursor: 0, wanted: false, hold: 0, visible: true };
  var current = function () { return payload.instruments[state.index]; };
  var lastBar = function () { return current().bars.length - 1; };
  var timer = null;

  var renderChart = function () {
    var instrument = current();
    var box = els.chart.getBoundingClientRect();
    els.chart.innerHTML = chartSVG(instrument, state.cursor, {
      width: box.width || 780, height: box.height || 340, window: windowBars(), compact: phone()
    });
  };
  var renderPanels = function () {
    var instrument = current();
    var rungs = ladder(instrument, state.cursor, levels);
    if (els.ladder) els.ladder.innerHTML = rungs.rows;
    if (els.spread) els.spread.textContent = rungs.spread;
    if (els.mid) els.mid.textContent = rungs.mid;
    if (els.bookHead) els.bookHead.textContent = 'Order book · ' + instrument.label;
    if (els.tape) els.tape.innerHTML = tapeRows(instrument, state.cursor);
    var strip = stripValues(instrument, state.cursor);
    if (els.position) els.position.textContent = strip.position;
    if (els.last) els.last.textContent = strip.last;
    if (els.cash) els.cash.textContent = strip.cash;
    if (els.pnl) { els.pnl.textContent = strip.pnl; els.pnl.className = 'num-signed ' + strip.pnlClass; }
    var values = tabValues(payload, state.cursor);
    els.tabs.forEach(function (tab, position) {
      var price = tab.querySelector('[data-th-price]'), delta = tab.querySelector('[data-th-delta]');
      if (price) price.textContent = values[position].price;
      if (delta) { delta.textContent = values[position].delta; delta.className = 'num-signed ' + values[position].deltaClass; }
    });
    if (els.clockDate) els.clockDate.textContent = clockDate(instrument.bars[state.cursor][0], instrument.utcOffsetMinutes);
    if (els.clockTime) els.clockTime.textContent = clockTime(instrument.bars[state.cursor][0], instrument.utcOffsetMinutes) + ' ' + instrument.tz;
    if (els.handoff) els.handoff.setAttribute('href', replayHref(instrument));
    section.setAttribute('data-th-cursor', String(state.cursor));
    section.setAttribute('data-th-symbol', instrument.symbol);
    section.setAttribute('data-th-levels', String(levels));
  };
  var render = function () { renderChart(); renderPanels(); };

  var updatePlay = function () {
    if (!els.play) return;
    els.play.setAttribute('aria-pressed', state.wanted ? 'true' : 'false');
    els.play.setAttribute('aria-label', state.wanted ? 'Pause the replay' : 'Play the replay');
    var glyph = els.play.querySelector('[data-th-glyph]');
    if (glyph) glyph.textContent = state.wanted ? '\u23f8' : '\u25b6';
  };
  var announce = function (message) { if (els.live) els.live.textContent = message; };

  var step = function () {
    var instrument = current(), end = lastBar();
    if (state.hold) {
      if (Date.now() < state.hold) return;
      state.hold = 0;
      state.cursor = instrument.run.startCursor;
      render();
      return;
    }
    if (state.cursor >= end) { state.hold = Date.now() + 3000; return; }
    state.cursor += 1;
    render();
    if (state.cursor >= end) state.hold = Date.now() + 3000;
  };
  var sync = function () {
    var running = state.wanted && state.visible && !doc.hidden;
    if (running && !timer) timer = root.setInterval(step, reduced() ? 1000 : 250);
    if (!running && timer) { root.clearInterval(timer); timer = null; }
  };

  // Keeps the selected tab inside the scrolling strip; see revealIn above.
  var reveal = function (tab) { revealIn(els.tabStrip, tab); };

  var select = function (position, focus) {
    if (position === state.index) return;
    state.index = position;
    state.hold = 0;
    state.cursor = (reduced() && !state.wanted) ? lastBar() : current().run.startCursor;
    els.tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', i === position ? 'true' : 'false');
      tab.tabIndex = i === position ? 0 : -1;
    });
    if (els.panel) els.panel.setAttribute('aria-labelledby', els.tabs[position].id);
    if (focus) els.tabs[position].focus();
    reveal(els.tabs[position]);
    render();
    announce(current().label + ' selected.');
  };

  els.tabs.forEach(function (tab, position) {
    tab.addEventListener('click', function () { select(position, false); });
    tab.addEventListener('keydown', function (event) {
      var key = event.key, next = -1;
      if (key === 'ArrowRight' || key === 'ArrowDown') next = (position + 1) % els.tabs.length;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (position - 1 + els.tabs.length) % els.tabs.length;
      else if (key === 'Home') next = 0;
      else if (key === 'End') next = els.tabs.length - 1;
      if (next < 0) return;
      event.preventDefault();
      select(next, true);
    });
  });
  if (els.play) {
    els.play.addEventListener('click', function () {
      state.wanted = !state.wanted;
      if (state.wanted && state.cursor >= lastBar() && !state.hold) state.cursor = current().run.startCursor;
      updatePlay();
      announce(state.wanted ? 'Replay playing.' : 'Replay paused.');
      render();
      sync();
    });
  }
  doc.addEventListener('visibilitychange', sync);
  if (root.IntersectionObserver) {
    new root.IntersectionObserver(function (entries) {
      state.visible = entries[entries.length - 1].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(section);
  }
  // The chart is redrawn at its new size, and the ladder is re-solved for the
  // new room, whenever either could have changed.
  var relayout = function () { refit(); renderChart(); };
  if (root.ResizeObserver) {
    var pending = false;
    var observer = new root.ResizeObserver(function () {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(function () { pending = false; relayout(); });
    });
    observer.observe(els.chart);
    if (els.panel) observer.observe(els.panel);
  } else if (root.addEventListener) {
    root.addEventListener('resize', relayout);
  }

  state.wanted = !reduced();
  state.cursor = state.wanted ? current().run.startCursor : lastBar();
  updatePlay();
  render();
  refit();
  // A reload at 320px must not open with the selected tab off the scrollport.
  reveal(els.tabs[state.index]);
  sync();
  root.__terminalHero = { state: state, payload: payload, render: render };
}(typeof window !== 'undefined' ? window : null));
