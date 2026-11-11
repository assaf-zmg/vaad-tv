// "Good news only" Ynet filter. JS port of docs/content/news-filter-reference.py.
// Word lists and feeds live in news-filter.json (owned by the content session).
// Pure functions only, so the contract test can run the 240-title fixture.

var SPLIT_RE = /[\s,.:;!?()\[\]\/\-]+/;

function norm(t) {
  return ('' + t).replace(/״/g, '"').replace(/׳/g, "'").replace(/–/g, ' ').replace(/—/g, ' ');
}

// Valid Hebrew prefix sequence, in order: ו? (ש|כש|מש)? [בכלמ]? ה?
// e.g. "והמחבלים" -> "מחבלים", but "הכירו" -> "כירו" only (never "ירו").
var PREFIX_RE = /^(ו)?(ש|כש|מש)?([בכלמ])?(ה)?/;

// Each token -> [token, then the token with each valid prefix part stripped],
// like the reference. Outer quotes are stripped; inner gershayim (צה"ל) and a
// trailing geresh (סמוטריץ') are kept.
function tokens(title) {
  var out = [];
  norm(title).split(SPLIT_RE).forEach(function(w) {
    w = w.replace(/^["']+/, '').replace(/"+$/, '');
    if (!w) return;
    var cands = [w], x = w;
    var m = PREFIX_RE.exec(w);
    var parts = m ? m.slice(1).filter(Boolean) : [];
    for (var i = 0; i < parts.length; i++) {
      var g = parts[i];
      if (x.length - g.length >= 2 && x.indexOf(g) === 0) { x = x.slice(g.length); cands.push(x); }
      else break;
    }
    out.push(cands);
  });
  return out;
}

// Returns a short reason string on a hit, or null. Same order as the reference.
function hit(title, list) {
  var t = norm(title);
  var phrases = list.phrases || [], words = list.words || [], stems = list.stems || [];
  for (var p = 0; p < phrases.length; p++) {
    if (t.indexOf(phrases[p]) !== -1) return 'phrase:' + phrases[p];
  }
  var toks = tokens(title);
  for (var i = 0; i < toks.length; i++) {
    for (var j = 0; j < toks[i].length; j++) {
      var c = toks[i][j];
      if (words.indexOf(c) !== -1) return 'word:' + c;
      for (var k = 0; k < stems.length; k++) {
        var s = stems[k];
        if (s.length <= 2) { if (c === s) return 'stem=' + s; }
        else if (c.indexOf(s) === 0) return 'stem:' + s;
      }
    }
  }
  return null;
}

// { keep, preferred, reason } for one title from one feed config ({ soft }).
function classify(title, feed, F) {
  var blocked = hit(title, F.block);
  if (blocked) return { keep: false, preferred: false, reason: blocked };
  var preferred = hit(title, F.prefer);
  if (!feed.soft && !preferred) return { keep: false, preferred: false, reason: 'no-prefer' };
  return { keep: true, preferred: !!preferred, reason: preferred || '' };
}

// perFeed: [{ feed, items: [{ title, link }] }] in F.feeds order.
// Preferred titles first, then the rest; each pass round-robins across feeds.
// At most F.perFeedMax per feed, F.maxItems total, duplicates removed.
// Never falls back to unfiltered items: may return [].
function select(perFeed, F) {
  var queues = { pref: [], rest: [] };
  perFeed.forEach(function(group) {
    var p = [], r = [];
    group.items.forEach(function(it) {
      var c = classify(it.title, group.feed, F);
      if (!c.keep) return;
      (c.preferred ? p : r).push(it);
    });
    queues.pref.push(p);
    queues.rest.push(r);
  });

  var out = [], seen = {}, perFeedCount = perFeed.map(function() { return 0; });
  ['pref', 'rest'].forEach(function(kind) {
    var lists = queues[kind], idx = lists.map(function() { return 0; });
    var progressed = true;
    while (progressed && out.length < F.maxItems) {
      progressed = false;
      for (var f = 0; f < lists.length && out.length < F.maxItems; f++) {
        while (idx[f] < lists[f].length && perFeedCount[f] < F.perFeedMax) {
          var it = lists[f][idx[f]++];
          var key = it.title.trim();
          if (seen[key]) continue;
          seen[key] = 1;
          out.push(it);
          perFeedCount[f]++;
          progressed = true;
          break;
        }
      }
    }
  });
  return out;
}

module.exports = { norm: norm, tokens: tokens, hit: hit, classify: classify, select: select };
