const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_PATH = path.join(
  process.cwd(), 'firmware', 'core2', 'manifest-source.json'
);

function finish(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', contentType);
  res.end(body);
}

function readManifest(readFile = fs.readFileSync) {
  const body = readFile(MANIFEST_PATH, 'utf8');
  const parsed = JSON.parse(body);
  if (!Number.isSafeInteger(parsed.version) || parsed.version <= 0 ||
      typeof parsed.user_version !== 'string' ||
      typeof parsed.url !== 'string' || typeof parsed.signature !== 'string') {
    throw new Error('Invalid Core2 manifest');
  }
  return body;
}

function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    finish(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    finish(res, 200, readManifest(), 'application/json; charset=utf-8');
  } catch {
    finish(res, 503, 'Firmware manifest unavailable');
  }
}

module.exports = handler;
module.exports._test = { MANIFEST_PATH, readManifest };
