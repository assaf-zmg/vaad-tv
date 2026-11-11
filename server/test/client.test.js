// Client (ES5) helpers from public/js/dashboard.js, extracted and tested in Node.
var assert = require('assert');
var src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'public', 'js', 'dashboard.js'), 'utf8');
function extract(name, nextMarker) {
  var start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + ' not found in dashboard.js');
  var end = src.indexOf(nextMarker, start);
  return src.slice(start, end);
}

// --- Review #1: fetchJSON must call back exactly once (else fetchData spawns two retry loops) ---
function FakeXHR() { FakeXHR.last = this; this.readyState = 0; this.status = 0; }
FakeXHR.prototype.open = function(m, u) { this.url = u; };
FakeXHR.prototype.send = function() {};
var fetchJSON = new Function('XMLHttpRequest', extract('fetchJSON', '// --- LocalStorage Cache') + '; return fetchJSON;')(FakeXHR);

// network failure: Chrome fires readystatechange (4, status 0) AND onerror
var calls = 0;
fetchJSON('/api/dashboard.json', function() { calls++; });
var x = FakeXHR.last;
x.readyState = 4; x.status = 0; x.onreadystatechange(); if (x.onerror) x.onerror();
assert.equal(calls, 1, 'network error: callback must run once, ran ' + calls);

// success then a stray error event: still once, with data
calls = 0; var got = null;
fetchJSON('/x', function(err, data) { calls++; got = data; });
x = FakeXHR.last; x.readyState = 4; x.status = 200; x.responseText = '{"ok":1}';
x.onreadystatechange(); if (x.onerror) x.onerror();
assert.equal(calls, 1); assert.deepEqual(got, { ok: 1 });

// timeout: set to 20s, ontimeout reports an error once even if readystatechange follows
calls = 0; var lastErr = null;
fetchJSON('/x', function(err) { calls++; lastErr = err; });
x = FakeXHR.last;
assert.equal(x.timeout, 20000, 'xhr.timeout = 20000');
assert.equal(typeof x.ontimeout, 'function', 'ontimeout handler');
x.ontimeout(); x.readyState = 4; x.status = 0; x.onreadystatechange();
assert.equal(calls, 1); assert.ok(lastErr);

// --- Review #6: CSS url() must be quoted and escape ( ) ' " so Wikimedia names don't break it ---
var cssUrl = new Function(extract('cssUrl', '\n  }\n') + '\n  }; return cssUrl;')();
assert.equal(cssUrl('/api/image-proxy?url=a(b)c\'d"e'), 'url("/api/image-proxy?url=a%28b%29c%27d%22e")');
assert.equal(cssUrl('/api/pool/landscape/3?v=abc'), 'url("/api/pool/landscape/3?v=abc")');

console.log('client tests: ALL OK');
