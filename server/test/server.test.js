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

function get(port, path) {
  return new Promise(function(resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: path, timeout: 40000 }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }); });
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
    .then(function() { return get(port, '/credits'); })
    .then(function(r3) {
      assert.equal(r3.status, 200);
      assert.ok(r3.body.indexOf('noindex') !== -1);
      console.log('server tests: ALL OK');
      server.close(); process.exit(0);
    })
    .catch(function(e) { console.error(e); server.close(); process.exit(1); });
});
