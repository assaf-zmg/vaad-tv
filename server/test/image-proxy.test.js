// Review #2: /api/image-proxy must not be an open proxy.
var assert = require('assert');
var proxy = require('../image-proxy');

// allowlist
['https://drive.google.com/uc?export=view&id=1', 'https://drive.usercontent.google.com/download?id=1',
 'https://lh3.googleusercontent.com/abc', 'https://i.ibb.co/xyz/a.jpg', 'https://images.unsplash.com/photo-1?w=1600',
 'https://upload.wikimedia.org/wikipedia/commons/a/a1/x.jpg'].forEach(function(u) {
  assert.ok(proxy.isAllowedUrl(u), 'allowed: ' + u);
});
['https://evil.example/a.jpg', 'http://169.254.169.254/latest/meta-data', 'https://googleusercontent.com.evil.io/a',
 'file:///etc/passwd', 'javascript:alert(1)', 'https://drive.google.com.evil.io/x', '', 'not a url'].forEach(function(u) {
  assert.ok(!proxy.isAllowedUrl(u), 'denied: ' + u);
});

// fake fetch: map of url -> response
function fakeFetch(map) {
  var seen = [];
  var f = function(url, opts) {
    seen.push(url);
    var r = map[url];
    if (!r) return Promise.reject(new Error('unexpected fetch ' + url));
    var headers = r.headers || {};
    return Promise.resolve({
      status: r.status || 200, ok: (r.status || 200) >= 200 && (r.status || 200) < 300,
      headers: { get: function(k) { return headers[k.toLowerCase()] || null; } },
      buffer: function() { return Promise.resolve(Buffer.from(r.body || 'IMG')); }
    });
  };
  f.seen = seen;
  return f;
}

function run(cases) {
  return cases.reduce(function(p, c) {
    return p.then(function() {
      var f = fakeFetch(c.map);
      return proxy.fetchImage(c.url, f).then(function(out) {
        assert.equal(out.status, c.status, c.name + ': status ' + out.status);
        if (c.status === 200) {
          assert.ok(/^image\//.test(out.contentType), c.name + ': image content type');
          assert.ok(out.body && out.body.length, c.name + ': body');
        } else {
          assert.ok(!out.body || !out.body.length, c.name + ': no body on error');
        }
        if (c.notFetched) assert.equal(f.seen.indexOf(c.notFetched), -1, c.name + ': must not fetch ' + c.notFetched);
      });
    });
  }, Promise.resolve());
}

run([
  { name: 'allowed image', url: 'https://i.ibb.co/a.jpg', status: 200,
    map: { 'https://i.ibb.co/a.jpg': { headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } } } },
  { name: 'denied host', url: 'https://evil.example/a.jpg', status: 403, map: {}, notFetched: 'https://evil.example/a.jpg' },
  { name: 'redirect to denied host', url: 'https://drive.google.com/uc?id=1', status: 403,
    map: { 'https://drive.google.com/uc?id=1': { status: 302, headers: { location: 'https://evil.example/x.html' } } },
    notFetched: 'https://evil.example/x.html' },
  { name: 'redirect to allowed host', url: 'https://drive.google.com/uc?id=2', status: 200,
    map: { 'https://drive.google.com/uc?id=2': { status: 302, headers: { location: 'https://drive.usercontent.google.com/d?id=2' } },
           'https://drive.usercontent.google.com/d?id=2': { headers: { 'content-type': 'image/png' } } } },
  { name: 'non-image (HTML) response', url: 'https://i.ibb.co/page', status: 502,
    map: { 'https://i.ibb.co/page': { headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<script>x</script>' } } },
  { name: 'upstream error', url: 'https://i.ibb.co/missing.jpg', status: 502,
    map: { 'https://i.ibb.co/missing.jpg': { status: 404, headers: { 'content-type': 'text/html' } } } },
  { name: 'too large', url: 'https://i.ibb.co/huge.jpg', status: 413,
    map: { 'https://i.ibb.co/huge.jpg': { headers: { 'content-type': 'image/jpeg', 'content-length': String(5 * 1024 * 1024) } } } },
  { name: 'redirect loop', url: 'https://i.ibb.co/loop', status: 502,
    map: { 'https://i.ibb.co/loop': { status: 302, headers: { location: 'https://i.ibb.co/loop' } } } }
]).then(function() {
  console.log('image-proxy tests: ALL OK');
}).catch(function(e) { console.error(e); process.exit(1); });
