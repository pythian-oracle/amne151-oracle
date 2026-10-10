/* AMNE 151 Citation Helper: Chicago (17th ed.) bibliography entries.
   Works offline in the browser; also loadable in Node for tests (module.exports).
   Follows the patterns in info.html (Project Proposal Guide). */
(function (root) {
  'use strict';

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function em(s) { return '<em>' + esc(s) + '</em>'; }
  function plain(html) { return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
  function endDot(s) { s = clean(s); return /[.?!]$/.test(s) ? s : s + '.'; }
  function stripEndDot(s) { return clean(s).replace(/[.\s]+$/, ''); }
  function curly(s) {   // straight quotes/apostrophes to typographic ones
    return s.replace(/(^|[\s(\[])"/g, '$1\u201C').replace(/"/g, '\u201D')
            .replace(/(^|[\s(\[])'/g, '$1\u2018').replace(/'/g, '\u2019');
  }

  var MINOR = ('a an the and but for or nor as at by in of on to up via per from into onto with over upon than ' +
               'off out vs').split(' ');
  // Chicago headline style: first/last word and the word after a colon are capitalized;
  // articles, conjunctions and prepositions are lowercase otherwise.
  function headline(title) {
    title = clean(title).replace(/\s+:\s*/g, ': ');
    var words = title.split(' '), n = words.length;
    return words.map(function (w, i) {
      var core = w.replace(/^[^A-Za-z\u00C0-\u024F]+|[^A-Za-z\u00C0-\u024F]+$/g, '');
      if (!core) return w;
      if (/[A-Z].*[A-Z]/.test(core) || /[a-z][A-Z]/.test(core)) return w;   // acronyms, McX, iPhone
      var prev = i > 0 ? words[i - 1] : '';
      var forceCap = i === 0 || i === n - 1 || /[:?!.\u2014]$/.test(prev);
      var lower = core.toLowerCase();
      var out = (!forceCap && MINOR.indexOf(lower) >= 0) ? lower
        : lower.split('-').map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join('-');
      return w.replace(core, out);
    }).join(' ');
  }
  function joinNames(list) {
    list = list.map(clean).filter(Boolean);
    if (list.length < 2) return list[0] || '';
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }
  // "Last, First" for the first author, others "First Last"
  function authorName(last, first) { last = clean(last); first = clean(first); return first ? last + ', ' + first : last; }
  function pubInfo(place, publisher, year) {
    var p = clean(place), pub = clean(publisher), y = clean(year);
    var s = '';
    if (p) s += p + ': ';
    s += pub;
    if (y) s += (pub ? ', ' : '') + y;
    return s ? s + '.' : '';
  }
  function title(s, apply) { s = curly(clean(s)); return apply === false ? s : headline(s); }

  /* ---------- the five types (from the Project Proposal Guide) ---------- */
  var TYPES = {
    primary: {
      label: 'Primary source (e.g. Loeb Classical Library)',
      fields: [
        ['author', 'Ancient author', 'Pindar'],
        ['title', 'Title of the work(s)', 'Olympian Odes. Pythian Odes'],
        ['role', 'Role of the modern scholar', 'Edited and translated by', ['Edited and translated by', 'Translated by', 'Edited by']],
        ['person', 'Editor / translator (First Last)', 'William H. Race'],
        ['series', 'Series and number', 'Loeb Classical Library 56'],
        ['place', 'Place of publication', 'Cambridge, MA'],
        ['publisher', 'Publisher', 'Harvard University Press'],
        ['year', 'Year', '1997'],
        ['annotation', 'Annotation (optional, complete sentences)', 'This book has the original Greek and the English translation on facing pages. The very helpful introduction includes background context and stylistic notes.', 'textarea']
      ],
      make: function (f) {
        var h = esc(endDot(f.author)) + ' ' + em(stripEndDot(title(f.title, false))) + '.';
        if (clean(f.person)) h += ' ' + esc(endDot((f.role || 'Edited and translated by') + ' ' + f.person));
        if (clean(f.series)) h += ' ' + esc(endDot(f.series));
        h += ' ' + esc(pubInfo(f.place, f.publisher, f.year));
        return { html: h.trim(), annotation: clean(f.annotation) };
      }
    },
    book: {
      label: 'Book',
      fields: [
        ['last', 'Author last name', 'Braswell'],
        ['first', 'Author first name(s)', 'Bruce Karl'],
        ['others', 'Other authors (optional, First Last; separate with ;)', ''],
        ['title', 'Book title', 'A commentary on the fourth Pythian ode of Pindar'],
        ['volume', 'Volume (optional, number only)', '14'],
        ['place', 'Place of publication (pick one)', 'Berlin'],
        ['publisher', 'Publisher', 'De Gruyter'],
        ['year', 'Year', '1988']
      ],
      make: function (f) {
        var names = [authorName(f.last, f.first)].concat(clean(f.others).split(';'));
        var h = esc(endDot(joinNames(names))) + ' ' + em(stripEndDot(title(f.title))) + '.';
        if (clean(f.volume)) h += ' Vol. ' + esc(stripEndDot(f.volume)) + '.';
        h += ' ' + esc(pubInfo(f.place, f.publisher, f.year));
        return { html: h };
      }
    },
    section: {
      label: 'Book section (a chapter in an edited book)',
      fields: [
        ['last', 'Chapter author last name', 'Smith'],
        ['first', 'Chapter author first name(s) or initials', 'R. R. R.'],
        ['chapter', 'Chapter title', 'Pindar, athletes, and the early Greek statue habit'],
        ['book', 'Book title', 'Pindar\u2019s Poetry, Patrons, and Festivals'],
        ['editors', 'Editor(s) (First Last; separate with ;)', 'Simon Hornblower; Catherine Morgan'],
        ['pages', 'Pages', '83\u2013139'],
        ['place', 'Place of publication (pick one)', 'Oxford'],
        ['publisher', 'Publisher', 'Oxford University Press'],
        ['year', 'Year', '2007']
      ],
      make: function (f) {
        var h = esc(endDot(authorName(f.last, f.first))) + ' \u201C' + esc(stripEndDot(title(f.chapter))) + '.\u201D In ' + em(stripEndDot(title(f.book)));
        var eds = clean(f.editors).split(';').map(clean).filter(Boolean);
        if (eds.length) h += ', edited by ' + esc(joinNames(eds));
        if (clean(f.pages)) h += ', ' + esc(clean(f.pages));
        h += '. ' + esc(pubInfo(f.place, f.publisher, f.year));
        return { html: h };
      }
    },
    journal: {
      label: 'Journal article',
      fields: [
        ['last', 'Author last name', 'Potamiti'],
        ['first', 'Author first name(s)', 'Anna'],
        ['article', 'Article title', 'the Theme of Hospitality in Pindar\'s Fourth Pythian'],
        ['journal', 'Journal name', 'Greece and Rome'],
        ['volume', 'Volume', '62'],
        ['issue', 'Issue (optional)', '1'],
        ['year', 'Year', '2015'],
        ['pages', 'Pages', '1-11'],
        ['doi', 'DOI (optional)', '10.1017/S0017383514000205']
      ],
      make: function (f) {
        var h = esc(endDot(authorName(f.last, f.first))) + ' \u201C' + esc(stripEndDot(title(f.article))) + '.\u201D ' + em(stripEndDot(title(f.journal)));
        if (clean(f.volume)) h += ' ' + esc(clean(f.volume));
        if (clean(f.issue)) h += ', no. ' + esc(clean(f.issue));
        if (clean(f.year)) h += ' (' + esc(clean(f.year)) + ')';
        if (clean(f.pages)) h += ': ' + esc(clean(f.pages));
        h += '.';
        var doi = clean(f.doi).replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
        if (doi) h += ' Doi: ' + esc(stripEndDot(doi)) + '.';
        return { html: h };
      }
    },
    object: {
      label: 'Primary visual / material culture source (museum object)',
      fields: [
        ['description', 'Description (what, where from, date)', 'Silver coin from Cyrene, 480 BC - 435 BC'],
        ['kind', 'Object type', 'Coin'],
        ['collection', 'Collection (museum)', 'British Museum'],
        ['identifier', 'Identifier / museum number', '(EH,p697.3.Cyr)'],
        ['url', 'URL', 'https://www.britishmuseum.org/collection/object/C_EH-p697-3-Cyr']
      ],
      make: function (f) {
        var parts = [f.description, f.kind, f.collection, f.identifier, f.url].map(clean).filter(Boolean);
        return { html: parts.map(function (p) { return esc(endDot(p)); }).join(' ') };
      }
    }
  };
  function example(type) { var o = {}; TYPES[type].fields.forEach(function (f) { o[f[0]] = f[2]; }); return o; }
  function make(type, values) { var r = TYPES[type].make(values); r.text = plain(r.html); return r; }

  /* ---------- fixer for pasted citations ---------- */
  var HQ = {   // main headquarters, for "pick one" when a catalogue lists several places
    'de gruyter': 'Berlin', 'walter de gruyter': 'Berlin', 'oxford university press': 'Oxford',
    'cambridge university press': 'Cambridge', 'harvard university press': 'Cambridge, MA',
    'princeton university press': 'Princeton', 'yale university press': 'New Haven',
    'university of chicago press': 'Chicago', 'university of california press': 'Berkeley',
    'brill': 'Leiden', 'routledge': 'London', 'bloomsbury': 'London', 'bloomsbury academic': 'London',
    'wiley-blackwell': 'Hoboken, NJ', 'blackwell': 'Oxford', 'johns hopkins university press': 'Baltimore',
    'university of toronto press': 'Toronto', 'penguin': 'London', 'penguin classics': 'London',
    'mcgill-queen\u2019s university press': 'Montreal', 'cornell university press': 'Ithaca, NY',
    'university of texas press': 'Austin', 'university of michigan press': 'Ann Arbor'
  };
  function splitSentences(s) {   // split at ". " except after initials like "R." or "Vol."
    var out = [], start = 0, re = /\.\s+/g, m;
    while ((m = re.exec(s)) !== null) {
      var before = s.slice(start, m.index), last = (before.match(/(\S+)$/) || ['', ''])[1];
      if (/^[A-Z]$/.test(last) || /^(Vol|vol|no|ed|eds|trans|Bd)$/.test(last)) continue;
      out.push(s.slice(start, m.index + 1).trim()); start = m.index + m[0].length;
    }
    if (start < s.length) out.push(s.slice(start).trim());
    return out.filter(Boolean);
  }
  function fix(input) {
    var notes = [], warn = [];
    var s = clean(input);
    if (!s) return { html: '', text: '', notes: [], warnings: ['Paste a citation first.'] };
    var t0 = s;
    s = s.replace(/\s*https?:\/\/[^\s]*(serialssolutions|summon)[^\s]*/gi, '');
    if (s !== t0) notes.push('Removed the long UBC library link (not needed in a bibliography).');
    s = s.replace(/\s*\((from )?(Google Scholar|UBC Catalog(ue)?)\)\s*$/i, '');
    var html = '', type = '';

    var q = s.match(/^(.*?)\s*["\u201C](.+?)[,.]?["\u201D]\s*(.*)$/);
    if (q) {
      var author = endDot(q[1]), atitle = stripEndDot(q[2]), rest = clean(q[3]);
      var fixedTitle = headline(curly(atitle));
      if (fixedTitle !== atitle) notes.push('Capitalized the title in headline style.');
      notes.push('Used curly quotation marks around the title.');
      var aHtml = esc(author) + ' \u201C' + esc(fixedTitle) + '.\u201D ';
      if (/^In\s/.test(rest)) {
        type = 'section';
        var m = rest.match(/^In\s+(.*?)(,\s*(edited by|ed\.).*)$/i);
        if (m) { html = aHtml + 'In ' + em(headline(curly(stripEndDot(m[1].replace(/[<>]/g, ''))))) + esc(m[2]); notes.push('Put the book title in italics.'); }
        else html = aHtml + esc(rest);
      } else {
        var j = rest.match(/^(.*?)\s+(\d+\s*(,\s*no\.\s*\d+)?\s*\(\d{4}\).*|\(\d{4}\).*)$/);
        if (j) {
          var cont = stripEndDot(j[1]), tail = j[2];
          html = aHtml + em(headline(curly(cont))) + ' ' + esc(tail);
          notes.push('Put the journal (or book) name in italics.');
          if (/^\(\d{4}\)/.test(tail)) {
            type = 'section';
            warn.push('This has no volume number, so it is probably a chapter in an edited book (Google Scholar often formats these like articles). Use the Book Section maker: add "In", the book\u2019s editors, place, and publisher.');
          } else type = 'journal';
        } else html = aHtml + esc(rest);
      }
      if (/\b[A-Z]{2,3}\.?$/.test(stripEndDot(q[1])) && /,/.test(q[1])) warn.push('The author\u2019s initials look run together (e.g. "RR"). Check the book itself and write them as "R. R." with periods.');
    } else {
      type = 'book';
      var parts = splitSentences(s);
      var auth = parts.shift() || '', btitle = parts.shift() || '';
      var eds = false;
      var edm = btitle.match(/^(.*?),\s*edited by\s+(.*)$/i);
      if (edm) { btitle = edm[1]; eds = true; notes.push('Removed the repeated editor names after the title.'); }
      var tail = parts.join(' ');
      var colon = tail.lastIndexOf(':');
      var mid = tail, place = '', pubyr = '';
      if (colon >= 0) {
        var pre = tail.slice(0, colon), lastDot = pre.lastIndexOf('. ');
        place = lastDot >= 0 ? pre.slice(lastDot + 2) : pre;
        mid = lastDot >= 0 ? pre.slice(0, lastDot + 1) : '';
        pubyr = stripEndDot(tail.slice(colon + 1));
      }
      var places = place.split(';').map(clean).filter(Boolean), chosen = places[0] || '';
      var pubName = clean(pubyr.replace(/,\s*\d{4}$/, '')).toLowerCase();
      if (places.length > 1) {
        chosen = HQ[pubName] && places.indexOf(HQ[pubName]) >= 0 ? HQ[pubName] : (HQ[pubName] || places[0]);
        notes.push('Several places of publication were listed; kept one (' + chosen + ').');
      }
      var mid0 = mid;
      mid = mid.replace(/Vol\.\s*(Bd\.\s*)?(\d+)[\s.;]*(Bd\.\s*\2[\s.;]*)*/i, 'Vol. $2. ');
      if (mid !== mid0 && clean(mid) !== clean(mid0)) notes.push('Cleaned up the volume number.');
      var midParts = splitSentences(clean(mid)).map(function (p) { return p.replace(/[;\s]+$/, '').replace(/^[;.\s]+/, ''); }).filter(Boolean);
      var midOut = [];
      midParts.forEach(function (p) {
        if (/^Vol\./i.test(p)) {
          var n = p.match(/\d+/);
          if (n) { midOut.push('Vol. ' + n[0] + '.'); if (clean(p) !== 'Vol. ' + n[0] + '.') notes.push('Cleaned up the volume number.'); }
        } else if (!/^Bd\.?\s*\d*[;.]*$/.test(p)) midOut.push(endDot(p.replace(/;+/g, '')));
      });
      var fixedT = headline(curly(btitle.replace(/\.$/, '')));
      if (fixedT !== btitle.replace(/\.$/, '')) notes.push('Capitalized the title in headline style.');
      notes.push('Put the book title in italics.');
      var authOut = auth;
      if (eds) {
        var a = auth.replace(/\.$/, '').match(/^([^,]+),\s*(.+?)\s+and\s+(.+)$/);
        authOut = a ? a[1] + ', ' + a[2] + ', and ' + a[3] + ', eds.' : stripEndDot(auth) + ', eds.';
        warn.push('This is the whole edited book. If you used one chapter, cite that chapter instead (Book Section maker).');
      }
      html = esc(endDot(authOut)) + ' ' + em(fixedT) + '.' + (midOut.length ? ' ' + esc(midOut.join(' ')) : '') +
             (colon >= 0 ? ' ' + esc(pubInfo(chosen, pubyr.replace(/,\s*(\d{4})$/, ''), (pubyr.match(/(\d{4})$/) || ['', ''])[1])) : '');
    }
    html = html.replace(/(\w)'(\w)/g, '$1\u2019$2').replace(/\s+/g, ' ').trim();
    if (!/\d{4}/.test(s)) warn.push('No year found: add the year of publication.');
    var uniq = notes.filter(function (n, i) { return notes.indexOf(n) === i; });
    return { html: html, text: plain(html), type: type, notes: uniq, warnings: warn };
  }

  var api = { TYPES: TYPES, example: example, make: make, fix: fix, headline: headline, plain: plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cite = api;

  /* ---------- browser UI ---------- */
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', function () {
    var $ = function (id) { return document.getElementById(id); };
    var sel = $('ctype'), fieldsEl = $('cfields'), out = $('cout'), ann = $('cann');
    Object.keys(TYPES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = TYPES[k].label; sel.appendChild(o); });
    function renderFields() {
      fieldsEl.innerHTML = '';
      TYPES[sel.value].fields.forEach(function (f) {
        var id = 'f-' + f[0], wrap = document.createElement('div'); wrap.className = 'cfield' + (f[3] === 'textarea' ? ' wide' : '');
        var lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = f[1]; wrap.appendChild(lab);
        var inp;
        if (Array.isArray(f[3])) { inp = document.createElement('select'); f[3].forEach(function (v) { var o = document.createElement('option'); o.textContent = v; inp.appendChild(o); }); }
        else if (f[3] === 'textarea') inp = document.createElement('textarea');
        else { inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'e.g. ' + f[2]; }
        inp.id = id; inp.name = f[0]; wrap.appendChild(inp); fieldsEl.appendChild(wrap);
      });
      out.innerHTML = ''; ann.textContent = '';
    }
    function values() { var v = {}; TYPES[sel.value].fields.forEach(function (f) { v[f[0]] = $('f-' + f[0]).value; }); return v; }
    sel.addEventListener('change', renderFields);
    $('cexample').addEventListener('click', function () {
      var ex = example(sel.value); Object.keys(ex).forEach(function (k) { $('f-' + k).value = ex[k]; }); build();
    });
    function build() { var r = make(sel.value, values()); out.innerHTML = r.html; ann.textContent = r.annotation || ''; }
    $('cform').addEventListener('submit', function (e) { e.preventDefault(); build(); });
    function copy(elm, status) {
      var html = elm.innerHTML, text = plain(html);
      if (!text) { status.textContent = 'Nothing to copy yet.'; return; }
      var done = function () { status.textContent = 'Copied (with italics where your program supports it).'; };
      try {
        if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
          navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(done, fallback);
          return;
        }
      } catch (e) {}
      fallback();
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(elm); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand('copy') ? done() : (status.textContent = 'Selected: press Ctrl+C (or Cmd+C) to copy.'); } catch (e) { status.textContent = 'Selected: press Ctrl+C (or Cmd+C) to copy.'; }
      }
    }
    $('ccopy').addEventListener('click', function () { copy(out, $('cstatus')); });
    $('xform').addEventListener('submit', function (e) {
      e.preventDefault();
      var r = fix($('xin').value);
      $('xout').innerHTML = r.html;
      var list = $('xnotes'); list.innerHTML = '';
      r.notes.forEach(function (n) { var li = document.createElement('li'); li.textContent = '\u2714\uFE0F ' + n; list.appendChild(li); });
      r.warnings.forEach(function (n) { var li = document.createElement('li'); li.className = 'warn'; li.textContent = '\u26A0\uFE0F ' + n; list.appendChild(li); });
    });
    $('xcopy').addEventListener('click', function () { copy($('xout'), $('xstatus')); });
    document.querySelectorAll('[data-bad]').forEach(function (b) {
      b.addEventListener('click', function () { $('xin').value = b.getAttribute('data-bad'); $('xin').focus(); });
    });
    renderFields();
  });
})(this);
