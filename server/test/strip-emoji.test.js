// D21: the lobby's Android 4.4 has no emoji font, so emoji render as empty boxes.
// stripEmoji lives in the ES5 client (public/js/dashboard.js); we extract and test it here.
var assert = require('assert');
var src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'public', 'js', 'dashboard.js'), 'utf8');
var fnSrc = src.slice(src.indexOf('function stripEmoji'), src.indexOf('function escapeHtml'));
var stripEmoji = new Function(fnSrc + '; return stripEmoji;')();

// astral emoji (surrogate pairs), ZWJ sequences, skin tones
assert.equal(stripEmoji('ועד הבית מאחל לכל הדיירים ימים שקטים! 😊'), 'ועד הבית מאחל לכל הדיירים ימים שקטים!');
assert.equal(stripEmoji('שורה 1 🎉\n\nשורה 👍🏽 שלוש'), 'שורה 1\n\nשורה שלוש');
assert.equal(stripEmoji('👨‍👩‍👧 משפחה'), 'משפחה');
// BMP symbols / dingbats U+2600–U+27BF, with or without VS16
assert.equal(stripEmoji('❤️ אהבה'), 'אהבה');
assert.equal(stripEmoji('❤ אהבה'), 'אהבה');
assert.equal(stripEmoji('יום ☀ חם'), 'יום חם');
assert.equal(stripEmoji('✨ חדש ✨'), 'חדש');
assert.equal(stripEmoji('☎️ טלפון: 03-1234567'), 'טלפון: 03-1234567');
// Hebrew punctuation and normal text stay intact
assert.equal(stripEmoji('צה״ל, ז׳בוטינסקי, בית־ספר, "ציטוט" ו-ynet'), 'צה״ל, ז׳בוטינסקי, בית־ספר, "ציטוט" ו-ynet');
assert.equal(stripEmoji('20:00 – 22:00 · 50% הנחה'), '20:00 – 22:00 · 50% הנחה');
assert.equal(stripEmoji(''), '');

console.log('stripEmoji tests: ALL OK');
