// D20: Hebrew date in letters, e.g. "א׳ בכסלו תשפ״ז".
// Node's Intl gives the Hebrew calendar day/month/year as digits; we convert
// the day and the year (without thousands) to gematria. Server-side only.

var GERESH = '׳';     // U+05F3
var GERSHAYIM = '״';  // U+05F4
var FINALS = { 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' };
var VALUES = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
  [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'],
  [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']
];

// 1..999 -> letters with geresh/gershayim (15 = ט״ו, 16 = ט״ז, 780 = תש״ף)
function gematria(n) {
  var letters = '';
  var rest = n;
  for (var i = 0; i < VALUES.length && rest > 0; i++) {
    while (rest >= VALUES[i][0]) {
      // 15/16 are written 9+6 / 9+7 so they don't spell a divine name
      if (rest === 15) { letters += 'טו'; rest = 0; break; }
      if (rest === 16) { letters += 'טז'; rest = 0; break; }
      letters += VALUES[i][1];
      rest -= VALUES[i][0];
    }
  }
  if (letters.length === 1) return letters + GERESH;
  var last = letters.charAt(letters.length - 1);
  return letters.slice(0, -1) + GERSHAYIM + (FINALS[last] || last);
}

var formatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem'
});

// Date -> "א׳ בכסלו תשפ״ז" (Israel calendar day). Month names come from Intl,
// including "אדר א׳" / "אדר ב׳" in leap years.
function formatHebrewDate(date) {
  var parts = {};
  formatter.formatToParts(date).forEach(function(p) { parts[p.type] = p.value; });
  var day = parseInt(parts.day, 10);
  var year = parseInt(parts.year, 10);
  if (!day || !year || !parts.month) return formatter.format(date); // unexpected: keep Intl's digits
  return gematria(day) + ' ב' + parts.month + ' ' + gematria(year % 1000);
}

// Review #4: Gregorian date in Israel time (the server runs in UTC on Vercel,
// so without a timeZone it showed yesterday's date after midnight).
var gregorianFormatter = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem'
});
function formatGregorianDate(date) {
  return gregorianFormatter.format(date);
}

module.exports = { gematria: gematria, formatHebrewDate: formatHebrewDate, formatGregorianDate: formatGregorianDate };
