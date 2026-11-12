const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function canonicalPayload(m) {
  return `xlii-core2-release-v1\n${m.version}\n${m.cipher_size}\n${m.plain_size}\n${m.sha256}\n${m.md5}\n${m.nonce}\n${m.tag}\n${m.url}\n`;
}
function canonicalScopePayload(scope) {
  return `xlii-core2-only-release-v1\ncore2\n${scope.core2_manifest_sha256}\n${scope.core2_cipher_sha256}\ncores3\n${scope.cores3_manifest_sha256}\n${scope.cores3_cipher_sha256}\n`;
}
const scopeKeys = ['schema', 'mode', 'core2_manifest_sha256', 'core2_cipher_sha256',
  'cores3_manifest_sha256', 'cores3_cipher_sha256', 'signature'].sort();
const base64 = (value, bytes) => typeof value === 'string' &&
  Buffer.from(value, 'base64').length === bytes && Buffer.from(value, 'base64').toString('base64') === value;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function checkScope(scope, manifests, pins, publicKey) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) ||
      Object.keys(scope).sort().join(',') !== scopeKeys.join(',') ||
      scope.schema !== 1 || scope.mode !== 'core2-only' ||
      !base64(scope.signature, 256) ||
      !scopeKeys.filter(key => key.endsWith('_sha256')).every(key =>
        typeof scope[key] === 'string' && /^[a-f0-9]{64}$/.test(scope[key]))) {
    throw new Error('Invalid Core2-only release scope');
  }
  if (!crypto.verify('sha256', Buffer.from(canonicalScopePayload(scope)),
      {key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING}, Buffer.from(scope.signature, 'base64'))) {
    throw new Error('Invalid Core2-only scope signature');
  }
  for (const target of ['core2', 'cores3']) {
    if (scope[`${target}_manifest_sha256`] !== pins[target].manifest ||
        scope[`${target}_cipher_sha256`] !== pins[target].cipher) {
      throw new Error(`Core2-only scope does not match pinned ${target} files`);
    }
  }
  const [nextMajor, nextMinor] = manifests[0].user_version.split('.').map(BigInt);
  const [oldMajor, oldMinor] = manifests[1].user_version.split('.').map(BigInt);
  const newerUserVersion = (nextMajor === oldMajor && nextMinor > oldMinor) ||
    (nextMajor === oldMajor + 1n && nextMinor === 0n);
  if (manifests[0].version <= manifests[1].version || !newerUserVersion) {
    throw new Error('Core2-only scope requires a newer Core2 version than preserved CoreS3');
  }
}

function checkPair(root = process.cwd(), publicKey = fs.readFileSync(path.join(__dirname, 'firmware-signing-public.pem'))) {
  const pins = {};
  const manifests = ['core2', 'cores3'].map(target => {
    const dir = path.join(root, 'firmware', target);
    const manifestBytes = fs.readFileSync(path.join(dir, 'manifest-source.json'));
    const m = JSON.parse(manifestBytes.toString('utf8'));
    const integer = value => Number.isSafeInteger(value) && value > 0;
    if (m.schema !== 1 || !integer(m.version) || !integer(m.cipher_size) ||
        m.cipher_size > 6000000 || m.cipher_size !== m.plain_size ||
        typeof m.user_version !== 'string' || !/^\d+\.\d+$/.test(m.user_version) ||
        !/^[a-f0-9]{64}$/.test(m.sha256) || !/^[a-f0-9]{32}$/.test(m.md5) ||
        !/^[a-f0-9]{64}$/.test(m.cipher_sha256) || !base64(m.nonce, 12) || !base64(m.tag, 16) ||
        !base64(m.signature, 256) || !base64(m.package_signature, 256) ||
        m.url !== `https://xliis.app/firmware/${target}/releases/${m.version}.enc`) {
      throw new Error(`Invalid ${target} release identity or manifest`);
    }
    const ciphertext = fs.readFileSync(path.join(dir, 'releases', `${m.version}.enc`));
    const cipherHash = sha256(ciphertext);
    if (ciphertext.length !== m.cipher_size || cipherHash !== m.cipher_sha256) {
      throw new Error(`Missing, incomplete or corrupt ${target} package`);
    }
    const payload = canonicalPayload(m);
    const verify = (data, signature) => crypto.verify('sha256', Buffer.from(data),
      {key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING}, Buffer.from(signature, 'base64'));
    if (!verify(payload, m.signature) || !verify(`${payload}cipher_sha256\n${m.cipher_sha256}\n`, m.package_signature)) {
      throw new Error(`Invalid ${target} package signature`);
    }
    pins[target] = {manifest: sha256(manifestBytes), cipher: cipherHash};
    return m;
  });
  // Scope is an additional signed binding, never a replacement for either
  // target's package checks. Even a matching pair must not ignore a stale scope.
  let scopeBytes;
  try { scopeBytes = fs.readFileSync(path.join(root, 'firmware', 'release-scope.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (scopeBytes !== undefined) {
    checkScope(JSON.parse(scopeBytes.toString('utf8')), manifests, pins, publicKey);
  } else if (manifests[0].version !== manifests[1].version || manifests[0].user_version !== manifests[1].user_version) {
    throw new Error('Core2 and CoreS3 must ship together at the same version');
  }
  return manifests[0].user_version;
}
if (require.main === module) console.log(`Firmware release ${checkPair()} verified`);
module.exports = { checkPair, canonicalPayload, canonicalScopePayload };
