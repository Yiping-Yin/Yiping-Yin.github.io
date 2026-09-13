(function () {
  'use strict';

  var root = document.documentElement;
  var themeButton = document.getElementById('theme');
  var themeStatus = document.getElementById('theme-status');
  var modes = ['light', 'dark', 'system'];
  var icons = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.8 6.8 0 0 0 11.1 11.1z"/></svg>'
  };
  var mode = modes.indexOf(root.dataset.theme) !== -1 ? root.dataset.theme : 'light';

  try {
    var savedMode = window.localStorage.getItem('theme');
    mode = modes.indexOf(savedMode) !== -1 ? savedMode : 'light';
  } catch (error) {
    // Theme switching still works when browser storage is unavailable.
  }

  function applyTheme(announce) {
    // 'system' is an explicit state: the stylesheet only follows the OS preference when it is set.
    root.dataset.theme = mode;

    if (themeButton) {
      var nextMode = modes[(modes.indexOf(mode) + 1) % modes.length];
      var label = 'Theme: ' + mode + '. Switch to ' + nextMode + ' theme.';
      themeButton.innerHTML = icons[mode];
      themeButton.setAttribute('aria-label', label);
      themeButton.title = label;
    }
    if (announce && themeStatus) themeStatus.textContent = 'Theme changed to ' + mode + '.';
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
    document.querySelectorAll('.sectionnav a[href^="#"], #mobile-nav a[href^="#"]'),
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
    if (topbar) topbar.classList.toggle('scrolled', scrollTop > 8);
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

  var researchTabs = document.querySelector('.research-tabs');
  var researchItems = [];
  var researchHeading = document.getElementById('research');
  var researchHeadings = { trading: 'work', ai: 'ai', agents: 'agents' };

  if (researchTabs) {
    var tabButtons = Array.prototype.slice.call(researchTabs.querySelectorAll('[data-research-tab]'));
    var candidates = tabButtons.map(function (button) {
      var panel = document.getElementById(button.getAttribute('aria-controls'));
      var heading = document.getElementById(researchHeadings[button.dataset.researchTab]);
      return panel && heading && panel.contains(heading)
        ? { button: button, panel: panel, heading: heading } : null;
    });
    // Incomplete markup keeps the fully readable, unenhanced layout.
    if (candidates.length === 3 && candidates.every(function (item) { return item; })) {
      researchItems = candidates;
    }
  }

  function activateResearch(item, updateUrl) {
    var changed = item.panel.hidden;
    var focusWouldBeHidden = researchItems.some(function (other) {
      return other !== item && other.panel.contains(document.activeElement);
    });
    researchItems.forEach(function (other) {
      var selected = other === item;
      other.button.setAttribute('aria-selected', String(selected));
      other.button.tabIndex = selected ? 0 : -1;
      other.panel.hidden = !selected;
    });
    if (focusWouldBeHidden) item.button.focus({ preventScroll: true });
    if (updateUrl) {
      try {
        window.history.replaceState(window.history.state, '', '#' + item.heading.id);
      } catch (error) {
        // Tab selection still works when history updates are unavailable.
      }
      interactionSection = researchHeading;
      interactionScrollTop = window.scrollY;
      interactionScrolling = false;
    }
    scheduleScrollUpdate();
    return changed;
  }

  function revealTarget(target) {
    if (!target) return false;
    var item = researchItems.find(function (candidate) {
      return candidate.panel === target || candidate.panel.contains(target);
    });
    var changed = item ? activateResearch(item, false) : false;
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

  if (researchItems.length) {
    researchTabs.setAttribute('role', 'tablist');
    researchItems.forEach(function (item, index) {
      item.button.setAttribute('role', 'tab');
      item.panel.setAttribute('role', 'tabpanel');
      item.panel.setAttribute('aria-labelledby', item.button.id);
      item.panel.tabIndex = 0;
      item.button.addEventListener('click', function () { activateResearch(item, true); });
      item.button.addEventListener('keydown', function (event) {
        var next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % researchItems.length;
        else if (event.key === 'ArrowLeft') next = (index + researchItems.length - 1) % researchItems.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = researchItems.length - 1;
        else return;
        event.preventDefault();
        researchItems[next].button.focus({ preventScroll: true });
        activateResearch(researchItems[next], true);
      });
    });
    var initialTarget = targetForFragment(window.location.hash);
    var initialItem = researchItems.find(function (item) {
      return initialTarget && (item.panel === initialTarget || item.panel.contains(initialTarget));
    }) || researchItems[0];
    activateResearch(initialItem, false);
    revealTarget(initialTarget);
    researchTabs.hidden = false;
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

  var menuButton = document.getElementById('menu-toggle');
  var mobileNav = document.getElementById('mobile-nav');
  var mobileViewport = window.matchMedia('(max-width: 700px)');

  function closeMenu(restoreFocus) {
    if (!menuButton || !mobileNav) return;
    if (restoreFocus && mobileNav.contains(document.activeElement)) menuButton.focus();
    mobileNav.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  }

  function syncMobileMenu() {
    if (!menuButton || !mobileNav) return;
    var moveFocus = !mobileViewport.matches &&
      (document.activeElement === menuButton || mobileNav.contains(document.activeElement));
    if (!mobileViewport.matches) closeMenu(false);
    menuButton.hidden = !mobileViewport.matches;
    if (moveFocus) {
      var desktopItem = navItems.find(function (item) {
        return !mobileNav.contains(item.link) && item.target === activeSection;
      });
      if (desktopItem) desktopItem.link.focus();
    }
  }

  if (menuButton && mobileNav) {
    menuButton.setAttribute('aria-controls', mobileNav.id);
    closeMenu(false);
    menuButton.addEventListener('click', function () {
      var opening = mobileNav.hidden;
      mobileNav.hidden = !opening;
      menuButton.setAttribute('aria-expanded', String(opening));
      scheduleScrollUpdate();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || mobileNav.hidden) return;
      event.preventDefault();
      closeMenu(false);
      menuButton.focus();
    });
    mobileNav.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest('a[href^="#"]');
      if (!link || !mobileNav.contains(link)) return;
      var target = fragmentTarget(link);
      if (!target) return;
      revealTarget(target);
      var heading = target.matches('h1, h2, h3, h4, h5, h6')
        ? target : target.querySelector('h1, h2, h3, h4, h5, h6') || target;
      heading.setAttribute('tabindex', '-1');
      closeMenu(false);
      heading.focus({ preventScroll: true });
      // Preserve native hash navigation, then keep keyboard focus on the heading.
      window.requestAnimationFrame(function () { heading.focus({ preventScroll: true }); });
    });
    syncMobileMenu();
  }

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
    syncMobileMenu();
    scheduleScrollUpdate();
  });
  window.addEventListener('load', scheduleScrollUpdate);
  root.classList.add('js');
  readAnchorOffset();
  updateScrollState();
  restoreFragment(true);
})();
