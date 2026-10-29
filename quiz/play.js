(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fb = null;
  var quiz = null;
  var roomCode = null;
  var myUid = null;
  var myNick = null;
  var metaUnsub = null;
  var playersUnsub = null;
  var answersUnsub = null;
  var currentMeta = null;
  var hardMode = false;
  var playersMap = {};
  var answersTree = {};
  var lastSubmittedQ = null;
  var renderedQ = null;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function kind(q) { return QuizNormalize.questionKind(q); }

  function showConfigBanner(msg) {
    var b = $('configBanner');
    b.innerHTML = msg;
    show(b);
  }

  function loadQuiz(id) {
    return fetch('quizzes/' + encodeURIComponent(id) + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Quiz file missing: ' + id);
        return r.json();
      });
  }

  function ensureFirebase() {
    if (!SphinxFirebase.isConfigured()) {
      showConfigBanner('<strong>Live quiz is not configured yet.</strong> Try the <a href="self.html">self-quiz</a>.');
      $('joinBtn').disabled = true;
      return Promise.reject(new Error('not configured'));
    }
    return SphinxFirebase.init().then(function (api) {
      fb = api;
      return fb.signInAnonymously();
    }).then(function () {
      myUid = fb.auth.currentUser && fb.auth.currentUser.uid;
    });
  }

  function questionAt(i) {
    if (!quiz || !quiz.questions) return null;
    if (i < 0 || i >= quiz.questions.length) return null;
    return quiz.questions[i];
  }

  function setStatus(kindName, text) {
    var s = $('status');
    s.className = 'notice ' + (kindName || '');
    s.textContent = text;
    show(s);
  }

  function hideInputs() {
    hide($('answer')); hide($('answerLong')); hide($('mcBox')); if ($('hardMcBox')) { hide($('hardMcBox')); $('hardMcBox').innerHTML = ''; } hide($('cloudBox'));
    $('mcBox').innerHTML = '';
    $('cloudBox').innerHTML = '';
  }

  function refreshMyScore() {
    if (!quiz) return;
    var openedMap = {};
    // Use questionOpenedAt only for current question; earlier Qs get no speed (or 0 bonus) unless stored per-q.
    // Host sets questionOpenedAt each time a question opens; for past questions we score correctness only (speed 0)
    // by passing openedAt = answer.at (no bonus) when unknown — better: pass null → speed 0.
    var board = QuizNormalize.computeLeaderboard(quiz, playersMap, answersTree, {
      currentQ: currentMeta ? currentMeta.currentQ : -1,
      openedAt: currentMeta ? currentMeta.questionOpenedAt : null
    });
    // Fix: computeLeaderboard only applies openedAt to currentQ — good enough for speed on current;
    // for past questions speedFactor(null) = 0 so only base points. To be fairer, score past with
    // openedAt = ans.at - something... Actually for past Qs we want full speed credit based on
    // when they answered relative to when Q was open. Without per-question openedAt history,
    // award full speed bonus for correct past answers (openedAt = ans.at).
    board = computeBoardFair();
    var me = null, i;
    for (i = 0; i < board.length; i++) {
      if (board[i].uid === myUid) { me = board[i]; break; }
    }
    var text = me
      ? ('Score ' + me.score + ' · rank ' + me.rank + '/' + board.length)
      : 'Score 0';
    ['myScore', 'waitScore', 'endScore'].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = text + (myNick ? ' · ' + myNick : '');
    });
  }

  function openedAtForQuestion(qIndex) {
    var map;
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
    var uid, qIndex, q, ansMap, ans, qs, opened;
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
    var rows = [], seen = Object.create(null), i, n;
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

  function renderMc(q) {
    var multi = !!q.multi;
    var opts = q.options || [];
    var box = $('mcBox');
    var i, btn;
    box.innerHTML = '';
    for (i = 0; i < opts.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tap-option';
      btn.dataset.index = String(i);
      btn.textContent = opts[i];
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function (ev) {
        var el = ev.currentTarget;
        var on = el.getAttribute('aria-pressed') === 'true';
        if (!multi) {
          Array.prototype.forEach.call(box.querySelectorAll('.tap-option'), function (b) {
            b.setAttribute('aria-pressed', 'false');
            b.classList.remove('selected');
          });
          el.setAttribute('aria-pressed', 'true');
          el.classList.add('selected');
        } else {
          el.setAttribute('aria-pressed', on ? 'false' : 'true');
          el.classList.toggle('selected', !on);
        }
      });
      box.appendChild(btn);
    }
    show(box);
  }

  function selectedMc() {
    var btns = $('mcBox').querySelectorAll('.tap-option[aria-pressed="true"]');
    var out = [], i;
    for (i = 0; i < btns.length; i++) out.push(Number(btns[i].dataset.index));
    return out;
  }

  function hardNeedCount(q) {
    if (q.multi) return (q.correct || []).length || 1;
    return 1;
  }

  function renderHardMc(q) {
    var box = $('hardMcBox');
    var need = hardNeedCount(q);
    var multi = !!q.multi;
    var wrap, row, inp, addBtn, hint, i;
    box.innerHTML = '';
    hint = document.createElement('p');
    hint.className = 'hard-count-hint';
    hint.textContent = multi
      ? ('Name all ' + need + ' — separate with commas or add another box.')
      : 'Type the answer (spelling variants OK).';
    box.appendChild(hint);
    wrap = document.createElement('div');
    wrap.className = 'hard-entries';
    box.appendChild(wrap);
    function addRow(val) {
      inp = document.createElement('input');
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.autocapitalize = 'words';
      inp.maxLength = 60;
      inp.placeholder = multi ? 'Name' : 'Answer';
      if (val) inp.value = val;
      wrap.appendChild(inp);
      return inp;
    }
    addRow('');
    if (multi) {
      addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn hard-add';
      addBtn.textContent = 'Add another';
      addBtn.addEventListener('click', function () {
        var n = addRow('');
        n.focus();
      });
      box.appendChild(addBtn);
    }
    show(box);
    var first = wrap.querySelector('input');
    if (first) first.focus();
  }

  function hardMcEntries() {
    var box = $('hardMcBox');
    if (!box) return [];
    var inputs = box.querySelectorAll('.hard-entries input');
    var parts = [], i, t;
    if (inputs.length) {
      for (i = 0; i < inputs.length; i++) {
        t = String(inputs[i].value || '').trim();
        if (t) parts.push(t);
      }
    }
    // Also split commas inside each field
    var flat = [];
    for (i = 0; i < parts.length; i++) {
      QuizNormalize.parseHardModeEntries(parts[i]).forEach(function (x) { flat.push(x); });
    }
    return flat;
  }

  function renderCloud(q) {
    var n = Math.min(5, Math.max(1, Number(q.max) || 3));
    var box = $('cloudBox'), i, inp;
    box.innerHTML = '';
    for (i = 0; i < n; i++) {
      inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 40;
      inp.placeholder = 'Word ' + (i + 1);
      inp.autocomplete = 'off';
      box.appendChild(inp);
    }
    show(box);
  }

  function cloudWords() {
    var inputs = $('cloudBox').querySelectorAll('input');
    var out = [], i, t;
    for (i = 0; i < inputs.length; i++) {
      t = String(inputs[i].value || '').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function showAnswerUI(q, qIndex) {
    var k = kind(q);
    hide($('joinPanel'));
    hide($('waitPanel'));
    hide($('endedPanel'));
    show($('answerPanel'));
    $('progress').textContent = 'Question ' + (qIndex + 1) + ' of ' + quiz.questions.length;
    $('sectionBadge').textContent = q.section || 'Question';
    $('prompt').textContent = q.prompt;

    if (renderedQ !== qIndex) {
      hideInputs();
      hide($('status'));
      $('submitBtn').disabled = false;
      $('submitBtn').textContent = 'Send answer';
      if (k === 'open') {
        $('typeHint').textContent = 'Write a short answer.';
        show($('answerLong'));
        $('answerLong').value = '';
        $('answerLong').focus();
      } else if (k === 'mc') {
        if (hardMode) {
          $('typeHint').textContent = q.multi
            ? ('Hard Mode · name all ' + hardNeedCount(q) + '.')
            : 'Hard Mode · type the answer.';
          renderHardMc(q);
        } else {
          $('typeHint').textContent = q.multi ? 'Tap all that apply.' : 'Tap one option.';
          renderMc(q);
        }
      } else if (k === 'cloud') {
        $('typeHint').textContent = 'Up to ' + (q.max || 3) + ' short words.';
        renderCloud(q);
      } else {
        $('typeHint').textContent = 'Type a short answer.';
        show($('answer'));
        $('answer').value = '';
        $('answer').focus();
      }
      renderedQ = qIndex;
    }
    if (lastSubmittedQ === qIndex) {
      $('submitBtn').disabled = true;
      setStatus('ok', 'Answer sent. Watch the screen.');
    }
    refreshMyScore();
  }

  function showWaiting(msg) {
    hide($('joinPanel'));
    hide($('answerPanel'));
    hide($('endedPanel'));
    show($('waitPanel'));
    $('waitText').textContent = msg || 'Waiting for the Sphinx to pose a question…';
    $('waitRoom').textContent = roomCode || '';
    $('waitNick').textContent = myNick || '';
    refreshMyScore();
  }

  function onMeta(meta) {
    var prevHard = hardMode;
    currentMeta = meta;
    hardMode = !!(meta && meta.hardMode);
    if (!meta || meta.ended) {
      hide($('joinPanel'));
      hide($('waitPanel'));
      hide($('answerPanel'));
      show($('endedPanel'));
      refreshMyScore();
      return;
    }
    var qIndex = Number(meta.currentQ) || 0;
    var q = questionAt(qIndex);
    if (!q) {
      showWaiting('Waiting…');
      return;
    }
    if (prevHard !== hardMode) renderedQ = -1;
    showAnswerUI(q, qIndex);
  }

  function listen(code) {
    if (metaUnsub) metaUnsub();
    if (playersUnsub) playersUnsub();
    if (answersUnsub) answersUnsub();
    metaUnsub = fb.onValue(fb.ref('rooms/' + code + '/meta'), function (snap) {
      var meta = snap.val();
      if (!meta) {
        hide($('joinPanel')); hide($('waitPanel')); hide($('answerPanel'));
        show($('endedPanel'));
        return;
      }
      if (!quiz || quiz.id !== meta.quizId) {
        loadQuiz(meta.quizId).then(function (data) {
          quiz = data;
          onMeta(meta);
        }).catch(function (e) { setStatus('warn', e.message || String(e)); });
      } else {
        onMeta(meta);
      }
    });
    playersUnsub = fb.onValue(fb.ref('rooms/' + code + '/players'), function (snap) {
      playersMap = snap.val() || {};
      refreshMyScore();
    });
    answersUnsub = fb.onValue(fb.ref('rooms/' + code + '/answers'), function (snap) {
      answersTree = snap.val() || {};
      refreshMyScore();
    });
  }

  function join() {
    var code = String($('roomInput').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    var nickRaw = $('nickInput').value;
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      alert('Enter the 4-character room code');
      return;
    }
    roomCode = code;
    $('joinBtn').disabled = true;
    ensureFirebase()
      .then(function () { return fb.get(fb.ref('rooms/' + code + '/meta')); })
      .then(function (snap) {
        if (!snap.val()) throw new Error('No room with that code. Check the projector.');
        return fb.get(fb.ref('rooms/' + code + '/players'));
      })
      .then(function (snap) {
        var existing = snap.val() || {};
        myNick = QuizNormalize.uniquifyNick(nickRaw, existing, myUid);
        return fb.set(fb.ref('rooms/' + code + '/players/' + myUid), {
          nick: myNick,
          joinedAt: Date.now()
        });
      })
      .then(function () {
        try { localStorage.setItem('sphinx-quiz-nick', myNick); } catch (e) {}
        history.replaceState(null, '', 'play.html?room=' + encodeURIComponent(code));
        showWaiting('Connected. Loading…');
        listen(code);
      })
      .catch(function (err) {
        $('joinBtn').disabled = false;
        if (err && err.message === 'not configured') return;
        var msg = err.message || String(err);
        if (/PERMISSION_DENIED|permission/i.test(msg)) {
          msg += '\n\nThe TA may still need to publish the latest database.rules.json (players path).';
        }
        alert(msg);
      });
  }

  function buildPayload(q) {
    var k = kind(q);
    var raw, norm, sel, words, i, wnorm, wordsObj, labels, choiceStr;
    if (k === 'mc') {
      if (hardMode) {
        var entries = hardMcEntries();
        if (!entries.length) return { error: 'Type at least one answer.' };
        var mapped = QuizNormalize.mapHardModeAnswer(entries, q);
        if (!mapped.matched.length && mapped.unmatched.length) {
          // Still submit phantoms so host can score 0
        }
        raw = mapped.raw || entries.join(', ');
        norm = QuizNormalize.normalizeAnswer(raw) || mapped.choiceStr || 'x';
        if (!mapped.choiceStr) {
          mapped.choiceStr = String((q.options || []).length);
        }
        return {
          kind: 'mc',
          choiceStr: mapped.choiceStr,
          raw: String(raw).slice(0, 280),
          norm: String(norm).slice(0, 280),
          hardMode: true,
          at: Date.now()
        };
      }
      sel = selectedMc();
      if (!sel.length) return { error: 'Tap at least one option.' };
      choiceStr = QuizNormalize.choiceStrFromIndices(sel);
      labels = sel.map(function (ix) { return (q.options || [])[ix] || String(ix); });
      raw = labels.join(', ');
      norm = QuizNormalize.normalizeAnswer(raw) || choiceStr;
      return { kind: 'mc', choiceStr: choiceStr, raw: raw.slice(0, 280), norm: String(norm).slice(0, 280), at: Date.now() };
    }
    if (k === 'cloud') {
      words = cloudWords();
      if (!words.length) return { error: 'Enter at least one word.' };
      if (words.length > (q.max || 3)) return { error: 'Too many words.' };
      wordsObj = {};
      for (i = 0; i < words.length; i++) {
        if (words[i].length > 40) return { error: 'Keep each word under 40 characters.' };
        wnorm = QuizNormalize.normalizeAnswer(words[i]);
        if (!wnorm) continue;
        wordsObj[i] = { raw: words[i], norm: wnorm };
      }
      if (!Object.keys(wordsObj).length) return { error: 'Words were empty after cleaning.' };
      raw = words.join(', ');
      norm = words.map(function (w) { return QuizNormalize.normalizeAnswer(w); }).filter(Boolean).join(' ');
      return { kind: 'cloud', words: wordsObj, raw: raw.slice(0, 280), norm: String(norm).slice(0, 280), at: Date.now() };
    }
    raw = (k === 'open' ? $('answerLong').value : $('answer').value);
    raw = String(raw || '').trim();
    if (!raw) return { error: 'Type an answer first.' };
    if (raw.length > 280) return { error: 'Keep it under 280 characters.' };
    norm = QuizNormalize.normalizeAnswer(raw);
    if (!norm) return { error: 'That answer is empty after cleaning.' };
    return { kind: k === 'open' ? 'open' : 'short', raw: raw, norm: norm, at: Date.now() };
  }

  function submit() {
    if (!fb || !roomCode || !currentMeta) return;
    var qIndex = Number(currentMeta.currentQ) || 0;
    var q = questionAt(qIndex);
    if (!q) return;
    var payload = buildPayload(q);
    if (payload.error) { setStatus('warn', payload.error); return; }
    if (!myUid) { setStatus('warn', 'Not signed in anonymously yet — try again.'); return; }
    $('submitBtn').disabled = true;
    fb.set(fb.ref('rooms/' + roomCode + '/answers/' + qIndex + '/' + myUid), payload)
      .then(function () {
        lastSubmittedQ = qIndex;
        setStatus('ok', 'Answer sent. Watch the screen.');
        $('submitBtn').textContent = 'Sent';
        refreshMyScore();
      })
      .catch(function (e) {
        $('submitBtn').disabled = false;
        setStatus('warn', e.message || String(e));
      });
  }

  $('joinBtn').addEventListener('click', join);
  $('roomInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); join(); }
  });
  $('nickInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('roomInput').focus(); }
  });
  $('submitBtn').addEventListener('click', submit);
  $('answer').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  try {
    var savedNick = localStorage.getItem('sphinx-quiz-nick');
    if (savedNick && $('nickInput') && !$('nickInput').value) {
      $('nickInput').value = savedNick;
    }
  } catch (e) {}

  var params = new URLSearchParams(location.search);
  var pre = params.get('room');
  if (pre) $('roomInput').value = pre.toUpperCase();

  if (!SphinxFirebase.isConfigured()) {
    showConfigBanner('<strong>Live quiz is not configured yet.</strong> Use the <a href="self.html">self-quiz</a>.');
    $('joinBtn').disabled = true;
  }
})();
