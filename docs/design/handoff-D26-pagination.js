  // --- Render: Announcements (D26: always whole text, never clamped) ---
  // One announcement at a time. For each one we try three type sizes; if the
  // whole text does not fit even at the smallest size, the body is split into
  // parts ("1/2", "2/2") that rotate in the same 20s slot. Measurement happens
  // while the content is faded out, so the resident never sees it.
  var ANN_SIZES = ['ann-size-1', 'ann-size-2', 'ann-size-3'];
  var annIndex = 0;      // which announcement
  var annPart = 0;       // which part of it
  var annLayout = null;  // { size: 'ann-size-x', parts: [bodyText, ...] }

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

  // Measure the card itself: el.scrollHeight never drops below el's own
  // height, so it cannot tell "fits with room to spare".
  function fits(el) {
    var card = el.children[0];
    return !!card && card.offsetHeight <= el.clientHeight - FIT_SLACK;
  }

  // Greedy word fill at the smallest size. Whitespace tokens are kept so
  // line breaks typed in the sheet survive. Reserves room for a "9/9" label.
  function splitBody(ann, body, el) {
    var tokens = body.split(/(\s+)/);
    var parts = [];
    var cur = '';
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '') continue;
      var trial = cur + tokens[i];
      el.innerHTML = annCardHtml(ann, 'ann-size-3', trial, '9/9');
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
    return { size: 'ann-size-3', parts: splitBody(ann, body, el) };
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
    setTimeout(function() {
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
    if (!list.length) return;
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
    });
  }

