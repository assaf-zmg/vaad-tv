// D20: Hebrew date in letters ("א׳ בכסלו תשפ״ז"), server-side.
var assert = require('assert');
var h = require('../hebdate');

// gematria: geresh (׳) after a single letter, gershayim (״) before the last letter
assert.equal(h.gematria(1), 'א׳');
assert.equal(h.gematria(10), 'י׳');
assert.equal(h.gematria(11), 'י״א');
assert.equal(h.gematria(15), 'ט״ו');   // not י״ה
assert.equal(h.gematria(16), 'ט״ז');   // not י״ו
assert.equal(h.gematria(20), 'כ׳');    // single letter: no final form
assert.equal(h.gematria(29), 'כ״ט');
assert.equal(h.gematria(30), 'ל׳');
// years: thousands dropped, final letter forms at the end
assert.equal(h.gematria(5787 % 1000), 'תשפ״ז');
assert.equal(h.gematria(780), 'תש״ף');
assert.equal(h.gematria(740), 'תש״ם');
assert.equal(h.gematria(800), 'ת״ת');
assert.equal(h.gematria(715), 'תשט״ו');

// full date, Israel calendar day (Asia/Jerusalem), Intl month names kept
function at(iso) { return h.formatHebrewDate(new Date(iso)); }
assert.equal(at('2026-11-11T10:00:00Z'), 'א׳ בכסלו תשפ״ז');
assert.equal(at('2027-01-23T10:00:00Z'), 'ט״ו בשבט תשפ״ז');
assert.equal(at('2027-02-21T10:00:00Z'), 'י״ד באדר א׳ תשפ״ז');   // leap year: Adar I
assert.equal(at('2027-03-23T10:00:00Z'), 'י״ד באדר ב׳ תשפ״ז');   // leap year: Adar II
assert.equal(at('2026-03-03T10:00:00Z'), 'י״ד באדר תשפ״ו');      // regular year: Adar
// 22:30 UTC on 11.11 is already 12.11 in Israel -> ב׳ בכסלו
assert.equal(at('2026-11-11T22:30:00Z'), 'ב׳ בכסלו תשפ״ז');

// --- Review #4: Gregorian date in Israel time (Vercel runs in UTC) ---
assert.equal(h.formatGregorianDate(new Date('2026-11-11T22:30:00Z')), 'יום חמישי, 12 בנובמבר 2026');
assert.equal(h.formatGregorianDate(new Date('2026-11-11T10:00:00Z')), 'יום רביעי, 11 בנובמבר 2026');

console.log('hebdate tests: ALL OK');
