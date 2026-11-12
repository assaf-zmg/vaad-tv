// Integration checks on the real Express app (review #2, #7). Uses the local mocks
// so it doesn't depend on the sheet / ynet; weather and hebcal may hit the network
// (each has a 10s timeout and a fallback).
process.env.SCHEDULE_MOCK = 'test/mock-schedule.json';
process.env.ANNOUNCEMENTS_MOCK = 'test/mock-announcements.csv';
process.env.YNET_MOCK_EMPTY = '1';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;
var assert = require('assert');
var http = require('http');
var app = require('../server.js');
var schedule = require('../schedule');

function get(port, path, headers) {
  return new Promise(function(resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: path, headers: headers || {}, timeout: 40000 }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, raw: raw, body: raw.toString('utf8') });
      });
    }).on('error', reject).on('timeout', function() { reject(new Error('request hung: ' + path)); });
  });
}

var server = app.listen(0, function() {
  var port = server.address().port;
  // 1) /api/image-proxy refuses a non-allowlisted host without fetching it
  get(port, '/api/image-proxy?url=' + encodeURIComponent('https://evil.example/x.html'))
    .then(function(r) {
      assert.equal(r.status, 403, 'denied host -> 403');
      assert.equal(r.headers['x-content-type-options'], 'nosniff');
      assert.equal(r.body, '');
      // 2) a throw while building the payload must not hang the request (review #7)
      var real = schedule.getBackground;
      schedule.getBackground = function() { throw new Error('boom (test)'); };
      return get(port, '/api/dashboard.json').then(function(r2) {
        schedule.getBackground = real;
        assert.equal(r2.status, 200, 'still answers');
        JSON.parse(r2.body); // valid JSON (last good data or {})
      });
    })
    // every image route sends nosniff, on success and on error (manager follow-up)
    .then(function() {
      var key = Object.keys(schedule.THEMES).filter(function(k) { return schedule.THEMES[k].images.length; })[0];
      return Promise.all(['/api/pool/art/0', '/api/pool/nope/1', '/api/bg/0', '/api/theme/' + key + '/0', '/api/theme/nope/0']
        .map(function(p) { return get(port, p).then(function(r) {
          assert.equal(r.headers['x-content-type-options'], 'nosniff', p + ' (status ' + r.status + ') lacks nosniff');
        }); }));
    })
    // wave 3: closed /go/ redirect list
    .then(function() {
      var golinks = require('../golinks');
      var id = Object.keys(golinks.LINKS)[0];
      return Promise.all([get(port, '/go/' + id), get(port, '/go/nope'), get(port, '/go/__proto__')]).then(function(r) {
        assert.equal(r[0].status, 302);
        assert.equal(r[0].headers.location, golinks.LINKS[id].url);
        assert.equal(r[0].headers['cache-control'], 'no-store');
        assert.equal(r[1].status, 404); assert.equal(r[1].body, '');
        assert.equal(r[2].status, 404);
        return id;
      });
    })
    // wave 3: QR PNG, integer scale, fixed origin whatever the Host header says
    .then(function(id) {
      return Promise.all([
        get(port, '/api/qr/' + id + '.png?s=8'),
        get(port, '/api/qr/' + id + '.png?s=6'),
        get(port, '/api/qr/' + id + '.png?s=8', { Host: 'evil.example' }),
        get(port, '/api/qr/nope.png'),
        get(port, '/api/qr/' + id),
        get(port, '/api/qr/' + id + '.png?s=5'),
        get(port, '/api/qr/' + id + '.png'),
        get(port, '/api/qr/' + id + '.png?s=4'),
        get(port, '/api/qr/' + id + '.png?s=3')
      ]).then(function(r) {
        assert.equal(r[7].raw.readUInt32BE(16), 148, 's=4 -> 148px (D49)');
        assert.equal(r[8].raw.readUInt32BE(16), 111, 's=3 -> 111px (D49)');
        assert.equal(r[5].raw.readUInt32BE(16), 185, 's=5 -> 185px (D46)');
        assert.equal(r[6].raw.readUInt32BE(16), 222, 'no s -> 222px (D46 default)');
        assert.equal(r[0].status, 200);
        assert.equal(r[0].headers['content-type'], 'image/png');
        assert.ok(/max-age=86400/.test(r[0].headers['cache-control']));
        assert.equal(r[0].headers['x-content-type-options'], 'nosniff');
        assert.equal(r[0].raw.readUInt32BE(16), 296, 's=8 -> 296px (kept for cached pages)');
        assert.equal(r[1].raw.readUInt32BE(16), 222, 's=6 -> 222px');
        assert.ok(r[2].raw.equals(r[0].raw), 'Host header does not change the code');
        assert.equal(r[3].status, 404);
        assert.equal(r[4].status, 404, 'needs the .png suffix');
      });
    })
    // wave 3: cake photo route
    .then(function() { return Promise.all([get(port, '/api/cake/999'), get(port, '/api/cake/x')]); })
    .then(function(r) {
      assert.equal(r[0].status, 404); assert.equal(r[1].status, 404);
      assert.equal(r[0].headers['x-content-type-options'], 'nosniff');
    })
    // D35: the newsMode flag from settings.json reaches the client
    .then(function() { return get(port, '/api/dashboard.json'); })
    .then(function(r) {
      var d = JSON.parse(r.body);
      assert.equal(d.newsMode, require('../settings.json').newsMode, 'newsMode in dashboard.json');
      assert.ok(d.newsMode === 'ticker' || d.newsMode === 'card');
      assert.ok(d.background && d.background.url, 'background still built');
    })
    .then(function() { return get(port, '/credits'); })
    .then(function(r3) {
      assert.equal(r3.status, 200);
      assert.ok(r3.body.indexOf('noindex') !== -1);
      console.log('server tests: ALL OK');
      server.close(); process.exit(0);
    })
    .catch(function(e) { console.error(e); server.close(); process.exit(1); });
});
