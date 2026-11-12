(function() {
  'use strict';

  // --- Configuration ---
  var POLL_INTERVAL = 2 * 60 * 1000;
  var RETRY_INTERVAL = 60 * 1000;
  var ANNOUNCEMENT_ROTATE = 20 * 1000;
  var NEWS_ROTATE = 10 * 1000;
  var PAGE_RELOAD_INTERVAL = 7 * 60 * 60 * 1000;
  var CACHE_KEY = 'vaadtv_dashboard_cache';
  var PHOTO_FADE_MS = 1600;

  // --- Weather SVG Icons — outline/line style, dark stroke, no fill ---
  // Clouds use arc-based paths; fill="white" on partly-cloudy hides sun rays behind the cloud.
  var S = '#3a3a3a'; // stroke color
  var WEATHER_ICONS = {
    // Sun: circle + 8 rays
    sunny: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="10" fill="none" stroke="' + S + '" stroke-width="2.5"/><g stroke="' + S + '" stroke-width="2.5" stroke-linecap="round"><line x1="24" y1="2" x2="24" y2="8"/><line x1="24" y1="40" x2="24" y2="46"/><line x1="2" y1="24" x2="8" y2="24"/><line x1="40" y1="24" x2="46" y2="24"/><line x1="7.8" y1="7.8" x2="12" y2="12"/><line x1="36" y1="36" x2="40.2" y2="40.2"/><line x1="40.2" y1="7.8" x2="36" y2="12"/><line x1="12" y1="36" x2="7.8" y2="40.2"/></g></svg>',

    // Partly cloudy: small sun top-right + cloud bottom-left (white fill covers sun overlap)
    partly: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><circle cx="34" cy="14" r="8" fill="none" stroke="' + S + '" stroke-width="2"/><g stroke="' + S + '" stroke-width="2" stroke-linecap="round"><line x1="34" y1="2" x2="34" y2="6"/><line x1="34" y1="22" x2="34" y2="26"/><line x1="22" y1="14" x2="26" y2="14"/><line x1="42" y1="14" x2="46" y2="14"/><line x1="25.5" y1="5.5" x2="28.2" y2="8.2"/><line x1="39.8" y1="19.8" x2="42.5" y2="22.5"/><line x1="42.5" y1="5.5" x2="39.8" y2="8.2"/><line x1="28.2" y1="19.8" x2="25.5" y2="22.5"/></g><path d="M 4 42 A 8 8 0 0 1 6 30 A 12 12 0 0 1 22 18 A 11 11 0 0 1 38 30 A 8 8 0 0 1 40 42 Z" fill="white" stroke="' + S + '" stroke-width="2" stroke-linejoin="round"/></svg>',

    // Cloud: arc-based path, centered
    cloudy: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><path d="M 6 38 A 8 8 0 0 1 8 26 A 12 12 0 0 1 24 14 A 11 11 0 0 1 40 26 A 8 8 0 0 1 42 38 Z" fill="none" stroke="' + S + '" stroke-width="2.5" stroke-linejoin="round"/></svg>',

    // Rain: cloud shifted up + 3 angled rain lines
    rain: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><path d="M 6 30 A 8 8 0 0 1 8 18 A 12 12 0 0 1 24 6 A 11 11 0 0 1 40 18 A 8 8 0 0 1 42 30 Z" fill="none" stroke="' + S + '" stroke-width="2.5" stroke-linejoin="round"/><g stroke="' + S + '" stroke-width="2" stroke-linecap="round"><line x1="16" y1="35" x2="14" y2="45"/><line x1="24" y1="35" x2="22" y2="45"/><line x1="32" y1="35" x2="30" y2="45"/></g></svg>',

    // Storm: cloud + lightning bolt
    storm: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><path d="M 6 30 A 8 8 0 0 1 8 18 A 12 12 0 0 1 24 6 A 11 11 0 0 1 40 18 A 8 8 0 0 1 42 30 Z" fill="none" stroke="' + S + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M 27 32 L 21 42 L 25 42 L 19 48 L 31 36 L 27 36 Z" fill="' + S + '"/></svg>',

    // Snow: cloud + 3 snowflake asterisks
    snow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><path d="M 6 30 A 8 8 0 0 1 8 18 A 12 12 0 0 1 24 6 A 11 11 0 0 1 40 18 A 8 8 0 0 1 42 30 Z" fill="none" stroke="' + S + '" stroke-width="2.5" stroke-linejoin="round"/><g stroke="' + S + '" stroke-width="1.5" stroke-linecap="round"><line x1="14" y1="35" x2="14" y2="45"/><line x1="9" y1="40" x2="19" y2="40"/><line x1="10.5" y1="36.5" x2="17.5" y2="43.5"/><line x1="17.5" y1="36.5" x2="10.5" y2="43.5"/><line x1="24" y1="35" x2="24" y2="45"/><line x1="19" y1="40" x2="29" y2="40"/><line x1="20.5" y1="36.5" x2="27.5" y2="43.5"/><line x1="27.5" y1="36.5" x2="20.5" y2="43.5"/><line x1="34" y1="35" x2="34" y2="45"/><line x1="29" y1="40" x2="39" y2="40"/><line x1="30.5" y1="36.5" x2="37.5" y2="43.5"/><line x1="37.5" y1="36.5" x2="30.5" y2="43.5"/></g></svg>'
  };

  function getWeatherIconType(code) {
    // met.no string symbol codes (e.g. "clearsky_day", "partlycloudy_day", "heavyrain")
    if (typeof code === 'string') {
      var base = code.replace('_day', '').replace('_night', '');
      if (base.indexOf('thunder') !== -1) return 'storm';
      if (base.indexOf('snow') !== -1 || base.indexOf('sleet') !== -1) return 'snow';
      if (base.indexOf('rain') !== -1 || base.indexOf('shower') !== -1 || base.indexOf('drizzle') !== -1) return 'rain';
      if (base === 'cloudy' || base.indexOf('fog') !== -1) return 'cloudy';
      if (base.indexOf('partlycloudy') !== -1) return 'partly';
      return 'sunny'; // clearsky, fair
    }
    // Legacy WMO numeric codes (fallback)
    code = parseInt(code, 10) || 0;
    if (code === 0) return 'sunny';
    if (code <= 2) return 'partly';
    if (code === 3 || (code >= 45 && code <= 48)) return 'cloudy';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 95) return 'storm';
    return 'rain';
  }

  // --- State ---
  var currentData = null;
  var utcOffset = 2;
  var newsPage = 0;

  // --- DOM References ---
  var els = {};

  function initDom() {
    els.alertBanner = document.getElementById('alert-banner');
    els.alertText = document.getElementById('alert-text');
    els.weatherForecast = document.getElementById('weather-forecast');
    els.clock = document.getElementById('clock');
    els.gregorianDate = document.getElementById('gregorian-date');
    els.hebrewDate = document.getElementById('hebrew-date');
    els.announcementsContent = document.getElementById('announcements-content');
    els.newsContent = document.getElementById('news-content');
    els.newsDots = document.getElementById('news-dots');
    els.annDots = document.getElementById('ann-dots');
    els.shabbatContent = document.getElementById('shabbat-content');
    els.photoA = document.getElementById('photo-a');
    els.photoB = document.getElementById('photo-b');
    els.annPhoto = document.getElementById('ann-photo');
    els.photoMessage = document.getElementById('photo-message');
    els.photoCaption = document.getElementById('photo-caption');
    els.photoContext = document.getElementById('photo-context');
    els.tickerStrip = document.getElementById('ticker-strip');
    els.tickerViewport = document.getElementById('ticker-viewport');
  }

  // --- XHR (ES5, no fetch) ---
  function fetchJSON(url, callback) {
    // Exactly one callback per request: on a network failure the browser fires
    // both readystatechange (status 0) and error, and calling back twice would
    // start two retry loops in fetchData (they multiply on every failure).
    var done = false;
    function finish(err, data) {
      if (done) return;
      done = true;
      callback(err, data);
    }
    var xhr;
    try {
      xhr = new XMLHttpRequest();
    } catch (e) {
      finish(e, null);
      return;
    }
    xhr.open('GET', url, true);
    xhr.timeout = 20000;
    xhr.ontimeout = function() { finish(new Error('Timeout'), null); };
    xhr.onerror = function() { finish(new Error('Network error'), null); };
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e2) { finish(e2, null); return; }
        finish(null, data);
      } else {
        finish(new Error('HTTP ' + xhr.status), null);
      }
    };
    try { xhr.send(); } catch (e) { finish(e, null); }
  }

  // CSS url() value: quoted, with ( ) ' " escaped, so image names like
  // "Almond_tree_(Israel).jpg" can't break the declaration.
  function cssUrl(u) {
    return 'url("' + ('' + u).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27').replace(/"/g, '%22') + '")';
  }

  // --- LocalStorage Cache ---
  function saveToCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function loadFromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // --- Main photo ---
  // The server decides what to show (pool photo every 3 hours, holiday photo,
  // or a building event) and sends { id, url, caption, message, sub, tone }.
  // We preload the new photo, then cross-fade it in on top of the old one.
  var photoState = { id: null, pendingId: null, front: null, annShowing: false, bg: null };

  // --- Photo context block (D37; supersedes wave-3 renderQrCard) ---
  // The server adds bg.context for pool photos only (never on holiday,
  // memorial, mourning or event photos):
  //   bg.context = { kind: 'abroad' | 'israel' | 'nature' | 'art' | 'cake',
  //                  label: 'החופשה הבאה שלכם',   // from server/labels.json, rotated by slot
  //                  name:  'לופוטן, נורווגיה',   // place / subject / artwork title / cake name
  //                  sub:   'קלוד מונה',          // optional: artist, or "צילום: X · Unsplash"
  //                  qr:    { img: '/api/qr/ramon.png', cta: 'סרקו לפרטים' } }  // israel+trip, cake only
  // The block replaces the plain place pill (#photo-caption is hidden while it
  // shows). A message pill on the photo wins: then no context block. The QR
  // PNG is requested at an integer scale and shown at natural size (wave 3).
  // QR PNG at an integer scale (D49): 4 px/module (148px), 3 (111px) on screens <= 820px high. Before
  // layout the old WebView can report innerHeight 0; then use the document height.
  function qrScale() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    return h && h <= 820 ? 3 : 4;
  }

  function qrSrc(qr) {
    return qr.img + (qr.img.indexOf('?') === -1 ? '?' : '&') + 's=' + qrScale();
  }

  // Code review: redraw the block only when it changed (rebuilding the <img> on
  // every 2-minute poll can blink the QR tile on the old WebView), and show a QR
  // only once its PNG has loaded; if the PNG fails, show the block without it.
  var ctxShown = '';
  function showContext(bg) {
    var c = bg && bg.context;
    var key = (bg && bg.message ? 'M\u0001' : '') +
      (c ? [c.kind, c.label, c.name, c.sub, c.qr ? qrSrc(c.qr) + '\u0001' + c.qr.cta : ''].join('\u0001') : '');
    if (key === ctxShown) return;
    ctxShown = key;
    if (!c || !c.qr || !c.qr.img || bg.message) { renderContext(bg); return; }
    renderContext(null); // the previous photo's block goes now; this one comes with its QR
    var img = new Image();
    img.onload = function() { if (ctxShown === key) renderContext(bg); };
    img.onerror = function() {
      if (ctxShown !== key) return;
      renderContext({ message: '', context: { kind: c.kind, label: c.label, name: c.name, sub: c.sub } });
    };
    img.src = qrSrc(c.qr);
  }

  function renderContext(bg) {
    var el = els.photoContext;
    var c = bg && bg.context;
    if (!c || bg.message) {
      el.innerHTML = '';
      el.className = '';
      els.photoCaption.style.display = '';
      return;
    }
    var hasQr = !!(c.qr && c.qr.img);
    var html =
      '<div class="ctx-text">' +
        '<div class="ctx-label">' + escapeHtml(c.label || '') + '</div>' +
        '<div class="ctx-name">' + escapeHtml(c.name || '') + '</div>' +
        (c.sub ? '<div class="ctx-sub">' + escapeHtml(c.sub) + '</div>' : '') +
        (hasQr && c.qr.cta ? '<div class="ctx-cta">' + escapeHtml(c.qr.cta) + '</div>' : '') +
      '</div>';
    if (hasQr) {
      html += '<div class="qr-tile"><img src="' + qrSrc(c.qr) + '" alt=""></div>';
    }
    el.className = 'ctx-' + (c.kind || 'abroad') + (hasQr ? ' has-qr' : '');
    el.innerHTML = html;
    els.photoCaption.style.display = 'none';
  }

  function renderPhotoText(bg) {
    var msg = '';
    if (bg.message) {
      msg = escapeHtml(bg.message);
      if (bg.sub) msg += '<span class="msg-sub">' + escapeHtml(bg.sub) + '</span>';
      msg = '<span class="msg-pill">' + msg + '</span>';
    }
    els.photoMessage.innerHTML = msg;
    els.photoMessage.className = (bg.tone === 'somber' ? 'somber' : '') + (photoState.annShowing ? ' hidden' : '');
    els.photoCaption.innerHTML = escapeHtml(bg.caption || '');
    photoState.bg = bg;
    showContext(bg); // runs from the photo's onload, so the block never shows without its photo
  }

  function applyBackground(bg) {
    if (!bg || !bg.url) return;
    if (bg.id === photoState.id) { renderPhotoText(bg); return; }
    if (bg.id === photoState.pendingId) return; // already loading this one
    photoState.pendingId = bg.id;

    var img = new Image();
    img.onerror = function() { if (photoState.pendingId === bg.id) photoState.pendingId = null; };
    img.onload = function() {
      if (photoState.pendingId !== bg.id) return; // a newer photo was requested meanwhile
      photoState.pendingId = null;
      var next = (photoState.front === els.photoA) ? els.photoB : els.photoA;
      var prev = photoState.front;
      next.style.backgroundImage = cssUrl(bg.url);
      next.style.zIndex = 1;
      if (prev) prev.style.zIndex = 0;
      next.className = 'photo-layer visible';
      // hide the old layer after the fade, unless it became the front again meanwhile
      if (prev) setTimeout(function() { if (photoState.front !== prev) prev.className = 'photo-layer'; }, PHOTO_FADE_MS);
      photoState.front = next;
      photoState.id = bg.id;
      renderPhotoText(bg);
    };
    // On error keep the current photo; the next poll will try again.
    img.src = bg.url;
  }

  // An announcement with an image takes over the photo area while it is shown.
  // The flyer is preloaded and shown only once it has loaded, so a broken link
  // never blanks the photo area (the landscape just stays).
  var annPhotoWanted = '';

  function setAnnPhotoVisible(on) {
    els.annPhoto.className = on ? 'photo-layer visible' : 'photo-layer';
    photoState.annShowing = on;
    var hide = on ? ' hidden' : '';
    els.photoCaption.className = hide;
    if (els.photoContext) els.photoContext.style.display = on ? 'none' : '';
    els.photoMessage.className = els.photoMessage.className.replace(' hidden', '').replace('hidden', '') + hide;
  }

  function showAnnouncementPhoto(url) {
    annPhotoWanted = url || '';
    if (!url) { setAnnPhotoVisible(false); return; }
    var img = new Image();
    img.onload = function() {
      if (annPhotoWanted !== url) return; // the announcement changed meanwhile
      els.annPhoto.style.backgroundImage = cssUrl(url);
      setAnnPhotoVisible(true);
    };
    img.onerror = function() { if (annPhotoWanted === url) setAnnPhotoVisible(false); };
    img.src = url;
  }

  // --- Clock (ES5: getUTCHours + offset, no Intl timezone) ---
  function updateClock() {
    var now = new Date();
    var h = (now.getUTCHours() + utcOffset) % 24;
    if (h < 0) h += 24;
    var m = now.getUTCMinutes();
    els.clock.innerHTML = (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
  }

  // --- HTML Escaping ---
  // D21: Android 4.4 has no colour-emoji font, so emoji render as empty boxes.
  // Drop astral characters (surrogate pairs), BMP symbol/dingbat emoji (U+2600-27BF)
  // and emoji joiners/variation selectors,
  // then tidy the spaces they leave behind. Newlines are kept (pre-wrap bodies).
  function stripEmoji(str) {
    if (!str) return '';
    return ('' + str)
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      .replace(/[\u2600-\u27BF]\uFE0F?/g, '')          // BMP symbols / dingbats (☀ ❤ ✨)
      .replace(/[\u200D\uFE0E\uFE0F]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+(\n|$)/g, '$1')
      .replace(/(^|\n)[ \t]+/g, '$1');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return ('' + str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Render: Alert ---
  function renderAlert(alert) {
    if (alert && alert.title) {
      els.alertText.innerHTML = escapeHtml(alert.title + (alert.areas ? ' - ' + alert.areas : ''));
      els.alertBanner.style.display = 'block';
      // body.has-alert trims the column so nothing is cut mid-line (no classList on old WebView)
      if (!/(^|\s)has-alert(\s|$)/.test(document.body.className)) document.body.className += ' has-alert';
    } else {
      els.alertBanner.style.display = 'none';
      document.body.className = document.body.className.replace(/(^|\s)has-alert(?=\s|$)/g, '');
    }
  }

  // --- Render: Weather (D27: as many whole days as fit, max 5) ---
  // Day 0 = "היום" (daily high) until 15:00 local; from 15:00 it becomes
  // "עכשיו" with the current temperature, because the "high of the remaining
  // hours" can be lower than tomorrow's and reads as wrong in the evening.
  // Then "מחר", then short day names ("שישי"). The row never wraps and never
  // cuts an item: tighter spacing first, then fewer days.
  var WEATHER_MAX_DAYS = 5;
  var WEATHER_EVENING_HOUR = 15;
  var MOON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><path d="M 30 6 A 18 18 0 1 0 42 32 A 14 14 0 0 1 30 6 Z" fill="none" stroke="' + S + '" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  var lastWeather = null;

  function localHour() {
    var h = (new Date().getUTCHours() + utcOffset) % 24;
    return h < 0 ? h + 24 : h;
  }

  function weatherIconHtml(code) {
    var type = getWeatherIconType(code);
    var svg = (typeof code === 'string' && code.indexOf('night') !== -1 && type === 'sunny')
      ? MOON_ICON
      : (WEATHER_ICONS[type] || WEATHER_ICONS.cloudy);
    return svg.split(S).join('#f2f0ea').split('fill="white"').join('fill="none"');
  }

  function shortDayName(dayName) {
    return dayName ? dayName.replace('יום ', '') : '';
  }

  function forecastItemHtml(code, temp, label) {
    return '<div class="forecast-day">' +
      '<div class="day-icon">' + weatherIconHtml(code) + '</div>' +
      '<div class="day-temp">' + temp + '&#176;</div>' +
      '<div class="day-name">' + escapeHtml(label) + '</div>' +
      '</div>';
  }

  function setWeatherCompact(on) {
    var el = els.weatherForecast;
    el.className = el.className.replace(/(^|\s)wx-compact(?=\s|$)/g, '');
    if (on) el.className += ' wx-compact';
  }

  function weatherOverflows() {
    return els.weatherForecast.scrollWidth > els.weatherForecast.clientWidth + 1;
  }

  function renderWeather(weather) {
    if (weather) lastWeather = weather;
    weather = lastWeather;
    if (!weather || !weather.daily || weather.daily.length === 0) {
      els.weatherForecast.innerHTML = '<div class="day-name">מזג אוויר לא זמין</div>';
      return;
    }

    var daily = weather.daily;
    var cur = weather.current || {};
    var evening = localHour() >= WEATHER_EVENING_HOUR &&
      cur.temperature !== undefined && cur.temperature !== null;
    var items = [];
    for (var i = 0; i < daily.length && items.length < WEATHER_MAX_DAYS; i++) {
      var d = daily[i];
      if (i === 0 && evening) {
        items.push(forecastItemHtml(cur.weathercode || d.weathercode, Math.round(cur.temperature), 'עכשיו'));
      } else if (d.maxTemp === undefined || d.maxTemp === null || d.maxTemp <= -50) {
        continue; // no data for this day (e.g. -99 sentinel): skip, never show a fake number
      } else {
        items.push(forecastItemHtml(d.weathercode, d.maxTemp,
          i === 0 ? 'היום' : i === 1 ? 'מחר' : shortDayName(d.dayName)));
      }
    }

    // Fit: all items with normal spacing, then compact spacing, then drop the last day.
    var n = items.length;
    setWeatherCompact(false);
    els.weatherForecast.innerHTML = items.join('');
    if (weatherOverflows()) setWeatherCompact(true);
    while (n > 2 && weatherOverflows()) {
      n--;
      els.weatherForecast.innerHTML = items.slice(0, n).join('');
    }
  }

  // Re-fit if the screen size changes (rare on the kiosk, cheap anyway).
  // Re-fit everything that was measured if the screen size changes: weather
  // row (D27) and the whole-text pages of news and announcements (D26).
  // Replaces the D27 one-liner `window.onresize = function() { renderWeather(null); };`
  window.onresize = function() {
    renderWeather(null);
    annPart = 0;
    annLayout = null;
    renderAnnouncementsPage();
    renderNewsPage();
    renderTicker(true);
    if (photoState.bg) showContext(photoState.bg); // QR scale follows the screen height (part of the key)
  };

  // --- Render: Dates ---
  function renderDates(data) {
    if (data.gregorianDate) els.gregorianDate.innerHTML = escapeHtml(data.gregorianDate);
    if (data.hebrewDate) els.hebrewDate.innerHTML = escapeHtml(data.hebrewDate);
  }

  // --- Render: Announcements (D26: always whole text, never clamped) ---
  // One announcement at a time. For each one we try three type sizes; if the
  // whole text does not fit even at the smallest size, the body is split into
  // parts ("1/2", "2/2") that rotate in the same 20s slot. Measurement happens
  // while the content is faded out, so the resident never sees it.
  var ANN_SIZES = ['ann-size-1', 'ann-size-2', 'ann-size-3'];
  var annIndex = 0;      // which announcement
  var annPart = 0;       // which part of it
  var annLayout = null;  // { size: 'ann-size-x', parts: [bodyText, ...] }
  var annKey = '';       // text + alert state of the current one (see render())
  var annBusy = false;   // a render is mid-fade (400ms); rotation waits for it

  function annCardHtml(ann, size, body, partLabel) {
    var footer = escapeHtml(ann.date || '');
    if (partLabel) footer += (footer ? ' · ' : '') + '<span class="ann-part">' + partLabel + '</span>';
    return '<div class="announcement-card ' + size + (ann.urgent ? ' urgent' : '') + '">' +
      '<div class="ann-title">' + escapeHtml(stripEmoji(ann.title)) + '</div>' +
      '<div class="ann-body">' + escapeHtml(body) + '</div>' +
      (footer ? '<div class="ann-date">' + footer + '</div>' : '') +
      '</div>';
  }

  var FIT_SLACK = 4; // px of headroom for rounding between measure and paint

  // D45: the card wraps its content, so #announcements-content no longer has
  // a fixed height. Measure against the CAPACITY instead: the slot's height
  // (#announcements-panel, flex: 1) minus the card's own chrome (padding,
  // border, header, dots), which does not depend on the content.
  // Replaces the D26 fits(el).
  function annCapacity(el) {
    var card = el.parentNode;              // .ann-card
    var slot = card.parentNode;            // #announcements-panel
    var chrome = card.offsetHeight - el.offsetHeight;
    return slot.clientHeight - chrome;
  }

  function fits(el) {
    var notice = el.children[0];
    return !!notice && notice.offsetHeight <= annCapacity(el) - FIT_SLACK;
  }

  // Greedy word fill at the smallest size. Whitespace tokens are kept so
  // line breaks typed in the sheet survive. Reserves room for a "9/9" label.
  function splitBody(ann, body, el, size) {
    var tokens = body.split(/(\s+)/);
    var parts = [];
    var cur = '';
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '') continue;
      var trial = cur + tokens[i];
      el.innerHTML = annCardHtml(ann, size, trial, '9/9');
      if (!fits(el) && cur.replace(/\s/g, '') !== '') {
        // Prefer to break at a line break typed in the sheet, if one sits in
        // the second half of this part; otherwise break between words.
        var nl = cur.lastIndexOf('\n');
        if (nl > cur.length / 2) {
          parts.push(cur.slice(0, nl).replace(/\s+$/, ''));
          cur = cur.slice(nl + 1) + tokens[i];
        } else {
          parts.push(cur.replace(/\s+$/, ''));
          cur = tokens[i].replace(/^\s+/, '');
        }
      } else {
        cur = trial;
      }
    }
    if (cur.replace(/\s/g, '') !== '') parts.push(cur.replace(/\s+$/, ''));
    return parts.length ? parts : [body];
  }

  function layoutAnnouncement(ann, el) {
    var body = stripEmoji(ann.body || '');
    for (var s = 0; s < ANN_SIZES.length; s++) {
      el.innerHTML = annCardHtml(ann, ANN_SIZES[s], body, '');
      if (fits(el)) return { size: ANN_SIZES[s], parts: [body] };
    }
    // A title that fills the box on its own would leave room for ~1 word per
    // part. Step the title down once more before splitting; if even that is too
    // tall (a very long title), show the whole text as one part rather than
    // dozens of one-word pages.
    var size = 'ann-size-3';
    el.innerHTML = annCardHtml(ann, size, body.split(/\s+/)[0] || '', '9/9');
    if (!fits(el)) {
      size = 'ann-size-3 ann-title-tight';
      el.innerHTML = annCardHtml(ann, size, body.split(/\s+/)[0] || '', '9/9');
      if (!fits(el)) return { size: size, parts: [body] };
    }
    var parts = splitBody(ann, body, el, size);
    return { size: size, parts: parts.length > 12 ? [body] : parts };
  }

  function renderAnnouncementsPage() {
    var list = (currentData && currentData.announcements) || [];
    if (list.length === 0) {
      els.announcementsContent.innerHTML = '<div class="fallback-text">אין הודעות להצגה</div>';
      renderDots(els.annDots, 0, 1, 0);
      showAnnouncementPhoto('');
      return;
    }
    if (annIndex >= list.length) { annIndex = 0; annPart = 0; }

    var el = els.announcementsContent;
    el.className = 'fade-out';
    annBusy = true;
    setTimeout(function() {
      annBusy = false;
      var ann = list[annIndex];
      if (annPart === 0 || !annLayout) annLayout = layoutAnnouncement(ann, el);
      if (annPart >= annLayout.parts.length) annPart = 0;
      var n = annLayout.parts.length;
      el.innerHTML = annCardHtml(ann, annLayout.size, annLayout.parts[annPart],
        n > 1 ? (annPart + 1) + '/' + n : '');
      el.className = 'fade-in';
      showAnnouncementPhoto(ann.showImage && ann.imageUrl ? ann.imageUrl : '');
      renderDots(els.annDots, list.length, 1, annIndex);
    }, 400);
  }

  function rotateAnnouncements() {
    var list = (currentData && currentData.announcements) || [];
    if (!list.length || annBusy) return; // mid-render: annLayout isn't ready yet
    if (annLayout && annPart + 1 < annLayout.parts.length) {
      annPart++;
    } else {
      if (list.length === 1 && (!annLayout || annLayout.parts.length === 1)) return;
      annIndex = (annIndex + 1) % list.length;
      annPart = 0;
    }
    renderAnnouncementsPage();
  }

  // --- Render: News + Pagination Dots (D26: whole headlines, paged by height) ---
  var newsPages = [];  // [[start, end), ...] built by measuring

  function renderDots(el, count, perPage, page) {
    if (!el) return;
    var totalPages = Math.ceil(count / perPage);
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < totalPages; i++) {
      html += '<span class="page-dot' + (i === page ? ' active' : '') + '"></span>';
    }
    el.innerHTML = html;
  }

  function newsItemHtml(item) {
    return '<div class="news-item">' + escapeHtml(stripEmoji(item.title)) + '</div>';
  }

  function setCompactNews(on) {
    var panel = els.newsContent.parentNode;
    panel.className = panel.className.replace(/(^|\s)news-compact(?=\s|$)/g, '');
    if (on) panel.className += ' news-compact';
  }

  // Render every headline once (invisible), measure, pack whole items per page.
  // If even one headline is taller than the whole box, retry one type step
  // smaller (.news-compact) so it still shows in full.
  function paginateNews(list, el) {
    setCompactNews(false);
    var pages = packNews(list, el);
    if (pages.tooTall) {
      setCompactNews(true);
      pages = packNews(list, el);
    }
    return pages;
  }

  function packNews(list, el) {
    var html = '';
    for (var i = 0; i < list.length; i++) html += newsItemHtml(list[i]);
    el.innerHTML = html;
    var avail = el.clientHeight - FIT_SLACK;
    var kids = el.children;
    var pages = [];
    var start = 0, used = 0;
    var tooTall = false;
    for (var k = 0; k < kids.length; k++) {
      var h = kids[k].offsetHeight;
      if (h > avail) tooTall = true;
      if (k > start && used + h > avail) {
        pages.push([start, k]);
        start = k;
        used = 0;
      }
      used += h;
    }
    pages.push([start, kids.length]);
    pages.tooTall = tooTall;
    return pages;
  }

  function renderNewsPage() {
    var list = (currentData && currentData.ynet) || [];
    if (list.length === 0) {
      els.newsContent.innerHTML = '<div class="fallback-text">החדשות הטובות יחזרו בקרוב</div>';
      newsPages = [];
      renderDots(els.newsDots, 0, 1, 0);
      return;
    }

    var el = els.newsContent;
    if (!el.offsetWidth && !el.offsetHeight) return; // card hidden (alert on a low screen)
    el.className = 'fade-out';
    setTimeout(function() {
      newsPages = paginateNews(list, el);
      if (newsPage >= newsPages.length) newsPage = 0;
      var html = '';
      for (var i = newsPages[newsPage][0]; i < newsPages[newsPage][1]; i++) html += newsItemHtml(list[i]);
      el.innerHTML = html;
      el.className = 'fade-in';
      renderDots(els.newsDots, newsPages.length, 1, newsPage);
    }, 400);
  }

  function rotateNews() {
    if (newsPages.length <= 1) return;
    newsPage = (newsPage + 1) % newsPages.length;
    renderNewsPage();
  }

  // Desktop browsers swap in the Heebo web font after first paint, which
  // changes line heights; re-measure once it is ready. The lobby device has no
  // document.fonts (and cannot load the font), so this is skipped there.
  function relayoutWhenFontsReady() {
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(function() {
      annPart = 0;
      annLayout = null;
      renderAnnouncementsPage();
      renderNewsPage();
      renderTicker(true); // the copy width depends on the font (code review)
    });
  }

  // --- ynet ticker (D35) ---
  // Builds the strip once per headline change (not per poll, so the scroll
  // does not restart every 2 minutes). Two identical copies, each at least as
  // wide as the viewport; one CSS animation moves the strip by 50% (= one
  // copy) left -> right at TICKER_SPEED px/s. No per-frame JS.
  var TICKER_SPEED = 70; // px per second, slow enough to read from 2-3 m
  var tickerKey = null;

  function setTickerAnimation(el, value) {
    el.style.webkitAnimation = 'none';
    el.style.animation = 'none';
    void el.offsetWidth; // restart the animation
    el.style.webkitAnimation = value;
    el.style.animation = value;
  }

  function renderTicker(force) {
    var strip = els.tickerStrip;
    if (!strip) return;
    var list = (currentData && currentData.ynet) || [];
    var titles = [];
    for (var i = 0; i < list.length; i++) titles.push(stripEmoji(list[i].title));
    var key = titles.join('\n');
    // Hidden (red alert, or ticker off): measure nothing now; the first
    // render() after the ticker is visible again builds it at the right width.
    if (!els.tickerViewport.offsetWidth) { tickerKey = null; return; }
    if (!force && key === tickerKey) return;
    tickerKey = key;

    if (!titles.length) {
      strip.className = 'ticker-strip static';
      strip.innerHTML = 'החדשות הטובות יחזרו בקרוב';
      setTickerAnimation(strip, '');
      return;
    }

    var one = '';
    for (var k = 0; k < titles.length; k++) {
      one += '<span class="ticker-item">' + escapeHtml(titles[k]) + '</span><span class="ticker-sep"></span>';
    }
    strip.className = 'ticker-strip';

    // One copy must be at least as wide as the viewport for a seamless loop.
    var copyHtml = one;
    strip.innerHTML = '<span class="ticker-copy">' + copyHtml + '</span>';
    var viewportW = els.tickerViewport.offsetWidth;
    for (var guard = 0; guard < 10 && strip.children[0].offsetWidth < viewportW; guard++) {
      copyHtml += one;
      strip.innerHTML = '<span class="ticker-copy">' + copyHtml + '</span>';
    }
    var copyW = strip.children[0].offsetWidth;
    strip.innerHTML = '<span class="ticker-copy">' + copyHtml + '</span><span class="ticker-copy">' + copyHtml + '</span>';

    var seconds = Math.max(20, Math.round(copyW / TICKER_SPEED));
    setTickerAnimation(strip, 'ticker-scroll ' + seconds + 's linear infinite');
  }

  // D35: server flag newsMode 'ticker' | 'card'. No flag (older cached data) keeps
  // the page default (index.html ships with ticker-on). No classList on old WebView.
  function applyNewsMode(mode) {
    if (mode !== 'ticker' && mode !== 'card') return;
    var cls = document.body.className.replace(/(^|\s)ticker-on(?=\s|$)/g, '');
    document.body.className = mode === 'ticker' ? cls + ' ticker-on' : cls;
  }

  // --- Render: Shabbat (D44) ---
  // Right-aligned like the rest of the column, with a two-candles line icon
  // at its start (same stroke style/colour as the weather icons). hebcal's
  // Hebrew parasha already starts with "פרשת " ("פרשת תולדות"), so it is
  // stripped for display to avoid "פרשת השבוע: פרשת תולדות".
  var SHABBAT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">' +
    '<g fill="none" stroke="#f2f0ea" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="12" y="22" width="8" height="19" rx="1.5"/><rect x="28" y="22" width="8" height="19" rx="1.5"/>' +
    '<line x1="16" y1="22" x2="16" y2="19"/><line x1="32" y1="22" x2="32" y2="19"/>' +
    '<path d="M 16 16 C 13.5 13.5 13.5 11 16 7 C 18.5 11 18.5 13.5 16 16 Z"/>' +
    '<path d="M 32 16 C 29.5 13.5 29.5 11 32 7 C 34.5 11 34.5 13.5 32 16 Z"/>' +
    '<line x1="8" y1="42" x2="40" y2="42"/></g></svg>';

  function renderShabbat(shabbat) {
    if (!shabbat || (!shabbat.candleLighting && !shabbat.parasha)) {
      els.shabbatContent.innerHTML = '<div class="fallback-text">זמני שבת לא זמינים</div>';
      return;
    }

    var times = '';
    if (shabbat.candleLighting) times += 'כניסת שבת: ' + shabbat.candleLighting;
    if (shabbat.havdalah) times += (times ? ' | ' : '') + 'יציאת שבת: ' + shabbat.havdalah;
    var parasha = (shabbat.parasha || '').replace(/^פרשת\s+/, '');

    els.shabbatContent.innerHTML =
      '<div class="shabbat-row">' +
        '<div class="shabbat-icon">' + SHABBAT_ICON + '</div>' +
        '<div class="shabbat-text">' +
          '<div class="shabbat-times">' + times + '</div>' +
          (parasha ? '<div class="shabbat-parasha">פרשת השבוע: ' + escapeHtml(parasha) + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  // --- Main Render ---
  function render(data) {
    if (!data) return;
    currentData = data;
    if (data.utcOffset !== undefined) utcOffset = data.utcOffset;

    applyNewsMode(data.newsMode);
    renderAlert(data.alert);
    applyBackground(data.background);
    renderWeather(data.weather);
    renderDates(data);
    renderShabbat(data.shabbat);

    // Keep the rotation position across polls (a 6+ part announcement must be able
    // to finish). Re-measure only when the current announcement's text changed or
    // the alert state changed (it changes the space available).
    var cur = (data.announcements || [])[annIndex];
    var key = cur ? (cur.title || '') + '\u0001' + (cur.body || '') + '\u0001' + (data.alert && data.alert.title ? 'A' : '') : '';
    if (key !== annKey) {
      annKey = key;
      annPart = 0;
      annLayout = null;
    }
    renderAnnouncementsPage();
    renderNewsPage();
    renderTicker(false);
  }

  // --- Initial loading placeholders ---
  function renderFallbacks() {
    if (els.announcementsContent) els.announcementsContent.innerHTML = '<div class="fallback-text">טוען הודעות...</div>';
    if (els.newsContent) els.newsContent.innerHTML = '<div class="fallback-text">טוען חדשות...</div>';
    if (els.shabbatContent) els.shabbatContent.innerHTML = '<div class="fallback-text">טוען זמני שבת...</div>';
    if (els.weatherForecast) els.weatherForecast.innerHTML = '<div class="fallback-text">טוען...</div>';
  }

  // --- Data Fetching ---
  function fetchData() {
    fetchJSON('/api/dashboard.json', function(err, data) {
      if (err) {
        if (!currentData) {
          var cached = loadFromCache();
          if (cached) {
            render(cached);
          } else {
            if (els.announcementsContent) els.announcementsContent.innerHTML = '<div class="fallback-text">לא ניתן לטעון נתונים</div>';
            if (els.newsContent) els.newsContent.innerHTML = '<div class="fallback-text">לא ניתן לטעון חדשות</div>';
          }
        }
        setTimeout(fetchData, RETRY_INTERVAL);
        return;
      }
      saveToCache(data);
      render(data);
      setTimeout(fetchData, POLL_INTERVAL);
    });
  }

  // --- Init ---
  function init() {
    initDom();
    updateClock();
    renderFallbacks();

    var cached = loadFromCache();
    if (cached) render(cached);

    fetchData();
    relayoutWhenFontsReady();

    setInterval(updateClock, 1000);
    setInterval(rotateAnnouncements, ANNOUNCEMENT_ROTATE);
    setInterval(rotateNews, NEWS_ROTATE);

    setTimeout(function() { window.location.reload(true); }, PAGE_RELOAD_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
