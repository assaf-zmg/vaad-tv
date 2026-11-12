// Wave 3: QR code PNG for a go-link id. The code encodes our fixed public
// address (never the request's Host header), error level M, 4-module quiet zone,
// black on white, at a whole number of pixels per module (D46: s=6, or s=5 on
// low screens; s=8 still served for pages cached before D46). The client shows
// it at natural size so modules stay crisp on the old WebView, which ignores
// image-rendering: pixelated.

var QRCode = require('qrcode');
var golinks = require('./golinks');

var PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://vaad-tv.vercel.app';
var cache = {};

function goUrl(id) { return PUBLIC_ORIGIN + '/go/' + id; }

// D49: 4 (148px) and 3 (111px) for the half-size card; 8/6/5 stay served for
// pages cached before each change. Anything else -> 6.
var SCALES = { '3': 3, '4': 4, '5': 5, '6': 6, '8': 8 };
function scaleFor(s) {
  return Object.prototype.hasOwnProperty.call(SCALES, s) ? SCALES[s] : 6; // no prototype keys
}

// -> Promise<Buffer|null> (null: unknown id)
function pngFor(id, scale) {
  if (!golinks.resolve(id)) return Promise.resolve(null);
  var s = scaleFor(scale);
  var key = id + '@' + s;
  // cache the promise, so parallel first requests share one render
  if (!cache[key]) {
    cache[key] = QRCode.toBuffer(goUrl(id), {
      type: 'png', errorCorrectionLevel: 'M', margin: 4, scale: s,
      color: { dark: '#000000ff', light: '#ffffffff' }
    }).catch(function(err) { delete cache[key]; throw err; });
  }
  return cache[key];
}

module.exports = { goUrl: goUrl, scaleFor: scaleFor, pngFor: pngFor };
