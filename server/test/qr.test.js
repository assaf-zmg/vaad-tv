// Wave 3: QR PNGs at an integer scale (design + D38). Run: npm test
var assert = require('assert');
delete process.env.PUBLIC_ORIGIN;
var qr = require('../qr');
var golinks = require('../golinks');
var QRCode = require('qrcode');

assert.equal(qr.goUrl('c-cheese'), 'https://vaad-tv.vercel.app/go/c-cheese');
assert.equal(qr.scaleFor('6'), 6);
assert.equal(qr.scaleFor('8'), 8);
assert.equal(qr.scaleFor(undefined), 8, 'default scale');
assert.equal(qr.scaleFor('7'), 8, 'only 6 or 8');
assert.equal(qr.scaleFor('100000'), 8, 'no huge renders');

// D38: every real go id gives a version-3 code (37 modules with the margin)
Object.keys(golinks.LINKS).forEach(function(id) {
  var v = QRCode.create(qr.goUrl(id), { errorCorrectionLevel: 'M' }).version;
  assert.ok(v <= 3, id + ' encodes as QR version ' + v + ' (> 3)');
});

function pngWidth(buf) { return buf.readUInt32BE(16); }

var id = Object.keys(golinks.LINKS)[0];
Promise.all([qr.pngFor(id, 8), qr.pngFor(id, 6), qr.pngFor(id, 8), qr.pngFor('nope', 8)]).then(function(r) {
  var a8 = r[0], a6 = r[1];
  assert.ok(Buffer.isBuffer(a8));
  assert.equal(a8.slice(0, 4).toString('hex'), '89504e47', 'PNG signature');
  assert.equal(pngWidth(a8), 37 * 8, 'v3 at s=8 -> 296px');
  assert.equal(pngWidth(a6), 37 * 6, 'v3 at s=6 -> 222px');
  assert.strictEqual(r[2], a8, 'cached per id + scale');
  assert.strictEqual(r[3], null, 'unknown id -> null');
  console.log('qr tests: ALL OK');
}).catch(function(e) { console.error(e); process.exit(1); });
