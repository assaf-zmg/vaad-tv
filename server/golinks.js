// Wave 3: closed list of QR targets. A QR code always encodes our own short
// address /go/<id>; this file decides where that id leads. Unknown ids -> null,
// so /go/ can never be used as an open redirect. Content owns go-links.json.

var LINKS = require('./go-links.json');
var ID_RE = /^[a-z0-9-]{2,11}$/; // D38: <= 11 chars keeps every code at QR version 3

function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function resolve(id) {
  if (!isValidId(id) || !Object.prototype.hasOwnProperty.call(LINKS, id)) return null;
  var url = LINKS[id] && LINKS[id].url;
  return typeof url === 'string' && url.indexOf('https://') === 0 ? url : null;
}

module.exports = { LINKS: LINKS, isValidId: isValidId, resolve: resolve };
