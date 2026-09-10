const assert = require('node:assert/strict');
const test = require('node:test');

const handler = require('../api/core2-manifest');
const { readManifest } = handler._test;

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

test('GET serves the current signed manifest with strict no-cache headers', () => {
  const res = responseRecorder();
  handler({ method: 'GET' }, res);
  const parsed = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(parsed.version, 2026091006);
  assert.equal(parsed.user_version, '2.56');
  assert.match(res.headers['cache-control'], /no-store/);
  assert.match(res.headers['cache-control'], /no-cache/);
  assert.equal(res.headers.pragma, 'no-cache');
  assert.equal(res.headers.expires, '0');
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
});

test('invalid manifest content fails closed', () => {
  assert.throws(() => readManifest(() => '{"version":0}'));
  assert.throws(() => readManifest(() => 'not json'));
});

test('only GET is accepted', () => {
  const res = responseRecorder();
  handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});
