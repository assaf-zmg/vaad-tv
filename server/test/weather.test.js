// Regression test for the "-99°" bug: in the evening met.no has no daytime blocks
// left for today, so today's max must come from the remaining hours.
var assert = require('assert');
var weather = require('../weather');

function hour(iso, temp, opts) {
  var e = { time: iso, data: { instant: { details: { air_temperature: temp } } } };
  e.data.next_1_hours = { summary: { symbol_code: (opts && opts.sym) || 'clearsky_day' } };
  if (opts && opts.max6 !== undefined) {
    e.data.next_6_hours = { details: { air_temperature_max: opts.max6 }, summary: { symbol_code: 'partlycloudy_day' } };
  }
  return e;
}

// Evening run at 19:00Z: today only has 19:00–23:00Z left (no 06–15Z, no 00/06/12 blocks).
var series = [
  hour('2026-11-11T19:00:00Z', 18.6),
  hour('2026-11-11T20:00:00Z', 17.2),
  hour('2026-11-11T21:00:00Z', 16.4),
  hour('2026-11-11T23:00:00Z', 15.9),
  hour('2026-11-12T00:00:00Z', 15.1, { max6: 16 }),
  hour('2026-11-12T06:00:00Z', 17.0, { max6: 22.4 }),
  hour('2026-11-12T09:00:00Z', 21.0),
  hour('2026-11-12T12:00:00Z', 23.6, { max6: 24.2 }),
  hour('2026-11-12T15:00:00Z', 20.0)
];

var daily = weather.buildDaily(series);
assert.equal(daily.length, 2);
assert.equal(daily[0].date, '2026-11-11');
assert.notEqual(daily[0].maxTemp, -99, 'today must not be -99 in the evening');
assert.equal(daily[0].maxTemp, 19, 'today = max of the remaining hours (18.6 -> 19)');
assert.equal(daily[1].date, '2026-11-12');
assert.equal(daily[1].maxTemp, 24, 'tomorrow = daytime max (24.2 -> 24)');
assert.ok(daily[0].dayName.indexOf('יום ') === 0);

// Normal daytime run still uses the daytime blocks.
var day = weather.buildDaily([
  hour('2026-11-12T06:00:00Z', 17.0, { max6: 22.4 }),
  hour('2026-11-12T12:00:00Z', 23.6, { max6: 24.2 })
]);
assert.equal(day[0].maxTemp, 24);

// A daily forecast is a day icon: a pre-dawn "_night" symbol must not make tomorrow show a moon.
var early = weather.buildDaily([
  hour('2026-11-12T03:00:00Z', 14.0, { sym: 'clearsky_night' }),
  hour('2026-11-12T09:00:00Z', 22.0, { sym: 'clearsky_day' }),
  hour('2026-11-12T12:00:00Z', 23.0, { max6: 24 })
]);
assert.equal(early[0].weathercode.indexOf('night'), -1, 'daily symbol is a day symbol: ' + early[0].weathercode);
var rainyNight = weather.buildDaily([hour('2026-11-12T03:00:00Z', 14.0, { sym: 'rain_night' }), hour('2026-11-12T12:00:00Z', 20.0, { max6: 21 })]);
assert.equal(rainyNight[0].weathercode, 'rain_day', 'worst symbol kept, as its day variant');

// --- Review #3: days are Israel-local, and days before Israel's today are dropped ---
// 00:30 in Israel on 12.11 (UTC+2) = 22:30Z on 11.11. A cached run from 21:00 local
// (19:00Z) still holds 11.11 hours; they belong to "yesterday" and must not show.
var nowMs = Date.parse('2026-11-11T22:30:00Z');
var night = weather.buildDaily([
  hour('2026-11-11T19:00:00Z', 18.0),          // 21:00 local, 11.11 (yesterday)
  hour('2026-11-11T21:00:00Z', 17.0),          // 23:00 local, 11.11 (yesterday)
  hour('2026-11-11T22:00:00Z', 16.5),          // 00:00 local, 12.11 (today)
  hour('2026-11-12T06:00:00Z', 19.0, { max6: 23.4 }),  // 08:00 local, 12.11
  hour('2026-11-12T12:00:00Z', 22.0, { max6: 23.9 }),  // 14:00 local, 12.11
  hour('2026-11-12T22:30:00Z', 15.0),          // 00:30 local, 13.11 (tomorrow)
  hour('2026-11-13T12:00:00Z', 25.0, { max6: 25.6 })
], nowMs);
assert.equal(night[0].date, '2026-11-12', 'first day is Israel today, not the UTC date');
assert.equal(night[0].maxTemp, 24);
assert.equal(night[1].date, '2026-11-13', 'second day is Israel tomorrow');
assert.ok(night[0].dayName.indexOf('חמישי') !== -1, '12.11.2026 is a Thursday: ' + night[0].dayName);
// a 23:30-local entry (21:30Z) is still the same Israel day
var late = weather.buildDaily([hour('2026-11-12T06:00:00Z', 20, { max6: 21 }), hour('2026-11-12T21:30:00Z', 14)], Date.parse('2026-11-12T08:00:00Z'));
assert.equal(late.length, 1, '21:30Z on 12.11 is 23:30 Israel, same day');
// cache key helper: the weather cache must expire at Israel midnight
assert.equal(weather.israelDate(Date.parse('2026-11-11T21:59:00Z')), '2026-11-11');
assert.equal(weather.israelDate(Date.parse('2026-11-11T22:00:00Z')), '2026-11-12');
assert.equal(weather.israelDate(Date.parse('2027-07-01T20:59:00Z')), '2027-07-01');   // summer UTC+3
assert.equal(weather.israelDate(Date.parse('2027-07-01T21:00:00Z')), '2027-07-02');

console.log('weather tests: ALL OK');
