// Photo-area logic: which photo + message the lobby screen shows right now.
// Pure functions only (no network), so it can be tested with `npm test`.

var BG_IMAGES = require('./bg-images.json');         // landscapes (content-owned)
var NATURE_IMAGES = require('./nature-images.json'); // nature & animals (content-owned)
var ART_IMAGES = require('./art-images.json');       // public-domain art (content-owned)
var THEMES = require('./theme-images.json');
var CAKES = require('./cakes.json');                 // wave 3: cake of the week (content-owned)
var golinks = require('./golinks');                  // wave 3: closed QR target list
var LABELS = require('./labels.json');               // D37: context line per photo kind (content-owned)
var BG_SLOT_MS = 3 * 60 * 60 * 1000; // pool photo changes every 3 hours (Israel time)

function normalizeKey(s) {
  return ('' + (s || '')).replace(/[״"׳'\s־-]/g, '');
}

// Sheet template label (e.g. "ל״ג בעומר", also typed as ל"ג בעומר) -> theme key
var THEME_BY_LABEL = {};
Object.keys(THEMES).forEach(function(key) {
  THEME_BY_LABEL[normalizeKey(THEMES[key].label)] = key;
  THEME_BY_LABEL[normalizeKey(key)] = key;
});

function themeKeyFor(label) {
  return THEME_BY_LABEL[normalizeKey(label)] || 'general';
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// gviz JSON gives dates as "Date(2027,4,12)" (month 0-based). Typed text is
// read as Israeli d/m/y, or y-m-d when it starts with the year.
function parseSheetDate(cell) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return '';
  var v = '' + cell.v;
  var m = v.match(/^Date\((\d+),(\d+),(\d+)/);
  if (m) return m[1] + '-' + pad2(+m[2] + 1) + '-' + pad2(+m[3]);
  m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
  return '';
}

function cellText(cell) {
  if (!cell || cell.v === null || cell.v === undefined) return '';
  return ('' + (cell.f !== undefined && typeof cell.v !== 'string' ? cell.f : cell.v)).trim();
}

function cellBool(cell) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return true; // empty = active
  if (cell.v === true || cell.v === false) return cell.v;
  var s = ('' + cell.v).trim().toUpperCase();
  return !(s === 'FALSE' || s === 'NO' || s === '0' || s === 'לא');
}

// Schedule tab columns by position:
// A from-date | B to-date | C type (info only) | D name | E template |
// F details (family name) | G screen text | H image link | I active | J notes
// gviz quirk: if the requested tab doesn't exist, it silently returns the FIRST tab
// (the announcements). So the header must prove this is the schedule tab.
function isScheduleTable(gvizJson) {
  var cols = (gvizJson && gvizJson.table && gvizJson.table.cols) || [];
  return !!(cols[0] && ('' + (cols[0].label || '')).indexOf('מתאריך') !== -1);
}

// Returns [] when the table isn't the schedule tab (missing tab = no schedule).
function parseScheduleRows(gvizJson) {
  if (!isScheduleTable(gvizJson)) return [];
  var rows = (gvizJson.table && gvizJson.table.rows) || [];
  var out = [];
  rows.forEach(function(r, i) {
    var c = r.c || [];
    var from = parseSheetDate(c[0]);
    if (!from) return; // template/example rows without a date are ignored
    var link = cellText(c[7]);
    // D39: column H may hold a go-link id (QR card) instead of an image link
    var go = golinks.resolve(link) ? link : '';
    out.push({
      row: i,
      from: from,
      to: parseSheetDate(c[1]) || from,
      name: cellText(c[3]),
      theme: themeKeyFor(cellText(c[4])),
      details: cellText(c[5]),
      text: cellText(c[6]),
      link: go ? '' : link,
      go: go,
      active: cellBool(c[8])
    });
  });
  return out;
}

function localDateString(localMs) {
  var d = new Date(localMs);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function fillDetails(template, details) {
  if (!template) return '';
  if (details) return template.replace('{פרטים}', details);
  // No name given: drop the placeholder and the ל prefix in front of it.
  return template.replace(/ ?ל?\{פרטים\}/, '').replace(/\s+/g, ' ').trim();
}

// D22: every 3-hour slot takes the next step of a 4-slot cycle
//   landscape -> nature -> landscape -> art
// and each pool walks its own counter, so every pool is shown in full before it repeats.
var POOLS = { landscape: BG_IMAGES, nature: NATURE_IMAGES, art: ART_IMAGES };
var CYCLE = ['landscape', 'nature', 'landscape', 'art'];

function poolPick(slot) {
  var cycle = Math.floor(slot / CYCLE.length);
  var pos = slot % CYCLE.length;
  var kind = CYCLE[pos];
  // how many times this kind appeared before this slot = its own counter
  var perCycle = 0, before = 0;
  for (var i = 0; i < CYCLE.length; i++) {
    if (CYCLE[i] !== kind) continue;
    perCycle++;
    if (i < pos) before++;
  }
  var counter = cycle * perCycle + before;
  return { kind: kind, index: counter % POOLS[kind].length };
}

// Short, stable fingerprint of an image's source URL (FNV-1a, base36). Appended as ?v=
// so a photo swapped at the same index gets a new address and caches never mix
// a new caption with an old photo. The routes ignore the query string.
function urlVersion(url) {
  var h = 0x811c9dc5;
  for (var i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function poolBackground(slot) {
  var pick = poolPick(slot);
  var img = POOLS[pick.kind][pick.index];
  // D25: on screen only the place (art: "<title> · <artist>"); credits are on /credits
  var caption = pick.kind === 'art' ? img.place + ' · ' + img.credit : img.place;
  var bg = {
    id: pick.kind + '-' + pick.index,
    url: '/api/pool/' + pick.kind + '/' + pick.index + '?v=' + urlVersion(img.url),
    caption: caption,
    message: '', sub: '', tone: ''
  };
  // D37 context block. Landscapes with trip data are Israeli (QR to the site); the rest are abroad.
  if (pick.kind === 'landscape' && img.trip && img.trip.go) {
    bg.context = context('israel', labelFor('israel', slot), img.place, '', qrFor(img.trip.go, 'סרקו לפרטים'));
  } else if (pick.kind === 'landscape') {
    bg.context = context('abroad', labelFor('abroad', slot), img.place, '');
  } else if (pick.kind === 'art') {
    bg.context = context('art', labelFor('art', slot), img.place, img.credit);
  } else {
    bg.context = context(pick.kind, labelFor(pick.kind, slot), img.place, '');
  }
  return bg;
}

// --- Wave 3 (D33): cake of the week, Israel local Thursday 15:00 -> Friday 12:00.
// localMs is wall-clock time, so the DST switch (a Friday at 02:00) can't move it.
var DAY_MS = 24 * 60 * 60 * 1000;
var CAKE_EPOCH = Date.UTC(2026, 0, 1); // a Thursday (local midnight)

function cakeWindowActive(localMs) {
  var d = new Date(localMs);
  var day = d.getUTCDay(), h = d.getUTCHours();
  return (day === 4 && h >= 15) || (day === 5 && h < 12);
}

// One cake per week, the whole list before any repeat.
function cakeIndex(localMs) {
  var week = Math.floor((localMs - CAKE_EPOCH) / (7 * DAY_MS));
  return ((week % CAKES.length) + CAKES.length) % CAKES.length;
}

function cakeBackground(localMs, slot) {
  var i = cakeIndex(localMs);
  var cake = CAKES[i];
  return {
    id: 'cake-' + i,
    url: '/api/cake/' + i + '?v=' + urlVersion(cake.image),
    caption: '',
    message: '', sub: '', tone: '',
    // D25/D34: no photo credit on screen; the cake's credit is on /credits
    context: context('cake', labelFor('cake', slot), cake.title, '', qrFor(cake.go, 'סרקו למתכון'))
  };
}

// D37: one context block per pool photo: why it's here (label), what it is (name),
// optional sub line (artist / photo credit) and, for trips, cakes and city events, a QR.
function labelFor(kind, slot) {
  var list = LABELS[kind];
  return list && list.length ? list[slot % list.length] : '';
}

function qrFor(go, cta) {
  return { img: '/api/qr/' + go + '.png', cta: cta };
}

function context(kind, label, name, sub, qr) {
  var c = { kind: kind, label: label, name: name, sub: sub || '' };
  if (qr) c.qr = qr;
  return c;
}

// D39: "4.6", "9–18.2", "28.10–2.11"
function formatDates(from, to) {
  function dm(iso) { var p = iso.split('-'); return { d: +p[2], m: +p[1] }; }
  var a = dm(from), b = dm(to || from);
  if (!to || to === from) return a.d + '.' + a.m;
  if (a.m === b.m) return a.d + '–' + b.d + '.' + b.m;
  return a.d + '.' + a.m + '–' + b.d + '.' + b.m;
}

// D39: "<event>, <place> · <dates>"
function cityMessage(item) {
  var head = item.name + (item.details ? ', ' + item.details : '');
  return (head ? head + ' · ' : '') + formatDates(item.from, item.to);
}

// What the big photo area shows at `localMs` (ms since epoch, shifted to Israel time):
// building event / committee request > memorial day > holiday / city event > cake > pool.
// Same priority: the lower row in the sheet wins.
// slotMs is optional (local testing can rotate faster); default 3 hours.
// opts.alert: a red alert is on -> no QR at all (wave 3; the block is hidden by CSS too).
function getBackground(schedule, localMs, slotMs, opts) {
  var bg = pickBackground(schedule, localMs, slotMs);
  if (opts && opts.alert && bg.context) delete bg.context.qr;
  return bg;
}

function pickBackground(schedule, localMs, slotMs) {
  var today = localDateString(localMs);
  var slot = Math.floor(localMs / (slotMs || BG_SLOT_MS));

  var best = null;
  (schedule || []).forEach(function(item) {
    if (!item.active || today < item.from || today > item.to) return;
    var pri = THEMES[item.theme].priority || 1;
    if (!best || pri >= best.pri) best = { item: item, pri: pri };
  });
  if (!best) return cakeWindowActive(localMs) ? cakeBackground(localMs, slot) : poolBackground(slot);

  var item = best.item;
  var theme = THEMES[item.theme];
  var bg = poolBackground(slot);
  delete bg.context; // scheduled days: the message pill is the context (D37)
  if (item.imageUrl) {
    bg.id = 'custom-' + item.row + '-' + item.imageUrl;
    bg.url = '/api/image-proxy?url=' + encodeURIComponent(item.imageUrl);
    bg.caption = '';
  } else if (theme.images.length) {
    var i = slot % theme.images.length;
    var img = theme.images[i];
    bg.id = 'theme-' + item.theme + '-' + i;
    bg.url = '/api/theme/' + item.theme + '/' + i + '?v=' + urlVersion(img.url);
    bg.caption = ''; // D25: holiday / event photos carry no caption on screen
  }
  if (item.theme === 'city' && item.go) {
    // D39 + D37: with a QR the event goes in the context block (no pill, so they don't collide)
    bg.message = '';
    bg.context = item.text
      ? context('event', 'אירוע בעיר', item.text, '', qrFor(item.go, 'סרקו לפרטים'))
      : context('event', 'אירוע בעיר', item.name || cityMessage(item),
          (item.details ? item.details + ' · ' : '') + formatDates(item.from, item.to), qrFor(item.go, 'סרקו לפרטים'));
  } else if (item.theme === 'city') {
    bg.message = item.text || cityMessage(item);
  } else {
    bg.message = item.text || fillDetails(theme.message, item.details);
  }
  bg.sub = item.text ? '' : theme.sub;
  bg.tone = theme.tone;
  bg.id += '|' + bg.message;
  return bg;
}

module.exports = {
  BG_IMAGES: BG_IMAGES,
  NATURE_IMAGES: NATURE_IMAGES,
  ART_IMAGES: ART_IMAGES,
  POOLS: POOLS,
  urlVersion: urlVersion,
  THEMES: THEMES,
  CAKES: CAKES,
  cakeWindowActive: cakeWindowActive,
  cakeIndex: cakeIndex,
  formatDates: formatDates,
  poolBackground: poolBackground,
  themeKeyFor: themeKeyFor,
  parseSheetDate: parseSheetDate,
  isScheduleTable: isScheduleTable,
  parseScheduleRows: parseScheduleRows,
  fillDetails: fillDetails,
  getBackground: getBackground
};
