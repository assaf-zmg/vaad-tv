// Wave 3: QR PNGs at an integer scale (design + D38). Run: npm test
var assert = require('assert');
delete process.env.PUBLIC_ORIGIN;
var qr = require('../qr');
var golinks = require('../golinks');
var QRCode = require('qrcode');

assert.equal(qr.goUrl('c-cheese'), 'https://vaad-tv.vercel.app/go/c-cheese');
// D46: smaller QR. 6 px/module (222px) normally, 5 (185px) on low screens.
// 8 stays accepted so a page cached before the deploy still gets its code.
assert.equal(qr.scaleFor('6'), 6);
assert.equal(qr.scaleFor('5'), 5);
assert.equal(qr.scaleFor('8'), 8, 'old clients');
// D49: half-size card. 4 px/module (148px), 3 (111px) on low screens; 8/6/5 still served.
assert.equal(qr.scaleFor('4'), 4);
assert.equal(qr.scaleFor('3'), 3);
assert.equal(qr.scaleFor('2'), 6, 'below 3 is not offered');
['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(function(k) {
  assert.strictEqual(qr.scaleFor(k), 6, 'scaleFor(' + k + ') must be a number');
});
assert.equal(qr.scaleFor(undefined), 6, 'default scale');
assert.equal(qr.scaleFor('7'), 6, 'only 5, 6 or 8');
assert.equal(qr.scaleFor('100000'), 6, 'no huge renders');

// D38: every real go id gives a version-3 code (37 modules with the margin)
Object.keys(golinks.LINKS).forEach(function(id) {
  var v = QRCode.create(qr.goUrl(id), { errorCorrectionLevel: 'M' }).version;
  assert.ok(v <= 3, id + ' encodes as QR version ' + v + ' (> 3)');
});

function pngWidth(buf) { return buf.readUInt32BE(16); }

var id = Object.keys(golinks.LINKS)[0];
Promise.all([qr.pngFor(id, 8), qr.pngFor(id, 6), qr.pngFor(id, 8), qr.pngFor('nope', 8), qr.pngFor(id, 5)]).then(function(r) {
  var a8 = r[0], a6 = r[1];
  assert.equal(pngWidth(r[4]), 37 * 5, 'v3 at s=5 -> 185px');
  assert.ok(Buffer.isBuffer(a8));
  assert.equal(a8.slice(0, 4).toString('hex'), '89504e47', 'PNG signature');
  assert.equal(pngWidth(a8), 37 * 8, 'v3 at s=8 -> 296px');
  assert.equal(pngWidth(a6), 37 * 6, 'v3 at s=6 -> 222px');
  assert.strictEqual(r[2], a8, 'cached per id + scale');
  assert.strictEqual(r[3], null, 'unknown id -> null');
  // D46: every real code decodes to its /go/ address at both new sizes
  var PNG = require('pngjs').PNG, jsQR = require('jsqr');
  var ids = Object.keys(golinks.LINKS), jobs = [];
  ids.forEach(function(i) { [6, 5, 4, 3].forEach(function(sc) { jobs.push(qr.pngFor(i, sc).then(function(buf) {
    var png = PNG.sync.read(buf);
    assert.equal(png.width, 37 * sc, i + ' s=' + sc + ' width');
    var code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(code, i + ' s=' + sc + ' does not decode');
    assert.equal(code.data, qr.goUrl(i), i + ' s=' + sc + ' decodes to the wrong url');
  })); }); });
  return Promise.all(jobs).then(function() { console.log('qr tests: ALL OK (' + jobs.length + ' codes decoded at 222/185/148/111px)'); });
}).catch(function(e) { console.error(e); process.exit(1); });
