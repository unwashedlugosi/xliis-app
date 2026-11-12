const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkPair, canonicalPayload, canonicalScopePayload } = require('../tools/check-firmware-pair');
const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
function fixture(t, change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-pair-'));
  t.after(() => fs.rmSync(root, {recursive: true}));
  for (const target of ['core2', 'cores3']) {
    const dir = path.join(root, 'firmware', target);
    fs.mkdirSync(path.join(dir, 'releases'), {recursive: true});
    const m = {schema: 1, version: 2026092901, user_version: '2.77', cipher_size: 3, plain_size: 3,
      sha256: 'a'.repeat(64), md5: 'a'.repeat(32), nonce: Buffer.alloc(12).toString('base64'),
      tag: Buffer.alloc(16).toString('base64'), cipher_sha256: crypto.createHash('sha256').update('abc').digest('hex'),
      url: `https://xliis.app/firmware/${target}/releases/2026092901.enc`};
    const sign = data => crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64');
    m.signature = sign(canonicalPayload(m));
    m.package_signature = sign(`${canonicalPayload(m)}cipher_sha256\n${m.cipher_sha256}\n`);
    change(m, target);
    fs.writeFileSync(path.join(dir, 'manifest-source.json'), JSON.stringify(m));
    fs.writeFileSync(path.join(dir, 'releases', `${m.version}.enc`), 'abc');
  }
  return root;
}
test('matching signed device releases pass', t => assert.equal(checkPair(fixture(t), publicKey), '2.77'));
test('one-device update is rejected', t => assert.throws(() => checkPair(fixture(t, (m, target) => {
  if (target === 'cores3') m.user_version = '2.69';
}), publicKey), /must ship together/));
test('wrong target URL rejected', t => assert.throws(() => checkPair(fixture(t, m => {
  m.url = 'https://xliis.app/firmware/core2/releases/1.enc';
}), publicKey), /release identity/));
test('truncated package rejected', t => assert.throws(() => checkPair(fixture(t, m => {
  m.cipher_size = m.plain_size = 5;
}), publicKey), /incomplete/));
test('missing signature rejected', t => assert.throws(() => checkPair(fixture(t, m => {
  delete m.signature;
}), publicKey), /manifest/));
test('same-length corruption rejected', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'firmware/cores3/releases/2026092901.enc'), 'xyz');
  assert.throws(() => checkPair(root, publicKey), /corrupt/);
});
test('tampered digest cannot be relabeled', t => assert.throws(() => checkPair(fixture(t, m => {
  m.sha256 = 'b'.repeat(64);
}), publicKey), /signature/));
test('package signature mandatory', t => assert.throws(() => checkPair(fixture(t, m => {
  m.package_signature = m.signature;
}), publicKey), /signature/));

test('noncanonical signature encoding rejected before device delivery', t => assert.throws(() => checkPair(fixture(t, m => {
  m.signature += '\n';
}), publicKey), /manifest/));

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sign = payload => crypto.sign('sha256', Buffer.from(payload), privateKey).toString('base64');
const manifestPath = (root, target) => path.join(root, 'firmware', target, 'manifest-source.json');
const scopePath = root => path.join(root, 'firmware', 'release-scope.json');
function rewriteManifest(root, target, change, resign = true) {
  const file = manifestPath(root, target);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const oldPackage = path.join(root, 'firmware', target, 'releases', `${m.version}.enc`);
  change(m);
  if (resign) {
    m.signature = sign(canonicalPayload(m));
    m.package_signature = sign(`${canonicalPayload(m)}cipher_sha256\n${m.cipher_sha256}\n`);
  }
  const newPackage = path.join(root, 'firmware', target, 'releases', `${m.version}.enc`);
  if (newPackage !== oldPackage) fs.copyFileSync(oldPackage, newPackage);
  fs.writeFileSync(file, JSON.stringify(m));
}
function writeScope(root, change = () => {}) {
  const scope = {schema: 1, mode: 'core2-only'};
  for (const target of ['core2', 'cores3']) {
    const bytes = fs.readFileSync(manifestPath(root, target));
    const m = JSON.parse(bytes.toString('utf8'));
    scope[`${target}_manifest_sha256`] = digest(bytes);
    scope[`${target}_cipher_sha256`] = digest(fs.readFileSync(
      path.join(root, 'firmware', target, 'releases', `${m.version}.enc`)));
  }
  scope.signature = sign(canonicalScopePayload(scope));
  change(scope);
  fs.writeFileSync(scopePath(root), JSON.stringify(scope));
}
function splitFixture(t, version = '2.78', build = 2026093002) {
  const root = fixture(t);
  rewriteManifest(root, 'core2', m => {
    m.user_version = version;
    m.version = build;
    m.url = `https://xliis.app/firmware/core2/releases/${build}.enc`;
  });
  writeScope(root);
  return root;
}

test('scope payload matches the publisher wire contract', () => {
  assert.equal(canonicalScopePayload({core2_manifest_sha256: 'a', core2_cipher_sha256: 'b',
    cores3_manifest_sha256: 'c', cores3_cipher_sha256: 'd'}),
  'xlii-core2-only-release-v1\ncore2\na\nb\ncores3\nc\nd\n');
});
test('signed Core2-only release accepts pinned unchanged CoreS3 files', t => {
  const root = splitFixture(t);
  const beforeManifest = fs.readFileSync(manifestPath(root, 'cores3'));
  const packagePath = path.join(root, 'firmware/cores3/releases/2026092901.enc');
  const beforePackage = fs.readFileSync(packagePath);
  assert.equal(checkPair(root, publicKey), '2.78');
  assert.deepEqual(fs.readFileSync(manifestPath(root, 'cores3')), beforeManifest);
  assert.deepEqual(fs.readFileSync(packagePath), beforePackage);
});
test('next major at zero is allowed by an exact signed scope', t => {
  assert.equal(checkPair(splitFixture(t, '3.0'), publicKey), '3.0');
});
test('split release without scope remains rejected', t => {
  const root = splitFixture(t);
  fs.unlinkSync(scopePath(root));
  assert.throws(() => checkPair(root, publicKey), /must ship together/);
});
test('scope requires exact schema mode keys hashes and canonical signature encoding', t => {
  for (const change of [
    s => { delete s.signature; },
    s => { s.schema = 2; },
    s => { s.schema = '1'; },
    s => { s.mode = 'cores3-only'; },
    s => { s.extra = true; },
    s => { delete s.cores3_manifest_sha256; },
    s => { s.core2_manifest_sha256 = 'ABC'.repeat(22); },
    s => { s.cores3_cipher_sha256 = 123; },
    s => { s.signature += '\n'; },
    s => { s.signature = 'not-base64'; }
  ]) {
    const root = splitFixture(t);
    writeScope(root, change);
    assert.throws(() => checkPair(root, publicKey), /Invalid Core2-only release scope/);
  }
});
test('malformed nonobject and null scope are rejected', t => {
  for (const value of ['null', '[]', '1', '{']) {
    const root = splitFixture(t);
    fs.writeFileSync(scopePath(root), value);
    assert.throws(() => checkPair(root, publicKey));
  }
});
test('valid-looking unsigned or altered scope cannot authorize a split', t => {
  for (const change of [
    s => { s.signature = Buffer.alloc(256).toString('base64'); },
    s => { s.core2_manifest_sha256 = '0'.repeat(64); },
    s => { s.cores3_cipher_sha256 = '0'.repeat(64); }
  ]) {
    const root = splitFixture(t);
    writeScope(root, change);
    assert.throws(() => checkPair(root, publicKey), /scope signature/);
  }
});
test('scope signed by a different key is rejected', t => {
  const root = splitFixture(t);
  const wrong = crypto.generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
  writeScope(root, s => { s.signature = crypto.sign('sha256',
    Buffer.from(canonicalScopePayload(s)), wrong).toString('base64'); });
  assert.throws(() => checkPair(root, publicKey), /scope signature/);
});
test('signed scope pins raw manifest bytes for BOTH hardware targets', t => {
  for (const target of ['core2', 'cores3']) {
    const root = splitFixture(t);
    fs.appendFileSync(manifestPath(root, target), '\n');
    assert.throws(() => checkPair(root, publicKey), new RegExp(`pinned ${target} files`));
  }
});
test('all four scope pins are checked even with a valid scope signature', t => {
  for (const target of ['core2', 'cores3']) for (const kind of ['manifest', 'cipher']) {
    const root = splitFixture(t);
    writeScope(root, s => {
      s[`${target}_${kind}_sha256`] = '0'.repeat(64);
      s.signature = sign(canonicalScopePayload(s));
    });
    assert.throws(() => checkPair(root, publicKey), new RegExp(`pinned ${target} files`));
  }
});
test('scope prevents relabeling the human version outside the legacy package signature', t => {
  const root = splitFixture(t);
  rewriteManifest(root, 'core2', m => { m.user_version = '2.79'; }, false);
  assert.throws(() => checkPair(root, publicKey), /pinned core2 files/);
});
test('a re-signed replacement CoreS3 package still violates the preserved scope', t => {
  const root = splitFixture(t);
  fs.writeFileSync(path.join(root, 'firmware/cores3/releases/2026092901.enc'), 'xyz');
  rewriteManifest(root, 'cores3', m => { m.cipher_sha256 = digest('xyz'); });
  assert.throws(() => checkPair(root, publicKey), /pinned cores3 files/);
});
test('scope cannot bypass existing package tamper checks on either target', t => {
  for (const target of ['core2', 'cores3']) {
    const root = splitFixture(t);
    const m = JSON.parse(fs.readFileSync(manifestPath(root, target)));
    fs.writeFileSync(path.join(root, 'firmware', target, 'releases', `${m.version}.enc`), 'xyz');
    writeScope(root);
    assert.throws(() => checkPair(root, publicKey), /corrupt/);
  }
});
test('scope cannot bypass manifest signatures or wrong hardware-target URLs', t => {
  for (const target of ['core2', 'cores3']) {
    let root = splitFixture(t);
    rewriteManifest(root, target, m => { m.sha256 = 'b'.repeat(64); }, false);
    writeScope(root);
    assert.throws(() => checkPair(root, publicKey), /package signature/);
    root = splitFixture(t);
    rewriteManifest(root, target, m => {
      const other = target === 'core2' ? 'cores3' : 'core2';
      m.url = `https://xliis.app/firmware/${other}/releases/${m.version}.enc`;
    });
    writeScope(root);
    assert.throws(() => checkPair(root, publicKey), /release identity/);
  }
});
test('scope rejects equal or older numeric build and disallowed user-version changes', t => {
  for (const [version, build] of [
    ['2.78', 2026092901], ['2.78', 2026092801], ['2.77', 2026093002],
    ['2.76', 2026093002], ['1.99', 2026093002], ['3.1', 2026093002], ['4.0', 2026093002]
  ]) assert.throws(() => checkPair(splitFixture(t, version, build), publicKey), /requires a newer Core2 version/);
});
test('matching pair cannot ignore a stale or invalid scope file', t => {
  const root = fixture(t);
  writeScope(root);
  assert.throws(() => checkPair(root, publicKey), /requires a newer Core2 version/);
  writeScope(root, s => { s.signature = Buffer.alloc(256).toString('base64'); });
  assert.throws(() => checkPair(root, publicKey), /scope signature/);
  fs.unlinkSync(scopePath(root));
  assert.equal(checkPair(root, publicKey), '2.77');
});
