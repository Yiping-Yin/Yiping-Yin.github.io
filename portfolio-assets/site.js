(function () {
  'use strict';

  var root = document.documentElement;
  var themeButton = document.getElementById('theme');
  var themeStatus = document.getElementById('theme-status');
  // 'system' first: the ground follows the operating system until a visitor
  // chooses otherwise. This list and the pre-paint script in source.html are
  // the only two places a default is written, and they write the same word.
  var modes = ['system', 'light', 'dark'];
  var words = { system: 'Auto', light: 'Light', dark: 'Dark' };
  var says = {
    system: 'Appearance: Auto, following the system. Switch to Light.',
    light: 'Appearance: Light. Switch to Dark.',
    dark: 'Appearance: Dark. Switch to Auto, following the system.'
  };
  // One 24x24 grid, two stroke weights, no fill: a circle half ruled (Auto),
  // an open circle with rays (Light), a closed arc (Dark).
  var icons = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/><path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" aria-hidden="true" focusable="false"><path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1z"/></svg>'
  };
  // The pre-paint script already resolved the mode; trust it, and only let
  // storage speak when it holds one of the three modes. The second, silent
  // fallback that used to live here overrode the pre-paint script entirely.
  var mode = modes.indexOf(root.dataset.theme) !== -1 ? root.dataset.theme : 'system';
  try {
    var savedMode = window.localStorage.getItem('theme');
    if (modes.indexOf(savedMode) !== -1) mode = savedMode;
  } catch (error) {
    // Theme switching still works when browser storage is unavailable.
  }

  function applyTheme(announce) {
    // 'system' is an explicit state: the stylesheet only follows the OS
    // preference when it is set.
    root.dataset.theme = mode;
    if (themeButton) {
      themeButton.innerHTML = icons[mode];
      themeButton.setAttribute('aria-label', says[mode]);
      themeButton.title = says[mode];
    }
    if (announce && themeStatus) themeStatus.textContent = 'Appearance: ' + words[mode] + '.';
  }

  applyTheme(false);
  if (themeButton) {
    themeButton.addEventListener('click', function () {
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      applyTheme(true);
      try {
        window.localStorage.setItem('theme', mode);
      } catch (error) {
        // Keep the selected theme for this page even if it cannot be saved.
      }
    });
    themeButton.hidden = false;
  }

  function targetForFragment(fragment) {
    if (!fragment || fragment.charAt(0) !== '#' || fragment.length < 2) return null;
    try {
      return document.getElementById(decodeURIComponent(fragment.slice(1)));
    } catch (error) {
      return null;
    }
  }

  function fragmentTarget(link) {
    return targetForFragment(link.getAttribute('href'));
  }

  var navItems = Array.prototype.map.call(
    document.querySelectorAll('.sectionnav a[href^="#"]'),
    function (link) { return { link: link, target: fragmentTarget(link) }; }
  ).filter(function (item) { return item.target; });
  var sections = [];
  navItems.forEach(function (item) {
    if (sections.indexOf(item.target) === -1) sections.push(item.target);
  });
  sections.sort(function (a, b) {
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  var topbar = document.getElementById('topbar');
  var framePending = false;
  var anchorOffset = 100;
  var activeSection = null;
  var interactionSection = null;
  var interactionScrollTop = 0;
  var interactionScrolling = false;

  function readAnchorOffset() {
    var value = parseFloat(window.getComputedStyle(root).getPropertyValue('--anchor-offset'));
    anchorOffset = Number.isFinite(value) && value >= 0 ? value : 100;
  }

  function trackFragmentNavigation(target) {
    interactionSection = sections.indexOf(target) !== -1 ? target : null;
    interactionScrolling = !!interactionSection;
    if (!interactionSection) return;
    var margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
    var maxScroll = Math.max(root.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    interactionScrollTop = Math.max(0, Math.min(maxScroll,
      window.scrollY + target.getBoundingClientRect().top - anchorOffset - margin));
  }

  function releaseScrollInteraction() {
    interactionSection = null;
    interactionScrolling = false;
    scheduleScrollUpdate();
  }

  function updateScrollState() {
    framePending = false;
    var scrollTop = window.scrollY;
    if (topbar) topbar.toggleAttribute('data-scrolled', scrollTop > 8);
    if (!sections.length) return;

    var current = sections[0];
    sections.forEach(function (section) {
      if (!section.getClientRects().length) return;
      // Native anchors combine the root scroll padding with the target's margin.
      var margin = parseFloat(window.getComputedStyle(section).scrollMarginTop) || 0;
      if (section.getBoundingClientRect().top <= anchorOffset + margin + 1) current = section;
    });

    var pageHeight = Math.max(root.scrollHeight, document.body.scrollHeight);
    var maxScroll = pageHeight - window.innerHeight;
    // A short final section may never reach the bar; a page that fits is not scrolled.
    if (maxScroll > 4 && scrollTop > 0 && scrollTop >= maxScroll - 2) {
      current = sections[sections.length - 1];
    }
    var atInteractionTarget = Math.abs(scrollTop - interactionScrollTop) <= 2;
    if (interactionScrolling && atInteractionTarget) interactionScrolling = false;
    // Keep an explicit anchor selected through smooth scrolling and its clamped
    // landing point. Subsequent scrolling returns control to the scrollspy.
    if (interactionSection && (interactionScrolling || atInteractionTarget)) {
      current = interactionSection;
    } else {
      interactionSection = null;
    }
    if (current === activeSection) return;
    activeSection = current;
    navItems.forEach(function (item) {
      var active = item.target === current;
      item.link.classList.toggle('on', active);
      if (active) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  }

  function scheduleScrollUpdate() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateScrollState);
  }

  function revealTarget(target) {
    if (!target) return false;
    var changed = false;
    var ancestor = target;
    while (ancestor) {
      if (ancestor.tagName === 'DETAILS' && !ancestor.open) {
        ancestor.open = true;
        changed = true;
      }
      ancestor = ancestor.parentElement;
    }
    return changed;
  }

  function restoreFragment(forceScroll) {
    var target = targetForFragment(window.location.hash);
    var changed = revealTarget(target);
    trackFragmentNavigation(target);
    if (target && (forceScroll || changed)) {
      window.requestAnimationFrame(function () {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        scheduleScrollUpdate();
      });
    }
    scheduleScrollUpdate();
  }

  // Reveal same-page targets before the browser performs native anchor scrolling.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    var url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (error) {
      return;
    }
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search) return;
    var target = targetForFragment(url.hash);
    revealTarget(target);
    trackFragmentNavigation(target);
    scheduleScrollUpdate();
  }, true);

  document.addEventListener('toggle', function (event) {
    if (event.target.tagName === 'DETAILS') scheduleScrollUpdate();
  }, true);

  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('wheel', releaseScrollInteraction, { passive: true });
  window.addEventListener('touchmove', releaseScrollInteraction, { passive: true });
  window.addEventListener('pointerdown', function (event) {
    if (event.target === root) releaseScrollInteraction();
  }, { passive: true });
  window.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(event.key) === -1) return;
    var target = event.target;
    if (target.isContentEditable || target.closest('input, textarea, select')) return;
    if (event.key === ' ' && target.closest('button, summary, [role="tab"]')) return;
    releaseScrollInteraction();
  });
  window.addEventListener('hashchange', function () { restoreFragment(false); });
  window.addEventListener('resize', function () {
    readAnchorOffset();
    scheduleScrollUpdate();
  });
  window.addEventListener('load', scheduleScrollUpdate);
  var printOpened = [];
  window.addEventListener('beforeprint', function () {
    printOpened = [];
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (item) {
      printOpened.push(item);
      item.open = true;
    });
  });
  window.addEventListener('afterprint', function () {
    printOpened.forEach(function (item) { item.open = false; });
    printOpened = [];
  });
  root.classList.add('js');
  readAnchorOffset();
  updateScrollState();
  restoreFragment(true);
})();
