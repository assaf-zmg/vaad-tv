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

// --- D37: photo context block (design's renderContext; replaces wave-3 renderQrCard) ---
var escFn = extract('escapeHtml', '\n  }\n') + '\n  }';
assert.equal(src.indexOf('function renderQrCard('), -1, 'wave-3 renderQrCard removed (superseded by D37)');
function makeCtx(innerHeight) {
  var els = { photoContext: { innerHTML: 'x', className: 'y' }, photoCaption: { style: { display: '' } } };
  var helpers = extract('qrScale', '\n  }\n') + '\n  }\n' + extract('qrSrc', '\n  }\n') + '\n  }\n';
  var fn = new Function('els', 'window', 'document', escFn + '\n' + helpers + extract('renderContext', '\n  }\n') + '\n  }; return renderContext;')(
    els, { innerHeight: innerHeight }, { documentElement: { clientHeight: innerHeight } });
  return { els: els, render: fn };
}
var q = makeCtx(1080);
q.render({ message: '', context: { kind: 'cake', label: 'העוגה הבאה שלכם', name: 'עוגת <b>', sub: 'צילום: X · Unsplash',
  qr: { img: '/api/qr/c-cheese.png', cta: 'סרקו למתכון' } } });
assert.equal(q.els.photoContext.className, 'ctx-cake has-qr');
assert.ok(q.els.photoContext.innerHTML.indexOf('src="/api/qr/c-cheese.png?s=8"') !== -1, q.els.photoContext.innerHTML);
assert.ok(q.els.photoContext.innerHTML.indexOf('עוגת &lt;b&gt;') !== -1, 'name escaped');
assert.ok(!/width=|height=/.test(q.els.photoContext.innerHTML), 'natural size: no width/height');
assert.equal(q.els.photoCaption.style.display, 'none', 'caption hidden while the block shows');
q = makeCtx(720);
q.render({ context: { kind: 'israel', label: 'l', name: 'n', sub: '', qr: { img: '/api/qr/ramon.png', cta: 'c' } } });
assert.ok(q.els.photoContext.innerHTML.indexOf('src="/api/qr/ramon.png?s=6"') !== -1, 'low screen -> s=6');
q.render({ context: { kind: 'abroad', label: 'l', name: 'n', sub: '' } });
assert.equal(q.els.photoContext.className, 'ctx-abroad');
assert.equal(q.els.photoContext.innerHTML.indexOf('<img'), -1, 'no QR without qr');
// a message on the photo wins: no block, caption back
q.render({ message: 'חג שמח', context: { kind: 'abroad', label: 'l', name: 'n' } });
assert.equal(q.els.photoContext.innerHTML, ''); assert.equal(q.els.photoCaption.style.display, '');
q.render({ id: 'x' });
assert.equal(q.els.photoContext.innerHTML, ''); assert.equal(q.els.photoContext.className, '');
q.render(null);
assert.equal(q.els.photoContext.innerHTML, '');

// --- Review fixes: showContext redraws only on change, and shows the QR only once its PNG loaded ---
(function() {
  var renders = [], images = [];
  function FakeImage() { images.push(this); }
  var win = { innerHeight: 0 }, doc = { documentElement: { clientHeight: 1080 } };
  var api = new Function('els', 'window', 'document', 'Image', 'renderContext',
    extract('qrScale', '\n  }\n') + '\n  }\n' + extract('qrSrc', '\n  }\n') + '\n  }\n' +
    'var ctxShown = "";\n' + extract('showContext', '\n  }\n') + '\n  }; return { showContext: showContext, qrScale: qrScale };'
  )({}, win, doc, FakeImage, function(bg) { renders.push(bg); });
  assert.equal(api.qrScale(), 8, 'innerHeight 0 -> falls back to the document height');
  win.innerHeight = 720; assert.equal(api.qrScale(), 6); win.innerHeight = 1080;
  var plain = { message: '', context: { kind: 'abroad', label: 'l', name: 'n', sub: '' } };
  api.showContext(plain); api.showContext(plain);
  assert.equal(renders.length, 1, 'same block on the next poll -> no redraw');
  var withQr = { message: '', context: { kind: 'cake', label: 'l', name: 'n', sub: '', qr: { img: '/api/qr/c-cheese.png', cta: 'c' } } };
  renders = [];
  api.showContext(withQr);
  assert.equal(images.length, 1); assert.equal(images[0].src, '/api/qr/c-cheese.png?s=8');
  assert.ok(!renders.length || !renders[renders.length - 1] || !renders[renders.length - 1].context, 'nothing with a QR before the PNG loads');
  images[0].onload();
  assert.strictEqual(renders[renders.length - 1], withQr, 'QR block after the PNG loaded');
  // PNG fails -> the block without the QR
  var other = { message: '', context: { kind: 'israel', label: 'l', name: 'm', sub: '', qr: { img: '/api/qr/ramon.png', cta: 'c' } } };
  api.showContext(other);
  images[1].onerror();
  var last = renders[renders.length - 1];
  assert.equal(last.context.name, 'm'); assert.ok(!last.context.qr, 'failed PNG -> no QR tile');
  // a stale load (the photo changed meanwhile) does nothing
  api.showContext(plain);
  var n = renders.length; images[1].onload && images[1].onload();
  assert.equal(renders.length, n, 'stale PNG load ignored');
})();

// --- D35: newsMode flag toggles body.ticker-on (no classList on the old WebView) ---
var body = { className: 'ticker-on has-alert' };
var applyNewsMode = new Function('document', extract('applyNewsMode', '\n  }\n') + '\n  }; return applyNewsMode;')({ body: body });
applyNewsMode('card');
assert.equal(body.className.replace(/\s+/g, ' ').trim(), 'has-alert', 'card -> no ticker-on');
applyNewsMode('ticker');
applyNewsMode('ticker');
assert.equal(body.className.match(/ticker-on/g).length, 1, 'added once');
assert.ok(/has-alert/.test(body.className));
applyNewsMode(undefined); // older cached payload without the flag: keep the page default
assert.ok(/ticker-on/.test(body.className));

console.log('client tests: ALL OK');
