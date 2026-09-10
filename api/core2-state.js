const SUPABASE_URL = 'https://dhwllgdxpeucldtmzhme.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRod2xsZ2R4cGV1Y2xkdG16aG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzI2NTMsImV4cCI6MjA4NTgwODY1M30.PmDxpoWXP0zA2sJLgRxAfODH1JcjdFOoRMdnGZwJYLE';
const STATE_RPC_PATH = '/rest/v1/rpc/get_xlii_core2_state';
const UPSTREAM_TIMEOUT_MS = 8_000;

// Supabase anonymous keys are public client credentials. An environment
// override keeps rotation possible without changing this route.
function supabaseKey() {
  return process.env.CORE2_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
}

async function fetchState(fetchImpl = globalThis.fetch, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('State request timed out'));
    }, timeoutMs);
  });

  try {
    const key = supabaseKey();
    const request = fetchImpl(`${SUPABASE_URL}${STATE_RPC_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'identity',
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: '{}',
      signal: controller.signal
    });
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function finish(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', contentType);
  res.end(body);
}

async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    finish(res, 405, 'Method Not Allowed');
    return;
  }

  try {
    const upstream = await fetchState();
    const body = await upstream.text();
    if (!upstream.ok) {
      finish(res, 502, 'Listener service unavailable');
      return;
    }
    finish(res, 200, body, 'application/json; charset=utf-8');
  } catch {
    finish(res, 504, 'Listener service unavailable');
  }
}

module.exports = handler;
module.exports._test = {
  STATE_RPC_PATH,
  SUPABASE_URL,
  UPSTREAM_TIMEOUT_MS,
  fetchState,
  supabaseKey
};
