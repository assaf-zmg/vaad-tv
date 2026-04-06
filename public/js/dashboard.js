(function() {
  'use strict';

  // --- Configuration ---
  var POLL_INTERVAL = 5 * 60 * 1000;
  var RETRY_INTERVAL = 60 * 1000;
  var ANNOUNCEMENT_ROTATE = 20 * 1000;
  var NEWS_ROTATE = 9 * 1000;
  var PAGE_RELOAD_INTERVAL = 7 * 60 * 60 * 1000;
  var ANNOUNCEMENTS_PER_PAGE = 2;
  var NEWS_PER_PAGE = 4;
  var CACHE_KEY = 'vaadtv_dashboard_cache';
  var BG_IMAGE_COUNT = 7;

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
  var announcementPage = 0;
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
    els.shabbatContent = document.getElementById('shabbat-content');
  }

  // --- XHR (ES5, no fetch) ---
  function fetchJSON(url, callback) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
    } catch (e) {
      callback(e, null);
      return;
    }
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            callback(null, JSON.parse(xhr.responseText));
          } catch (e2) {
            callback(e2, null);
          }
        } else {
          callback(new Error('HTTP ' + xhr.status), null);
        }
      }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    try { xhr.send(); } catch (e) { callback(e, null); }
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

  // --- Background Image ---
  function setBackground() {
    var now = new Date();
    var dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    var index = dayOfYear % BG_IMAGE_COUNT;
    document.body.style.backgroundImage = 'url(/api/bg/' + index + ')';
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
    } else {
      els.alertBanner.style.display = 'none';
    }
  }

  // --- Render: Weather (5-day forecast with SVG icons) ---
  function renderWeather(weather) {
    if (!weather || !weather.daily || weather.daily.length === 0) {
      els.weatherForecast.innerHTML = '<div class="fallback-text">מזג אוויר לא זמין</div>';
      return;
    }

    var html = '';
    var daily = weather.daily;
    for (var i = 0; i < daily.length; i++) {
      var day = daily[i];
      var iconType = getWeatherIconType(day.weathercode);
      var icon = WEATHER_ICONS[iconType] || WEATHER_ICONS.cloudy;
      // Short day name: strip "יום " prefix
      var shortName = day.dayName ? day.dayName.replace('יום ', '') : '';
      var label = (i === 0) ? 'היום' : (i === 1) ? 'מחר' : shortName;
      html +=
        '<div class="forecast-day">' +
          '<div class="day-icon">' + icon + '</div>' +
          '<div class="day-temp">' + day.maxTemp + '&#176;</div>' +
          '<div class="day-name">' + label + '</div>' +
        '</div>';
    }
    els.weatherForecast.innerHTML = html;
  }

  // --- Render: Dates ---
  function renderDates(data) {
    if (data.gregorianDate) els.gregorianDate.innerHTML = escapeHtml(data.gregorianDate);
    if (data.hebrewDate) els.hebrewDate.innerHTML = escapeHtml(data.hebrewDate);
  }

  // --- Render: Announcements ---
  function renderAnnouncementsPage() {
    var list = (currentData && currentData.announcements) || [];
    if (list.length === 0) {
      els.announcementsContent.innerHTML = '<div class="fallback-text">אין הודעות להצגה</div>';
      return;
    }

    var start = announcementPage * ANNOUNCEMENTS_PER_PAGE;
    if (start >= list.length) { announcementPage = 0; start = 0; }

    var html = '';
    for (var i = start; i < start + ANNOUNCEMENTS_PER_PAGE && i < list.length; i++) {
      var ann = list[i];
      html +=
        '<div class="announcement-card' + (ann.urgent ? ' urgent' : '') + '">' +
          '<div class="ann-title">' + escapeHtml(ann.title) + '</div>' +
          '<div class="ann-body">' + escapeHtml(ann.body) + '</div>' +
          '<div class="ann-date">' + escapeHtml(ann.date) + '</div>' +
        '</div>';
    }

    els.announcementsContent.className = 'fade-out';
    var el = els.announcementsContent;
    setTimeout(function() { el.innerHTML = html; el.className = 'fade-in'; }, 400);
  }

  function rotateAnnouncements() {
    var list = (currentData && currentData.announcements) || [];
    if (Math.ceil(list.length / ANNOUNCEMENTS_PER_PAGE) <= 1) return;
    announcementPage = (announcementPage + 1) % Math.ceil(list.length / ANNOUNCEMENTS_PER_PAGE);
    renderAnnouncementsPage();
  }

  // --- Render: News + Pagination Dots ---
  function updateNewsDots() {
    if (!els.newsDots) return;
    var list = (currentData && currentData.ynet) || [];
    var totalPages = Math.ceil(list.length / NEWS_PER_PAGE);
    if (totalPages <= 1) { els.newsDots.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < totalPages; i++) {
      html += '<span class="page-dot' + (i === newsPage ? ' active' : '') + '"></span>';
    }
    els.newsDots.innerHTML = html;
  }

  function renderNewsPage() {
    var list = (currentData && currentData.ynet) || [];
    if (list.length === 0) {
      els.newsContent.innerHTML = '<div class="fallback-text">חדשות לא זמינות</div>';
      updateNewsDots();
      return;
    }

    var start = newsPage * NEWS_PER_PAGE;
    if (start >= list.length) { newsPage = 0; start = 0; }

    var html = '';
    for (var i = start; i < start + NEWS_PER_PAGE && i < list.length; i++) {
      html += '<div class="news-item">' + escapeHtml(list[i].title) + '</div>';
    }

    var el = els.newsContent;
    el.className = 'fade-out';
    setTimeout(function() { el.innerHTML = html; el.className = 'fade-in'; updateNewsDots(); }, 400);
  }

  function rotateNews() {
    var list = (currentData && currentData.ynet) || [];
    var totalPages = Math.ceil(list.length / NEWS_PER_PAGE);
    if (totalPages <= 1) return;
    newsPage = (newsPage + 1) % totalPages;
    renderNewsPage();
  }

  // --- Render: Shabbat ---
  function renderShabbat(shabbat) {
    if (!shabbat || (!shabbat.candleLighting && !shabbat.parasha)) {
      els.shabbatContent.innerHTML = '<div class="fallback-text">זמני שבת לא זמינים</div>';
      return;
    }

    var times = '';
    if (shabbat.candleLighting) times += 'כניסת שבת: ' + shabbat.candleLighting;
    if (shabbat.havdalah) times += (times ? ' | ' : '') + 'יציאת שבת: ' + shabbat.havdalah;

    els.shabbatContent.innerHTML =
      '<div class="shabbat-times">' + times + '</div>' +
      (shabbat.parasha ? '<div class="shabbat-parasha">פרשת השבוע: ' + escapeHtml(shabbat.parasha) + '</div>' : '');
  }

  // --- Main Render ---
  function render(data) {
    if (!data) return;
    currentData = data;
    if (data.utcOffset !== undefined) utcOffset = data.utcOffset;

    renderAlert(data.alert);
    renderWeather(data.weather);
    renderDates(data);
    renderShabbat(data.shabbat);

    announcementPage = 0;
    newsPage = 0;
    renderAnnouncementsPage();
    renderNewsPage();
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
    setBackground();
    updateClock();
    renderFallbacks();

    var cached = loadFromCache();
    if (cached) render(cached);

    fetchData();

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
