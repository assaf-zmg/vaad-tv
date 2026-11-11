require('dotenv').config();

var express = require('express');
var fetch = require('node-fetch');
var xml2js = require('xml2js');
var csvParse = require('csv-parse/sync');
var path = require('path');

var app = express();

// Every /api response (images, JSON, errors) declares its own type: no MIME sniffing.
app.use('/api', function(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
var PORT = process.env.PORT || 3000;
var SHEET_ID = process.env.GOOGLE_SHEET_ID || '1e6bM89BRo1VEvw4edUaydH8sYy29Kr94BJW-W9Li5pI';

// --- Photo area: pool / holiday / building-event logic lives in schedule.js ---
var schedule = require('./schedule');
var SETTINGS = require('./settings.json');      // dev-owned switches (D35 newsMode)
var NEWS_MODE = SETTINGS.newsMode === 'card' ? 'card' : 'ticker';
var BG_IMAGES = schedule.BG_IMAGES;
var THEMES = schedule.THEMES;
var SCHEDULE_SHEET = process.env.SCHEDULE_SHEET || 'לוח תמונות';

// LOCAL TESTING ONLY (ignored on Vercel):
//   DEBUG_DATE=2027-05-12T10:00:00+03:00   pretend it's this moment
//   SCHEDULE_MOCK=test/mock-schedule.json  read the schedule from a file, not the sheet
var IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV); // debug hooks off on any Vercel env
var DEBUG_DATE_MS = (!IS_VERCEL && process.env.DEBUG_DATE) ? Date.parse(process.env.DEBUG_DATE) : NaN;
var SCHEDULE_MOCK = (!IS_VERCEL && process.env.SCHEDULE_MOCK) ? path.resolve(__dirname, process.env.SCHEDULE_MOCK) : '';
if (!isNaN(DEBUG_DATE_MS)) console.log('DEBUG_DATE active:', new Date(DEBUG_DATE_MS).toISOString());
//   ANNOUNCEMENTS_MOCK=test/mock-announcements.csv  announcements from a CSV, not the sheet
var ANNOUNCEMENTS_MOCK = (!IS_VERCEL && process.env.ANNOUNCEMENTS_MOCK) ? path.resolve(__dirname, process.env.ANNOUNCEMENTS_MOCK) : '';
//   ALERT_MOCK=טקסט התרעה       show a red alert banner with this text
//   YNET_MOCK_EMPTY=1           ynet returns no items (empty state)
//   DEBUG_ROTATE_SEC=60         pool photo changes every N seconds (to watch the crossfade)
var ALERT_MOCK = (!IS_VERCEL && process.env.ALERT_MOCK) || '';
var YNET_MOCK_EMPTY = !IS_VERCEL && process.env.YNET_MOCK_EMPTY === '1';
var DEBUG_ROTATE_MS = (!IS_VERCEL && +process.env.DEBUG_ROTATE_SEC > 0) ? +process.env.DEBUG_ROTATE_SEC * 1000 : 0;
if (SCHEDULE_MOCK) console.log('SCHEDULE_MOCK active:', SCHEDULE_MOCK);
if (ALERT_MOCK || YNET_MOCK_EMPTY || DEBUG_ROTATE_MS) console.log('Debug mocks:', { ALERT_MOCK: ALERT_MOCK, YNET_MOCK_EMPTY: YNET_MOCK_EMPTY, DEBUG_ROTATE_MS: DEBUG_ROTATE_MS });
if (ANNOUNCEMENTS_MOCK) console.log('ANNOUNCEMENTS_MOCK active:', ANNOUNCEMENTS_MOCK);

function nowMs() {
  return isNaN(DEBUG_DATE_MS) ? Date.now() : DEBUG_DATE_MS;
}

function israelLocalMs() {
  return nowMs() + getUtcOffset() * 60 * 60 * 1000;
}

var lastSchedule = [];

// Never rejects: on any error keep the last good schedule.
function fetchSchedule() {
  return fetchScheduleRaw()
    .then(function(items) { lastSchedule = items; return items; })
    .catch(function(err) {
      console.error('Error fetching schedule:', err.message);
      return lastSchedule;
    });
}

function fetchScheduleRaw() {
  var itemsPromise;
  if (SCHEDULE_MOCK) {
    // Mock file holds rows in the sheet's column order, as gviz cells.
    delete require.cache[SCHEDULE_MOCK];
    itemsPromise = Promise.resolve(schedule.parseScheduleRows(require(SCHEDULE_MOCK)));
  } else {
    var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&headers=1&sheet=' + encodeURIComponent(SCHEDULE_SHEET);
    itemsPromise = fetch(url, { timeout: 10000 })
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        if (json.status === 'error') throw new Error('schedule sheet: ' + JSON.stringify(json.errors));
        if (!schedule.isScheduleTable(json)) {
          // Tab missing (gviz fell back to the first tab): a real "no schedule", not an error.
          console.log('Schedule tab "' + SCHEDULE_SHEET + '" not found; showing the photo pool only.');
          return [];
        }
        return schedule.parseScheduleRows(json);
      });
  }
  // Resolve Drive / imgBB share links once, at fetch time.
  return itemsPromise.then(function(items) {
    return Promise.all(items.map(function(item) {
      if (!item.link) return item;
      return resolveImageUrl(item.link).then(function(u) { item.imageUrl = u; return item; });
    }));
  });
}

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


// --- Ynet "good news only" (lists in news-filter.json, owned by content; logic in news.js) ---
var NEWS_FILTER = require('./news-filter.json');
var news = require('./news');
var weather = require('./weather');
var hebdate = require('./hebdate');

// --- Data Fetchers ---

// Resolve a share-page URL to a direct image URL.
// Returns a Promise<string>.
function resolveImageUrl(url) {
  if (!url) return Promise.resolve('');

  // Google Drive share/view → direct URL
  var driveMatch = url.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/);
  if (driveMatch) {
    return Promise.resolve('https://drive.google.com/uc?export=view&id=' + driveMatch[1]);
  }

  // imgBB share page (ibb.co/CODE) → extract og:image direct URL
  if (/^https?:\/\/(www\.)?ibb\.co\/[a-zA-Z0-9]+/.test(url) && url.indexOf('i.ibb.co') === -1) {
    return fetch(url, { timeout: 8000 })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var m = html.match(/property="og:image"\s+content="([^"]+)"/);
        if (!m) m = html.match(/content="([^"]+)"\s+property="og:image"/);
        return (m && m[1]) ? m[1] : url;
      })
      .catch(function() { return url; });
  }

  return Promise.resolve(url);
}

function fetchAnnouncements() {
  var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv';
  var csvPromise = ANNOUNCEMENTS_MOCK
    ? Promise.resolve(require('fs').readFileSync(ANNOUNCEMENTS_MOCK, 'utf8'))
    : fetch(url, { timeout: 10000 }).then(function(res) { return res.text(); });
  return csvPromise
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
          urgent: (row.urgent || row.Urgent || '').toString().toUpperCase() === 'TRUE',
          showImage: (row.image || row.Image || '').toString().toUpperCase() === 'TRUE',
          imageUrl: row.link || row.Link || ''
        };
      });

      // Sort by ID ascending — the spreadsheet ID is the display order set by the admin
      announcements.sort(function(a, b) {
        return a.id - b.id;
      });

      // Resolve share-page URLs then wrap in local proxy so Android 4.4
      // (no TLS 1.2 for external HTTPS) can load them via HTTP from this server
      return Promise.all(announcements.map(function(ann) {
        if (!ann.showImage || !ann.imageUrl) return Promise.resolve(ann);
        return resolveImageUrl(ann.imageUrl).then(function(resolved) {
          ann.imageUrl = resolved ? '/api/image-proxy?url=' + encodeURIComponent(resolved) : '';
          return ann;
        });
      }));
    });
}

// Own cache: 7 feeds are fetched at most every 10 minutes, not every 2.
var ynetCache = { data: null, timestamp: 0, TTL: 10 * 60 * 1000 };

function fetchYnetFeed(feed) {
  // https directly: the http URL 301-redirects.
  var url = 'https://www.ynet.co.il/Integration/StoryRss' + feed.id + '.xml';
  return fetch(url, { timeout: 10000 })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(xml) { return xml2js.parseStringPromise(xml); })
    .then(function(result) {
      var raw = (result.rss && result.rss.channel && result.rss.channel[0].item) || [];
      var items = raw.slice(0, 30).map(function(item) {
        var t = item.title && item.title[0];
        if (t && typeof t === 'object') t = t._ || '';
        return { title: ('' + (t || '')).trim(), link: (item.link && item.link[0]) || '' };
      }).filter(function(it) { return it.title; });
      return { feed: feed, items: items };
    });
}

// A failed feed is skipped. Only if every feed fails is it an error (the caller then
// keeps the last list). Never falls back to unfiltered news: may return [].
function fetchYnet() {
  if (YNET_MOCK_EMPTY) return Promise.resolve([]);
  if (ynetCache.data && (Date.now() - ynetCache.timestamp) < ynetCache.TTL) {
    return Promise.resolve(ynetCache.data);
  }
  return Promise.all(NEWS_FILTER.feeds.map(function(feed) {
    return fetchYnetFeed(feed).catch(function(err) {
      console.error('Ynet feed ' + feed.id + ' (' + feed.name + ') failed:', err.message);
      return null;
    });
  })).then(function(groups) {
    groups = groups.filter(Boolean);
    if (!groups.length) {
      if (ynetCache.data) return ynetCache.data;
      throw new Error('all ynet feeds failed');
    }
    var list = news.select(groups, NEWS_FILTER);
    ynetCache.data = list;
    ynetCache.timestamp = Date.now();
    return list;
  });
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
      var daily = weather.buildDaily(series, Date.now()); // Israel-local days (review #3)

      // Current: most recent entry
      var first  = series[0] || {};
      var curDet = (first.data && first.data.instant && first.data.instant.details) || {};
      var curSym = (first.data && first.data.next_1_hours && first.data.next_1_hours.summary &&
                   first.data.next_1_hours.summary.symbol_code) || 'clearsky_day';

      return {
        current: {
          temperature: Math.round(curDet.air_temperature || 0),
          weathercode: curSym,
          description: weather.metSymbolToHebrew(curSym)
        },
        daily: daily
      };
    });
}

function fetchShabbat() {
  var url = 'https://www.hebcal.com/shabbat?cfg=json&geonameid=293918&M=on';
  return fetch(url, { timeout: 10000 })
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
  if (ALERT_MOCK) return Promise.resolve({ title: ALERT_MOCK, areas: 'פתח תקווה' });
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
    // D20: letters, e.g. "א׳ בכסלו תשפ״ז" (see hebdate.js + test/hebdate.test.js)
    return hebdate.formatHebrewDate(new Date());
  } catch (e) {
    console.error('Hebrew date error:', e.message);
    return '';
  }
}

function getGregorianDate() {
  try {
    return hebdate.formatGregorianDate(new Date()); // Israel time (review #4)
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
  if (cache.data && (now - cache.timestamp) < (DEBUG_ROTATE_MS ? 5000 : cache.TTL)) {
    res.json(cache.data);
    return;
  }

  // Fetch all sources in parallel
  var results = {};

  // Weather uses its own 6-hour cache
  var weatherPromise;
  // Also expire at Israel midnight, so "today" never carries yesterday's data (review #3)
  if (weatherCache.data && (now - weatherCache.timestamp) < weatherCache.TTL &&
      weather.israelDate(weatherCache.timestamp) === weather.israelDate(now)) {
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
    { key: 'alert', fn: fetchAlerts },
    { key: 'schedule', fn: fetchSchedule }
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
      alert: results.alert || null,
      newsMode: NEWS_MODE,
      background: schedule.getBackground(results.schedule || lastSchedule, israelLocalMs(), DEBUG_ROTATE_MS,
        { alert: !!(results.alert && results.alert.title) })
    };

    cache.data = payload;
    cache.timestamp = Date.now();

    res.json(payload);
  }).catch(function(err) {
    // Review #7: a throw while building the payload (e.g. malformed content JSON)
    // must not leave the request hanging; serve the last good data instead.
    console.error('dashboard.json build failed:', err && err.stack || err);
    res.json(cache.data || {});
  });
});

// --- Photo proxies (old Android can't do modern TLS to external hosts) ---
// Only URLs from our own JSON pools are fetched (no open proxy here).
// No in-memory cache: each photo URL is stable, so Vercel's CDN caches it (s-maxage).
function sendPoolImage(url, res, label) {
  fetch(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VaadTV/1.0)' } })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var ct = r.headers.get('content-type') || 'image/jpeg';
      return r.buffer().then(function(buf) {
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
        res.send(buf);
      });
    })
    .catch(function(err) {
      console.error(label + ' image error:', err.message);
      res.status(502).send('');
    });
}

// D22: /api/pool/landscape|nature|art/:index
app.get('/api/pool/:kind/:index', function(req, res) {
  var pool = schedule.POOLS[req.params.kind];
  var index = parseInt(req.params.index, 10);
  if (!pool || !(index >= 0) || !pool[index]) { res.status(404).send(''); return; }
  sendPoolImage(pool[index].url, res, 'Pool ' + req.params.kind);
});

// Old URL kept so a page cached before the deploy still gets landscapes.
app.get('/api/bg/:index', function(req, res) {
  var index = parseInt(req.params.index, 10) || 0;
  index = ((index % BG_IMAGES.length) + BG_IMAGES.length) % BG_IMAGES.length;
  sendPoolImage(BG_IMAGES[index].url, res, 'Background');
});

// --- Holiday / event photo proxy ---
app.get('/api/theme/:key/:index', function(req, res) {
  var theme = THEMES[req.params.key];
  var index = parseInt(req.params.index, 10) || 0;
  if (!theme || !theme.images[index]) { res.status(404).send(''); return; }
  sendPoolImage(theme.images[index].url, res, 'Theme');
});

// --- Wave 3: cake of the week photo (Thursday 15:00 -> Friday 12:00) ---
app.get('/api/cake/:index', function(req, res) {
  var index = /^\d+$/.test(req.params.index) ? +req.params.index : -1;
  if (!schedule.CAKES[index]) { res.status(404).send(''); return; }
  sendPoolImage(schedule.CAKES[index].image, res, 'Cake');
});

// --- Wave 3: QR codes. /go/<id> is the short address inside every code; it
// redirects only to entries of go-links.json (closed list, never open). ---
var golinks = require('./golinks');
var qr = require('./qr');
app.get('/go/:id', function(req, res) {
  var url = golinks.resolve(req.params.id);
  res.set('Cache-Control', 'no-store');
  if (!url) { res.status(404).send(''); return; }
  res.redirect(302, url);
});

app.get(/^\/api\/qr\/([a-z0-9-]+)\.png$/, function(req, res) {
  qr.pngFor(req.params[0], req.query.s).then(function(buf) {
    if (!buf) { res.status(404).send(''); return; }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
    res.send(buf);
  }).catch(function(err) {
    console.error('QR error:', err.message);
    res.status(500).send('');
  });
});

// --- D25: photo credits (not linked from the TV) ---
var credits = require('./credits');
app.get('/credits', function(req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(credits.renderCreditsHtml());
});

// --- Announcement image proxy (Drive / imgBB links from the sheet) ---
// Hardened (code review #2): host allowlist re-checked per redirect hop, 2xx +
// image/* only, max 4 MB, nosniff. See image-proxy.js + test/image-proxy.test.js.
var imageProxy = require('./image-proxy');
app.get('/api/image-proxy', function(req, res) {
  var url = '' + (req.query.url || '');
  imageProxy.fetchImage(url, fetch).then(function(out) {
    res.set('X-Content-Type-Options', 'nosniff');
    if (out.status !== 200) { res.status(out.status).send(''); return; }
    res.set('Content-Type', out.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(out.body);
  });
});

// --- Serve static frontend (local dev only; Vercel serves /public directly) ---
app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, function() {
    console.log('Vaad TV server running on port ' + PORT);
  });
}
