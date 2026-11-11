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
  window.onresize = function() { renderWeather(null); };

