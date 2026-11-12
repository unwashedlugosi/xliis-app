// Exact membership from released XLIIs 1.11.0 catalog, commit a45da709.
// Horns recordings first entered the catalog in a3e21a11 (2026-11-09).
// All 20 saved release tags containing them include nativeShowListeningBoundary
// from 377c46b2. Their positive session_end duration is a native listening delta,
// not the legacy wall-clock session timer. Play attempts alone never qualify.
// This confirms some measured playback, not a whole show or audible volume.
const SHOWS = Object.freeze([
  "gd1973-09-11.152009.sbd.gems.flac16",
  "gd73-09-12.sbd.sly.14010.sbeok.shnf",
  "gd73-09-15.aud-sbd.cotsman.16174.sbeok.shnf",
  "gd1973-09-17.150977.sbd.patched.miller.flac1644",
  "gd73-09-20.aud-sbd.cotsman.11618.sbeok.shnf",
  "gd1973-09-21.145131.sbd.boswell.smith.sirmick.flac1644",
  "gd73-09-24.sbd-aud.cotsman.11620.sbeok.shnf",
  "gd1973-09-26.sbd-repatched.miller.80198.sbeok.flac16"
]);
const MEMBERS = new Set(SHOWS);
const FIRST_CATALOG_AT = Date.parse('2026-11-09T06:11:14Z');
const PAGE_SIZE = 32, MAX_PAGES = 4;
function qualifies(row, deviceId, evaluatedMs) {
  const at = typeof row?.created_at === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(row.created_at)
    ? Date.parse(row.created_at) : NaN;
  const fields = [row?.collection, ...Object.values(row?.metadata || {})];
  return row?.device_id === deviceId && MEMBERS.has(row.show_id) &&
    row.event === 'session_end' && Number.isFinite(at) && at >= FIRST_CATALOG_AT && at <= evaluatedMs &&
    Number.isInteger(row.metadata?.duration_seconds) && row.metadata.duration_seconds > 0 &&
    row.metadata.duration_seconds <= 86400 &&
    !fields.some(value => /test harness|xlii test track/i.test(String(value)));
}
async function fetchHorns(listener, evaluatedMs, fetchImpl, deadline, requestJSON, baseUrl) {
  const params = new URLSearchParams({
    select: 'device_id,event,show_id,created_at,collection,metadata',
    device_id: `eq.${listener.user_id}`, show_id: `in.(${SHOWS.join(',')})`,
    event: 'eq.session_end', created_at: `lte.${new Date(evaluatedMs).toISOString()}`,
    order: 'created_at.desc,id.desc', limit: String(PAGE_SIZE)
  });
  params.append('created_at', `gte.${new Date(FIRST_CATALOG_AT).toISOString()}`);
  const stop = Math.min(deadline, Date.now() + 1200);
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const remaining = stop - Date.now();
      if (remaining <= 0) return null;
      params.set('offset', String(page * PAGE_SIZE));
      const { data } = await requestJSON(`${baseUrl}/rest/v1/xlii_analytics?${params}`,
        { method: 'GET' }, fetchImpl, remaining, 65536);
      if (!Array.isArray(data) || data.length > PAGE_SIZE) return null;
      if (data.some(row => qualifies(row, listener.user_id, evaluatedMs))) return true;
      // An invalid/test/zero-duration newest row cannot hide earlier evidence.
      if (data.length < PAGE_SIZE) return data.length ? null : false;
    }
    // Bounded history exhausted, not a negative lifetime assertion.
    return null;
  } catch { return null; }
}

// This optional Core2 route accepts bounded opaque identities supplied by
// the device. Raw installation IDs stay server-side. Scanning starts at the first
// possible Horns evidence, so repeat sessions cannot hide an earlier earned badge.
const { createHash } = require('node:crypto');
const BADGE_PAGE_SIZE = 128, BADGE_MAX_PAGES = 16, MAX_BADGE_IDS = 8;
function badgeIds(value) {
  if (typeof value !== 'string') return null;
  const ids = value.split(',');
  return ids.length && ids.length <= MAX_BADGE_IDS &&
    ids.every(id => /^[a-f0-9]{24}$/.test(id)) && new Set(ids).size === ids.length ? ids : null;
}
function opaqueId(deviceId) {
  return createHash('sha256').update(`core2-listener-v1:${deviceId}`).digest('hex').slice(0, 24);
}
function badgeOffset(value) {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,7})$/.test(value)) return null;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset <= 10000000 && offset % BADGE_PAGE_SIZE === 0 ? offset : null;
}
async function fetchHornsByIds(ids, evaluatedMs, fetchImpl, deadline, requestJSON, baseUrl, startOffset = 0) {
  // null means no retained proof was found, never a claim of lifetime absence.
  // Devices retain previously confirmed positives across unknown responses.
  const found = new Map(ids.map(id => [id, null]));
  let nextOffset = startOffset;
  const params = new URLSearchParams({
    select: 'device_id,event,show_id,created_at,collection,metadata',
    show_id: `in.(${SHOWS.join(',')})`, event: 'eq.session_end',
    created_at: `lte.${new Date(evaluatedMs).toISOString()}`,
    order: 'created_at.asc,id.asc', limit: String(BADGE_PAGE_SIZE)
  });
  params.append('created_at', `gte.${new Date(FIRST_CATALOG_AT).toISOString()}`);
  try {
    for (let page = 0; page < BADGE_MAX_PAGES; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      params.set('offset', String(startOffset + page * BADGE_PAGE_SIZE));
      const { data } = await requestJSON(`${baseUrl}/rest/v1/xlii_analytics?${params}`,
        { method: 'GET' }, fetchImpl, remaining, 262144);
      if (!Array.isArray(data) || data.length > BADGE_PAGE_SIZE) break;
      for (const row of data) {
        if (typeof row?.device_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.device_id)) continue;
        const id = opaqueId(row.device_id);
        if (found.has(id) && qualifies(row, row.device_id, evaluatedMs)) found.set(id, true);
      }
      if ([...found.values()].every(value => value === true) || data.length < BADGE_PAGE_SIZE) {
        nextOffset = null; break;
      }
      // Continue the same requested batch on its next poll, rather than scan
      // the same prefix forever when retained history outgrows one request.
      nextOffset = startOffset + (page + 1) * BADGE_PAGE_SIZE;
      if (nextOffset > 10000000) { nextOffset = 0; break; }
    }
  } catch { /* Keep proved positives; never replace missing evidence with false. */ }
  const rows = ids.map(listener_id => ({ listener_id, horns_1973_listened: found.get(listener_id) }));
  Object.defineProperty(rows, 'next_offset', { value: nextOffset });
  return rows;
}
function finishBadges(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', status === 200 ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
  res.end(body);
}
async function handler(req, res) {
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET'); finishBadges(res, 405, 'Method Not Allowed'); return;
  }
  const ids = badgeIds(req.query?.ids);
  const offset = badgeOffset(req.query?.offset);
  if (!ids || offset === null) { finishBadges(res, 400, 'Invalid listener identities'); return; }
  // Load lazily: core2-listeners also uses the legacy single-listener helper.
  const { requestJSON } = require('./core2-listeners')._test;
  const { SUPABASE_URL } = require('./core2-state')._test;
  const evaluated = Date.now();
  const listeners = await fetchHornsByIds(ids, evaluated, globalThis.fetch,
    evaluated + 4000, requestJSON, SUPABASE_URL, offset);
  finishBadges(res, 200, JSON.stringify({ schema_version: 1,
    evaluated_at: new Date(evaluated).toISOString(),
    valid_until: new Date(evaluated + 30000).toISOString(), listeners, next_offset: listeners.next_offset }));
}
module.exports = handler;
Object.assign(module.exports, { SHOWS, PAGE_SIZE, MAX_PAGES, qualifies, fetchHorns,
  fetchHornsByIds, opaqueId, badgeIds, badgeOffset, BADGE_PAGE_SIZE, BADGE_MAX_PAGES, MAX_BADGE_IDS });
