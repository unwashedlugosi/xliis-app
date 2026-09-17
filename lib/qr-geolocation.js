// Vercel edge geolocation is approximate; never read/store IPs or coordinates.
// https://vercel.com/docs/headers/request-headers
function readQrGeolocation(headers, trustedEdge = process.env.VERCEL === '1') {
  if (!trustedEdge || !headers || typeof headers !== 'object') return null;
  const countryValue = headers['x-vercel-ip-country'];
  const regionValue = headers['x-vercel-ip-country-region'];
  const cityValue = headers['x-vercel-ip-city'];
  const country = typeof countryValue === 'string' && /^[A-Za-z]{2}$/.test(countryValue)
    ? countryValue.toUpperCase() : null;
  const region = country && typeof regionValue === 'string' && /^[A-Za-z0-9]{1,3}$/.test(regionValue)
    ? regionValue.toUpperCase() : null;
  let city = null;
  if (typeof cityValue === 'string' && cityValue.length <= 768) {
    try {
      const decoded = decodeURIComponent(cityValue).normalize('NFC').trim();
      // Reject control/format characters, markup and residual percent escapes.
      // Decode exactly once; truncation could produce a misleading place name.
      if (decoded && Buffer.byteLength(decoded, 'utf8') <= 64 &&
          /^[\p{L}\p{M}\p{N} .,'’()\-]+$/u.test(decoded)) city = decoded;
    } catch { /* Missing/malformed edge data remains unknown. */ }
  }
  if (!city && !region && !country) return null;
  return { source: 'vercel', approximate: true, city, region, country };
}
module.exports = { readQrGeolocation };
