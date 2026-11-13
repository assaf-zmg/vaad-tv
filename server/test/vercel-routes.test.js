// D52: vercel.json routing. Static files from the CDN (@vercel/static), everything
// else to the Express function. Simulates Vercel's first-match on anchored src
// regexes (path only; the query string is not part of the match).
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
var SERVER = '/server/server.js';

assert.ok(cfg.builds.some(function(b) { return b.src === 'server/server.js' && b.use === '@vercel/node'; }), 'node build kept');
var server = cfg.builds.filter(function(b) { return b.use === '@vercel/node'; })[0];
assert.deepEqual(server.config.includeFiles, ['public/**'], 'express.static fallback still has the files');
assert.ok(cfg.builds.some(function(b) { return b.src === 'public/**' && b.use === '@vercel/static'; }), 'static build for public/**');
assert.equal(cfg.routes[cfg.routes.length - 1].src, '/(.*)', 'catch-all is last');
assert.equal(cfg.routes[cfg.routes.length - 1].dest, SERVER);
cfg.routes.forEach(function(r) { assert.ok(!r.handle, 'no handle phases mixed in'); });

function route(url) {
  var p = url.split('?')[0];
  for (var i = 0; i < cfg.routes.length; i++) {
    var m = new RegExp('^' + cfg.routes[i].src + '$').exec(p);
    if (m) return cfg.routes[i].dest.replace(/\$(\d)/g, function(_, n) { return m[+n]; });
  }
  return null;
}

// static: must land on a real file under public/
['/', '/?r=1794505390110&w=1', '/?r=1&w=3&date=2026-11-12',
 '/js/dashboard.js', '/js/dashboard.js?v=1794505390110', '/css/style.css',
 '/img/ynet-icon-64.png', '/favicon.png', '/favicon.ico'].forEach(function(u) {
  var d = route(u);
  assert.ok(d && d.indexOf('/public/') === 0, u + ' -> ' + d + ' (expected static)');
  assert.ok(fs.existsSync(path.join(ROOT, d)), u + ' -> ' + d + ' does not exist');
});
assert.equal(route('/?r=1&w=1'), '/public/index.html', 'watchdog reload URL serves index.html');

// dynamic: must reach Express
['/api/dashboard.json', '/api/dashboard.json?v=1', '/api/ping?t=1', '/api/bg/3', '/api/cake/2',
 '/api/qr/c-cheese.png?s=4', '/api/image-proxy?url=x', '/go/c-cheese', '/credits',
 '/js', '/jsx/a.js', '/index.html', '/public/index.html', '/server/server.js', '/api/js/x'].forEach(function(u) {
  assert.equal(route(u), SERVER, u + ' -> ' + route(u) + ' (expected Express)');
});

// every file the page references is served statically
var html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
var refs = [], re = /(?:src|href)="((?:css|js|img)\/[^"?]+|favicon\.[a-z]+)"/g, m;
while ((m = re.exec(html))) refs.push('/' + m[1]);
var loader = /s\.src = '(js\/[^'?]+)'/.exec(html);
if (loader) refs.push('/' + loader[1]);
assert.ok(refs.indexOf('/js/dashboard.js') !== -1 && refs.indexOf('/css/style.css') !== -1, refs.join(','));
refs.forEach(function(u) { assert.ok(route(u).indexOf('/public/') === 0, u + ' not static'); });

console.log('vercel routes tests: ALL OK (' + refs.length + ' page assets static)');
