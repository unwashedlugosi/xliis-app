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

module.exports = { SHOWS, PAGE_SIZE, MAX_PAGES, qualifies, fetchHorns };
