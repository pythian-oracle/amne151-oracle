(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var quizId = params.get('quiz') || 'lecture-review-1';
  var quiz = null;
  var idx = 0;
  var score = 0;
  var scored = 0;
  var answered = false;
  var hardMode = false; // set only by the Hard Mode gate this run
  /** @type {Array<{kind:string, prompt:string, section:string, yourText:string, mark:string, correctHtml:string, note:string|null, skip?:boolean}>} */
  var history = [];

  var $ = function (id) { return document.getElementById(id); };
  var intro = $('intro'), quizEl = $('quiz'), doneEl = $('done');
  var loadError = $('loadError'), answer = $('answer'), answerLong = $('answerLong');
  var mcBox = $('mcBox'), cloudBox = $('cloudBox');
  var feedback = $('feedback'), checkBtn = $('checkBtn'), nextBtn = $('nextBtn');

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function current() { return quiz.questions[idx]; }
  function kind(q) { return QuizNormalize.questionKind(q); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function loadQuiz() {
    return fetch('quizzes/' + encodeURIComponent(quizId) + '.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('Could not load quiz “' + quizId + '” (' + r.status + ').');
        return r.json();
      })
      .then(function (data) {
        quiz = data;
        var nQ = QuizNormalize.countableLength
          ? QuizNormalize.countableLength(data.questions)
          : data.questions.length;
        $('quizMeta').textContent = (data.title || data.id) + ' · ' + nQ + ' questions';
        document.title = (data.title || 'Sphinx') + ' · self-quiz · AMNE 151';
      })
      .catch(function (err) {
        loadError.textContent = err.message || String(err);
        show(loadError);
        $('startBtn').disabled = true;
      });
  }

  function hideInputs() {
    hide(answer); hide(answerLong); hide(mcBox); hide(cloudBox);
    var hardBox = $('hardMcBox');
    if (hardBox) { hide(hardBox); hardBox.innerHTML = ''; }
    var gate = $('hmGateBox');
    if (gate) { hide(gate); gate.innerHTML = ''; }
    mcBox.innerHTML = '';
    cloudBox.innerHTML = '';
  }

  function renderMc(q) {
    var multi = !!q.multi;
    var opts = q.options || [];
    var i, id, lab, inp;
    mcBox.innerHTML = '';
    for (i = 0; i < opts.length; i++) {
      id = 'mc_' + i;
      lab = document.createElement('label');
      lab.className = 'mc-option';
      lab.setAttribute('for', id);
      inp = document.createElement('input');
      inp.type = multi ? 'checkbox' : 'radio';
      inp.name = 'mc';
      inp.id = id;
      inp.value = String(i);
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(' ' + opts[i]));
      mcBox.appendChild(lab);
    }
    show(mcBox);
  }

  function selectedMc() {
    var inputs = mcBox.querySelectorAll('input:checked');
    var out = [], i;
    for (i = 0; i < inputs.length; i++) out.push(Number(inputs[i].value));
    return out;
  }

  function renderHardMc(q) {
    var box = $('hardMcBox');
    var multi = !!q.multi;
    var ta, hint;
    box.innerHTML = '';
    hint = document.createElement('p');
    hint.className = 'hard-count-hint';
    hint.textContent = multi
      ? 'Name as many as you can — separate with commas or spaces.'
      : 'Type your answer (spelling variants OK).';
    box.appendChild(hint);
    ta = document.createElement('textarea');
    ta.className = 'hard-entry';
    ta.rows = multi ? 3 : 2;
    ta.autocomplete = 'off';
    ta.autocapitalize = 'words';
    ta.maxLength = 280;
    ta.placeholder = multi ? 'e.g. Hector, Priam, Hecuba' : 'Answer';
    box.appendChild(ta);
    show(box);
    ta.focus();
  }

  function hardMcEntries(q) {
    var box = $('hardMcBox');
    var ta, raw, hints;
    if (!box) return [];
    ta = box.querySelector('textarea.hard-entry, input.hard-entry');
    if (!ta) return [];
    raw = String(ta.value || '').trim();
    if (!raw) return [];
    hints = QuizNormalize.hardModePhraseHints ? QuizNormalize.hardModePhraseHints(q || {}) : [];
    return QuizNormalize.parseHardModeEntries(raw, hints);
  }

  function renderHardModeGate(q) {
    var box = $('hmGateBox');
    var html;
    if (!box) return;
    html = '';
    html += '<div class="hm-gate-actions">';
    html += '<button type="button" class="btn big choice" id="hmGateChooseMc">Take it easy</button>';
    html += '<button type="button" class="btn big choice" id="hmGateChooseType">Hard Mode</button>';
    html += '</div>';
    box.innerHTML = html;
    show(box);
    $('hmGateChooseMc').onclick = function () { chooseHardModeGate(false); };
    $('hmGateChooseType').onclick = function () { chooseHardModeGate(true); };
  }

  function chooseHardModeGate(enableHard) {
    hardMode = !!enableHard;
    answered = true;
    // Do not score or store in review
    history[idx] = null;
    idx += 1;
    if (idx >= quiz.questions.length) {
      hide(quizEl);
      show(doneEl);
      $('scoreLine').innerHTML = scored
        ? 'You got <strong>' + score + '</strong> of <strong>' + scored + '</strong> scored questions right.'
        : 'Review complete.';
      renderSelfReview();
      return;
    }
    renderQuestion();
  }

  function renderCloudInputs(q) {
    var n = Math.min(5, Math.max(1, Number(q.max) || 3));
    var i, inp;
    cloudBox.innerHTML = '';
    for (i = 0; i < n; i++) {
      inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cloud-word';
      inp.maxLength = 40;
      inp.placeholder = 'Word ' + (i + 1);
      inp.autocomplete = 'off';
      cloudBox.appendChild(inp);
    }
    show(cloudBox);
  }

  function cloudWords() {
    var inputs = cloudBox.querySelectorAll('input');
    var out = [], i, t;
    for (i = 0; i < inputs.length; i++) {
      t = String(inputs[i].value || '').trim();
      if (t) out.push(t);
    }
    return out;
  }

  function renderQuestion() {
    var q = current();
    var k = kind(q);
    var qs = quiz.questions || [];
    var total = QuizNormalize.countableLength ? QuizNormalize.countableLength(qs) : qs.length;
    var disp = QuizNormalize.displayQuestionNumber ? QuizNormalize.displayQuestionNumber(qs, idx) : (idx + 1);
    answered = false;
    hide(feedback);
    feedback.className = 'feedback hidden';
    feedback.innerHTML = '';
    hide(nextBtn);
    hideInputs();

    if (k === 'hardModeGate') {
      hide(checkBtn);
      $('progress').textContent = 'Mode decision';
      $('sectionBadge').textContent = q.section || 'Mode';
      $('prompt').textContent = q.prompt || 'Hard Mode?';
      $('typeHint').textContent = '';
      renderHardModeGate(q);
      return;
    }

    show(checkBtn);
    checkBtn.disabled = false;
    checkBtn.textContent = k === 'cloud' || k === 'open' ? 'Continue' : 'Check answer';
    $('progress').textContent = (disp != null && total)
      ? ('Question ' + disp + ' of ' + total)
      : '';
    $('sectionBadge').textContent = q.section || 'Question';
    $('prompt').textContent = q.prompt;

    if (k === 'open') {
      show(answerLong);
      answerLong.value = '';
      $('typeHint').textContent = 'Open-ended — write briefly, then compare with the model answer.';
      answerLong.focus();
    } else if (k === 'mc') {
      if (hardMode) {
        $('typeHint').textContent = q.multi
          ? 'Name as many as you can'
          : 'Type your answer';
        renderHardMc(q);
      } else {
        $('typeHint').textContent = q.multi
          ? 'Select all that apply, then check.'
          : 'Choose one option, then check.';
        renderMc(q);
      }
    } else if (k === 'cloud') {
      $('typeHint').textContent = 'Enter up to ' + (q.max || 3) + ' short words or phrases.';
      renderCloudInputs(q);
      var first = cloudBox.querySelector('input');
      if (first) first.focus();
    } else {
      show(answer);
      answer.value = '';
      $('typeHint').textContent = 'Short answer — spelling variants are OK.';
      answer.focus();
    }
  }

  function finishCheck() {
    answered = true;
    hide(checkBtn);
    show(nextBtn);
    nextBtn.textContent = idx + 1 >= quiz.questions.length ? 'See score' : 'Next';
  }

  function pushHistory(entry) {
    history[idx] = entry;
  }

  function check() {
    var q = current();
    var k = kind(q);
    var m, g, html, i, opts, sel, cor, words, yourText, mark, correctHtml, note;

    note = q.revealNote || '';

    if (k === 'mc') {
      opts = q.options || [];
      if (hardMode) {
        var entries = hardMcEntries(q);
        if (!entries.length) {
          feedback.className = 'feedback incorrect';
          feedback.innerHTML = '<span class="tag">Empty.</span> Type at least one answer.';
          show(feedback);
          return;
        }
        g = QuizNormalize.gradeHardModeMc(entries, q);
        sel = g.mapped.matched;
        yourText = entries.join(', ');
      } else {
        sel = selectedMc();
        if (!sel.length) {
          feedback.className = 'feedback incorrect';
          feedback.innerHTML = '<span class="tag">Empty.</span> Choose at least one option.';
          show(feedback);
          return;
        }
        g = QuizNormalize.gradeMc(sel, q.correct || [], !!q.multi);
        yourText = sel.map(function (ix) { return opts[ix] || String(ix); }).join(', ');
      }
      scored += 1;
      if (g.exact) score += 1;
      cor = g.correct;
      mark = g.exact ? 'correct' : (g.partial ? 'partial' : 'incorrect');
      correctHtml = '<ul class="rq-opts">';
      for (i = 0; i < opts.length; i++) {
        correctHtml += '<li class="' +
          (cor.indexOf(i) !== -1 ? 'is-correct' : '') +
          (sel.indexOf(i) !== -1 ? ' is-yours' : '') +
          '">' + escapeHtml(opts[i]) +
          (cor.indexOf(i) !== -1 ? ' ✓' : '') +
          (sel.indexOf(i) !== -1 && cor.indexOf(i) === -1 ? ' (yours)' : '') +
          '</li>';
      }
      correctHtml += '</ul>';
      if (hardMode) {
        html = '<span class="tag">' + (g.exact ? 'Correct' : (g.partial ? 'Partly right' : 'Not quite')) + '</span>' +
          '<p class="rq-you">You typed: <mark class="' + (g.exact ? 'ok' : (g.partial ? 'partial' : 'bad')) + '">' +
          escapeHtml(yourText) + '</mark></p>' + correctHtml;
      } else {
        html = '<span class="tag">' + (g.exact ? 'Correct' : (g.partial ? 'Partly right' : 'Not quite')) + '</span>' + correctHtml;
      }
      if (note) html += '<p class="hint">' + escapeHtml(note) + '</p>';
      feedback.className = 'feedback ' + (g.exact ? 'correct' : 'incorrect');
      feedback.innerHTML = html;
      show(feedback);
      Array.prototype.forEach.call(mcBox.querySelectorAll('input'), function (inp) { inp.disabled = true; });
      Array.prototype.forEach.call(($('hardMcBox') || document).querySelectorAll('input, textarea'), function (inp) { inp.disabled = true; });
      pushHistory({
        kind: k, prompt: q.prompt, section: q.section || '',
        yourText: yourText, mark: mark, correctHtml: correctHtml, note: note
      });
      finishCheck();
      return;
    }

    if (k === 'cloud') {
      words = cloudWords();
      if (!words.length) {
        feedback.className = 'feedback incorrect';
        feedback.innerHTML = '<span class="tag">Empty.</span> Add at least one word.';
        show(feedback);
        return;
      }
      yourText = words.join(' · ');
      correctHtml = q.modelAnswer
        ? '<p class="rq-primary" style="font-weight:normal">' + escapeHtml(q.modelAnswer) + '</p>'
        : '<p class="hint">No single correct answer.</p>';
      mark = 'none';
      feedback.className = 'feedback';
      feedback.innerHTML =
        '<span class="tag">Your words</span>' +
        '<p style="margin:.4rem 0 0">' + escapeHtml(yourText) + '</p>' +
        (q.modelAnswer ? '<p class="hint" style="margin:.6rem 0 0"><strong>Notes:</strong> ' + escapeHtml(q.modelAnswer) + '</p>' : '') +
        (note ? '<p class="hint">' + escapeHtml(note) + '</p>' : '');
      show(feedback);
      pushHistory({
        kind: k, prompt: q.prompt, section: q.section || '',
        yourText: yourText, mark: mark, correctHtml: correctHtml, note: note
      });
      finishCheck();
      return;
    }

    if (k === 'open') {
      var rawOpen = answerLong.value;
      if (!String(rawOpen).trim()) {
        feedback.className = 'feedback incorrect';
        feedback.innerHTML = '<span class="tag">Empty.</span> The Sphinx waits for a word.';
        show(feedback);
        return;
      }
      yourText = String(rawOpen).trim();
      correctHtml = '<p class="rq-primary" style="font-weight:normal">' + escapeHtml(q.modelAnswer || '—') + '</p>';
      mark = 'none';
      feedback.className = 'feedback';
      feedback.innerHTML =
        '<span class="tag">Model answer</span>' +
        '<p style="margin:.4rem 0 0">' + escapeHtml(q.modelAnswer || '') + '</p>' +
        (note ? '<p class="hint" style="margin:.5rem 0 0">' + escapeHtml(note) + '</p>' : '');
      show(feedback);
      pushHistory({
        kind: k, prompt: q.prompt, section: q.section || '',
        yourText: yourText, mark: mark, correctHtml: correctHtml, note: note
      });
      finishCheck();
      return;
    }

    // short (and legacy type)
    var raw = answer.value;
    if (!String(raw).trim()) {
      feedback.className = 'feedback incorrect';
      feedback.innerHTML = '<span class="tag">Empty.</span> The Sphinx waits for a word.';
      show(feedback);
      return;
    }
    m = QuizNormalize.matchesAccepted(raw, q.accepted || []);
    scored += 1;
    if (m.ok) score += 1;
    yourText = String(raw).trim();
    mark = m.ok ? 'correct' : 'incorrect';
    var accepted = q.accepted || [];
    correctHtml = accepted.length
      ? ('<p class="rq-primary">' + escapeHtml(accepted[0]) + '</p>' +
        (accepted.length > 1
          ? '<p class="rq-variants">Also accepted: ' + escapeHtml(accepted.slice(1).join(', ')) + '</p>'
          : ''))
      : '<p class="hint">—</p>';
    feedback.className = 'feedback ' + (m.ok ? 'correct' : 'incorrect');
    if (m.ok) {
      feedback.innerHTML =
        '<span class="tag">Correct</span>' +
        '<p style="margin:.4rem 0 0">Accepted as <strong>' + escapeHtml(m.matched) + '</strong>.</p>';
    } else {
      feedback.innerHTML =
        '<span class="tag">Not quite</span>' +
        '<p style="margin:.4rem 0 0">Accepted answers include: <strong>' +
        escapeHtml((q.accepted || []).join(', ')) + '</strong>.</p>' +
        (note ? '<p class="hint" style="margin:.5rem 0 0">' + escapeHtml(note) + '</p>' : '');
    }
    show(feedback);
    pushHistory({
      kind: k, prompt: q.prompt, section: q.section || '',
      yourText: yourText, mark: mark, correctHtml: correctHtml, note: note
    });
    finishCheck();
  }

  function markLabel(mark) {
    if (mark === 'correct') return '<mark class="ok">Correct</mark>';
    if (mark === 'partial') return '<mark class="partial">Partial</mark>';
    if (mark === 'incorrect') return '<mark class="bad">Incorrect</mark>';
    return '<mark class="neutral">No mark</mark>';
  }

  function renderSelfReview() {
    var list = $('selfReviewList');
    var i, h, html, num;
    if (!list) return;
    html = '';
    num = 0;
    for (i = 0; i < history.length; i++) {
      h = history[i];
      if (!h || h.kind === 'hardModeGate') continue;
      num += 1;
      html += '<article class="review-item">';
      html += '<p class="rq-num">Question ' + num +
        (h.section ? ' · ' + escapeHtml(h.section) : '') +
        ' · ' + markLabel(h.mark) + '</p>';
      html += '<p class="rq-prompt">' + escapeHtml(h.prompt) + '</p>';
      html += '<p class="rq-you"><strong>Your answer:</strong> ' + escapeHtml(h.yourText || '—') + '</p>';
      html += '<div class="rq-correct"><strong>Correct / model:</strong> ' + (h.correctHtml || '—') + '</div>';
      if (h.note) html += '<p class="rq-note">' + escapeHtml(h.note) + '</p>';
      html += '</article>';
    }
    list.innerHTML = html || '<p class="hint">No answers recorded.</p>';
  }

  function next() {
    if (!answered) return;
    idx += 1;
    if (idx >= quiz.questions.length) {
      hide(quizEl);
      show(doneEl);
      var nQ = QuizNormalize.countableLength
        ? QuizNormalize.countableLength(quiz.questions)
        : quiz.questions.length;
      $('scoreLine').innerHTML = scored
        ? 'You got <strong>' + score + '</strong> of <strong>' + scored + '</strong> scored questions right.'
        : 'Review complete (' + nQ + ' questions).';
      renderSelfReview();
      return;
    }
    renderQuestion();
  }

  function start() {
    hardMode = false;
    try { localStorage.removeItem('sphinx-hard-mode'); } catch (e) {}
    idx = 0; score = 0; scored = 0; history = [];
    hide(intro); hide(doneEl); show(quizEl);
    if ($('selfReviewList')) $('selfReviewList').innerHTML = '';
    renderQuestion();
  }

  $('startBtn').addEventListener('click', start);
  $('checkBtn').addEventListener('click', check);
  $('nextBtn').addEventListener('click', next);
  $('retryBtn').addEventListener('click', function () { hide(doneEl); show(intro); });
  answer.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!answered) check(); else next();
    }
  });

  loadQuiz();
})();
