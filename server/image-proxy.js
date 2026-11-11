// /api/image-proxy hardening (code review #2). Committee announcements and
// "בקשת ועד" rows link images on Google Drive / imgBB; the old Android can't load
// them directly, so the server proxies them. It must not be an open proxy:
//  - only https URLs on known image hosts, re-checked on every redirect hop
//    (redirects are followed manually, so a denied host is never even fetched);
//  - the upstream must answer 2xx with an image/* Content-Type;
//  - at most 4 MB.

var MAX_BYTES = 4 * 1024 * 1024;
var MAX_REDIRECTS = 5;
var EXACT_HOSTS = {
  'drive.google.com': 1,
  'drive.usercontent.google.com': 1,
  'i.ibb.co': 1,
  'images.unsplash.com': 1,
  'upload.wikimedia.org': 1,
  'thumb.wikimedia.org': 1
};
var SUFFIX_HOSTS = ['.googleusercontent.com'];

function parse(url) {
  try { return new URL(url); } catch (e) { return null; }
}

function isAllowedUrl(url) {
  var u = parse(url);
  if (!u || u.protocol !== 'https:' || u.username || u.password) return false;
  var host = u.hostname.toLowerCase();
  if (EXACT_HOSTS[host]) return true;
  for (var i = 0; i < SUFFIX_HOSTS.length; i++) {
    var sfx = SUFFIX_HOSTS[i];
    if (host.length > sfx.length && host.slice(-sfx.length) === sfx) return true;
  }
  return false;
}

// Resolves to { status, contentType?, body? }. Never rejects.
function fetchImage(url, fetchImpl, hops) {
  hops = hops || 0;
  if (!isAllowedUrl(url)) return Promise.resolve({ status: 403 });
  if (hops > MAX_REDIRECTS) return Promise.resolve({ status: 502 });

  return fetchImpl(url, {
    redirect: 'manual',
    timeout: 10000,
    size: MAX_BYTES,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VaadTV/1.0)' }
  }).then(function(r) {
    if (r.status >= 300 && r.status < 400) {
      var loc = r.headers.get('location');
      if (!loc) return { status: 502 };
      var next;
      try { next = new URL(loc, url).toString(); } catch (e) { return { status: 502 }; }
      return fetchImage(next, fetchImpl, hops + 1);
    }
    if (!r.ok) return { status: 502 };
    var ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('image/') !== 0) return { status: 502 };
    var len = parseInt(r.headers.get('content-length') || '0', 10);
    if (len > MAX_BYTES) return { status: 413 };
    return r.buffer().then(function(buf) {
      if (buf.length > MAX_BYTES) return { status: 413 };
      return { status: 200, contentType: ct, body: buf };
    });
  }).catch(function(err) {
    // node-fetch throws on a body larger than `size`
    if (err && err.type === 'max-size') return { status: 413 };
    console.error('Image proxy error:', err && err.message);
    return { status: 502 };
  });
}

module.exports = { isAllowedUrl: isAllowedUrl, fetchImage: fetchImage, MAX_BYTES: MAX_BYTES };
