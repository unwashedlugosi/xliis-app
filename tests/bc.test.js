const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const handler = require('../api/bc');
const {
  CAMPAIGN_METADATA,
  COOKIE_NAME,
  DESTINATION_URL,
  recordScan
} = handler._test;

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

function cookieValue(setCookie) {
  const match = setCookie.match(new RegExp(`^${COOKIE_NAME}=([^;]+);`));
  assert.ok(match, 'visitor cookie should be present');
  return decodeURIComponent(match[1]);
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

test('first GET records a scan, sets a durable cookie, and redirects', async () => {
  const requests = [];

  await withFetch(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 201 };
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'GET', headers: {} }, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, DESTINATION_URL);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    assert.match(res.headers['set-cookie'], /; Max-Age=31536000; Path=\/; Secure; HttpOnly; SameSite=Lax$/);
    assert.equal(requests.length, 1);

    const visitorId = cookieValue(res.headers['set-cookie']);
    const request = requests[0];
    const body = JSON.parse(request.options.body);
    assert.equal(request.url, 'https://dhwllgdxpeucldtmzhme.supabase.co/rest/v1/xlii_analytics');
    assert.equal(request.options.method, 'POST');
    assert.equal(body.event, 'business_card_qr_scan');
    assert.equal(body.device_id, visitorId);
    assert.deepEqual(body.metadata, { ...CAMPAIGN_METADATA, repeat: false });
    assert.ok(request.options.signal instanceof AbortSignal);
  });
});

test('repeat GET reuses the visitor id and marks the scan as repeat', async () => {
  const visitorId = '123e4567-e89b-42d3-a456-426614174000';
  let recordedBody;

  await withFetch(async (_url, options) => {
    recordedBody = JSON.parse(options.body);
    return { ok: true, status: 201 };
  }, async () => {
    const res = responseRecorder();
    await handler({
      method: 'GET',
      headers: { cookie: `unrelated=1; ${COOKIE_NAME}=${visitorId}` }
    }, res);

    assert.equal(res.statusCode, 302);
    assert.equal(cookieValue(res.headers['set-cookie']), visitorId);
    assert.equal(recordedBody.device_id, visitorId);
    assert.equal(recordedBody.metadata.repeat, true);
  });
});

test('HEAD redirects without logging or setting a visitor cookie', async () => {
  let fetchCalls = 0;

  await withFetch(async () => {
    fetchCalls += 1;
    return { ok: true, status: 201 };
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'HEAD', headers: {} }, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, DESTINATION_URL);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(fetchCalls, 0);
  });
});

test('analytics failure still redirects to the app', async () => {
  await withFetch(async () => {
    throw new Error('network unavailable');
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'GET', headers: {} }, res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, DESTINATION_URL);
    assert.ok(res.headers['set-cookie']);
  });
});

test('analytics writes are bounded even when fetch never settles', async () => {
  const startedAt = Date.now();

  await assert.rejects(
    recordScan(
      { id: '123e4567-e89b-42d3-a456-426614174000', repeat: false },
      () => new Promise(() => {}),
      20
    ),
    /timed out/
  );

  assert.ok(Date.now() - startedAt < 250, 'analytics timeout should release the redirect promptly');
});

test('methods other than GET and HEAD return 405 without logging', async () => {
  let fetchCalls = 0;

  await withFetch(async () => {
    fetchCalls += 1;
    return { ok: true, status: 201 };
  }, async () => {
    const res = responseRecorder();
    await handler({ method: 'POST', headers: {} }, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
    assert.equal(res.body, 'Method Not Allowed');
    assert.equal(fetchCalls, 0);
  });
});

test('destination hard-checks the correct XLIIs App Store id', () => {
  assert.equal(DESTINATION_URL, 'https://apps.apple.com/app/xliis/id6761192003');
  assert.doesNotMatch(DESTINATION_URL, /6759740213/);
});

test('Vercel rewrites only /bc and leaves static pages available', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

  assert.deepEqual(config.rewrites, [{ source: '/bc', destination: '/api/bc' }]);
  for (const file of ['index.html', 'about.html', 'privacy.html', 'support.html']) {
    assert.equal(fs.statSync(path.join(root, file)).isFile(), true, `${file} should remain available`);
  }
});
