const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const opaqueId = id => createHash('sha256').update(`core2-listener-v1:${id}`).digest('hex').slice(0, 24);
const handler = require('../api/core2-listeners');
const { buildResponse, summarizeHistory, summarizeEndedToday, fetchTodayRoster, dayStart, dayKey, requestJSON, PAGE_SIZE, supportedIntervals, weekKey, lastHereLabel, fetchFirstSeen } = handler._test;
const ASOF = Date.parse('2026-09-10T16:00:00Z');
const iso = ms => new Date(ms).toISOString();
const listener = (id = 'xlii-current') => ({ user_id: id, show_identifier: 'gd1973-06-24', track_name: 'Looks Like Rain', show_date: '1973-06-24', show_venue: 'Portland', started_at: '2026-09-10T15:00:00Z', updated_at: '2026-09-10T15:59:00Z' });
const event = (id, at, duration, device = 'xlii-current', name = 'session_end') => ({ id, device_id: device, show_id: 'gd1973-06-24', event: name, created_at: at, metadata: { duration_seconds: duration } });
const envelope = (listeners = [listener()]) => [{ active_count: listeners.length, evaluated_at: iso(ASOF), valid_until: iso(ASOF + 30_000), active_listeners: listeners }];
const json = (data, headers = {}, status = 200) => new Response(JSON.stringify(data), { status, headers });
function todayPage(rows, total = rows.length, offset = 0) { return json([{ evaluated_at: iso(ASOF), total_count: total, page_offset: offset, page_limit: PAGE_SIZE, events: rows }]); }
function recorder() { return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(body) { this.body = body; } }; }

test('active scope returns only opaque current identities without history requests', async () => {
  let requests = 0;
  const response = await buildResponse(async url => {
    requests++;
    assert.match(url, /\/rpc\//);
    return json(envelope([listener('fox-device'), listener('bear-device')]));
  }, () => ASOF, 6000, 'active');
  assert.equal(requests, 1);
  assert.equal(response.total_count, 2);
  assert.equal(response.listeners.length, 2);
  assert.deepEqual(Object.keys(response.listeners[0]), ['id']);
  assert.doesNotMatch(JSON.stringify(response), /fox-device|bear-device|device_id|user_id/);
  assert.equal(response.today_listeners, undefined);
});

test('ended daily time uses playback-supported intervals and clips at Eastern midnight', () => {
  const rows = [
    event(1, '2026-09-10T04:20:00Z', 3600, 'fox-device'),
    event(2, '2026-09-10T04:10:00Z', undefined, 'fox-device', 'track_play'),
    event(3, '2026-09-10T05:15:00Z', 900, 'fox-device')
  ];
  const summary = summarizeEndedToday(rows, ASOF);
  assert.equal(summary.today_seconds, 600 + 900);
});

test('today roster includes inactive listeners, prefers active duration, and exposes no raw identity', async () => {
  const rows = [
    event(1, '2026-09-10T15:00:00Z', 3360, 'bear-device'),
    event(2, '2026-09-10T15:10:00Z', undefined, 'bear-device', 'track_play'),
    event(3, '2026-09-10T14:00:00Z', 600, 'fox-device')
  ];
  const roster = await fetchTodayRoster([listener('fox-device')], [{ id: opaqueId('fox-device'), today_seconds: 3720 }], ASOF,
    async () => todayPage(rows), Date.now() + 1000);
  assert.equal(roster.total_count, 2);
  assert.equal(roster.listeners[0].today_seconds, 3720);
  assert.equal(roster.listeners[1].today_seconds, 1800);
  assert.doesNotMatch(JSON.stringify(roster), /fox-device|bear-device|device_id/);
});

test('completed cumulative and active intervals union without double-counting or clock extrapolation', () => {
  const rows = [event(1, '2026-09-10T15:30:00Z', 5400), event(2, '2026-09-10T15:45:00Z', 6300),
    event(3, '2026-09-10T15:45:00Z', 86400, 'another-listener'),
    ...['14:20', '14:40', '15:00', '15:20', '15:40'].map((time, i) => event(10 + i, `2026-09-10T${time}:00Z`, undefined, 'xlii-current', 'track_play'))];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.today_seconds, 7140); // 14:00 through last actual update15:59.
  assert.equal(summary.today_sessions, 1);
  assert.equal(summary.month_seconds, 7140);
  assert.equal(summary.streak_days, 1);
});
test('unsupported seven-hour session is bounded and visits retain thirty-minute grouping', () => {
  const rows = [event(1, '2026-09-10T13:00:00Z', 25200), event(2, '2026-09-10T13:45:00Z', 900)];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.today_seconds, 1800 + 900 + 1800);
  assert.equal(summary.today_sessions, 3); // Unsupported hours are omitted and cannot bridge separate visits.
});
test('Eastern midnight clips duration and DST dates have23/25-hour lengths', () => {
  assert.equal(dayStart('2026-03-09') - dayStart('2026-03-08'), 23 * 3600_000);
  assert.equal(dayStart('2026-11-02') - dayStart('2026-11-01'), 25 * 3600_000);
  assert.equal(dayKey(Date.parse('2026-09-10T03:59:59Z')), '2026-09-09');
  const current = { ...listener(), started_at: '2026-09-10T03:30:00Z', updated_at: '2026-09-10T04:30:00Z' };
  const summary = summarizeHistory(current, [event(99, '2026-09-10T03:50:00Z', undefined, 'xlii-current', 'track_play'), event(100, '2026-09-10T04:10:00Z', undefined, 'xlii-current', 'track_play')], Date.parse('2026-09-10T04:31:00Z'));
  assert.equal(summary.today_seconds, 1800);
  assert.equal(summary.month_seconds, 3600);
  assert.equal(summary.month_days, 2);
  assert.equal(summary.streak_days, 2);
});
test('an interval ending exactly at midnight does not add a following-day visit', () => {
  const rows = [event(1, '2026-09-10T04:00:00Z', 3600)];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.today_sessions, 1);
  assert.equal(summary.today_seconds, 1800);
});
test('unpaired playback points retain known approximate duration without adding invented time', () => {
  const rows = [event(1, '2026-09-10T10:00:00Z', undefined, 'xlii-current', 'show_play')];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.today_sessions, 2);
  assert.equal(summary.today_seconds, 1800);
  assert.equal(summary.month_seconds, 1800);
  assert.equal(summary.month_days, 1);
});
test('older truncated history preserves covered month and proves streak only through a covered gap', () => {
  const summary = summarizeHistory(listener(), [event(1, '2026-09-09T14:00:00Z', 3600)], ASOF, false, Date.parse('2026-08-19T00:00:00Z'));
  assert.equal(summary.today_seconds, 1800);
  assert.equal(summary.month_seconds, 3600);
  assert.equal(summary.month_days, 2);
  assert.equal(summary.streak_days, 2);
  const partial = summarizeHistory(listener(), [], ASOF, false, Date.parse('2026-09-10T14:00:00Z'));
  assert.equal(partial.today_sessions, null);
  assert.equal(partial.today_seconds, null);
  assert.equal(partial.month_days, null);
  assert.equal(partial.streak_days, null);
});
test('history GET filters exact identity and returns bounded opaque live cards with original lease', async () => {
  let historyURL;
  const response = await buildResponse(async (url, options) => {
    if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope());
    if (new URL(url).searchParams.get('limit') === '1') return json([]);
    if (!new URL(url).searchParams.has('device_id')) return json([], { 'Content-Range': '*/0' });
    historyURL = new URL(url);
    assert.equal(options.headers.Range, '0-249');
    assert.equal(options.headers.Prefer, 'count=exact');
    return json([], { 'Content-Range': '*/0' });
  }, () => ASOF);
  assert.equal(historyURL.searchParams.get('device_id'), 'eq.xlii-current');
  assert.equal(historyURL.searchParams.get('order'), 'created_at.desc,id.desc');
  assert.equal(response.evaluated_at, iso(ASOF));
  assert.equal(response.valid_until, iso(ASOF + 30000));
  assert.equal(response.listeners[0].today_seconds, 1800);
  assert.match(response.listeners[0].id, /^[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(response), /xlii-current|user_id|device_id/);
});
test('pagination uses all pages and rejects another identity even when show matches', async () => {
  let pages = 0;
  const result = await buildResponse(async url => {
    if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope());
    if (new URL(url).searchParams.get('limit') === '1') return json([]);
    if (!new URL(url).searchParams.has('device_id')) return json([], { 'Content-Range': '*/0' });
    pages++;
    if (pages === 1) return json(Array.from({ length: PAGE_SIZE }, (_, i) => event(i, '2026-09-10T15:30:00Z', 1800)), { 'Content-Range': '0-249/251' });
    return json([event(250, '2026-09-10T15:30:00Z', 1800, 'wrong-device')], { 'Content-Range': '250-250/251' });
  }, () => ASOF);
  assert.equal(pages, 2);
  assert.equal(result.listeners[0].today_seconds, null);
});
test('bounded descending pagination retains month totals when older history exceeds cap', async () => {
  let pages = 0;
  const result = await buildResponse(async url => {
    if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope());
    if (new URL(url).searchParams.get('limit') === '1') return json([]);
    if (!new URL(url).searchParams.has('device_id')) return json([], { 'Content-Range': '*/0' });
    const offset = pages++ * PAGE_SIZE;
    return json(Array.from({ length: PAGE_SIZE }, (_, i) => event(offset + i, '2026-08-19T15:30:00Z', 1800)),
      { 'Content-Range': `${offset}-${offset + PAGE_SIZE - 1}/1500` });
  }, () => ASOF);
  assert.equal(pages, 4);
  assert.equal(result.listeners[0].today_seconds, 1800);
  assert.equal(result.listeners[0].month_seconds, 1800);
});
test('missing totals and upstream history errors return unknown statistics', async () => {
  for (const history of [() => json([]), () => json('private failure', {}, 500)]) {
    const result = await buildResponse(async url => url.endsWith('/rpc/get_xlii_current_listener_details') ? json(envelope()) : history(), () => ASOF);
    assert.equal(result.total_count, 1);
    assert.equal(result.listeners[0].today_sessions, null);
    assert.equal(result.listeners[0].month_seconds, null);
  }
});
test('cap eight cards, preserve total count, and bound UTF8 fields', async () => {
  let requests = 0;
  const current = Array.from({ length: 10 }, (_, i) => ({ ...listener(`xlii-${i}`), show_venue: 'é'.repeat(150) }));
  const result = await buildResponse(async url => {
    if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope(current));
    requests++;
    if (!new URL(url).searchParams.has('device_id')) return json([], { 'Content-Range': '*/0' });
    return json([], { 'Content-Range': '*/0' });
  }, () => ASOF);
  assert.equal(requests, 17);
  assert.equal(result.total_count, 10);
  assert.equal(result.listeners.length, 8);
  assert.equal(Buffer.byteLength(result.listeners[0].show_venue), 96);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 12000);
});
test('malformed/expired current snapshot fails instead of reporting zero', async () => {
  for (const value of [[], [{}], envelope([listener(), listener()]), [{ ...envelope()[0], active_count: 0 }]]) {
    await assert.rejects(buildResponse(async () => json(value), () => ASOF));
  }
  await assert.rejects(buildResponse(async () => json(envelope()), () => ASOF + 31000));
});
test('hard deadline covers stalled response body, and response byte limit rejects excess', async () => {
  const started = Date.now();
  await assert.rejects(requestJSON('https://example.test', {}, async () => ({ ok: true, text: () => new Promise(() => {}) }), 20), /timed out/);
  assert.ok(Date.now() - started < 250);
  await assert.rejects(requestJSON('https://example.test', {}, async () => json('oversize'), 100, 4), /too large/);
});
test('route rejects writes and keeps errors private with no-cache response', async () => {
  const denied = recorder();
  await handler({ method: 'POST' }, denied);
  assert.equal(denied.statusCode, 405);
  assert.equal(denied.headers.allow, 'GET');
  const original = global.fetch;
  try {
    global.fetch = async () => json('private upstream detail', {}, 500);
    const result = recorder();
    await handler({ method: 'GET' }, result);
    assert.equal(result.statusCode, 502);
    assert.equal(result.body, 'Listener details unavailable');
    assert.equal(result.headers['cache-control'], 'private, no-store, max-age=0');
  } finally { global.fetch = original; }
});

test('invalid durations do not poison valid recent recorded intervals', () => {
  const summary = summarizeHistory(listener(), [event(1, '2026-08-07T16:00:00Z', 108686),
    event(2, '2026-09-10T14:00:00Z', 'bad'), event(3, '2026-09-10T14:15:00Z', 0)], ASOF);
  assert.equal(summary.today_seconds, 1800);
  assert.equal(summary.month_seconds, 1800);
  assert.equal(summary.today_sessions, 2); // Bad duration still proves an earlier visit, without adding time.
});

test('audited six-hour wall-clock session drops135/205-minute idle gaps', () => {
  const auditedShow = 'gd1971-02-18';
  const current = { ...listener(), show_identifier: auditedShow, started_at: '2026-09-10T17:02:33Z', updated_at: '2026-09-10T18:13:00Z' };
  const completed = { ...event(500, '2026-09-10T16:54:10Z', 23431), show_id: auditedShow };
  const trackTimes = ['10:27', '10:28', '10:40', '12:55', '13:10', '13:18', '16:43', '16:50'];
  const rows = [completed, ...trackTimes.map((time, i) => ({
    ...event(501 + i, `2026-09-10T${time}:00Z`, undefined, 'xlii-current', 'track_play'), show_id: auditedShow
  }))];
  const summary = summarizeHistory(current, rows, Date.parse('2026-09-10T18:13:30Z'));
  assert.equal(summary.today_seconds, 8431); //110m31 supported completed +30m active; oldwallclock27658.
  assert.equal(summary.today_sessions, 3); //Morning, midday, and late-afternoon visits.
  assert.equal(summary.month_seconds, 8431);
});
test('rapid skips preserve seconds without multiplying thirty-minute support windows', () => {
  const from = Date.parse('2026-09-10T10:00:00Z');
  const until = from + 12 * 60000;
  const points = [0, 1000, 2000, 3000, 30000, 60000].map(delta => ({ at: from + delta, showId: 'show-a' }));
  assert.deepEqual(supportedIntervals(from, until, 'show-a', points), [[from, until]]);
});
test('same-device events from another show cannot fill a paused session', () => {
  const from = Date.parse('2026-09-10T10:00:00Z');
  const until = from + 3 * 3600000;
  const unrelated = Array.from({ length: 12 }, (_, i) => ({ at: from + i * 15 * 60000, showId: 'show-b' }));
  assert.deepEqual(supportedIntervals(from, until, 'show-a', unrelated), [[from, from + 30 * 60000]]);
  const withoutIdentity = unrelated.map(point => ({ ...point, showId: undefined }));
  assert.deepEqual(supportedIntervals(from, until, undefined, withoutIdentity), [[from, from + 30 * 60000]]);
});
test('current heartbeats cannot extend a paused show beyond playback support', () => {
  const current = { ...listener(), started_at: '2026-09-10T10:30:00Z', updated_at: '2026-09-10T15:59:00Z' };
  const rows = [event(1, '2026-09-10T10:40:00Z', undefined, 'xlii-current', 'track_play'),
    event(2, '2026-09-10T10:50:00Z', undefined, 'someone-else', 'track_play')];
  const summary = summarizeHistory(current, rows, ASOF);
  assert.equal(summary.today_seconds, 2400);
  assert.equal(summary.today_sessions, 1);
});
test('dense real playback still accumulates a long session with no arbitrary total cap', () => {
  const from = Date.parse('2026-09-10T08:00:00Z');
  const rows = [event(1, '2026-09-10T14:00:00Z', 21600),
    ...Array.from({ length: 18 }, (_, i) => event(i + 2, iso(from + i * 20 * 60000), undefined, 'xlii-current', 'track_play'))];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.today_seconds, 21600 + 1800);
});

test('weekly statistics reset Monday Eastern midnight including DST changes', () => {
  assert.equal(weekKey(Date.parse('2026-09-07T03:59:59Z')), '2026-08-31');
  assert.equal(weekKey(Date.parse('2026-09-07T04:00:00Z')), '2026-09-07');
  assert.equal(weekKey(Date.parse('2026-11-02T04:59:59Z')), '2026-10-26');
  assert.equal(weekKey(Date.parse('2026-11-02T05:00:00Z')), '2026-11-02');
  const summary = summarizeHistory(listener(), [event(1, '2026-09-06T14:00:00Z', 1800), event(2, '2026-09-07T14:00:00Z', 1800)], ASOF);
  assert.equal(summary.week_days, 2);
  assert.equal(summary.week_seconds, 3600);
  assert.equal(summary.month_days, 3);
  assert.equal(summary.month_seconds, 5400);
  const partial = summarizeHistory(listener(), [], ASOF, false, Date.parse('2026-09-08T00:00:00Z'));
  assert.equal(partial.today_seconds, 1800);
  assert.equal(partial.week_days, null);
  assert.equal(partial.week_seconds, null);
});
test('first recorded date queries all retained exact-device history independently of capped recent history', async () => {
  let request;
  const result = await fetchFirstSeen(listener(), ASOF, async url => {
    request = new URL(url);
    return json([{ device_id: 'xlii-current', created_at: '2025-01-02T03:00:00Z' }]);
  }, Date.now() + 1000);
  assert.equal(result, 'Jan 1, 2025');
  assert.equal(request.searchParams.get('device_id'), 'eq.xlii-current');
  assert.equal(request.searchParams.get('order'), 'created_at.asc,id.asc');
  assert.equal(request.searchParams.get('limit'), '1');
  assert.deepEqual(request.searchParams.getAll('created_at'), [`lte.${iso(ASOF)}`]);
  for (const response of [json([], {}, 500), json([{ device_id: 'another', created_at: '2025-01-02T03:00:00Z' }]), json([])]) {
    assert.equal(await fetchFirstSeen(listener(), ASOF, async () => response, Date.now() + 1000), null);
  }
});
test('last here excludes the current visit even across show changes and uses actual prior event time', () => {
  const rows = [event(1, '2026-09-09T14:30:00Z', 1800),
    { ...event(2, '2026-09-10T14:00:00Z', undefined, 'xlii-current', 'track_play'), show_id: 'different-prior-show' },
    event(3, '2026-09-10T15:20:00Z', undefined, 'xlii-current', 'track_play')];
  const summary = summarizeHistory(listener(), rows, ASOF);
  assert.equal(summary.last_here, 'Today 10:00 AM');
  assert.notEqual(summary.last_here, 'Today 11:20 AM');
  const onlyCurrent = summarizeHistory(listener(), [rows[2]], ASOF);
  assert.equal(onlyCurrent.last_here, null);
  assert.equal(lastHereLabel(Date.parse('2026-09-09T23:10:00Z'), ASOF), 'Yesterday 7:10 PM');
  assert.equal(lastHereLabel(Date.parse('2026-09-07T13:10:00Z'), ASOF), 'Mon 9:10 AM');
});
test('last here uses latest current playback cluster rather than original pre-pause start', () => {
  const current = { ...listener(), started_at: '2026-09-10T11:00:00Z', updated_at: '2026-09-10T15:59:00Z' };
  const rows = ['11:05', '15:20'].map((time, i) => event(i + 1, `2026-09-10T${time}:00Z`, undefined, 'xlii-current', 'track_play'));
  assert.equal(summarizeHistory(current, rows, ASOF).last_here, 'Today 7:05 AM');
  const paused = summarizeHistory(current, [rows[0]], ASOF);
  assert.equal(paused.last_here, null);
  const oldSameShow = event(20, '2026-09-09T15:20:00Z', undefined, 'xlii-current', 'track_play');
  assert.equal(summarizeHistory(current, [oldSameShow, rows[0]], ASOF).last_here, null);
});
test('naming month follows Eastern local first-of-month and comes from evaluated timestamp', async () => {
  for (const [at, expected] of [['2026-10-01T03:59:59Z', '2026-09'], ['2026-10-01T04:00:00Z', '2026-10'],
    ['2026-12-01T04:59:59Z', '2026-11'], ['2026-12-01T05:00:00Z', '2026-12']]) {
    const time = Date.parse(at);
    const result = await buildResponse(async () => json([{ active_count: 0, active_listeners: [], evaluated_at: at, valid_until: iso(time + 30000) }]), () => time);
    assert.equal(result.naming_month, expected);
    assert.equal(result.evaluated_at, at);
  }
});


test('first recorded and recent history fail independently without losing current card', async () => {
  for (const historyFails of [true, false]) {
    const result = await buildResponse(async url => {
      if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope());
      if (new URL(url).searchParams.get('limit') === '1') {
        return historyFails ? json([{ device_id: 'xlii-current', created_at: '2025-01-02T03:00:00Z' }]) : json([], {}, 500);
      }
      return historyFails ? json([], {}, 500) : json([], { 'Content-Range': '*/0' });
    }, () => ASOF);
    assert.equal(result.total_count, 1);
    assert.equal(result.listeners[0].first_seen, historyFails ? 'Jan 1, 2025' : null);
    assert.equal(result.listeners[0].week_seconds, historyFails ? null : 1800);
  }
});


test('daily carry-in playback support crosses Eastern midnight without adding yesterday-only listeners', async () => {
  const rows = [event(1, '2026-09-10T03:40:00Z', undefined, 'fox-device', 'track_play'),
    event(2, '2026-09-10T04:20:00Z', 7200, 'fox-device'),
    event(3, '2026-09-10T03:40:00Z', undefined, 'yesterday-device', 'track_play')];
  const roster = await fetchTodayRoster([], [], ASOF, async () => todayPage(rows), Date.now() + 1000);
  assert.equal(roster.total_count, 1);
  assert.equal(roster.listeners[0].today_seconds, 600);
});
test('unknown active history does not become an incomplete ended-only daily total', async () => {
  const rows = [event(1, '2026-09-10T14:00:00Z', 1800, 'fox-device')];
  const roster = await fetchTodayRoster([listener('fox-device')], [{ id: opaqueId('fox-device'), today_seconds: null }], ASOF,
    async () => todayPage(rows), Date.now() + 1000);
  assert.equal(roster.total_count, 1);
  assert.equal(roster.listeners[0].today_seconds, null);
});
test('daily roster includes all known active identities even beyond the rich card cap', async () => {
  const active = Array.from({ length: 10 }, (_, i) => listener(`xlii-${i}`));
  const cards = active.slice(0, 8).map(row => ({ id: opaqueId(row.user_id), today_seconds: 1000 }));
  const roster = await fetchTodayRoster(active, cards, ASOF, async () => todayPage([]), Date.now() + 1000);
  assert.equal(roster.total_count, 10);
  assert.equal(roster.listeners.length, 8);
});
test('malformed and out-of-window daily rows fail closed', async () => {
  for (const row of [{ ...event(1, 'bad', 1) }, { ...event(1, iso(ASOF + 1), 1) },
    { ...event(1, iso(ASOF), 1), event: 'unknown' }, { ...event(1, iso(ASOF), 1), device_id: 'bad identity' }]) {
    assert.equal(await fetchTodayRoster([], [], ASOF, async () => todayPage([row]), Date.now() + 1000), null);
  }
});
test('active scope checks its lease again before serving and route rejects invalid scope', async () => {
  let clockReads = 0;
  await assert.rejects(buildResponse(async () => json(envelope()), () => ++clockReads > 2 ? ASOF + 31000 : ASOF, 6000, 'active'), /expired/);
  const res = recorder();
  await handler({ method: 'GET', query: { scope: 'unknown' } }, res);
  assert.equal(res.statusCode, 400);
});

test('daily roster reads only sanitized RPC with exact bounded page and snapshot parameters', async () => {
  let request;
  const roster = await fetchTodayRoster([], [], ASOF, async (url, options) => {
    request = { url, options };
    return todayPage([]);
  }, Date.now() + 1000);
  assert.equal(roster.total_count, 0);
  assert.match(request.url, /\/rpc\/get_xlii_core2_today_events$/);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { p_as_of: iso(ASOF), p_offset: 0, p_limit: 250 });
});
test('missing sanitized RPC fails closed without unfiltered analytics fallback', async () => {
  let calls = 0;
  const result = await fetchTodayRoster([], [], ASOF, async url => {
    calls++;
    assert.match(url, /\/rpc\/get_xlii_core2_today_events$/);
    return json({ error: 'not installed' }, {}, 404);
  }, Date.now() + 1000);
  assert.equal(result, null);
  assert.equal(calls, 1);
});
test('daily paging rejects unbound snapshots, page identities, changing totals and truncation', async () => {
  for (const wrong of [{ evaluated_at: iso(ASOF - 1) }, { page_offset: 250 }, { page_limit: 100 }, { total_count: -1 }]) {
    const page = { evaluated_at: iso(ASOF), total_count: 0, page_offset: 0, page_limit: PAGE_SIZE, events: [], ...wrong };
    assert.equal(await fetchTodayRoster([], [], ASOF, async () => json([page]), Date.now() + 1000), null);
  }
  let calls = 0;
  const result = await fetchTodayRoster([], [], ASOF, async (_url, options) => {
    const offset = JSON.parse(options.body).p_offset;
    calls++;
    return todayPage(Array.from({ length: 250 }, (_, i) => event(offset + i, iso(ASOF), 1)), 1001, offset);
  }, Date.now() + 1000);
  assert.equal(result, null);
  assert.equal(calls, 4);
  let pages = 0;
  assert.equal(await fetchTodayRoster([], [], ASOF, async () => {
    const offset = pages++ * 250;
    return todayPage(Array.from({ length: 250 }, (_, i) => event(offset + i, iso(ASOF), 1)), 501 + offset, offset);
  }, Date.now() + 1000), null);
});


test('malformed optional daily objects leave valid current cards available', async () => {
  for (const bad of [[null], [{ evaluated_at: iso(ASOF), total_count: 1, page_offset: 0, page_limit: 250, events: [null] }],
    [{ evaluated_at: iso(ASOF), total_count: 1, page_offset: 0, page_limit: 250, events: [{ ...event(1, iso(ASOF), 1), id: {} }] }]]) {
    const result = await buildResponse(async url => {
      if (url.endsWith('/rpc/get_xlii_current_listener_details')) return json(envelope());
      if (url.endsWith('/rpc/get_xlii_core2_today_events')) return json(bad);
      if (new URL(url).searchParams.get('limit') === '1') return json([]);
      return json([], { 'Content-Range': '*/0' });
    }, () => ASOF);
    assert.equal(result.total_count, 1);
    assert.equal(result.listeners.length, 1);
    assert.equal(result.listeners[0].today_seconds, 1800);
    assert.equal(result.today_total_count, null);
    assert.equal(result.today_listeners, null);
  }
});
