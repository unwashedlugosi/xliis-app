const { randomUUID } = require('node:crypto');

const DESTINATION_URL = 'https://apps.apple.com/app/xliis/id6761192003';
const SUPABASE_URL = 'https://dhwllgdxpeucldtmzhme.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRod2xsZ2R4cGV1Y2xkdG16aG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzI2NTMsImV4cCI6MjA4NTgwODY1M30.PmDxpoWXP0zA2sJLgRxAfODH1JcjdFOoRMdnGZwJYLE';
const COOKIE_NAME = 'xlii_bc_vid';
const COOKIE_MAX_AGE = 31_536_000;
const ANALYTICS_TIMEOUT_MS = 1_250;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CAMPAIGN_METADATA = Object.freeze({
  source: 'business_card',
  medium: 'qr',
  campaign: 'hand_stamped_cards',
  content: 'stamp_v1'
});

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

function getVisitor(req) {
  const existing = readCookie(req.headers && req.headers.cookie, COOKIE_NAME);
  if (existing && UUID_PATTERN.test(existing)) {
    return { id: existing.toLowerCase(), repeat: true };
  }

  return { id: randomUUID(), repeat: false };
}

function visitorCookie(visitorId) {
  return `${COOKIE_NAME}=${encodeURIComponent(visitorId)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

async function recordScan(visitor, fetchImpl = globalThis.fetch, timeoutMs = ANALYTICS_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Analytics request timed out'));
    }, timeoutMs);
  });

  try {
    const request = fetchImpl(`${SUPABASE_URL}/rest/v1/xlii_analytics`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        event: 'business_card_qr_scan',
        device_id: visitor.id,
        metadata: { ...CAMPAIGN_METADATA, repeat: visitor.repeat }
      }),
      signal: controller.signal
    });

    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`Analytics request failed with HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

function redirect(res) {
  res.statusCode = 302;
  res.setHeader('Location', DESTINATION_URL);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.end();
}

async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'HEAD') {
    redirect(res);
    return;
  }

  if (method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.end('Method Not Allowed');
    return;
  }

  const visitor = getVisitor(req);
  res.setHeader('Set-Cookie', visitorCookie(visitor.id));

  try {
    await recordScan(visitor);
  } catch {
    // Analytics must never prevent a visitor from reaching the app.
  }

  redirect(res);
}

module.exports = handler;
module.exports._test = {
  ANALYTICS_TIMEOUT_MS,
  CAMPAIGN_METADATA,
  COOKIE_NAME,
  DESTINATION_URL,
  getVisitor,
  readCookie,
  recordScan,
  visitorCookie
};
