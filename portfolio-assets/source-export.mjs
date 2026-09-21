/** Public-only source export. Never executes Python or reads saved drafts. */
export function sourceFilename(task) {
  const slug = String(task || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return `pbook-${slug || 'strategy'}.py`;
}

export function downloadPythonSource(source, task, env = globalThis) {
  if (typeof source !== 'string') throw new TypeError('Current editor source is unavailable.');
  if (!env.Blob || !env.URL?.createObjectURL || !env.URL?.revokeObjectURL) {
    throw new Error('This browser cannot create a source download.');
  }
  const blob = new env.Blob([source], { type: 'text/x-python;charset=utf-8', endings: 'transparent' });
  const url = env.URL.createObjectURL(blob);
  let anchor;
  try {
    anchor = env.document.createElement('a');
    anchor.href = url;
    anchor.download = sourceFilename(task);
    anchor.hidden = true;
    env.document.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    if (anchor) anchor.remove();
    env.URL.revokeObjectURL(url);
    throw error;
  }
  anchor.remove();
  // Keep the URL alive while the browser accepts the download request.
  env.setTimeout(() => env.URL.revokeObjectURL(url), 60_000);
  return anchor.download;
}

/**
 * Progressive enhancement for the published IDE's existing textarea interface.
 * Read its live value on activation, not its original source or localStorage.
 * The public React bundles and the private/local runtime are left untouched.
 */
export function installSourceExport(doc = document) {
  const root = doc.getElementById('root');
  if (!root) return () => {};
  const view = doc.defaultView;
  function ensureControls() {
    root.querySelectorAll('section.ev-source-column[role="tabpanel"]').forEach(pane => {
      const editor = pane.querySelector('textarea[aria-label="Edit Python strategy source"]');
      const digest = pane.querySelector('.ev-digest');
      if (!editor || !digest || pane.querySelector('[data-p1-source-export]')) return;
      const tools = doc.createElement('div');
      tools.className = 'p1-source-export';
      tools.setAttribute('data-p1-source-export', '');
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = 'Download .py';
      button.setAttribute('aria-label', 'Download .py');
      const hint = doc.createElement('p');
      hint.className = 'p1-export-hint';
      hint.textContent = 'Exports the current editor text. Published results still belong to the original source.';
      const status = doc.createElement('p');
      status.className = 'p1-export-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      button.addEventListener('click', () => {
        try {
          const current = pane.querySelector('textarea[aria-label="Edit Python strategy source"]');
          if (!current) throw new Error('Current editor source is unavailable.');
          const task = (pane.getAttribute('aria-labelledby') || '').replace(/^ev-tab-/, '');
          const filename = downloadPythonSource(current.value, task, view);
          status.textContent = `Download requested: ${filename}. Your draft and published runs are unchanged.`;
          status.removeAttribute('data-error');
        } catch (error) {
          status.textContent = `Download could not start. ${error.message} Your editor text is unchanged; you can copy it or retry.`;
          status.setAttribute('data-error', 'true');
        }
      });
      tools.append(button, hint, status);
      digest.insertAdjacentElement('afterend', tools);
    });
  }
  ensureControls();
  const observer = new view.MutationObserver(ensureControls);
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

if (typeof document !== 'undefined') installSourceExport(document);
