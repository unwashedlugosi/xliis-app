const assert = require('node:assert/strict');
const test = require('node:test');

const handler = require('../api/core2-state');
const { STATE_RPC_PATH, SUPABASE_URL, fetchState, supabaseKey } = handler._test;

function responseRecorder() {
  return {
    body: undefined,
    headers: {},
    statusCode: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
    }
  };
}

async function withFetch(fetchImpl, callback) {
  const original = global.fetch;
  global.fetch = fetchImpl;
  try {
    await callback();
  } finally {
    global.fetch = original;
  }
}

test('GET relays the exact canonical state without caching', async () => {
  const canonical = '[{"active_count":2,"evaluated_at_utc_ms":1788824000000}]';
  let request;
  await withFetch(async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, text: async () => canonical };
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, canonical);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  });

  assert.equal(request.url, `${SUPABASE_URL}${STATE_RPC_PATH}`);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.body, '{}');
  assert.equal(request.options.headers['Accept-Encoding'], 'identity');
  assert.ok(request.options.headers.apikey);
  assert.equal(request.options.headers.Authorization, `Bearer ${request.options.headers.apikey}`);
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('upstream error becomes a bounded 502 with no upstream body exposure', async () => {
  await withFetch(async () => ({
    ok: false,
    status: 500,
    text: async () => 'private upstream detail'
  }), async () => {
    const res = responseRecorder();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body, 'Listener service unavailable');
    assert.doesNotMatch(res.body, /private upstream detail/);
  });
});

test('unavailable upstream becomes 504', async () => {
  await withFetch(async () => {
    throw new Error('offline');
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 504);
    assert.equal(res.body, 'Listener service unavailable');
  });
});

test('only GET is accepted', async () => {
  const res = responseRecorder();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
});

test('upstream request has a hard timeout', async () => {
  const startedAt = Date.now();
  await assert.rejects(fetchState(() => new Promise(() => {}), 20), /timed out/);
  assert.ok(Date.now() - startedAt < 250);
});

test('bundled public client key is scoped to the production Supabase project', () => {
  const [, payload] = supabaseKey().split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(claims.iss, 'supabase');
  assert.equal(claims.ref, 'dhwllgdxpeucldtmzhme');
  assert.equal(claims.role, 'anon');
});
