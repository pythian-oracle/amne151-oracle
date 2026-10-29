(function () {
  'use strict';

  var LS_KEY = 'sphinx-host-v1';
  var $ = function (id) { return document.getElementById(id); };
  var quiz = null;
  var roomCode = null;
  var hostToken = null;
  var fb = null;
  var metaUnsub = null;
  var answersUnsub = null;
  var currentMeta = null;
  var currentAnswers = null;
  var playersMap = {};
  var answersTree = {};
  var playersUnsub = null;
  var allAnswersUnsub = null;
  var boardVisible = false;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function randomCode(len) {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // letters only (no I/O; digits still accepted on join)
    var out = '', i, buf;
    if (window.crypto && crypto.getRandomValues) {
      buf = new Uint8Array(len);
      crypto.getRandomValues(buf);
      for (i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
      return out;
    }
    for (i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function randomToken() {
    if (window.crypto && crypto.getRandomValues) {
      var buf = new Uint8Array(24);
      crypto.getRandomValues(buf);
      return Array.prototype.map.call(buf, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }
    return randomCode(32).toLowerCase();
  }

  function showConfigBanner(msg) {
    var b = $('configBanner');
    b.innerHTML = msg;
    show(b);
  }

  function joinUrlFor(code) {
    var u = new URL('play.html', location.href);
    u.searchParams.set('room', code);
    return u.href;
  }

  function hostUrlFor(code, token) {
    var u = new URL('host.html', location.href);
    u.searchParams.set('room', code);
    u.searchParams.set('host', token);
    return u.href;
  }

  function saveSession(code, token, quizId) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        room: code, hostToken: token, quizId: quizId, at: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch (e) { return null; }
  }

  function renderQr(url) {
    var box = $('qr');
    box.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      box.textContent = 'QR library failed to load. Use the join URL below.';
      return;
    }
    try {
      // qrcodejs (vendor/qrcode.min.js): draws into the container element
      // eslint-disable-next-line no-new
      new QRCode(box, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#2B2420',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      box.textContent = 'Could not draw QR.';
      console.warn(e);
    }
  }


  function loadQuiz(id) {
    return fetch('quizzes/' + encodeURIComponent(id) + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Quiz not found: ' + id);
        return r.json();
      });
  }

  function ensureFirebase() {
    if (!SphinxFirebase.isConfigured()) {
      showConfigBanner(
        '<strong>Firebase not configured yet.</strong> Open <code>quiz/firebase-config.js</code> and paste the web app keys from the ' +
        '<strong>amne151-sphinx</strong> project. See <code>quiz/SETUP.md</code>. Self-quiz still works without this.'
      );
      $('startRoomBtn').disabled = true;
      return Promise.reject(new Error('not configured'));
    }
    return SphinxFirebase.init().then(function (api) {
      fb = api;
      return fb.signInAnonymously();
    });
  }

  function questionAt(i) {
    if (!quiz || !quiz.questions) return null;
    if (i < 0 || i >= quiz.questions.length) return null;
    return quiz.questions[i];
  }

  function countAnswers(map) {
    var n = 0, k;
    if (!map) return 0;
    for (k in map) if (Object.prototype.hasOwnProperty.call(map, k) && map[k]) n++;
    return n;
  }


  function openedAtForQuestion(qIndex) {
    var map, v;
    if (!currentMeta) return null;
    map = currentMeta.openedByQ;
    if (map && map[qIndex] != null) return map[qIndex];
    if (map && map[String(qIndex)] != null) return map[String(qIndex)];
    if (Number(currentMeta.currentQ) === qIndex && currentMeta.questionOpenedAt) {
      return currentMeta.questionOpenedAt;
    }
    return null;
  }

  function computeBoardFair() {
    var players = playersMap || {};
    var totals = Object.create(null);
    var uid, qIndex, q, ansMap, ans, qs, opened, rows, seen, i, n;
    for (uid in players) {
      if (Object.prototype.hasOwnProperty.call(players, uid)) totals[uid] = 0;
    }
    qs = (quiz && quiz.questions) || [];
    for (qIndex = 0; qIndex < qs.length; qIndex++) {
      q = qs[qIndex];
      if (!QuizNormalize.isGradable(q)) continue;
      ansMap = answersTree[qIndex] || {};
      opened = openedAtForQuestion(qIndex);
      for (uid in ansMap) {
        if (!Object.prototype.hasOwnProperty.call(ansMap, uid) || !ansMap[uid]) continue;
        ans = ansMap[uid];
        if (totals[uid] == null) totals[uid] = 0;
        totals[uid] += QuizNormalize.scoreForAnswer(q, ans, opened);
      }
    }
    rows = [];
    seen = Object.create(null);
    for (uid in totals) {
      if (!Object.prototype.hasOwnProperty.call(totals, uid)) continue;
      n = (players[uid] && players[uid].nick) || 'Player';
      rows.push({ uid: uid, nick: n, score: totals[uid] });
      seen[uid] = true;
    }
    for (uid in players) {
      if (seen[uid]) continue;
      rows.push({ uid: uid, nick: players[uid].nick || 'Player', score: 0 });
    }
    rows.sort(function (a, b) { return b.score - a.score || String(a.nick).localeCompare(String(b.nick)); });
    for (i = 0; i < rows.length; i++) rows[i].rank = i + 1;
    return rows;
  }

  function renderLeaderboard(finalPodium) {
    var board = computeBoardFair();
    var ol = $('leaderboard');
    var podium = $('podium');
    var panel = $('boardPanel');
    var i, li, top, html;
    show(panel);
    $('boardTitle').textContent = finalPodium ? 'Final podium' : 'Top scorers';
    ol.innerHTML = '';
    top = board.slice(0, finalPodium ? 10 : 5);
    if (!top.length) {
      ol.innerHTML = '<li class="hint">No players yet</li>';
    }
    for (i = 0; i < top.length; i++) {
      li = document.createElement('li');
      li.innerHTML = '<strong>' + escapeHtml(top[i].nick) + '</strong> <span class="pts">' + top[i].score + ' pts</span>';
      ol.appendChild(li);
    }
    if (finalPodium) {
      show(podium);
      html = '';
      if (board[1]) html += '<div class="place p2"><span>2</span><b>' + escapeHtml(board[1].nick) + '</b>' + board[1].score + '</div>';
      if (board[0]) html += '<div class="place p1"><span>1</span><b>' + escapeHtml(board[0].nick) + '</b>' + board[0].score + '</div>';
      if (board[2]) html += '<div class="place p3"><span>3</span><b>' + escapeHtml(board[2].nick) + '</b>' + board[2].score + '</div>';
      podium.innerHTML = html || '<p class="hint">No scores yet</p>';
      if ($('reviewFromPodiumBtn')) show($('reviewFromPodiumBtn'));
    } else {
      hide(podium);
      podium.innerHTML = '';
      if ($('reviewFromPodiumBtn')) hide($('reviewFromPodiumBtn'));
    }
  }


    /** Plain-text cloud summary for Review all: "wrath ×5, pride ×3, rage, …" (omit ×1). */
  function formatCloudWordList(words) {
    var parts = [], i, w, c, lab;
    for (i = 0; i < (words || []).length; i++) {
      w = words[i];
      if (!w || !w.label) continue;
      c = Number(w.count) || 1;
      lab = escapeHtml(w.label);
      parts.push(c > 1 ? (lab + ' ×' + c) : lab);
    }
    return parts.join(', ');
  }

  function topCloudWordsForQuestion(qIndex, limit) {
    var map = {};
    if (answersTree) {
      map = answersTree[qIndex] || answersTree[String(qIndex)] || {};
    }
    if ((!map || !Object.keys(map).length) && currentAnswers &&
        currentMeta && Number(currentMeta.currentQ) === Number(qIndex)) {
      map = currentAnswers;
    }
    var groups = QuizNormalize.groupCloudWords(map) || [];
    return groups.slice(0, limit || 80);
  }

  /** Per-question room stats: {answered, correct, partial, label}. No answers → label "—". */
  function questionRoomStats(qIndex, q) {
    var map = (answersTree && answersTree[qIndex]) || {};
    var k = QuizNormalize.questionKind(q || {});
    var answered = 0, correct = 0, partial = 0, uid, ans, g, sel, pct, label;
    for (uid in map) {
      if (!Object.prototype.hasOwnProperty.call(map, uid) || !map[uid]) continue;
      ans = map[uid];
      answered += 1;
      if (k === 'short' || k === 'type') {
        if (QuizNormalize.matchesAccepted(ans.raw || '', (q && q.accepted) || []).ok) correct += 1;
      } else if (k === 'mc') {
        if (ans.hardMode && ans.raw && QuizNormalize.gradeHardModeMc) {
          g = QuizNormalize.gradeHardModeMc(ans.raw, q || {});
        } else {
          sel = ans.choices
            ? QuizNormalize.sortedUniqueNums(ans.choices)
            : QuizNormalize.indicesFromChoiceStr(ans.choiceStr);
          g = QuizNormalize.gradeMc(sel, (q && q.correct) || [], !!(q && q.multi));
        }
        if (g.exact) correct += 1;
        else if (g.partial) partial += 1;
      }
    }
    if (!answered) {
      return { answered: 0, correct: 0, partial: 0, kind: k, label: '—' };
    }
    if (k === 'open' || k === 'cloud') {
      label = answered + (answered === 1 ? ' response' : ' responses');
    } else {
      pct = Math.round((correct / answered) * 100);
      label = correct + '/' + answered + ' correct (' + pct + '%)';
      if (k === 'mc' && q && q.multi && partial > 0) {
        label += '; ' + partial + ' partial';
      }
    }
    return { answered: answered, correct: correct, partial: partial, kind: k, label: label };
  }

  function renderHostReview() {
    var list = $('reviewList');
    var panel = $('reviewPanel');
    var qs, i, q, k, html, accepted, opts, cor, j, words, g, st, disp;
    if (!list || !quiz) return;
    qs = quiz.questions || [];
    html = '';
    for (i = 0; i < qs.length; i++) {
      q = qs[i];
      k = QuizNormalize.questionKind(q);
      if (k === 'hardModeGate') continue;
      st = questionRoomStats(i, q);
      disp = QuizNormalize.displayQuestionNumber
        ? QuizNormalize.displayQuestionNumber(qs, i)
        : (i + 1);
      html += '<article class="review-item">';
      html += '<p class="rq-num">Question ' + disp + ' · ' + escapeHtml(q.section || k) +
        ' · <span class="rq-stat">' + escapeHtml(st.label) + '</span></p>';
      html += '<p class="rq-prompt">' + escapeHtml(q.prompt || '') + '</p>';
      if (k === 'short' || k === 'type') {
        accepted = q.accepted || [];
        if (accepted.length) {
          html += '<p class="rq-correct rq-primary">' + escapeHtml(accepted[0]) + '</p>';
          if (accepted.length > 1) {
            html += '<p class="rq-variants">Also accepted: ' + escapeHtml(accepted.slice(1).join(', ')) + '</p>';
          }
        } else {
          html += '<p class="hint">No accepted list.</p>';
        }
      } else if (k === 'mc') {
        opts = q.options || [];
        cor = q.correct || [];
        html += '<ul class="rq-opts">';
        for (j = 0; j < opts.length; j++) {
          html += '<li class="' + (cor.indexOf(j) !== -1 ? 'is-correct' : '') + '">' +
            escapeHtml(opts[j]) +
            (cor.indexOf(j) !== -1 ? ' ✓' : '') +
            '</li>';
        }
        html += '</ul>';
      } else if (k === 'open') {
        html += '<p class="rq-correct"><strong>Model answer</strong></p>';
        html += '<p class="rq-primary" style="font-weight:normal">' + escapeHtml(q.modelAnswer || '—') + '</p>';
      } else if (k === 'cloud') {
        if (q.modelAnswer) {
          html += '<p class="rq-correct"><strong>Notes</strong></p>';
          html += '<p>' + escapeHtml(q.modelAnswer) + '</p>';
        }
        words = topCloudWordsForQuestion(i, 80);
        if (words.length) {
          html += '<p class="rq-cloud-list" aria-label="Submitted words">' + formatCloudWordList(words) + '</p>';
        } else {
          html += '<p class="hint">No words submitted.</p>';
        }
      }
      if (q.revealNote) {
        html += '<p class="rq-note">' + escapeHtml(q.revealNote) + '</p>';
      }
      html += '</article>';
    }
    list.innerHTML = html;
    show(panel);
    try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  }

  function hideHostReview() {
    if ($('reviewPanel')) hide($('reviewPanel'));
    if (roomCode) {
      updateMeta({ review: false }).catch(function (e) {
        console.warn('Could not clear review flag', e);
      });
    }
  }

  function onReview() {
    renderHostReview();
    updateMeta({ review: true }).catch(function (e) {
      alert('Could not share review with phones: ' + (e.message || e));
    });
  }

  function renderResults() {
    var qIndex = currentMeta ? currentMeta.currentQ : 0;
    var q = questionAt(qIndex);
    var bars = $('bars');
    var cloud = $('cloud');
    var openCards = $('openCards');
    var k, groups, max, i, g, pct, row, counts, opts, revealed, html;
    $('respCount').textContent = String(countAnswers(currentAnswers));
    hide(bars); hide(openCards);
    bars.innerHTML = '';
    openCards.innerHTML = '';
    if (!q) return;
    k = QuizNormalize.questionKind(q);
    revealed = !!(currentMeta && currentMeta.revealed);
    if (k === 'hardModeGate') return;

    if (k !== 'cloud') {
      hide(cloud);
      cloud.innerHTML = '';
    }

    if (k === 'mc' && currentMeta && currentMeta.hardMode && !revealed) {
      show(bars);
      bars.innerHTML = '<p class="hint hard-hidden">Hard Mode: students are typing their answers. ' +
        'Choices stay hidden until you reveal.</p>';
    } else if (k === 'mc') {
      show(bars);
      opts = q.options || [];
      counts = QuizNormalize.tallyMc(currentAnswers || {}, opts.length);
      max = counts.reduce(function (m, x) { return Math.max(m, x); }, 1) || 1;
      if (!countAnswers(currentAnswers)) {
        bars.innerHTML = '<p class="hint">Waiting for answers…</p>';
      }
      for (i = 0; i < opts.length; i++) {
        pct = Math.round((counts[i] / max) * 100);
        row = document.createElement('div');
        row.className = 'bar-row' + (revealed && (q.correct || []).indexOf(i) !== -1 ? ' correct' : '');
        row.innerHTML =
          '<div class="name" title="' + escapeHtml(opts[i]) + '">' + escapeHtml(opts[i]) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="bar-count">' + counts[i] + '</div>';
        bars.appendChild(row);
      }
    } else if (k === 'cloud') {
      show(cloud);
      groups = QuizNormalize.groupCloudWords(currentAnswers || {});
      if (typeof SphinxWordCloud !== 'undefined' && SphinxWordCloud.render) {
        SphinxWordCloud.render(cloud, groups, {
          totalResponses: countAnswers(currentAnswers),
          height: 340,
          animate: true
        });
      } else {
        cloud.innerHTML = groups.length
          ? groups.map(function (g) { return '<span>' + escapeHtml(g.label) + '</span>'; }).join(' ')
          : '<span style="color:var(--muted)">Words will gather here…</span>';
      }
    } else if (k === 'open') {
      show(openCards);
      var entries = [];
      var key;
      for (key in (currentAnswers || {})) {
        if (Object.prototype.hasOwnProperty.call(currentAnswers, key) && currentAnswers[key]) {
          entries.push(currentAnswers[key]);
        }
      }
      entries.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      if (!entries.length) {
        openCards.innerHTML = '<p class="hint">Open answers will appear as cards…</p>';
      } else {
        html = '';
        for (i = 0; i < entries.length; i++) {
          html += '<div class="open-card">' + escapeHtml(entries[i].raw || '') + '</div>';
        }
        openCards.innerHTML = html;
      }
    } else {
      // short / legacy type — frequency bars
      show(bars);
      groups = QuizNormalize.groupAnswers(currentAnswers || {}, q.accepted || []);
      max = groups.reduce(function (m, x) { return Math.max(m, x.count); }, 1) || 1;
      if (!groups.length) {
        bars.innerHTML = '<p class="hint">Waiting for answers…</p>';
      }
      for (i = 0; i < groups.length; i++) {
        g = groups[i];
        pct = Math.round((g.count / max) * 100);
        row = document.createElement('div');
        row.className = 'bar-row' + (g.correct && revealed ? ' correct' : '');
        row.innerHTML =
          '<div class="name" title="' + escapeHtml(g.label) + '">' + escapeHtml(g.label) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="bar-count">' + g.count + '</div>';
        bars.appendChild(row);
      }
    }

    var rb = $('revealBox');
    var stLine, stCur;
    if (revealed && q) {
      show(rb);
      stCur = questionRoomStats(qIndex, q);
      stLine = '<br><span class="rq-stat">' + escapeHtml(stCur.label) + '</span>';
      if (k === 'mc') {
        var labels = (q.correct || []).map(function (ix) { return (q.options || [])[ix]; });
        rb.innerHTML = '<strong>Correct:</strong> ' + escapeHtml(labels.join(', ')) + stLine +
          (q.revealNote ? '<br><span class="hint">' + escapeHtml(q.revealNote) + '</span>' : '');
      } else if (k === 'short' || k === 'type') {
        rb.innerHTML = '<strong>Accepted:</strong> ' + escapeHtml((q.accepted || []).join(', ')) + stLine +
          (q.revealNote ? '<br><span class="hint">' + escapeHtml(q.revealNote) + '</span>' : '');
      } else if (k === 'cloud') {
        rb.innerHTML = (q.modelAnswer ? '<strong>Notes:</strong> ' + escapeHtml(q.modelAnswer) : '<strong>Word cloud</strong> — no single correct answer.') + stLine +
          (q.revealNote ? '<br><span class="hint">' + escapeHtml(q.revealNote) + '</span>' : '');
      } else {
        rb.innerHTML = '<strong>Model answer:</strong> ' + escapeHtml(q.modelAnswer || '') + stLine +
          (q.revealNote ? '<br><span class="hint">' + escapeHtml(q.revealNote) + '</span>' : '');
      }
    } else {
      hide(rb);
      rb.innerHTML = '';
    }
  }

  function renderMeta() {
    var qIndex = currentMeta ? Number(currentMeta.currentQ) || 0 : 0;
    var q = questionAt(qIndex);
    var qs = quiz ? quiz.questions : [];
    var total = QuizNormalize.countableLength ? QuizNormalize.countableLength(qs) : (qs ? qs.length : 0);
    var disp = QuizNormalize.displayQuestionNumber ? QuizNormalize.displayQuestionNumber(qs, qIndex) : (qIndex + 1);
    if (isGateQuestion(q)) {
      $('qPos').textContent = '—';
      $('phaseLabel').textContent = 'decision';
      $('sectionBadge').textContent = (q && q.section) || 'Mode';
      $('prompt').textContent = (q && q.prompt) || 'Hard Mode?';
      $('respCount').textContent = '0';
      hide($('bars')); hide($('cloud')); hide($('openCards'));
      $('bars').innerHTML = '';
      $('cloud').innerHTML = '';
      $('openCards').innerHTML = '';
      renderHardModeGate(q);
      return;
    }
    clearHardModeGateUI();
    $('qPos').textContent = total && disp != null ? (disp + '/' + total) : '—';
    $('phaseLabel').textContent = (currentMeta && currentMeta.phase) ? currentMeta.phase : '—';
    if (q) {
      $('sectionBadge').textContent = q.section || 'Question';
      $('prompt').textContent = q.prompt;
    } else {
      $('sectionBadge').textContent = '—';
      $('prompt').textContent = 'No question';
    }
    renderResults();
  }

  function listenRoom(code) {
    if (metaUnsub) metaUnsub();
    if (answersUnsub) answersUnsub();
    if (playersUnsub) playersUnsub();
    if (allAnswersUnsub) allAnswersUnsub();
    var metaRef = fb.ref('rooms/' + code + '/meta');
    metaUnsub = fb.onValue(metaRef, function (snap) {
      currentMeta = snap.val();
      if (!currentMeta) {
        $('prompt').textContent = 'Room ended or missing.';
        return;
      }
      bindAnswers(code, currentMeta.currentQ);
      renderMeta();
      if (boardVisible) {
        var qIndex = Number(currentMeta.currentQ) || 0;
        var last = quiz && currentMeta.revealed && (qIndex >= quiz.questions.length - 1);
        renderLeaderboard(!!last);
      }
    });
    playersUnsub = fb.onValue(fb.ref('rooms/' + code + '/players'), function (snap) {
      playersMap = snap.val() || {};
      if (boardVisible) renderLeaderboard(false);
    });
    allAnswersUnsub = fb.onValue(fb.ref('rooms/' + code + '/answers'), function (snap) {
      answersTree = snap.val() || {};
      if (boardVisible) {
        var qIndex = currentMeta ? Number(currentMeta.currentQ) || 0 : 0;
        var last = quiz && currentMeta && currentMeta.revealed && (qIndex >= quiz.questions.length - 1);
        renderLeaderboard(!!last);
      }
    });
  }

  function bindAnswers(code, qIndex) {
    if (answersUnsub) answersUnsub();
    var aRef = fb.ref('rooms/' + code + '/answers/' + qIndex);
    answersUnsub = fb.onValue(aRef, function (snap) {
      currentAnswers = snap.val() || {};
      answersTree[qIndex] = currentAnswers;
      renderResults();
    });
  }

  function enterLiveUI(code, token) {
    roomCode = code;
    hostToken = token;
    hide($('setup'));
    show($('live'));
    $('roomCodeDisplay').textContent = code;
    $('joinUrl').textContent = joinUrlFor(code);
    renderQr(joinUrlFor(code));
    // Keep host token in URL without forcing reload if already there
    if (location.search.indexOf('host=') === -1) {
      history.replaceState(null, '', hostUrlFor(code, token));
    }
  }

  function isGateQuestion(q) {
    return !!(q && QuizNormalize.isHardModeGate && QuizNormalize.isHardModeGate(q));
  }

  /** Presenter picks Hard Mode at the gate slide; advances to the next question. */
  function chooseHardModeGate(enableHard) {
    if (!quiz || !currentMeta) return;
    var qIndex = Number(currentMeta.currentQ) || 0;
    var q = questionAt(qIndex);
    if (!isGateQuestion(q)) return;
    var nextQ = qIndex + 1;
    var now = Date.now();
    var openedByQ = Object.assign({}, currentMeta.openedByQ || {});
    var patch = {
      hardMode: !!enableHard,
      revealed: false,
      phase: 'question'
    };
    if (nextQ < quiz.questions.length) {
      openedByQ[nextQ] = now;
      patch.currentQ = nextQ;
      patch.questionOpenedAt = now;
      patch.openedByQ = openedByQ;
    }
    updateMeta(patch).catch(function (e) {
      alert(e.message || e);
    });
  }

  function renderHardModeGate(q) {
    var box = $('hmGateBox');
    var barsWrap = $('barsWrap');
    var html;
    if (!box) return;
    html = '';
    html += '<div class="hm-gate-actions">';
    html += '<button type="button" class="btn big choice" id="hmGateChooseMc">Take it easy</button>';
    html += '<button type="button" class="btn big choice" id="hmGateChooseType">Hard Mode</button>';
    html += '</div>';
    box.innerHTML = html;
    show(box);
    if (barsWrap) hide(barsWrap);
    hide($('revealBox'));
    if ($('nextBtn')) hide($('nextBtn'));
    if ($('revealBtn')) hide($('revealBtn'));
    $('hmGateChooseMc').onclick = function () { chooseHardModeGate(false); };
    $('hmGateChooseType').onclick = function () { chooseHardModeGate(true); };
  }

  function clearHardModeGateUI() {
    var box = $('hmGateBox');
    var barsWrap = $('barsWrap');
    if (box) { hide(box); box.innerHTML = ''; }
    if (barsWrap) show(barsWrap);
    if ($('nextBtn')) show($('nextBtn'));
    if ($('revealBtn')) show($('revealBtn'));
  }

  function createRoom() {
    var quizId = $('quizSelect').value;
    $('startRoomBtn').disabled = true;
    ensureFirebase()
      .then(function () { return loadQuiz(quizId); })
      .then(function (data) {
        quiz = data;
        var code = randomCode(4);
        var token = randomToken();
        var uid = fb.auth.currentUser && fb.auth.currentUser.uid;
        if (!uid) throw new Error('Anonymous sign-in failed. Enable Anonymous auth in Firebase.');
        var opened0 = Date.now();
        var meta = {
          hostUid: uid,
          hostToken: token,
          quizId: quizId,
          title: data.title || quizId,
          currentQ: 0,
          revealed: false,
          phase: 'question',
          ended: false,
          createdAt: opened0,
          questionOpenedAt: opened0,
          openedByQ: { 0: opened0 },
          hardMode: false
        };
        return fb.set(fb.ref('rooms/' + code + '/meta'), meta).then(function () {
          saveSession(code, token, quizId);
          enterLiveUI(code, token);
          listenRoom(code);
        });
      })
      .catch(function (err) {
        $('startRoomBtn').disabled = false;
        if (err && err.code === 'SPHINX_NOT_CONFIGURED') return;
        var msg = (err && (err.code || err.message)) ? (err.code ? err.code + ' — ' : '') + (err.message || err) : String(err);
        if (String(msg).indexOf('auth/configuration-not-found') !== -1 || String(msg).indexOf('auth/operation-not-allowed') !== -1) {
          msg += '\n\nEnable Anonymous sign-in in Firebase (SETUP.md step A), then try again.';
        } else if (String(msg).indexOf('PERMISSION_DENIED') !== -1) {
          msg += '\n\nPublish quiz/database.rules.json in Realtime Database → Rules (SETUP.md step B).';
        }
        alert('Could not open room: ' + msg);
      });
  }

  function updateMeta(patch) {
    if (!fb || !roomCode || !currentMeta) return Promise.reject(new Error('No room'));
    var next = Object.assign({}, currentMeta, patch);
    // Always re-assert host fields required by rules
    next.hostUid = fb.auth.currentUser.uid;
    next.hostToken = hostToken;
    return fb.set(fb.ref('rooms/' + roomCode + '/meta'), next);
  }

  function onNext() {
    if (!quiz || !currentMeta) return;
    if (isGateQuestion(questionAt(Number(currentMeta.currentQ) || 0))) return;
    if ($('reviewPanel') && !$('reviewPanel').classList.contains('hidden')) {
      hide($('reviewPanel'));
    }
    var nextQ = Number(currentMeta.currentQ) + 1;
    if (nextQ >= quiz.questions.length) {
      boardVisible = true;
      renderLeaderboard(true);
      if ($('reviewFromPodiumBtn')) show($('reviewFromPodiumBtn'));
      alert('That was the last question. Open Review answers, then End & wipe when finished.');
      return;
    }
    var now = Date.now();
    var openedByQ = Object.assign({}, currentMeta.openedByQ || {});
    openedByQ[nextQ] = now;
    updateMeta({
      currentQ: nextQ,
      revealed: false,
      phase: 'question',
      questionOpenedAt: now,
      openedByQ: openedByQ,
      review: false
    }).catch(function (e) {
      alert(e.message || e);
    });
  }

  function onReveal() {
    if (isGateQuestion(questionAt(currentMeta ? Number(currentMeta.currentQ) || 0 : 0))) return;
    updateMeta({ revealed: true, phase: 'reveal' }).then(function () {
      var qIndex = currentMeta ? Number(currentMeta.currentQ) : 0;
      var last = quiz && (qIndex >= quiz.questions.length - 1);
      boardVisible = true;
      renderLeaderboard(!!last);
    }).catch(function (e) {
      alert(e.message || e);
    });
  }

  function onBoard() {
    boardVisible = true;
    var qIndex = currentMeta ? Number(currentMeta.currentQ) : 0;
    var last = quiz && currentMeta && currentMeta.revealed && (qIndex >= quiz.questions.length - 1);
    renderLeaderboard(!!last);
  }

  function onEnd() {
    if (!confirm('End the session and wipe the room (answers + player nicknames) from Firebase?')) return;
    var code = roomCode;
    fb.remove(fb.ref('rooms/' + code))
      .then(function () {
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        location.href = 'host.html';
      })
      .catch(function (e) {
        alert('Wipe failed: ' + (e.message || e));
      });
  }

  function resumeIfPossible() {
    var params = new URLSearchParams(location.search);
    var code = (params.get('room') || '').toUpperCase();
    var token = params.get('host') || '';
    var saved = loadSession();
    if (!code && saved) {
      code = saved.room;
      token = saved.hostToken;
    }
    if (!code || !token) return;

    ensureFirebase()
      .then(function () {
        return fb.get(fb.ref('rooms/' + code + '/meta'));
      })
      .then(function (snap) {
        var meta = snap.val();
        if (!meta) throw new Error('Room not found (already wiped?).');
        if (meta.hostToken !== token) throw new Error('Host token does not match this room.');
        var uid = fb.auth.currentUser && fb.auth.currentUser.uid;
        // If this browser got a new anonymous uid, it cannot control the room.
        if (meta.hostUid && uid && meta.hostUid !== uid) {
          throw new Error(
            'This browser is signed in as a different anonymous user than the room host. ' +
            'Open the original host link on the same browser/device that created the room, ' +
            'or create a new room.'
          );
        }
        return loadQuiz(meta.quizId).then(function (data) {
          quiz = data;
          hostToken = token;
          saveSession(code, token, meta.quizId);
          enterLiveUI(code, token);
          listenRoom(code);
        });
      })
      .catch(function (err) {
        if (err && err.code === 'SPHINX_NOT_CONFIGURED') return;
        console.warn(err);
        showConfigBanner('<strong>Could not resume host session:</strong> ' + escapeHtml(err.message || String(err)));
      });
  }

  $('startRoomBtn').addEventListener('click', createRoom);
  $('nextBtn').addEventListener('click', onNext);
  $('revealBtn').addEventListener('click', onReveal);
  if ($('boardBtn')) $('boardBtn').addEventListener('click', onBoard);
  if ($('reviewBtn')) $('reviewBtn').addEventListener('click', onReview);
  if ($('reviewFromPodiumBtn')) $('reviewFromPodiumBtn').addEventListener('click', onReview);
  if ($('closeReviewBtn')) $('closeReviewBtn').addEventListener('click', hideHostReview);
  $('endBtn').addEventListener('click', onEnd);

  if (!SphinxFirebase.isConfigured()) {
    showConfigBanner(
      '<strong>Firebase not configured yet.</strong> Paste keys from project <strong>amne151-sphinx</strong> into ' +
      '<code>quiz/firebase-config.js</code>. See <code>SETUP.md</code>. You can still use the self-quiz.'
    );
    $('startRoomBtn').disabled = true;
  } else {
    resumeIfPossible();
  }
})();
