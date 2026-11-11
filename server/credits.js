// D25: /credits — a plain page that credits every photo the screen can show
// (photographer/artist, licence, source link). Not linked from the TV itself.
var s = require('./schedule');

function esc(x) {
  return ('' + (x === undefined || x === null ? '' : x))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Credit line for one image, naming the real source.
function creditLine(img) {
  if (img.source === 'Unsplash' || /images\.unsplash\.com/.test(img.url)) {
    return 'צילום: ' + esc(img.credit) + ' · Unsplash';
  }
  var parts = ['צילום: ' + esc(img.credit)];
  if (img.license) parts.push(esc(img.license));
  if (/wikimedia\.org/.test(img.url)) parts.push('ויקישיתוף');
  return parts.join(' · ');
}

// Link to the source page when we have one, else to the image itself.
function sourceHref(img) {
  if (img.page && /^https?:\/\//.test(img.page)) return img.page;      // e.g. Unsplash photo page
  if (img.source && /^https?:\/\//.test(img.source)) return img.source;
  if (img.source === 'Unsplash' || /images\.unsplash\.com/.test(img.url)) return 'https://unsplash.com/';
  return img.url;
}

function row(title, img, isArt) {
  var credit = isArt
    ? esc(img.credit) + (img.license ? ' · ' + esc(img.license) : '')
    : creditLine(img);
  return '<li>' + (title ? '<strong>' + esc(title) + '</strong> · ' : '') + credit +
    ' · <a href="' + esc(sourceHref(img)) + '">מקור</a>' +
    '<span class="u"> ' + esc(img.url) + '</span></li>';
}

function section(heading, items) {
  return '<h2>' + esc(heading) + ' (' + items.length + ')</h2><ol>' + items.join('') + '</ol>';
}

function renderCreditsHtml() {
  var body = '';
  body += section('נופים', s.POOLS.landscape.map(function(img) { return row(img.place, img); }));
  body += section('טבע וחיות', s.POOLS.nature.map(function(img) { return row(img.place, img); }));
  body += section('אומנות', s.POOLS.art.map(function(img) { return row(img.place, img, true); }));
  var themeItems = [];
  Object.keys(s.THEMES).forEach(function(key) {
    var t = s.THEMES[key];
    t.images.forEach(function(img) { themeItems.push(row(t.label, img)); });
  });
  body += section('חגים ואירועים', themeItems);
  return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
    '<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>קרדיטים לתמונות · לוח הבניין</title>' +
    '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;line-height:1.5;color:#222}' +
    'h1{font-size:24px}h2{font-size:19px;margin-top:28px}li{margin:4px 0}.u{display:none}</style></head><body>' +
    '<h1>קרדיטים לתמונות במסך הלובי</h1>' +
    '<p>התמונות מוצגות ברישיונות חופשיים. כאן מופיעים שם הצלם או האמן, הרישיון וקישור למקור.</p>' +
    body + '</body></html>';
}

module.exports = { renderCreditsHtml: renderCreditsHtml, creditLine: creditLine };
