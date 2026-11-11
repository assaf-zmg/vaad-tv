// Weather helpers: met.no timeseries -> daily max temp + worst daytime symbol.
// Pure functions (no network) so they can be tested.
var hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function metSymbolToHebrew(code) {
  if (code.indexOf('thunder') !== -1) return 'סופת רעמים';
  if (code.indexOf('snow') !== -1) return 'שלג';
  if (code.indexOf('sleet') !== -1) return 'ברד';
  if (code.indexOf('rain') !== -1 || code.indexOf('shower') !== -1) return 'גשם';
  if (code.indexOf('drizzle') !== -1) return 'טפטוף';
  if (code.indexOf('fog') !== -1) return 'ערפל';
  if (code === 'cloudy') return 'מעונן';
  if (code.indexOf('partlycloudy') !== -1) return 'מעונן חלקית';
  if (code.indexOf('fair') !== -1) return 'בהיר בעיקר';
  return 'בהיר';
}

// Severity order for picking worst daytime condition (lower index = worse)
var MET_SEVERITY = [
  'thunder', 'heavysnow', 'snow', 'sleet',
  'heavyrain', 'rain', 'rainshowers', 'shower',
  'lightrain', 'drizzle', 'fog',
  'cloudy', 'partlycloudy', 'fair', 'clearsky'
];
function metSeverity(sym) {
  var base = sym.replace('_day','').replace('_night','');
  for (var i = 0; i < MET_SEVERITY.length; i++) {
    if (base.indexOf(MET_SEVERITY[i]) !== -1) return i;
  }
  return MET_SEVERITY.length;
}

// "YYYY-MM-DD" of a moment in Israel (handles DST). Used to group forecast hours
// into Israel-local days and to expire the weather cache at Israel midnight.
var israelDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit'
});
function israelDate(ms) {
  return israelDateFmt.format(new Date(ms));
}

// nowMs (optional): days before Israel's "today" at that moment are dropped
// (a cached 21:00 run still holds yesterday's hours after midnight).
function buildDaily(series, nowMs) {
      var dayMap = {};

      for (var i = 0; i < series.length; i++) {
        var s    = series[i];
        var h    = parseInt(s.time.slice(11, 13), 10);
        var date = israelDate(Date.parse(s.time)); // Israel-local day, not the UTC date

        if (!dayMap[date]) dayMap[date] = { maxTemp: -99, anyMax: -99, symbol: '' };
        var day = dayMap[date];

        // Fallback max from any hour of the day (late evening has no daytime blocks left)
        var anyT = s.data.instant && s.data.instant.details && s.data.instant.details.air_temperature;
        if (anyT !== undefined && anyT > day.anyMax) day.anyMax = anyT;


        // --- Max temperature ---
        // From 6-hourly blocks (T00, T06, T12) covering daytime
        if ((h === 0 || h === 6 || h === 12) &&
            s.data.next_6_hours && s.data.next_6_hours.details) {
          var mx = s.data.next_6_hours.details.air_temperature_max;
          if (mx !== undefined && mx > day.maxTemp) day.maxTemp = mx;
        }
        // Also scan instant temps for hourly entries during 06–15 UTC (09–18 local)
        if (h >= 6 && h <= 15 && s.data.next_1_hours) {
          var t = s.data.instant.details.air_temperature || -99;
          if (t > day.maxTemp) day.maxTemp = t;
        }

        // --- Worst daytime symbol ---
        // Scan 03–15 UTC (= 06–18 Israel local)
        if (h >= 3 && h <= 15) {
          var sym = (s.data.next_1_hours && s.data.next_1_hours.summary && s.data.next_1_hours.summary.symbol_code)
                 || (s.data.next_6_hours && s.data.next_6_hours.summary && s.data.next_6_hours.summary.symbol_code)
                 || '';
          if (sym && (!day.symbol || metSeverity(sym) < metSeverity(day.symbol))) {
            day.symbol = sym;
          }
        }
      }

      var daily = [];
      var today = nowMs === undefined ? '' : israelDate(nowMs);
      var dates = Object.keys(dayMap).sort().filter(function(d) { return d >= today; }).slice(0, 6);
      for (var d = 0; d < dates.length; d++) {
        var dateStr = dates[d];
        var dateObj = new Date(dateStr + 'T12:00:00Z'); // noon UTC: same weekday everywhere
        var dayIndex = dateObj.getUTCDay();
        var entry   = dayMap[dateStr];
        if (entry.maxTemp === -99) entry.maxTemp = entry.anyMax;
        if (entry.maxTemp === -99) continue; // no data at all for this day
        // A daily forecast shows a day icon: pre-dawn hours may pick a "_night" code.
        var symbol  = (entry.symbol || 'clearsky_day').replace('_night', '_day');
        daily.push({
          date:        dateStr,
          dayName:     'יום ' + hebrewDays[dayIndex],
          maxTemp:     Math.round(entry.maxTemp),
          minTemp:     Math.round(entry.maxTemp),
          weathercode: symbol,
          description: metSymbolToHebrew(symbol)
        });
      }

      return daily;
}

module.exports = { buildDaily: buildDaily, israelDate: israelDate, metSymbolToHebrew: metSymbolToHebrew };
