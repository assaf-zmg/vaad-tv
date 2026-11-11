// Run: cd server && npm test
var assert = require('assert');
var s = require('../schedule');

var HOUR = 3600 * 1000;
// Israel-local wall-clock time -> "local ms" as used by getBackground
function local(iso) { return Date.parse(iso + 'Z'); }

// --- dates ---
assert.equal(s.parseSheetDate({ v: 'Date(2027,4,12)' }), '2027-05-12');
assert.equal(s.parseSheetDate({ v: '12/05/2027' }), '2027-05-12');
assert.equal(s.parseSheetDate({ v: '2027-05-12' }), '2027-05-12');
assert.equal(s.parseSheetDate({ v: '3.1.27' }), '2027-01-03');
assert.equal(s.parseSheetDate({ v: null }), '');
assert.equal(s.parseSheetDate(null), '');

// --- template labels: " vs ״, unknown -> general ---
assert.equal(s.themeKeyFor('ל"ג בעומר'), 'lagbaomer');
assert.equal(s.themeKeyFor('ל״ג בעומר'), 'lagbaomer');
assert.equal(s.themeKeyFor('ט״ו בשבט'), 'tubishvat');
assert.equal(s.themeKeyFor('משהו אחר'), 'general');

// --- text with / without a name ---
assert.equal(s.fillDetails('מזל טוב ל{פרטים} לרגל החתונה!', 'נועה ודני'), 'מזל טוב לנועה ודני לרגל החתונה!');
assert.equal(s.fillDetails('מזל טוב ל{פרטים} לרגל החתונה!', ''), 'מזל טוב לרגל החתונה!');
assert.equal(s.fillDetails('ועד הבית ודיירי הבניין משתתפים בצער {פרטים}', ''), 'ועד הבית ודיירי הבניין משתתפים בצער');

// --- parsing the mock sheet: row without a date is ignored ---
var rows = s.parseScheduleRows(require('./mock-schedule.json'));
assert.equal(rows.length, 5);
assert.equal(rows[2].from, '2027-06-20'); assert.equal(rows[2].to, '2027-06-26');
assert.equal(rows[4].active, false);

// --- gviz guard: missing tab -> gviz returns the announcements tab -> no schedule ---
var announcementsTab = { table: {
  cols: [ { id: 'A', label: 'Id', type: 'number' }, { id: 'B', label: 'enabled', type: 'boolean' }, { id: 'C', label: 'title', type: 'string' } ],
  rows: [ { c: [ { v: 1 }, { v: true }, { v: 'ברוכים הבאים לחדרה 28!' } ] } ] } };
assert.equal(s.isScheduleTable(announcementsTab), false);
assert.deepEqual(s.parseScheduleRows(announcementsTab), []);
assert.equal(s.isScheduleTable({ table: { cols: [], rows: [] } }), false);
assert.equal(s.isScheduleTable({}), false);
assert.equal(s.isScheduleTable(require('./mock-schedule.json')), true);

// --- priorities: building event > memorial > holiday > pool ---
var sched = [
  { row: 1, from: '2027-05-12', to: '2027-05-12', theme: 'atzmaut', details: '', text: '', active: true },
  { row: 2, from: '2027-05-10', to: '2027-05-16', theme: 'mourning', details: 'משפחת לוי', text: '', active: true },
  { row: 3, from: '2027-05-11', to: '2027-05-11', theme: 'zikaron', details: '', text: '', active: true },
  { row: 4, from: '2027-06-01', to: '2027-06-01', theme: 'wedding', details: '', text: '', active: false },
  { row: 5, from: '2027-06-02', to: '2027-06-02', theme: 'custom', details: '', text: 'אסיפת דיירים ב-20:00', active: true, imageUrl: 'https://example.com/x.jpg' }
];
var b = s.getBackground(sched, local('2027-05-12T10:00:00'));
assert.ok(b.message.indexOf('משפחת לוי') > 0 && b.tone === 'somber', 'mourning beats holiday');
assert.equal(b.sub, 'שלא תדעו עוד צער');

sched[1].active = false;
b = s.getBackground(sched, local('2027-05-12T10:00:00'));
assert.equal(b.message, 'חג עצמאות שמח!'); assert.equal(b.tone, 'festive');
assert.ok(b.url.indexOf('/api/theme/atzmaut/') === 0);

b = s.getBackground(sched, local('2027-05-11T10:00:00'));
assert.equal(b.tone, 'somber'); assert.equal(b.sub, 'יהי זכרם ברוך');

b = s.getBackground(sched, local('2027-06-01T10:00:00'));
assert.ok(b.url.indexOf('/api/pool/') === 0 && b.message === '', 'inactive row -> pool');

b = s.getBackground(sched, local('2027-06-02T10:00:00'));
assert.equal(b.message, 'אסיפת דיירים ב-20:00');
assert.ok(b.url.indexOf('/api/image-proxy?url=') === 0, 'custom link');
assert.equal(b.caption, '');

// --- day boundaries are Israel-local (23:59 vs 00:01) ---
assert.ok(s.getBackground(sched, local('2027-05-10T23:59:00')).url.indexOf('/api/pool/') === 0);
assert.equal(s.getBackground(sched, local('2027-05-11T00:01:00')).tone, 'somber');

// --- pool rotates every 3 hours, at 00/03/06/09... local ---
var a1 = s.getBackground([], local('2027-07-01T09:00:00')).url;
var a2 = s.getBackground([], local('2027-07-01T11:59:00')).url;
var a3 = s.getBackground([], local('2027-07-01T12:00:00')).url;
assert.equal(a1, a2); assert.notEqual(a2, a3);
// 8 slots a day: no repeat within a week (62 photos > 56 slots)
var seen = {};
for (var h = 0; h < 7 * 24; h += 3) seen[s.getBackground([], local('2027-07-01T00:00:00') + h * HOUR).url] = 1;
assert.equal(Object.keys(seen).length, 56);

// --- D22: pool mix, 4-slot cycle landscape -> nature -> landscape -> art ---
var L = s.BG_IMAGES.length, N = s.NATURE_IMAGES.length, A = s.ART_IMAGES.length;
assert.ok(L > 0 && N > 0 && A > 0, 'all three pools loaded');
var base = Math.floor(local('2027-07-01T00:00:00') / (3 * HOUR));
var kinds = [];
for (var k = 0; k < 8; k++) kinds.push(s.getBackground([], (base + k) * 3 * HOUR + 1).id.split('-')[0]);
var cyclePos = base % 4;
var expectCycle = ['landscape', 'nature', 'landscape', 'art'];
kinds.forEach(function(kind, k) { assert.equal(kind, expectCycle[(cyclePos + k) % 4], 'slot ' + k + ' kind'); });

// Each pool walks its own counter: consecutive appearances use consecutive indexes.
function poolSeq(kind, count) {
  var out = [];
  for (var t = 0; out.length < count; t++) {
    var b = s.getBackground([], (base + t) * 3 * HOUR + 1);
    if (b.id.split('-')[0] === kind) out.push(+b.id.split('-')[1]);
  }
  return out;
}
[['landscape', L], ['nature', N], ['art', A]].forEach(function(pk) {
  var seq = poolSeq(pk[0], 4);
  for (var q = 1; q < seq.length; q++) assert.equal(seq[q], (seq[q - 1] + 1) % pk[1], pk[0] + ' counter steps by 1');
});
// Whole pool shown before any repeat (per pool).
[['landscape', L], ['nature', N], ['art', A]].forEach(function(pk) {
  var seq = poolSeq(pk[0], pk[1]), uniq = {};
  seq.forEach(function(i) { uniq[i] = 1; });
  assert.equal(Object.keys(uniq).length, pk[1], pk[0] + ': no repeat within one pass');
});
// Deterministic: same moment -> same photo.
assert.equal(s.getBackground([], local('2027-07-01T10:30:00')).url, s.getBackground([], local('2027-07-01T10:30:00')).url);
// URLs and captions per pool.
function firstOf(kind) { for (var t = 0; ; t++) { var b = s.getBackground([], (base + t) * 3 * HOUR + 1); if (b.id.split('-')[0] === kind) return b; } }
var bl = firstOf('landscape'), bn = firstOf('nature'), ba = firstOf('art');
assert.ok(/^\/api\/pool\/landscape\/\d+\?v=/.test(bl.url), bl.url);
assert.ok(/^\/api\/pool\/nature\/\d+\?v=/.test(bn.url), bn.url);
assert.ok(/^\/api\/pool\/art\/\d+\?v=/.test(ba.url), ba.url);
// D25: on screen = place only; art = "<title> · <artist>"; credits live on /credits
var landImg = s.BG_IMAGES[+bl.id.split('-')[1].split('|')[0]];
var natImg = s.NATURE_IMAGES[+bn.id.split('-')[1].split('|')[0]];
var artImg = s.ART_IMAGES[+ba.id.split('-')[1].split('|')[0]];
assert.equal(bl.caption, landImg.place, 'landscape caption = place only');
assert.equal(bn.caption, natImg.place, 'nature caption = place only');
assert.equal(ba.caption, artImg.place + ' · ' + artImg.credit, 'art caption = title · artist');
// A scheduled holiday still wins over any pool kind.
assert.equal(s.getBackground(sched, local('2027-05-12T10:00:00')).id.indexOf('theme-atzmaut'), 0);

// --- D25: holiday / event photos carry no caption on screen ---
Object.keys(s.THEMES).forEach(function(key) {
  if (!s.THEMES[key].images.length) return;
  var row = [{ row: 1, from: '2027-07-01', to: '2027-07-01', theme: key, details: '', text: '', active: true }];
  var bb = s.getBackground(row, local('2027-07-01T10:30:00'));
  assert.equal(bb.caption, '', key + ' theme photo has no caption');
});

// --- cache-busting: image URLs carry a fingerprint of the source URL, so when content
// swaps the photo at the same index, browsers/CDN fetch the new one (caption and photo match).
var bp = s.getBackground([], local('2027-07-01T10:30:00'));
assert.ok(/\?v=[0-9a-z]+$/.test(bp.url), 'pool url has ?v=: ' + bp.url);
var bt = s.getBackground(sched, local('2027-05-12T10:00:00'));
assert.ok(/^\/api\/theme\/atzmaut\/\d+\?v=[0-9a-z]+$/.test(bt.url), 'theme url has ?v=: ' + bt.url);
assert.notEqual(s.urlVersion('https://a.example/1.jpg'), s.urlVersion('https://a.example/2.jpg'));
(function() {
  var at = local('2027-07-01T10:30:00');
  var before = s.getBackground([], at);
  var kind = before.id.split('-')[0], idx = +before.id.split('-')[1];
  var entry = s.POOLS[kind][idx], saved = entry.url;
  entry.url = saved + '&swapped=1';            // content swaps the photo at the same index
  var after = s.getBackground([], at);
  entry.url = saved;
  assert.equal(after.url.split('?')[0], before.url.split('?')[0], 'same route/index');
  assert.notEqual(after.url, before.url, 'D24: new source url -> new image url');
})();
assert.equal(s.urlVersion('https://a.example/1.jpg'), s.urlVersion('https://a.example/1.jpg'));

console.log('schedule tests: ALL OK');
