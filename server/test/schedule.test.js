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
// 8 slots a day: no repeat within a week. Wave 3: the 7 slots of the cake window
// (Thu 15:00 -> Fri 12:00) show the cake, so 49 pool slots, all different.
var seen = {}, poolSlots = 0;
for (var h = 0; h < 7 * 24; h += 3) {
  var at0 = local('2027-07-01T00:00:00') + h * HOUR;
  if (s.cakeWindowActive(at0)) continue;
  poolSlots++;
  seen[s.getBackground([], at0).url] = 1;
}
assert.equal(poolSlots, 49);
assert.equal(Object.keys(seen).length, 49);

// --- D22: pool mix, 4-slot cycle landscape -> nature -> landscape -> art ---
var L = s.BG_IMAGES.length, N = s.NATURE_IMAGES.length, A = s.ART_IMAGES.length;
assert.ok(L > 0 && N > 0 && A > 0, 'all three pools loaded');
var base = Math.floor(local('2027-07-01T00:00:00') / (3 * HOUR));
var kinds = [];
for (var k = 0; k < 8; k++) kinds.push(s.poolBackground(base + k).id.split('-')[0]);
var cyclePos = base % 4;
var expectCycle = ['landscape', 'nature', 'landscape', 'art'];
kinds.forEach(function(kind, k) { assert.equal(kind, expectCycle[(cyclePos + k) % 4], 'slot ' + k + ' kind'); });

// Each pool walks its own counter: consecutive appearances use consecutive indexes.
function poolSeq(kind, count) {
  var out = [];
  for (var t = 0; out.length < count; t++) {
    var b = s.poolBackground(base + t);
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
function firstOf(kind) { for (var t = 0; ; t++) { var b = s.poolBackground(base + t); if (b.id.split('-')[0] === kind) return b; } }
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

// ===== Wave 3 (D33): cake slot, trip card, no QR during an alert =====
var golinks = require('../golinks');
// Cake window: Israel local Thursday 15:00 -> Friday 12:00 (2027-07-01 is a Thursday)
assert.equal(s.cakeWindowActive(local('2027-07-01T14:59:00')), false, 'Thu 14:59');
assert.equal(s.cakeWindowActive(local('2027-07-01T15:00:00')), true, 'Thu 15:00');
assert.equal(s.cakeWindowActive(local('2027-07-01T23:59:00')), true, 'Thu night');
assert.equal(s.cakeWindowActive(local('2027-07-02T11:59:00')), true, 'Fri 11:59');
assert.equal(s.cakeWindowActive(local('2027-07-02T12:00:00')), false, 'Fri 12:00');
assert.equal(s.cakeWindowActive(local('2027-07-03T10:00:00')), false, 'Sat');
assert.equal(s.cakeWindowActive(local('2027-06-30T16:00:00')), false, 'Wed');
// DST: Israel moves the clock on Friday 26.3.2027 at 02:00; the window is wall-clock
assert.equal(s.cakeWindowActive(local('2027-03-26T11:59:00')), true, 'DST Fri 11:59');
assert.equal(s.cakeWindowActive(local('2027-03-26T12:00:00')), false, 'DST Fri 12:00');
assert.equal(s.cakeWindowActive(local('2027-03-26T01:30:00')), true, 'DST Fri 01:30');

var cakeBg = s.getBackground([], local('2027-07-01T16:00:00'));
var ci = s.cakeIndex(local('2027-07-01T16:00:00'));
var cake = s.CAKES[ci];
assert.ok(cakeBg.id.indexOf('cake-' + ci) === 0, cakeBg.id);
assert.equal(cakeBg.url, '/api/cake/' + ci + '?v=' + s.urlVersion(cake.image));
assert.equal(cakeBg.caption, '', 'no caption on the cake photo');
// D37: context block (label rotates by 3h slot over labels.json[kind])
var LABELS = require('../labels.json');
function slotOf(at) { return Math.floor(at / (3 * HOUR)); }
function labelAt(kind, at) { return LABELS[kind][slotOf(at) % LABELS[kind].length]; }
assert.ok(!cakeBg.qr, 'D37 replaces bg.qr');
assert.deepEqual(cakeBg.context, { kind: 'cake', label: labelAt('cake', local('2027-07-01T16:00:00')), name: cake.title,
  sub: '', qr: { img: '/api/qr/' + cake.go + '.png', cta: 'סרקו למתכון' } });
// D25/D34: no photo credit on screen in any context block (credits live on /credits)
for (var cs = 0; cs < 60; cs++) {
  var cx = s.poolBackground(cs).context;
  assert.ok(!/צילום|Unsplash/.test(cx.sub), 'credit in a context block: ' + cx.sub);
}
// labels rotate: over 4 consecutive slots the cake shows more than one label
var cakeLabels = {};
['15', '18', '21'].forEach(function(h) { cakeLabels[s.getBackground([], local('2027-07-01T' + h + ':00:00')).context.label] = 1; });
assert.ok(Object.keys(cakeLabels).length > 1, 'labels rotate by slot');
// same week = same cake all window long; next week = another cake
assert.equal(s.cakeIndex(local('2027-07-02T11:00:00')), ci);
assert.notEqual(s.cakeIndex(local('2027-07-08T16:00:00')), ci);
// 52 consecutive weeks show 52 different cakes
var seen = {};
for (var w = 0; w < 52; w++) seen[s.cakeIndex(local('2027-07-01T16:00:00') + w * 7 * 24 * HOUR)] = 1;
assert.equal(Object.keys(seen).length, 52, 'a year without repeats');
// any active schedule item wins over the cake
var holidayThu = [{ row: 1, from: '2027-07-01', to: '2027-07-01', theme: 'atzmaut', details: '', text: '', active: true }];
var hb = s.getBackground(holidayThu, local('2027-07-01T16:00:00'));
assert.equal(hb.id.indexOf('theme-atzmaut'), 0, 'holiday beats cake');
assert.ok(!hb.context, 'no context block on a holiday photo');
// alert: the cake photo stays, its card goes
var cakeAlert = s.getBackground([], local('2027-07-01T16:00:00'), 0, { alert: true });
assert.equal(cakeAlert.id, cakeBg.id);
assert.ok(cakeAlert.context && !cakeAlert.context.qr, 'no QR during an alert (the block itself is hidden by CSS)');

// Trip card only on landscape photos that carry trip data
var tripBg = null, plainLand = null, other = null;
for (var t = 0; t < 400 && !(tripBg && plainLand && other); t++) {
  var at = local('2027-07-04T00:00:00') + t * 3 * HOUR; // Sunday onward, then weekly
  if (s.cakeWindowActive(at)) continue;
  var b = s.getBackground([], at);
  var kind = b.id.split('-')[0], idx = +b.id.split('-')[1];
  if (kind === 'landscape' && s.BG_IMAGES[idx].trip && !tripBg) tripBg = { bg: b, img: s.BG_IMAGES[idx], at: at };
  else if (kind === 'landscape' && !s.BG_IMAGES[idx].trip && !plainLand) plainLand = b;
  else if (kind !== 'landscape' && !other) other = b;
}
assert.ok(tripBg, 'found a trip landscape slot');
assert.deepEqual(tripBg.bg.context, { kind: 'israel', label: labelAt('israel', tripBg.at), name: tripBg.img.place, sub: '',
  qr: { img: '/api/qr/' + tripBg.img.trip.go + '.png', cta: 'סרקו לפרטים' } });
assert.equal(tripBg.bg.caption, tripBg.img.place, 'caption kept (shown when the block is hidden)');
assert.ok(plainLand, 'found an abroad slot');
var plainIdx = +plainLand.id.split('-')[1];
assert.equal(plainLand.context.kind, 'abroad');
assert.ok(LABELS.abroad.indexOf(plainLand.context.label) !== -1, 'abroad label from labels.json');
assert.equal(plainLand.context.name, s.BG_IMAGES[plainIdx].place);
assert.ok(!plainLand.context.qr, 'abroad: no QR');
assert.ok(other && other.context && !other.context.qr, 'nature/art: block without QR');
assert.ok(!s.getBackground([], tripBg.at, 0, { alert: true }).context.qr, 'no trip QR during an alert');
// nature and art blocks
(function() {
  var nat = null, art = null;
  for (var t = 0; t < 40 && !(nat && art); t++) {
    var b = s.poolBackground(t);
    if (!nat && b.id.indexOf('nature-') === 0) nat = { b: b, slot: t };
    if (!art && b.id.indexOf('art-') === 0) art = { b: b, slot: t };
  }
  var ni = s.NATURE_IMAGES[+nat.b.id.split('-')[1]], ai = s.ART_IMAGES[+art.b.id.split('-')[1]];
  assert.deepEqual(nat.b.context, { kind: 'nature', label: LABELS.nature[nat.slot % LABELS.nature.length], name: ni.place, sub: '' });
  assert.deepEqual(art.b.context, { kind: 'art', label: LABELS.art[art.slot % LABELS.art.length], name: ai.place, sub: ai.credit });
})();
// "_comment" in labels.json is never a label
Object.keys(LABELS).forEach(function(k) { if (k !== '_comment') assert.ok(Array.isArray(LABELS[k]) && LABELS[k].length, 'labels ' + k); });
['abroad', 'israel', 'nature', 'art', 'cake'].forEach(function(k) { assert.ok(LABELS[k] && LABELS[k].length, 'labels.json has ' + k); });
// custom committee photo -> no card
var customRow = [{ row: 2, from: '2027-07-04', to: '2027-07-30', theme: 'custom', details: '', text: 'x', active: true, imageUrl: 'https://i.ibb.co/a.jpg' }];
assert.ok(!s.getBackground(customRow, tripBg.at).context, 'committee photo -> no block');

// ===== D39: "אירוע בעיר" =====
assert.equal(s.formatDates('2027-06-04', '2027-06-04'), '4.6');
assert.equal(s.formatDates('2027-02-09', '2027-02-18'), '9–18.2');
assert.equal(s.formatDates('2027-10-28', '2027-11-02'), '28.10–2.11');
(function() {
  var hadCity = !!s.THEMES.city;
  if (!hadCity) s.THEMES.city = { label: 'אירוע בעיר', priority: 1, tone: 'festive', message: '', sub: '', images: [] };
  var goId = Object.keys(golinks.LINKS)[0];
  var city = [{ row: 3, from: '2027-06-04', to: '2027-06-04', theme: 'city', name: 'מרוץ הלילה', details: 'פארק אוחיון',
    text: '', go: goId, active: true }];
  var cb = s.getBackground(city, local('2027-06-04T10:00:00'));
  // with a go id: the D37 block carries the event (no pill, so they don't collide)
  assert.equal(cb.message, '');
  assert.deepEqual(cb.context, { kind: 'event', label: 'אירוע בעיר', name: 'מרוץ הלילה', sub: 'פארק אוחיון · 4.6',
    qr: { img: '/api/qr/' + goId + '.png', cta: 'סרקו לפרטים' } });
  var cbA = s.getBackground(city, local('2027-06-04T10:00:00'), 0, { alert: true });
  assert.ok(!cbA.context.qr, 'no event QR in an alert');
  // no place, no go id -> text without the place, no card
  var bare = [{ row: 3, from: '2027-02-09', to: '2027-02-18', theme: 'city', name: 'אמצע הדרך', details: '', text: '', active: true }];
  var bb2 = s.getBackground(bare, local('2027-02-10T10:00:00'));
  assert.equal(bb2.message, 'אמצע הדרך · 9–18.2', 'no go id: the regular pill');
  assert.ok(!bb2.context);
  // screen text (column G) overrides
  bare[0].text = 'טקסט חופשי';
  assert.equal(s.getBackground(bare, local('2027-02-10T10:00:00')).message, 'טקסט חופשי');
  // G text with a go id: the pill shows the text, and the QR goes in the block
  var cityText = [Object.assign({}, city[0], { text: 'מרוץ הלילה הגדול!' })];
  var ct = s.getBackground(cityText, local('2027-06-04T10:00:00'));
  assert.equal(ct.message, '');
  assert.equal(ct.context.name, 'מרוץ הלילה הגדול!', 'G overrides the block name');
  assert.equal(ct.context.sub, '');
  // a building event (priority 3) on the same day wins and has no QR
  var both = city.concat([{ row: 4, from: '2027-06-04', to: '2027-06-04', theme: 'wedding', details: 'משפחת כהן', text: '', active: true }]);
  var wb = s.getBackground(both, local('2027-06-04T10:00:00'));
  assert.ok(/משפחת כהן/.test(wb.message)); assert.ok(!wb.context);
  if (!hadCity) delete s.THEMES.city;
})();
// Sheet column H holding a known go id -> item.go (not an image link)
(function() {
  var goId = Object.keys(golinks.LINKS)[0];
  function cell(v) { return { v: v }; }
  var table = { table: { cols: [{ label: 'מתאריך' }], rows: [
    { c: [cell('4/6/2027'), null, null, cell('מרוץ'), cell('אירוע בעיר'), null, null, cell(goId), null] },
    { c: [cell('5/6/2027'), null, null, cell('x'), cell('בקשת ועד'), null, null, cell('https://i.ibb.co/a.jpg'), null] },
    { c: [cell('6/6/2027'), null, null, cell('x'), cell('בקשת ועד'), null, null, cell('nope-id'), null] }
  ] } };
  var r = s.parseScheduleRows(table);
  assert.equal(r[0].go, goId); assert.equal(r[0].link, '', 'go id is not an image link');
  assert.equal(r[1].go, ''); assert.equal(r[1].link, 'https://i.ibb.co/a.jpg');
  assert.equal(r[2].go, ''); assert.equal(r[2].link, 'nope-id', 'unknown id stays a link (resolver ignores it)');
})();

// Pools: a photo lives in exactly one pool (content moves photos between pools;
// a duplicate would show twice, and the move must not drop it from both).
(function() {
  var where = {};
  ['landscape', 'nature', 'art'].forEach(function(k) {
    s.POOLS[k].forEach(function(img) {
      assert.ok(img.url && img.place, k + ': url + place');
      assert.ok(!where[img.url], 'photo in two pools (' + where[img.url] + ', ' + k + '): ' + img.place);
      where[img.url] = k;
    });
  });
})();

console.log('schedule tests: ALL OK');
