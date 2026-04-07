require('dotenv').config();

var express = require('express');
var fetch = require('node-fetch');
var xml2js = require('xml2js');
var csvParse = require('csv-parse/sync');
var path = require('path');

var app = express();
var PORT = process.env.PORT || 3000;
var SHEET_ID = process.env.GOOGLE_SHEET_ID || '1e6bM89BRo1VEvw4edUaydH8sYy29Kr94BJW-W9Li5pI';

// --- In-memory cache ---
var cache = {
  data: null,
  timestamp: 0,
  TTL: 2 * 60 * 1000 // 2 minutes — for news, announcements, shabbat, alerts
};

// Separate weather cache — met.no model runs update every 6 hours
var weatherCache = {
  data: null,
  timestamp: 0,
  TTL: 6 * 60 * 60 * 1000 // 6 hours
};

// Separate shabbat cache — refresh every Sunday at 05:00 Israel time
var shabbatCache = {
  data: null,
  timestamp: 0
};

// Returns the UTC ms timestamp of the most recent Sunday 05:00 Israel time.
// The shabbat cache is stale whenever its timestamp predates this value.
function lastSunday5amUTC() {
  var israelOffset = getUtcOffset(); // hours (2 or 3)
  var nowUTC = Date.now();
  // Shift "now" into Israel time so we can do simple day/hour arithmetic
  var israelMs  = nowUTC + israelOffset * 3600 * 1000;
  var israelDate = new Date(israelMs);
  var dayOfWeek  = israelDate.getUTCDay();  // 0 = Sunday
  var hourInDay  = israelDate.getUTCHours();

  // How many full days back to the last Sunday?
  var daysBack = dayOfWeek;
  if (dayOfWeek === 0 && hourInDay < 5) {
    daysBack = 7; // It's Sunday but before 05:00 — use the Sunday before
  }

  // Construct that Sunday at 05:00 in Israel time, then convert to UTC
  var sundayIsraelMs = israelMs - daysBack * 24 * 3600 * 1000;
  var sundayDate = new Date(sundayIsraelMs);
  sundayDate.setUTCHours(5, 0, 0, 0); // 05:00 Israel = 05:00 in shifted space
  return sundayDate.getTime() - israelOffset * 3600 * 1000; // back to UTC
}

// --- Weather code to Hebrew description mapping ---
var weatherDescriptions = {
  0: 'בהיר',
  1: 'בהיר בעיקר',
  2: 'מעונן חלקית',
  3: 'מעונן',
  45: 'ערפל',
  48: 'ערפל קפוא',
  51: 'טפטוף קל',
  53: 'טפטוף',
  55: 'טפטוף כבד',
  56: 'טפטוף קפוא',
  57: 'טפטוף קפוא כבד',
  61: 'גשם קל',
  63: 'גשם',
  65: 'גשם כבד',
  66: 'גשם קפוא',
  67: 'גשם קפוא כבד',
  71: 'שלג קל',
  73: 'שלג',
  75: 'שלג כבד',
  77: 'גרגירי שלג',
  80: 'ממטרים קלים',
  81: 'ממטרים',
  82: 'ממטרים כבדים',
  85: 'שלג קל',
  86: 'שלג כבד',
  95: 'סופת רעמים',
  96: 'סופת רעמים עם ברד',
  99: 'סופת רעמים עם ברד כבד'
};

var hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// --- RSS News Filters ---
var NEWS_BLACKLIST = [
  'הרוג','הרוגים','פצוע','פצועים','הרוגה',
  'נרצח','נרצחה','נרצחו',
  'ירי','ירי רקטות','אזעקה',
  'פיגוע','פיגועים','מטען','חיסול',
  'מחבל','מחבלים','ירי טילים','כטב"ם',
  'חדירה','חטיפה','חטופים',
  'לחימה','קרב','מלחמה','עימות',
  'צבא','צה"ל','תקיפה','הפצצה','יירוט',
  'רצח','רציחה','דקירה','דקר','תקף',
  'אלימות','שוד','שדד','גניבה',
  'נעצר','מעצר','חשוד','חקירה','כתב אישום',
  'אונס','הטרדה','תקיפה מינית',
  'תאונה','תאונת דרכים','התנגשות','דריסה',
  'שריפה','דליקה','קריסה','התמוטטות','טביעה',
  'אסון','פינוי','נפגעים','משבר',
  'ירידות','פיטורים','אבטלה','מחסור',
  'התייקרות','זינוק במחירים',
  'מחאה','הפגנה','שביתה','סכסוך',
  'מגפה','קורונה','נגיף','הדבקה','חולה קשה',
  'מוות','תמותה'
];

var NEWS_WHITELIST = [
  'זכה','זכתה','הצלחה','יוזמה','פרויקט',
  'חדש','השקה','קהילה','ילדים','חינוך',
  'תרומה','התנדבות','חדשנות','מחקר',
  'גילוי','בריאות','טוב','סיוע','שיתוף פעולה'
];

function titleContainsAny(title, list) {
  for (var i = 0; i < list.length; i++) {
    if (title.indexOf(list[i]) !== -1) return true;
  }
  return false;
}

// --- Data Fetchers ---

function fetchAnnouncements() {
  var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv';
  return fetch(url)
    .then(function(res) { return res.text(); })
    .then(function(csv) {
      var records = csvParse.parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      // Filter enabled rows
      var filtered = records.filter(function(row) {
        var enabled = (row.enabled || row.Enabled || '').toString().toUpperCase();
        return enabled === 'TRUE' || enabled === 'YES' || enabled === '1';
      });

      // Map to clean objects
      var announcements = filtered.map(function(row) {
        return {
          id: parseInt(row.Id || row.id || row.ID || '0', 10),
          title: row.title || row.Title || '',
          body: row.body || row.Body || '',
          date: row.date || row.Date || '',
          urgent: (row.urgent || row.Urgent || '').toString().toUpperCase() === 'TRUE'
        };
      });

      // Sort: urgent first, then newest date, then highest ID
      announcements.sort(function(a, b) {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.id - a.id;
      });

      return announcements;
    });
}

function fetchYnet() {
  var url = 'http://www.ynet.co.il/Integration/StoryRss2.xml';
  return fetch(url, { timeout: 10000 })
    .then(function(res) { return res.text(); })
    .then(function(xml) {
      return xml2js.parseStringPromise(xml);
    })
    .then(function(result) {
      var whitelisted = [];
      var neutral = [];
      try {
        var channel = result.rss.channel[0];
        var rawItems = channel.item || [];
        // Scan up to 40 items so the filter has enough to choose from
        for (var i = 0; i < Math.min(rawItems.length, 40); i++) {
          var item = rawItems[i];
          var title = (item.title && item.title[0]) || '';
          // Skip blacklisted items
          if (titleContainsAny(title, NEWS_BLACKLIST)) continue;
          var entry = { title: title, link: (item.link && item.link[0]) || '' };
          // Separate whitelisted from neutral
          if (titleContainsAny(title, NEWS_WHITELIST)) {
            whitelisted.push(entry);
          } else {
            neutral.push(entry);
          }
        }
      } catch (e) {
        console.error('Ynet parse error:', e.message);
      }
      // Whitelisted items first, then neutral; cap at 8
      return whitelisted.concat(neutral).slice(0, 8);
    });
}

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

function fetchWeather() {
  // Uses met.no complete endpoint — gives air_temperature_max per 6h block
  // Petah Tikva, Israel: 32.0840°N 34.8878°E
  var url = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'
    + '?lat=32.0840&lon=34.8878';

  return fetch(url, {
    timeout: 10000,
    headers: { 'User-Agent': 'VaadTV/1.0 (lobby-dashboard)' }
  })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var series = data.properties.timeseries;
      var dayMap = {};

      for (var i = 0; i < series.length; i++) {
        var s    = series[i];
        var h    = parseInt(s.time.slice(11, 13), 10);
        var date = s.time.slice(0, 10);

        if (!dayMap[date]) dayMap[date] = { maxTemp: -99, symbol: '' };
        var day = dayMap[date];

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
      var dates = Object.keys(dayMap).sort().slice(0, 6);
      for (var d = 0; d < dates.length; d++) {
        var dateStr = dates[d];
        var dateObj = new Date(dateStr + 'T12:00:00');
        var dayIndex = dateObj.getDay();
        var entry   = dayMap[dateStr];
        var symbol  = entry.symbol || 'clearsky_day';
        daily.push({
          date:        dateStr,
          dayName:     'יום ' + hebrewDays[dayIndex],
          maxTemp:     Math.round(entry.maxTemp),
          minTemp:     Math.round(entry.maxTemp),
          weathercode: symbol,
          description: metSymbolToHebrew(symbol)
        });
      }

      // Current: most recent entry
      var first  = series[0] || {};
      var curDet = (first.data && first.data.instant && first.data.instant.details) || {};
      var curSym = (first.data && first.data.next_1_hours && first.data.next_1_hours.summary &&
                   first.data.next_1_hours.summary.symbol_code) || 'clearsky_day';

      return {
        current: {
          temperature: Math.round(curDet.air_temperature || 0),
          weathercode: curSym,
          description: metSymbolToHebrew(curSym)
        },
        daily: daily
      };
    });
}

function fetchShabbat() {
  var url = 'https://www.hebcal.com/shabbat?cfg=json&geonameid=293918&M=on';
  return fetch(url)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var result = {
        parasha: '',
        candleLighting: '',
        havdalah: '',
        date: ''
      };

      if (data.items && data.items.length) {
        for (var i = 0; i < data.items.length; i++) {
          var item = data.items[i];
          if (item.category === 'candles') {
            result.candleLighting = item.date ? item.date.slice(11, 16) : '';
            result.date = item.date ? item.date.slice(0, 10) : '';
          } else if (item.category === 'havdalah') {
            result.havdalah = item.date ? item.date.slice(11, 16) : '';
          } else if (item.category === 'parashat') {
            result.parasha = item.hebrew || item.title || '';
          }
        }
      }

      return result;
    });
}

function fetchAlerts() {
  var url = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
  return fetch(url, {
    timeout: 5000,
    headers: {
      'Referer': 'https://www.oref.org.il/',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json'
    }
  })
    .then(function(res) { return res.text(); })
    .then(function(text) {
      // The response can be empty string when no alerts
      if (!text || text.trim() === '') return null;
      try {
        var data = JSON.parse(text);
        // data can be an object with id, cat, title, data array, or empty
        if (data && data.id) {
          return {
            id: data.id,
            title: data.title || 'התרעה',
            areas: (data.data || []).join(', ')
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    });
}

function getHebrewDate() {
  try {
    // Use Node.js Intl to format Hebrew date
    var now = new Date();
    var hebrewFormatter = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return hebrewFormatter.format(now);
  } catch (e) {
    console.error('Hebrew date error:', e.message);
    return '';
  }
}

function getGregorianDate() {
  try {
    var now = new Date();
    var formatter = new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return formatter.format(now);
  } catch (e) {
    return '';
  }
}

function getUtcOffset() {
  // Israel is UTC+2 (winter) or UTC+3 (summer / DST)
  var now = new Date();
  var jan = new Date(now.getFullYear(), 0, 1);
  var jul = new Date(now.getFullYear(), 6, 1);
  var stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  // If server runs in Israel timezone, we can compute directly
  // Otherwise, hardcode Israel DST rules
  // Safest: use Intl to get the actual offset for Jerusalem
  try {
    var options = { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false };
    var jerusalemHour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);
    var utcHour = now.getUTCHours();
    var offset = jerusalemHour - utcHour;
    if (offset < 0) offset += 24;
    if (offset > 12) offset -= 24;
    return offset;
  } catch (e) {
    // Fallback: assume IST (UTC+2) or IDT (UTC+3)
    // Israel DST is roughly last Friday before April 2 to last Sunday before October 31
    var month = now.getMonth(); // 0-indexed
    if (month >= 3 && month <= 8) return 3; // April-September: likely DST
    return 2;
  }
}

// --- Main API endpoint ---

app.get('/api/dashboard.json', function(req, res) {
  var now = Date.now();

  // Return cached data if fresh
  if (cache.data && (now - cache.timestamp) < cache.TTL) {
    res.json(cache.data);
    return;
  }

  // Fetch all sources in parallel
  var results = {};

  // Weather uses its own 6-hour cache
  var weatherPromise;
  if (weatherCache.data && (now - weatherCache.timestamp) < weatherCache.TTL) {
    weatherPromise = Promise.resolve(weatherCache.data);
  } else {
    weatherPromise = fetchWeather()
      .then(function(data) {
        weatherCache.data = data;
        weatherCache.timestamp = Date.now();
        return data;
      })
      .catch(function(err) {
        console.error('Error fetching weather:', err.message);
        return weatherCache.data || { current: {}, daily: [] };
      });
  }

  // Shabbat uses its own cache — refreshes every Sunday at 05:00 Israel time
  var shabbatPromise;
  if (shabbatCache.data && shabbatCache.timestamp >= lastSunday5amUTC()) {
    shabbatPromise = Promise.resolve(shabbatCache.data);
  } else {
    shabbatPromise = fetchShabbat()
      .then(function(data) {
        shabbatCache.data = data;
        shabbatCache.timestamp = Date.now();
        return data;
      })
      .catch(function(err) {
        console.error('Error fetching shabbat:', err.message);
        return shabbatCache.data || {};
      });
  }

  var sources = [
    { key: 'announcements', fn: fetchAnnouncements },
    { key: 'ynet', fn: fetchYnet },
    { key: 'alert', fn: fetchAlerts }
  ];

  var promises = sources.map(function(source) {
    return source.fn()
      .then(function(data) {
        results[source.key] = data;
      })
      .catch(function(err) {
        console.error('Error fetching ' + source.key + ':', err.message);
        if (cache.data && cache.data[source.key] !== undefined) {
          results[source.key] = cache.data[source.key];
        } else {
          results[source.key] = source.key === 'alert' ? null : [];
        }
      });
  });

  promises.push(weatherPromise.then(function(data) { results.weather = data; }));
  promises.push(shabbatPromise.then(function(data) { results.shabbat = data; }));

  Promise.all(promises).then(function() {
    var payload = {
      timestamp: new Date().toISOString(),
      utcOffset: getUtcOffset(),
      hebrewDate: getHebrewDate(),
      gregorianDate: getGregorianDate(),
      announcements: results.announcements || [],
      ynet: results.ynet || [],
      weather: results.weather || { current: {}, daily: [] },
      shabbat: results.shabbat || {},
      alert: results.alert || null
    };

    cache.data = payload;
    cache.timestamp = Date.now();

    res.json(payload);
  });
});

// --- Image proxy for old-browser TLS compatibility ---
var imageCache = {};

app.get('/api/bg/:index', function(req, res) {
  var bgImages = [
    'https://images.unsplash.com/photo-1606567595334-d39972c85dbe?w=1920&q=60',
    'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=1920&q=60',
    'https://images.unsplash.com/photo-1457089328109-e5d9bd499191?w=1920&q=60',
    'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=1920&q=60',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&q=60',
    'https://images.unsplash.com/photo-1494972308805-463bc619d34e?w=1920&q=60',
    'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=1920&q=60'
  ];

  var index = parseInt(req.params.index, 10) || 0;
  index = index % bgImages.length;
  var url = bgImages[index];

  // Check cache (cache for 24 hours)
  if (imageCache[index] && imageCache[index].expires > Date.now()) {
    res.set('Content-Type', imageCache[index].contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(imageCache[index].buffer);
    return;
  }

  fetch(url)
    .then(function(r) {
      var ct = r.headers.get('content-type') || 'image/jpeg';
      return r.buffer().then(function(buf) {
        imageCache[index] = {
          buffer: buf,
          contentType: ct,
          expires: Date.now() + 24 * 60 * 60 * 1000
        };
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(buf);
      });
    })
    .catch(function(err) {
      console.error('Image proxy error:', err.message);
      res.status(502).send('');
    });
});

// --- Serve static frontend ---
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, function() {
  console.log('Vaad TV server running on port ' + PORT);
});
