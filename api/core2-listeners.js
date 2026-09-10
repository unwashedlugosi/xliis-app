const { createHash } = require('node:crypto');
const { SUPABASE_URL, supabaseKey } = require('./core2-state')._test;

const DETAILS_PATH = '/rest/v1/rpc/get_xlii_current_listener_details';
const MAX_LISTENERS = 8;
const PAGE_SIZE = 250;
const MAX_PAGES = 4;
const LOOKBACK_DAYS = 180;
const VISIT_GAP_MS = 30 * 60_000;
const MAX_DURATION_MS = 24 * 60 * 60_000;
const MAX_ACTIVE_MS = 6 * 60 * 60_000;
const PLAYBACK_SUPPORT_MS = 30 * 60_000;
const EASTERN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
});

function dayKey(ms) {
  const parts = Object.fromEntries(EASTERN.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function moveDay(key, days) {
  return new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}
function dayStart(key) {
  const nominal = Date.parse(`${key}T00:00:00Z`);
  // Eastern midnight is always 04:00 or 05:00 UTC, including DST transition days.
  for (const hours of [4, 5]) {
    const candidate = nominal + hours * 3600_000;
    if (dayKey(candidate) === key && dayKey(candidate - 1) !== key) return candidate;
  }
  throw new Error('Invalid Eastern date');
}
function timestamp(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  return Date.parse(value);
}
function clippedText(value, max) {
  if (typeof value !== 'string') return null;
  let result = '';
  for (const char of value.replace(/[\u0000-\u001f\u007f]/g, ' ')) {
    if (Buffer.byteLength(result + char) > max) break;
    result += char;
  }
  return result;
}
function unknownHistory() {
  return { today_sessions: null, today_seconds: null, streak_days: null, month_days: null, month_seconds: null };
}
function mergeIntervals(intervals, gap = 0) {
  const result = [];
  for (const interval of intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = result[result.length - 1];
    if (last && interval[0] - last[1] <= gap) last[1] = Math.max(last[1], interval[1]);
    else result.push(interval.slice());
  }
  return result;
}
function supportedIntervals(start, end, showId, playbackPoints) {
  // session_end uses a wall-clock timer, and now-playing heartbeats continue
  // while paused. Neither proves uninterrupted playback. Estimate at most
  // thirty minutes after each show/track start, bounded by the reported span.
  // The reported initial start contributes one bounded fallback window.
  const starts = [start];
  if (typeof showId === 'string' && showId.trim()) {
    for (const point of playbackPoints) {
      if (point.showId === showId && point.at >= start && point.at <= end) starts.push(point.at);
    }
  }
  return mergeIntervals(starts.map(at => [at, Math.min(end, at + PLAYBACK_SUPPORT_MS)]));
}
function summarizeHistory(listener, rows, evaluatedMs, complete = true, coveredFrom = -Infinity) {
  const today = dayKey(evaluatedMs);
  const todayStart = dayStart(today);
  const monthStart = dayStart(`${today.slice(0, 7)}-01`);
  const firstDay = moveDay(today, -LOOKBACK_DAYS);
  const reported = [];
  const points = [];
  const playbackPoints = [];
  for (const row of rows) {
    if (row.device_id !== listener.user_id) continue;
    const end = timestamp(row.created_at);
    if (!Number.isFinite(end) || end > evaluatedMs) return unknownHistory();
    if (row.event === 'show_play' || row.event === 'track_play') {
      points.push(end);
      playbackPoints.push({ at: end, showId: row.show_id });
    }
    if (row.event !== 'session_end') continue;
    const raw = row.metadata?.duration_seconds;
    if (!/^[0-9]{1,5}$/.test(String(raw))) { points.push(end); continue; }
    const duration = Number(raw) * 1000;
    if (duration <= 0 || duration > MAX_DURATION_MS) { points.push(end); continue; }
    reported.push({ start: end - duration, end, showId: row.show_id });
  }
  const start = timestamp(listener.started_at);
  const updated = Math.min(timestamp(listener.updated_at), evaluatedMs);
  if (!Number.isFinite(start) || !Number.isFinite(updated) || start > updated) return unknownHistory();
  reported.push({ start: Math.max(start, updated - MAX_ACTIVE_MS), end: updated, showId: listener.show_identifier });
  const union = mergeIntervals(reported.flatMap(span => supportedIntervals(span.start, span.end, span.showId, playbackPoints)));
  const evidence = union.concat(points.map(p => [p, p]));
  const visits = mergeIntervals(evidence, VISIT_GAP_MS);
  const activeDays = new Set();
  for (const [a, b] of evidence) {
    for (let day = dayKey(a); day <= dayKey(b); day = moveDay(day, 1)) {
      // An interval ending exactly at midnight belongs to the preceding day.
      if ((a === b || dayStart(day) < b) && day >= firstDay) activeDays.add(day);
    }
  }
  const secondsSince = boundary => {
    // This bounded playback estimate deliberately omits unsupported long gaps.
    // Overlapping support windows, including rapid skips, count only once.
    const measured = union.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, evaluatedMs) - Math.max(a, boundary)), 0);
    return measured > 0 ? Math.floor(measured / 1000) : null;
  };
  let streak = 0;
  for (let day = today; ; day = moveDay(day, -1)) {
    if (day === firstDay || (!complete && dayStart(day) < coveredFrom)) { streak = null; break; }
    if (!activeDays.has(day)) break;
    streak++;
  }
  const todayComplete = complete || coveredFrom <= todayStart - VISIT_GAP_MS;
  const monthComplete = complete || coveredFrom <= monthStart;
  return {
    today_sessions: todayComplete ? visits.filter(([a, b]) => (a === b ? a >= todayStart : b > todayStart) && a <= evaluatedMs).length : null,
    today_seconds: todayComplete ? secondsSince(todayStart) : null,
    streak_days: streak,
    month_days: monthComplete ? [...activeDays].filter(day => day >= today.slice(0, 7) + '-01').length : null,
    month_seconds: monthComplete ? secondsSince(monthStart) : null
  };
}

async function requestJSON(url, options, fetchImpl, timeoutMs, maxBytes = 512_000) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Listener request timed out')); }, timeoutMs);
  });
  try {
    return await Promise.race([(async () => {
      const key = supabaseKey();
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', apikey: key,
          Authorization: `Bearer ${key}`, ...options.headers }
      });
      if (!response.ok) throw new Error('Listener upstream failed');
      let body;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { controller.abort(); throw new Error('Listener response too large'); }
            chunks.push(Buffer.from(value));
          }
          body = Buffer.concat(chunks).toString('utf8');
        } finally { reader.cancel().catch(() => {}); }
      } else {
        body = await response.text();
        if (Buffer.byteLength(body) > maxBytes) throw new Error('Listener response too large');
      }
      return { data: JSON.parse(body), headers: response.headers };
    })(), timeout]);
  } finally { clearTimeout(timer); }
}
async function fetchHistory(listener, evaluatedMs, fetchImpl, deadline) {
  const firstDay = moveDay(dayKey(evaluatedMs), -LOOKBACK_DAYS);
  const params = new URLSearchParams({
    select: 'id,device_id,show_id,event,metadata,created_at',
    device_id: `eq.${listener.user_id}`,
    event: 'in.(show_play,track_play,session_end)',
    order: 'created_at.desc,id.desc'
  });
  params.append('created_at', `gte.${new Date(dayStart(firstDay) - MAX_DURATION_MS).toISOString()}`);
  params.append('created_at', `lte.${new Date(evaluatedMs).toISOString()}`);
  const rows = [];
  let expectedTotal;
  const ids = new Set();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return unknownHistory();
      const offset = page * PAGE_SIZE;
      const { data, headers } = await requestJSON(`${SUPABASE_URL}/rest/v1/xlii_analytics?${params}`, {
        method: 'GET', headers: { Prefer: 'count=exact', 'Range-Unit': 'items', Range: `${offset}-${offset + PAGE_SIZE - 1}` }
      }, fetchImpl, remaining);
      const range = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(headers.get('content-range') || '');
      if (!Array.isArray(data) || !range || data.length > PAGE_SIZE) return unknownHistory();
      const total = Number(range[3]);
      if (expectedTotal !== undefined && total !== expectedTotal) return unknownHistory();
      expectedTotal = total;
      if (data.length && (Number(range[1]) !== offset || Number(range[2]) !== offset + data.length - 1)) return unknownHistory();
      for (const row of data) {
        if (row.device_id !== listener.user_id || row.id == null || ids.has(String(row.id))) return unknownHistory();
        ids.add(String(row.id));
      }
      rows.push(...data);
      if (rows.length === total) return summarizeHistory(listener, rows, evaluatedMs);
      if (data.length !== PAGE_SIZE) return unknownHistory();
    }
    const oldest = Math.min(...rows.map(row => timestamp(row.created_at)));
    if (Number.isFinite(oldest)) return summarizeHistory(listener, rows, evaluatedMs, false, oldest + 1);
  } catch { /* A card can remain live when its history is unavailable. */ }
  return unknownHistory();
}
async function buildResponse(fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  const { data } = await requestJSON(`${SUPABASE_URL}${DETAILS_PATH}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  }, fetchImpl, Math.min(timeoutMs, 3000));
  if (!Array.isArray(data) || data.length !== 1) throw new Error('Invalid listener envelope');
  const snapshot = data[0];
  const evaluated = timestamp(snapshot.evaluated_at);
  const valid = timestamp(snapshot.valid_until);
  if (!Number.isFinite(evaluated) || !Number.isFinite(valid) || valid <= now() ||
      evaluated > now() + 5000 || valid <= evaluated || valid - evaluated > 30_000 ||
      !Number.isSafeInteger(snapshot.active_count) || snapshot.active_count < 0 ||
      !Array.isArray(snapshot.active_listeners) || snapshot.active_count !== snapshot.active_listeners.length) {
    throw new Error('Invalid listener snapshot');
  }
  const identities = new Set();
  for (const listener of snapshot.active_listeners) {
    if (typeof listener.user_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(listener.user_id) || identities.has(listener.user_id)) {
      throw new Error('Invalid listener identity');
    }
    const started = timestamp(listener.started_at);
    const updated = timestamp(listener.updated_at);
    if (!Number.isFinite(started) || !Number.isFinite(updated) || started > updated ||
        updated <= evaluated - 300_000 || updated > evaluated + 60_000 ||
        started <= evaluated - MAX_ACTIVE_MS || typeof listener.show_identifier !== 'string' || !listener.show_identifier.trim()) {
      throw new Error('Invalid listener record');
    }
    identities.add(listener.user_id);
  }
  const listeners = await Promise.all(snapshot.active_listeners.slice().sort((a, b) => a.user_id.localeCompare(b.user_id)).slice(0, MAX_LISTENERS).map(async listener => ({
    id: createHash('sha256').update(`core2-listener-v1:${listener.user_id}`).digest('hex').slice(0, 24),
    track_name: clippedText(listener.track_name, 96),
    show_date: clippedText(listener.show_date, 16),
    show_venue: clippedText(listener.show_venue, 96),
    ...await fetchHistory(listener, evaluated, fetchImpl, deadline)
  })));
  if (valid <= now()) throw new Error('Listener snapshot expired');
  return { evaluated_at: snapshot.evaluated_at, valid_until: snapshot.valid_until, total_count: snapshot.active_count, listeners };
}
function finish(res, code, body) {
  res.statusCode = code;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', code === 200 ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
  res.end(body);
}
async function handler(req, res) {
  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    finish(res, 405, 'Method Not Allowed');
    return;
  }
  try { finish(res, 200, JSON.stringify(await buildResponse())); }
  catch { finish(res, 502, 'Listener details unavailable'); }
}
module.exports = handler;
module.exports._test = { buildResponse, summarizeHistory, fetchHistory, dayStart, dayKey, mergeIntervals, supportedIntervals, requestJSON, DETAILS_PATH, PAGE_SIZE, MAX_PAGES };
