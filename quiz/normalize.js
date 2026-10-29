/* Shared answer normalization + matching for AMNE 151 Sphinx quiz (self + live). */
(function (global) {
  'use strict';

  function stripAccents(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Canonical form for short-answer / cloud tokens. */
  function normalizeAnswer(raw) {
    var s = stripAccents(String(raw || '').toLowerCase());
    s = s.replace(/[''`´]/g, '');
    s = s.replace(/[^a-z0-9\s-]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    // Drop leading articles
    s = s.replace(/^(the|a|an)\s+/, '');
    // Greek / Latin transliteration folds
    s = s.replace(/ph/g, 'f');
    s = s.replace(/kh/g, 'ch');
    s = s.replace(/ai/g, 'e');
    s = s.replace(/ae/g, 'e');
    s = s.replace(/oe/g, 'e');
    s = s.replace(/ei/g, 'i');
    s = s.replace(/ou/g, 'u');
    s = s.replace(/y/g, 'i');
    s = s.replace(/us\b/g, 'os');
    // c/k and ch → k (Chiron, Cecrops, Kekrops align)
    s = s.replace(/ch/g, 'k');
    s = s.replace(/c/g, 'k');
    // Collapse repeated letters (Cassandra ~ Casandra)
    s = s.replace(/(.)\1+/g, '$1');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function levenshtein(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length, i, j, cost;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = new Array(n + 1);
    var cur = new Array(n + 1);
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }

  /** Edit distance allowance scales with length. */
  function maxEditDistance(len) {
    if (len <= 3) return 0;
    if (len <= 6) return 1;
    if (len <= 10) return 2;
    return 3;
  }

  function fuzzyEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    var maxd = Math.max(maxEditDistance(a.length), maxEditDistance(b.length));
    if (maxd <= 0) return false;
    return levenshtein(a, b) <= maxd;
  }

  /** True if needle appears as a token/phrase inside haystack (both normalized). */
  function containsAccepted(haystackNorm, needleNorm) {
    if (!haystackNorm || !needleNorm) return false;
    if (fuzzyEqual(haystackNorm, needleNorm)) return true;
    var padded = ' ' + haystackNorm + ' ';
    var needle = ' ' + needleNorm + ' ';
    if (padded.indexOf(needle) !== -1) return true;
    // Token-wise fuzzy (single-token accepted answers inside a sentence)
    if (needleNorm.indexOf(' ') === -1) {
      var toks = haystackNorm.split(' ');
      var i;
      for (i = 0; i < toks.length; i++) {
        if (fuzzyEqual(toks[i], needleNorm)) return true;
      }
    }
    return false;
  }

  function matchesAccepted(raw, acceptedList) {
    var norm = normalizeAnswer(raw);
    if (!norm) return { ok: false, norm: norm, matched: null };
    var list = acceptedList || [];
    var i, acc, an;
    for (i = 0; i < list.length; i++) {
      acc = list[i];
      an = normalizeAnswer(acc);
      if (!an) continue;
      if (containsAccepted(norm, an)) return { ok: true, norm: norm, matched: acc };
    }
    return { ok: false, norm: norm, matched: null };
  }

  /** Canonical question kind: short | open | mc | cloud | hardModeGate (legacy 'type' → short). */
  function questionKind(q) {
    if (!q || !q.type) return 'short';
    if (q.type === 'type') return 'short';
    return q.type;
  }

  function isHardModeGate(q) {
    return questionKind(q) === 'hardModeGate';
  }

  /** Count of real questions (excludes Hard Mode gate slides). */
  function countableLength(qs) {
    var n = 0, i;
    for (i = 0; i < (qs || []).length; i++) {
      if (!isHardModeGate(qs[i])) n++;
    }
    return n;
  }

  /**
   * 1-based display number among countable questions.
   * Returns null when index points at a Hard Mode gate.
   */
  function displayQuestionNumber(qs, index) {
    var i, n;
    if (!qs || index < 0 || index >= qs.length) return null;
    if (isHardModeGate(qs[index])) return null;
    n = 0;
    for (i = 0; i <= index; i++) {
      if (!isHardModeGate(qs[i])) n++;
    }
    return n;
  }

  function sortedUniqueNums(arr) {
    var seen = Object.create(null);
    var out = [];
    var i, n;
    for (i = 0; i < (arr || []).length; i++) {
      n = Number(arr[i]);
      if (!isFinite(n) || n < 0) continue;
      n = Math.floor(n);
      if (seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /** Grade MC selection. exact = same set; partial = overlap (multi only). */
  function gradeMc(selected, correct, multi) {
    var sel = sortedUniqueNums(selected);
    var cor = sortedUniqueNums(correct);
    var i, j, hit = 0;
    if (!cor.length) return { exact: false, partial: false, selected: sel, correct: cor, hit: 0 };
    if (!multi) {
      var ok = sel.length === 1 && cor.indexOf(sel[0]) !== -1;
      return { exact: ok, partial: ok, selected: sel, correct: cor, hit: ok ? 1 : 0 };
    }
    for (i = 0; i < sel.length; i++) {
      for (j = 0; j < cor.length; j++) {
        if (sel[i] === cor[j]) { hit++; break; }
      }
    }
    var exact = sel.length === cor.length && hit === cor.length;
    var partial = hit > 0;
    return { exact: exact, partial: partial, selected: sel, correct: cor, hit: hit };
  }

  function choiceStrFromIndices(indices) {
    return sortedUniqueNums(indices).join(',');
  }

  function indicesFromChoiceStr(s) {
    if (!s && s !== 0) return [];
    return sortedUniqueNums(String(s).split(','));
  }

  /** Group short/open text answers by normalized form. */
  function groupAnswers(answerMap, acceptedList) {
    var entries = [];
    var k, v, norm, label, g, m, out, groups, raw;
    if (Array.isArray(answerMap)) {
      entries = answerMap;
    } else if (answerMap && typeof answerMap === 'object') {
      for (k in answerMap) {
        if (Object.prototype.hasOwnProperty.call(answerMap, k) && answerMap[k]) {
          entries.push(answerMap[k]);
        }
      }
    }
    groups = Object.create(null);
    for (k = 0; k < entries.length; k++) {
      v = entries[k];
      if (!v) continue;
      raw = v.raw;
      norm = v.norm || normalizeAnswer(raw);
      if (!norm) continue;
      m = matchesAccepted(raw || norm, acceptedList || []);
      label = (m.ok && m.matched) ? m.matched : (raw || norm);
      if (!groups[norm]) {
        groups[norm] = {
          norm: norm,
          label: label,
          count: 0,
          correct: !!(acceptedList && acceptedList.length && m.ok)
        };
      }
      groups[norm].count += 1;
    }
    out = [];
    for (g in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, g)) out.push(groups[g]);
    }
    out.sort(function (a, b) {
      return b.count - a.count || String(a.label).localeCompare(String(b.label));
    });
    return out;
  }

  /** Tally MC votes per option index from live answer map. */
  function tallyMc(answerMap, optionCount) {
    var counts = [];
    var i, k, v, idxs, j;
    for (i = 0; i < optionCount; i++) counts[i] = 0;
    if (!answerMap) return counts;
    for (k in answerMap) {
      if (!Object.prototype.hasOwnProperty.call(answerMap, k) || !answerMap[k]) continue;
      v = answerMap[k];
      idxs = v.choices
        ? sortedUniqueNums(v.choices)
        : indicesFromChoiceStr(v.choiceStr);
      for (j = 0; j < idxs.length; j++) {
        if (idxs[j] >= 0 && idxs[j] < optionCount) counts[idxs[j]] += 1;
      }
    }
    return counts;
  }

  /** Flatten cloud words from all devices and group by norm. */
  /** Word cloud restarts: meta.cloudRounds = {qIndex: n}. Missing → 0. */
  function cloudRoundFor(meta, qIndex) {
    var r = meta && meta.cloudRounds ? meta.cloudRounds[qIndex] : 0;
    if (r == null && meta && meta.cloudRounds) r = meta.cloudRounds[String(qIndex)];
    return Number(r) || 0;
  }

  /** Keep only answers submitted in the given cloud round. */
  function filterCloudRound(answerMap, round) {
    var out = {}, k, a;
    round = Number(round) || 0;
    for (k in (answerMap || {})) {
      if (!Object.prototype.hasOwnProperty.call(answerMap, k)) continue;
      a = answerMap[k];
      if (a && (Number(a.round) || 0) === round) out[k] = a;
    }
    return out;
  }

  function groupCloudWords(answerMap) {
    var bag = [];
    var k, v, w, i, words;
    if (!answerMap) return groupAnswers([]);
    for (k in answerMap) {
      if (!Object.prototype.hasOwnProperty.call(answerMap, k) || !answerMap[k]) continue;
      v = answerMap[k];
      words = v.words;
      if (Array.isArray(words)) {
        for (i = 0; i < words.length; i++) {
          w = words[i];
          if (w && (w.raw || w.norm)) bag.push(w);
        }
      } else if (words && typeof words === 'object') {
        for (i in words) {
          if (Object.prototype.hasOwnProperty.call(words, i) && words[i]) bag.push(words[i]);
        }
      } else if (v.raw) {
        bag.push({ raw: v.raw, norm: v.norm });
      }
    }
    return groupAnswers(bag, []);
  }


  var SCORE_BASE = 1000;
  var SCORE_SPEED = 500;
  var SCORE_WINDOW_MS = 20000;

  function isGradable(q) {
    var k = questionKind(q);
    return k === 'short' || k === 'type' || k === 'mc';
  }

  /** Correctness 0..1 for a single answer payload vs question. */
  function answerCorrectness(q, ans) {
    var k = questionKind(q);
    if (!ans) return 0;
    if (k === 'short' || k === 'type') {
      return matchesAccepted(ans.raw || '', q.accepted || []).ok ? 1 : 0;
    }
    if (k === 'mc') {
      var g, sel;
      if (ans.hardMode && ans.raw) {
        g = gradeHardModeMc(ans.raw, q);
      } else {
        sel = ans.choices
          ? sortedUniqueNums(ans.choices)
          : indicesFromChoiceStr(ans.choiceStr);
        g = gradeMc(sel, q.correct || [], !!q.multi);
      }
      if (g.exact) return 1;
      if (q.multi && g.partial && (q.correct || []).length) {
        return g.hit / (q.correct || []).length;
      }
      return 0;
    }
    return 0;
  }

  function speedFactor(answeredAt, openedAt) {
    if (!openedAt || !answeredAt) return 0;
    var dt = Number(answeredAt) - Number(openedAt);
    if (dt < 0) dt = 0;
    var f = 1 - (dt / SCORE_WINDOW_MS);
    if (f < 0) f = 0;
    if (f > 1) f = 1;
    return f;
  }

  /** Points for one answer. Non-gradable → 0. */
  function scoreForAnswer(q, ans, openedAt) {
    if (!isGradable(q)) return 0;
    var c = answerCorrectness(q, ans);
    if (c <= 0) return 0;
    var spd = speedFactor(ans && ans.at, openedAt);
    return Math.round(SCORE_BASE * c + SCORE_SPEED * spd * c);
  }

  /**
   * Build leaderboard rows from players + answers maps.
   * returns [{uid, nick, score, rank}] sorted desc
   */
  function computeLeaderboard(quizObj, playersMap, answersByQ, metaByQOpened) {
    var players = playersMap || {};
    var totals = Object.create(null);
    var uid, qIndex, q, ansMap, ans, opened, qs, i;
    for (uid in players) {
      if (Object.prototype.hasOwnProperty.call(players, uid) && players[uid]) {
        totals[uid] = 0;
      }
    }
    qs = (quizObj && quizObj.questions) || [];
    for (qIndex = 0; qIndex < qs.length; qIndex++) {
      q = qs[qIndex];
      if (!isGradable(q)) continue;
      ansMap = (answersByQ && answersByQ[qIndex]) || {};
      opened = metaByQOpened && metaByQOpened[qIndex];
      // also accept single current openedAt passed as number for current q only via metaByQOpened.current
      if (opened == null && metaByQOpened && typeof metaByQOpened === 'object' && metaByQOpened.openedAt != null && metaByQOpened.currentQ === qIndex) {
        opened = metaByQOpened.openedAt;
      }
      for (uid in ansMap) {
        if (!Object.prototype.hasOwnProperty.call(ansMap, uid) || !ansMap[uid]) continue;
        ans = ansMap[uid];
        if (totals[uid] == null) totals[uid] = 0;
        totals[uid] += scoreForAnswer(q, ans, opened);
      }
    }
    var rows = [];
    for (uid in totals) {
      if (!Object.prototype.hasOwnProperty.call(totals, uid)) continue;
      rows.push({
        uid: uid,
        nick: (players[uid] && players[uid].nick) || 'Player',
        score: totals[uid]
      });
    }
    // include players with 0
    for (uid in players) {
      if (!Object.prototype.hasOwnProperty.call(players, uid)) continue;
      if (totals[uid] == null) {
        rows.push({ uid: uid, nick: players[uid].nick || 'Player', score: 0 });
      }
    }
    // dedupe by uid
    var seen = Object.create(null);
    var uniq = [];
    for (i = 0; i < rows.length; i++) {
      if (seen[rows[i].uid]) continue;
      seen[rows[i].uid] = true;
      uniq.push(rows[i]);
    }
    uniq.sort(function (a, b) {
      return b.score - a.score || String(a.nick).localeCompare(String(b.nick));
    });
    for (i = 0; i < uniq.length; i++) uniq[i].rank = i + 1;
    return uniq;
  }

  var MILD_BLOCK = /\b(fuck|shit|asshole|bitch|cunt|nigger|faggot)\b/i;

  function sanitizeNick(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[^\w\s.\-']/g, '');
    if (s.length > 20) s = s.slice(0, 20).trim();
    if (!s) s = 'Guest';
    if (MILD_BLOCK.test(s)) s = 'Guest';
    return s;
  }

  function uniquifyNick(base, playersMap, selfUid) {
    var nick = sanitizeNick(base);
    var used = Object.create(null);
    var uid, n, candidate, i;
    for (uid in (playersMap || {})) {
      if (!Object.prototype.hasOwnProperty.call(playersMap, uid)) continue;
      if (uid === selfUid) continue;
      n = (playersMap[uid] && playersMap[uid].nick) || '';
      used[n.toLowerCase()] = true;
    }
    if (!used[nick.toLowerCase()]) return nick;
    for (i = 2; i < 100; i++) {
      candidate = (nick.slice(0, 16) + ' ' + i).slice(0, 20);
      if (!used[candidate.toLowerCase()]) return candidate;
    }
    return (nick.slice(0, 12) + ' ' + String(Date.now()).slice(-4)).slice(0, 20);
  }


  /** Built-in spelling variants for Hard Mode (keyed by common English form). */
  var BUILTIN_OPTION_ALIASES = {
    Aphrodite: ['Afrodite'],
    Clytemnestra: ['Klytaimnestra', 'Clytaemnestra', 'Klytemnestra', 'Clytaimestra'],
    Electra: ['Elektra'],
    Menelaus: ['Menelaos'],
    Hecuba: ['Hekabe', 'Hecabe', 'Hekuba'],
    Cassandra: ['Kassandra'],
    Andromache: ['Andromakhe'],
    Agave: ['Agaue'],
    Semele: ['Semele'],
    Pentheus: ['Pentheus'],
    Oedipus: ['Oidipous', 'Oedipous', 'Oidipus'],
    Agamemnon: ['Agamemnon'],
    Achilles: ['Akhilleus', 'Achilleus'],
    Hector: ['Hektor'],
    Priam: ['Priamos'],
    Theseus: ['Theseus'],
    Jason: ['Iason'],
    Orestes: ['Orestes'],
    Hera: ['Here'],
    Athena: ['Athene', 'Athēna']
  };

  /**
   * Split Hard Mode typed text into answer tokens.
   * Splits on commas, semicolons, newlines, pipes, and whitespace.
   * When phraseHints are provided (option labels / aliases), greedily match
   * multi-word phrases before splitting the remainder on spaces so names like
   * "House of Atreus" are kept intact. Dedupes case-insensitively, first wins.
   */
  function parseHardModeEntries(raw, phraseHints) {
    var s = String(raw || '').replace(/\r/g, '\n');
    var chunks = s.split(/[\n,;|/]+/);
    var phrases = [];
    var seenPhrase = Object.create(null);
    var i, j, chunk, rest, matched, best, blen, pl, lower, key, out, seen;
    function addPhrase(x) {
      var t = String(x || '').replace(/\s+/g, ' ').trim();
      var k;
      if (!t || t.indexOf(' ') === -1) return;
      k = t.toLowerCase();
      if (seenPhrase[k]) return;
      seenPhrase[k] = true;
      phrases.push(t);
    }
    if (phraseHints && phraseHints.length) {
      for (i = 0; i < phraseHints.length; i++) addPhrase(phraseHints[i]);
    }
    phrases.sort(function (a, b) { return b.length - a.length; });

    out = [];
    seen = Object.create(null);
    function pushToken(t) {
      var k, cleaned;
      cleaned = String(t || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      k = cleaned.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(cleaned);
    }

    for (i = 0; i < chunks.length; i++) {
      chunk = String(chunks[i] || '').replace(/\s+/g, ' ').trim();
      if (!chunk) continue;
      rest = chunk;
      while (rest) {
        matched = null;
        best = null;
        blen = 0;
        lower = rest.toLowerCase();
        for (j = 0; j < phrases.length; j++) {
          pl = phrases[j].toLowerCase();
          if (pl.length <= blen) continue;
          if (lower === pl || lower.indexOf(pl + ' ') === 0) {
            best = phrases[j];
            blen = pl.length;
          }
        }
        if (best) {
          pushToken(best);
          rest = rest.slice(best.length).replace(/^\s+/, '');
          continue;
        }
        // No multi-word phrase at start — take next whitespace-separated token
        matched = rest.match(/^(\S+)(?:\s+(.*))?$/);
        if (!matched) break;
        pushToken(matched[1]);
        rest = matched[2] || '';
      }
    }
    return out;
  }

  /** All option labels + aliases for Hard Mode phrase-aware splitting. */
  function hardModePhraseHints(q) {
    var opts = (q && q.options) || [];
    var out = [], i, aliases, a;
    for (i = 0; i < opts.length; i++) {
      aliases = aliasesForOption(q, i);
      for (a = 0; a < aliases.length; a++) out.push(aliases[a]);
    }
    return out;
  }

  function optionLabel(q, index) {
    var o = (q && q.options && q.options[index]);
    if (o && typeof o === 'object') return o.text || o.label || '';
    return o == null ? '' : String(o);
  }

  /** Alias strings for one option index (option text + JSON aliases + builtins). */
  function aliasesForOption(q, index) {
    var label = optionLabel(q, index);
    var out = [];
    var seen = Object.create(null);
    function add(x) {
      var s = String(x || '').trim();
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      out.push(s);
    }
    add(label);
    var o = q && q.options && q.options[index];
    if (o && typeof o === 'object' && o.aliases) {
      (o.aliases || []).forEach(add);
    }
    if (q && q.aliases && label && q.aliases[label]) {
      (q.aliases[label] || []).forEach(add);
    }
    if (q && Array.isArray(q.optionAliases) && q.optionAliases[index]) {
      (q.optionAliases[index] || []).forEach(add);
    }
    if (BUILTIN_OPTION_ALIASES[label]) {
      BUILTIN_OPTION_ALIASES[label].forEach(add);
    }
    return out;
  }

  /** Match one typed token to an option index, or -1. */
  function matchOptionIndex(raw, q, usedMap) {
    var opts = (q && q.options) || [];
    var i, aliases, m;
    for (i = 0; i < opts.length; i++) {
      if (usedMap && usedMap[i]) continue;
      aliases = aliasesForOption(q, i);
      m = matchesAccepted(raw, aliases);
      if (m.ok) return i;
    }
    return -1;
  }

  /**
   * Map Hard Mode typed entries → MC indices.
   * Unmatched tokens become phantom wrong indices (>= options.length) so they
   * penalize exactness the same way as tapping a wrong option.
   * Returns { indices, unmatched, choiceStr, raw, labels }.
   */
  function mapHardModeAnswer(rawOrList, q) {
    var entries = Array.isArray(rawOrList)
      ? rawOrList
      : parseHardModeEntries(rawOrList, hardModePhraseHints(q));
    var opts = (q && q.options) || [];
    var used = Object.create(null);
    var indices = [];
    var unmatched = [];
    var labels = [];
    var i, ix, phantom;
    for (i = 0; i < entries.length; i++) {
      ix = matchOptionIndex(entries[i], q, used);
      if (ix >= 0) {
        used[ix] = true;
        indices.push(ix);
        labels.push(optionLabel(q, ix));
      } else {
        unmatched.push(entries[i]);
        labels.push(entries[i]);
      }
    }
    phantom = opts.length;
    for (i = 0; i < unmatched.length; i++) {
      indices.push(phantom + i);
    }
    var matchedOnly = sortedUniqueNums(indices.filter(function (n) { return n < opts.length; }));
    var phantoms = [];
    for (i = 0; i < unmatched.length; i++) phantoms.push(opts.length + i);
    return {
      indices: matchedOnly.concat(phantoms),
      matched: matchedOnly,
      unmatched: unmatched,
      choiceStr: choiceStrFromIndices(matchedOnly.concat(phantoms)),
      raw: entries.join(', '),
      labels: labels
    };
  }

  function gradeHardModeMc(rawOrList, q) {
    var mapped = mapHardModeAnswer(rawOrList, q);
    var g = gradeMc(mapped.indices, (q && q.correct) || [], !!(q && q.multi));
    g.mapped = mapped;
    return g;
  }


  global.QuizNormalize = {
    normalizeAnswer: normalizeAnswer,
    matchesAccepted: matchesAccepted,
    groupAnswers: groupAnswers,
    levenshtein: levenshtein,
    maxEditDistance: maxEditDistance,
    questionKind: questionKind,
    isHardModeGate: isHardModeGate,
    countableLength: countableLength,
    displayQuestionNumber: displayQuestionNumber,
    gradeMc: gradeMc,
    choiceStrFromIndices: choiceStrFromIndices,
    indicesFromChoiceStr: indicesFromChoiceStr,
    tallyMc: tallyMc,
    groupCloudWords: groupCloudWords,
    cloudRoundFor: cloudRoundFor,
    filterCloudRound: filterCloudRound,
    sortedUniqueNums: sortedUniqueNums,
    isGradable: isGradable,
    answerCorrectness: answerCorrectness,
    scoreForAnswer: scoreForAnswer,
    computeLeaderboard: computeLeaderboard,
    sanitizeNick: sanitizeNick,
    uniquifyNick: uniquifyNick,
    parseHardModeEntries: parseHardModeEntries,
    hardModePhraseHints: hardModePhraseHints,
    aliasesForOption: aliasesForOption,
    matchOptionIndex: matchOptionIndex,
    mapHardModeAnswer: mapHardModeAnswer,
    gradeHardModeMc: gradeHardModeMc,
    optionLabel: optionLabel,
    SCORE_BASE: SCORE_BASE,
    SCORE_SPEED: SCORE_SPEED,
    SCORE_WINDOW_MS: SCORE_WINDOW_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
