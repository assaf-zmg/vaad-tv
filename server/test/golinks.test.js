// Wave 3: the closed /go/<id> list + the data contract with content
// (go-links.json, cakes.json, trip fields in bg-images.json). Run: npm test
var assert = require('assert');
var golinks = require('../golinks');
var LINKS = require('../go-links.json');
var CAKES = require('../cakes.json');
var BG = require('../bg-images.json');

var anyId = Object.keys(LINKS)[0];

// --- resolve / isValidId ---
assert.equal(golinks.resolve(anyId), LINKS[anyId].url);
['nope', '../x', '', '__proto__', 'constructor', 'toString', null, undefined, 'ABC', 'a', 'abcdefghijkl']
  .forEach(function(bad) { assert.strictEqual(golinks.resolve(bad), null, 'resolve(' + bad + ')'); });
assert.ok(golinks.isValidId('c-cheese'));
assert.ok(!golinks.isValidId('abcdefghijkl'), '12 chars is too long (D38)');
assert.ok(!golinks.isValidId('Abc'));
assert.ok(!golinks.isValidId('a'));
assert.ok(!golinks.isValidId('a/b'));

// --- contract over the real files (fails loudly in npm test, not in the lobby) ---
Object.keys(LINKS).forEach(function(id) {
  assert.ok(/^[a-z0-9-]{2,11}$/.test(id), 'go id must match ^[a-z0-9-]{2,11}$ (D38): ' + id);
  assert.equal(('' + LINKS[id].url).indexOf('https://'), 0, 'go-link must be https: ' + id);
});
assert.equal(CAKES.length, 52, '52 cakes, one per week');
var cakeIds = {};
CAKES.forEach(function(c) {
  assert.ok(c.id && !cakeIds[c.id], 'cake id unique: ' + c.id);
  cakeIds[c.id] = 1;
  assert.ok(c.title && c.image && c.credit && c.page, 'cake fields: ' + c.id);
  assert.equal(c.image.indexOf('https://images.unsplash.com/'), 0, 'cake image from Unsplash: ' + c.id);
  assert.ok(golinks.resolve(c.go), 'cake go id missing from go-links.json: ' + c.go);
});
var trips = 0;
BG.forEach(function(img) {
  if (!img.trip) return;
  trips++;
  assert.ok(img.trip.title, 'trip title: ' + img.place);
  assert.ok(golinks.resolve(img.trip.go), 'trip go id missing from go-links.json: ' + img.trip.go);
});
assert.ok(trips > 0, 'some landscapes carry trip data');

console.log('golinks tests: ALL OK (' + Object.keys(LINKS).length + ' links, ' + CAKES.length + ' cakes, ' + trips + ' trips)');
