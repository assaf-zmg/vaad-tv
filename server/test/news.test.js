// Contract test at the seam with content: every fixture title must get the same
// keep value from the JS port (news.js) as from docs/content/news-filter-reference.py.
var assert = require('assert');
var F = require('../news-filter.json');
var news = require('../news');
var fixture = require('../../docs/content/news-filter-fixture.json').items;

var feeds = {};
F.feeds.forEach(function(f) { feeds[f.id] = f; });

var bad = [], kept = 0;
fixture.forEach(function(it) {
  // Feeds not in news-filter.json (e.g. main feed 2) are never fetched -> never kept.
  var c = feeds[it.feed] ? news.classify(it.title, feeds[it.feed], F) : { keep: false, preferred: false };
  if (c.keep) kept++;
  if (c.keep !== it.keep || (it.preferred !== undefined && c.keep && c.preferred !== it.preferred)) {
    bad.push(it.feed + ' expected keep=' + it.keep + '/pref=' + it.preferred + ' got ' + c.keep + '/' + c.preferred + ' | ' + it.title);
  }
});
var expectedKept = fixture.filter(function(it) { return it.keep; }).length;
assert.ok(fixture.length >= 240, 'fixture size ' + fixture.length);
if (bad.length) { console.error(bad.join('\n')); }
assert.equal(bad.length, 0, bad.length + ' fixture mismatches');
assert.equal(kept, expectedKept);

// Tokenizer parity with the reference (expected values printed from the python reference):
// outer quotes stripped, inner gershayim / trailing geresh kept, prefixes only in valid order.
assert.deepEqual(news.tokens('צה״ל הודיע'), [['צה"ל'], ['הודיע', 'ודיע']]);
assert.deepEqual(news.tokens('"צה״ל" הודיע'), [['צה"ל'], ['הודיע', 'ודיע']]);
assert.deepEqual(news.tokens('"שלום" לכם'), [['שלום', 'לום', 'ום'], ['לכם', 'כם']]);
assert.deepEqual(news.tokens('ובהצלחה'), [['ובהצלחה', 'בהצלחה', 'הצלחה', 'צלחה']]);
assert.deepEqual(news.tokens('הכירו'), [['הכירו', 'כירו']]);
assert.deepEqual(news.tokens("סמוטריץ' הודיע"), [["סמוטריץ'"], ['הודיע', 'ודיע']]);
assert.deepEqual(news.tokens('והמחבלים'), [['והמחבלים', 'המחבלים', 'מחבלים']]);

// Selection: preferred first, round-robin, perFeedMax, maxItems, dedupe, never unfiltered.
var groups = F.feeds.map(function(feed) {
  return { feed: feed, items: fixture.filter(function(it) { return it.feed === feed.id; }) };
});
var picked = news.select(groups, F);
assert.ok(picked.length <= F.maxItems);
var perFeed = {};
picked.forEach(function(it) {
  perFeed[it.feed] = (perFeed[it.feed] || 0) + 1;
  assert.ok(it.keep, 'only kept titles: ' + it.title);
});
Object.keys(perFeed).forEach(function(k) { assert.ok(perFeed[k] <= F.perFeedMax); });
var firstRest = picked.findIndex(function(it) { return !it.preferred; });
if (firstRest !== -1) picked.slice(firstRest).forEach(function(it) { assert.ok(!it.preferred, 'preferred titles come first'); });
var dup = [{ feed: F.feeds[0], items: [{ title: 'טעים ממש' }, { title: 'טעים ממש' }] }];
assert.ok(news.select(dup, F).length <= 1);
assert.deepEqual(news.select([{ feed: F.feeds[4], items: [{ title: 'מבזק כללי בלי שום דבר' }] }], F), []);

console.log('news filter tests: ALL OK (' + fixture.length + ' fixture titles, ' + kept + ' kept, ' + picked.length + ' selected)');
