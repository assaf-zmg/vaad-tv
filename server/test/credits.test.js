// D25: every photo in every pool and theme is credited on /credits (not linked on the TV).
var assert = require('assert');
var s = require('../schedule');
var credits = require('../credits');

var html = credits.renderCreditsHtml();
function esc(x) { return ('' + x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

var count = 0;
function expectListed(img, label) {
  count++;
  assert.ok(html.indexOf(esc(img.url)) !== -1, label + ': image url missing on /credits');
  assert.ok(html.indexOf(esc(img.credit)) !== -1, label + ': credit missing on /credits');
  if (img.license) assert.ok(html.indexOf(esc(img.license)) !== -1, label + ': license missing');
}
['landscape', 'nature', 'art'].forEach(function(kind) {
  s.POOLS[kind].forEach(function(img, i) {
    expectListed(img, kind + '/' + i);
    assert.ok(html.indexOf(esc(img.place)) !== -1, kind + '/' + i + ': place missing');
  });
});
Object.keys(s.THEMES).forEach(function(key) {
  s.THEMES[key].images.forEach(function(img, i) { expectListed(img, 'theme ' + key + '/' + i); });
});

// Wave 3: every cake photo is credited "צילום: <name> · Unsplash" with its photo page
assert.ok(html.indexOf('<h2>עוגות (' + s.CAKES.length + ')</h2>') !== -1, 'cakes section');
s.CAKES.forEach(function(c) {
  count++;
  assert.ok(html.indexOf(esc(c.image)) !== -1, 'cake ' + c.id + ': image url missing');
  assert.ok(html.indexOf('<strong>' + esc(c.title) + '</strong> · צילום: ' + esc(c.credit) + ' · Unsplash') !== -1, 'cake ' + c.id + ': credit');
  assert.ok(html.indexOf('href="' + esc(c.page) + '"') !== -1, 'cake ' + c.id + ': page link');
});

// Unsplash photos are credited "צילום: <name> · Unsplash", never "ויקישיתוף".
var unsplash = 0;
Object.keys(s.THEMES).forEach(function(key) {
  s.THEMES[key].images.forEach(function(img) {
    if (img.source !== 'Unsplash') return;
    unsplash++;
    assert.ok(html.indexOf('צילום: ' + esc(img.credit) + ' · Unsplash') !== -1, 'unsplash credit for ' + img.credit);
  });
});
// Unsplash entries link their own photo page when content provides "page".
Object.keys(s.THEMES).forEach(function(key) {
  s.THEMES[key].images.forEach(function(img) {
    if (img.source !== 'Unsplash' || !img.page) return;
    assert.ok(html.indexOf('href="' + esc(img.page) + '"') !== -1, 'unsplash page link for ' + img.credit);
  });
});
assert.ok(/<html[^>]*lang="he"[^>]*dir="rtl"/.test(html), 'Hebrew RTL page');
assert.ok(html.indexOf('noindex') !== -1, 'not indexed');

console.log('credits tests: ALL OK (' + count + ' images listed, ' + unsplash + ' from Unsplash)');
