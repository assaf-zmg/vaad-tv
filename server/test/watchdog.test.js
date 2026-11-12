// D51: black-screen resilience. The inline watchdog (<head>) and the script loader
// (end of <body>) in public/index.html, run in Node with fake timers, DOM and XHR.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var PUB = path.join(__dirname, '..', '..', 'public');
var html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function inline(id) {
  var m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(html);
  assert.ok(m, 'inline script #' + id + ' missing from index.html');
  return m[1];
}
var WATCHDOG = inline('vaad-watchdog');
var LOADER = inline('vaad-loader');

// --- page structure ---
var head = html.slice(0, html.indexOf('</head>'));
assert.ok(head.indexOf('id="vaad-watchdog"') !== -1, 'watchdog lives in <head>');
assert.ok(head.indexOf('id="vaad-watchdog"') < head.indexOf('<link'),
  'watchdog runs before any stylesheet (an inline script after a stylesheet waits for it)');
assert.ok(!/<script[^>]+src=["'][^"']*dashboard\.js/.test(html), 'dashboard.js comes only through the loader');
// ynet icon inline, byte-identical to the file
var logo = /class="ticker-logo" src="data:image\/png;base64,([A-Za-z0-9+\/=]+)"/.exec(html);
assert.ok(logo, 'ynet icon is a data URI');
assert.ok(Buffer.from(logo[1], 'base64').equals(fs.readFileSync(path.join(PUB, 'img', 'ynet-icon-64.png'))), 'data URI = ynet-icon-64.png');

// --- fake browser ---
function Env(search, opts) {
  opts = opts || {};
  var env = this;
  env.now = Date.UTC(2026, 10, 12, 10, 0, 0); // 12:00 in Israel (UTC+2)
  env.timers = []; env.xhrs = []; env.replaced = null; env.appended = [];
  env.clock = { innerHTML: '--:--' };
  var RealDate = Date;
  env.Date = function(v) { return new RealDate(v === undefined ? env.now : v); };
  env.storage = { vaadtv_dashboard_cache: opts.cache || null };
  env.localStorage = {
    getItem: function(k) { return env.storage.hasOwnProperty(k) ? env.storage[k] : null; },
    setItem: function(k, v) { env.storage[k] = '' + v; }
  };
  env.window = { location: {
    pathname: '/', search: search || '',
    replace: function(u) { env.replaced = u; }
  } };
  env.document = {
    getElementById: function(id) { return id === 'clock' ? env.clock : null; },
    createElement: function() { return {}; },
    body: { appendChild: function(s) { s.parentNode = { removeChild: function() { s.removed = true; } }; env.appended.push(s); } }
  };
  function add(fn, ms, every) { env.timers.push({ at: env.now + ms, fn: fn, every: every ? ms : 0 }); }
  env.setTimeout = function(fn, ms) { add(fn, ms, false); };
  env.setInterval = function(fn, ms) { add(fn, ms, true); };
  env.XMLHttpRequest = function() { env.xhrs.push(this); this.readyState = 0; };
  env.XMLHttpRequest.prototype.open = function(m, u) { this.url = u; };
  env.XMLHttpRequest.prototype.send = function() {};
}
Env.prototype.run = function(code) {
  new Function('window', 'document', 'setTimeout', 'setInterval', 'XMLHttpRequest', 'Date', 'localStorage', code)(
    this.window, this.document, this.setTimeout, this.setInterval, this.XMLHttpRequest, this.Date, this.localStorage);
  return this;
};
Env.prototype.advance = function(ms) {
  var end = this.now + ms;
  for (;;) {
    var next = null;
    for (var i = 0; i < this.timers.length; i++) if (this.timers[i].at <= end && (!next || this.timers[i].at < next.at)) next = this.timers[i];
    if (!next) break;
    this.now = next.at;
    if (next.every) next.at += next.every; else this.timers.splice(this.timers.indexOf(next), 1);
    next.fn();
  }
  this.now = end;
  return this;
};
Env.prototype.pings = function() { return this.xhrs.filter(function(x) { return /^\/api\/ping/.test(x.url); }); };
Env.prototype.answer = function(status) {
  var x = this.pings()[this.pings().length - 1];
  x.readyState = 4; x.status = status;
  x.onreadystatechange();
  if (status !== 200 && x.onerror) x.onerror();
};
var S = 1000, MIN = 60 * S;

// 1) script never starts: probe at ~2 min, then reload with w=1
var e = new Env('').run(WATCHDOG);
e.advance(61 * S);
assert.equal(e.pings().length, 0, 'no reload check fires before 90s');
e.advance(60 * S);
assert.equal(e.pings().length, 1, 'probe the server once the page is 90s without a heartbeat');
assert.equal(e.replaced, null, 'no reload before the probe answers');
e.answer(200);
assert.ok(/^\/\?r=\d+&w=1$/.test(e.replaced), 'reload with cache-buster and streak 1, got ' + e.replaced);

// 2) offline: the probe fails -> no reload (it would leave the browser error page); retry in 5 min
e = new Env('').run(WATCHDOG);
e.advance(121 * S); e.answer(0);
assert.equal(e.replaced, null, 'never reload while the server is unreachable');
e.advance(4 * MIN);
assert.equal(e.pings().length, 1, 'no retry before 5 min');
e.advance(1 * MIN + S);
assert.equal(e.pings().length, 2, 'retry 5 min later');
e.answer(200);
assert.ok(/w=1$/.test(e.replaced));

// 3) back-off: with w=2 the limit is 6 min; capped at 10 min
e = new Env('?r=1&w=2').run(WATCHDOG);
e.advance(5 * MIN + 59 * S);
assert.equal(e.pings().length, 0, 'w=2 waits 6 min');
e.advance(2 * MIN);
assert.equal(e.pings().length, 1);
e.answer(200);
assert.ok(/w=3$/.test(e.replaced), 'streak grows, got ' + e.replaced);
e = new Env('?w=9').run(WATCHDOG);
e.advance(9 * MIN + 30 * S);
assert.equal(e.pings().length, 0, 'cap is 10 min, not less');
e.advance(MIN + 31 * S);
assert.equal(e.pings().length, 1, 'cap is 10 min, not more');

// 4) live page: no reload while the heartbeat ticks; one stops -> reload after ~90s with w=1
e = new Env('?w=3').run(WATCHDOG);
for (var i = 0; i < 20; i++) { e.window.__vaadBeat = e.now; e.advance(30 * S); }
assert.equal(e.pings().length, 0, 'beating page is left alone');
e.advance(2 * MIN);
assert.equal(e.pings().length, 1, 'heartbeat stopped -> probe');
e.answer(200);
assert.ok(/^\/\?r=\d+&w=1$/.test(e.replaced), 'a page that once beat restarts the streak at 1, got ' + e.replaced);

// 5) other query params survive, old r/w are replaced
e = new Env('?date=2026-11-12&r=5&w=2').run(WATCHDOG);
e.window.__vaadSafeReload(0);
e.answer(200);
assert.ok(/^\/\?date=2026-11-12&r=\d+$/.test(e.replaced), 'got ' + e.replaced);

// 6) clock: device time until the script beats, cached utcOffset preferred
e = new Env('').run(WATCHDOG);
e.advance(1100);
assert.ok(/^\d\d:\d\d$/.test(e.clock.innerHTML), 'clock shows a time, not --:--: ' + e.clock.innerHTML);
e = new Env('', { cache: JSON.stringify({ utcOffset: 2 }) }).run(WATCHDOG);
e.advance(1100);
assert.equal(e.clock.innerHTML, '12:00', 'UTC 10:00 + cached offset 2');
e.window.__vaadBeat = e.now; e.clock.innerHTML = 'X';
e.advance(3 * S);
assert.equal(e.clock.innerHTML, 'X', 'watchdog leaves the clock to dashboard.js once it beats');
e = new Env('', { cache: '{broken' }).run(WATCHDOG);
e.advance(1100);
assert.ok(/^\d\d:\d\d$/.test(e.clock.innerHTML), 'broken cache -> device time');

// 7) window.onerror keeps the last error for diagnosis
e = new Env('').run(WATCHDOG);
e.window.onerror('boom', 'js/dashboard.js', 12);
assert.ok(/boom/.test(e.window.__vaadLastError));
assert.ok(/boom/.test(e.storage.vaadtv_last_error));

// 8) loader: retries dashboard.js after 5, 15, 30, 60 s with a cache-buster, then stops
e = new Env('').run(LOADER);
assert.equal(e.appended.length, 1);
assert.equal(e.appended[0].src, 'js/dashboard.js');
var waits = [5, 15, 30, 60];
for (i = 0; i < waits.length; i++) {
  e.appended[e.appended.length - 1].onerror();
  assert.ok(e.appended[e.appended.length - 1].removed, 'failed tag removed');
  e.advance(waits[i] * S - 100);
  assert.equal(e.appended.length, i + 1, 'not before ' + waits[i] + 's');
  e.advance(100);
  assert.equal(e.appended.length, i + 2, 'retry ' + (i + 1) + ' at ' + waits[i] + 's');
  assert.ok(/^js\/dashboard\.js\?v=\d+$/.test(e.appended[i + 1].src), 'cache-buster on retry');
}
e.appended[e.appended.length - 1].onerror();
e.advance(10 * MIN);
assert.equal(e.appended.length, 5, 'after 4 retries the watchdog takes over');

console.log('watchdog tests: ALL OK');
