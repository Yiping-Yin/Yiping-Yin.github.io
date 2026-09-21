/** Presentation-only helpers. They never execute a strategy or edit a ledger. */
const HASH = /^[a-f0-9]{64}$/;
const cents = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new TypeError('Invalid recorded equity');
  return Math.round(value * 100);
};

/** First maximum percentage decline from a preceding high, including initial cash. */
export function drawdownRange(rows, initialEquity) {
  if (!Array.isArray(rows)) throw new TypeError('Missing recorded equity');
  let high = cents(initialEquity);
  if (high <= 0) throw new TypeError('Initial equity must be positive');
  let peak = {barIndex: 0, label: 'Start', equity: initialEquity, initial: true};
  let bestLoss = 0, bestHigh = high;
  let result = {pct: 0, amount: 0, peak: null, trough: null};
  for (const [index, row] of rows.entries()) {
    const value = cents(row?.equity);
    const point = {...row, barIndex: index};
    if (value > high || (index === 0 && value === high)) { high = value; peak = point; }
    const loss = high - value;
    // Exact cross products preserve earliest ties without floating-point noise.
    if (BigInt(loss) * BigInt(bestHigh) > BigInt(bestLoss) * BigInt(high)) {
      bestLoss = loss; bestHigh = high;
      result = {pct: loss / high * 100, amount: loss / 100, peak, trough: point};
    }
  }
  return result;
}

function publicIdentity(entry) {
  const r = entry?.result;
  const market = r?.marketKind || entry?.marketKind || entry?.market?.marketKind;
  if (entry?.published !== true || !['historical','synthetic'].includes(market) || !HASH.test(r?.runId || '') || !HASH.test(r?.datasetChecksum || '') || !Array.isArray(r?.equity) || !r.equity.length) throw new TypeError('Only an available published run can be shared');
  return {r, market};
}

/** A new URL prevents leaking query parameters, private notes or account data. */
export function replayLink(href, entry, cursor) {
  const {r, market} = publicIdentity(entry);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= r.equity.length) throw new RangeError('Invalid replay minute');
  const url = new URL('/training.html', href);
  url.search = new URLSearchParams({market}).toString();
  url.hash = '/market?' + new URLSearchParams({view:'replay', run:r.runId, tape:r.datasetChecksum, minute:String(cursor + 1)});
  return url.href;
}

/** Absent bookmarks preserve legacy cursor behaviour; bad bookmarks never clamp. */
export function readReplayMoment(href, entry) {
  const invalid = {status:'invalid'};
  try {
    const url = new URL(href);
    const [path, query = ''] = url.hash.replace(/^#/, '').split('?');
    const params = new URLSearchParams(query);
    if (!params.has('minute') && !params.has('tape')) return {status:'absent'};
    if (path !== '/market' || params.get('view') !== 'replay') return {status:'absent'};
    const {r, market} = publicIdentity(entry);
    if (url.searchParams.getAll('market').length !== 1 || url.searchParams.get('market') !== market) return invalid;
    for (const key of ['view','run','tape','minute']) if (params.getAll(key).length !== 1) return invalid;
    if (params.get('run') !== r.runId || params.get('tape') !== r.datasetChecksum) return invalid;
    const minute = params.get('minute');
    if (!/^[1-9]\d{0,5}$/.test(minute || '')) return invalid;
    const cursor = Number(minute) - 1;
    return cursor < r.equity.length ? {status:'valid',cursor} : invalid;
  } catch { return invalid; }
}
