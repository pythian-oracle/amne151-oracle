(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var quizId = params.get('quiz') || 'lecture-review-1';
  var quiz = null;
  var idx = 0;
  var score = 0;
  var scored = 0;
  var answered = false;
  /** @type {Array<{kind:string, prompt:string, section:string, yourText:string, mark:string, correctHtml:string, note:string}>} */
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
        $('quizMeta').textContent = (data.title || data.id) + ' · ' + data.questions.length + ' questions';
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
    answered = false;
    hide(feedback);
    feedback.className = 'feedback hidden';
    feedback.innerHTML = '';
    show(checkBtn);
    hide(nextBtn);
    checkBtn.disabled = false;
    checkBtn.textContent = k === 'cloud' || k === 'open' ? 'Continue' : 'Check answer';
    $('progress').textContent = 'Question ' + (idx + 1) + ' of ' + quiz.questions.length;
    $('sectionBadge').textContent = q.section || 'Question';
    $('prompt').textContent = q.prompt;
    hideInputs();

    if (k === 'open') {
      show(answerLong);
      answerLong.value = '';
      $('typeHint').textContent = 'Open-ended — write briefly, then compare with the model answer.';
      answerLong.focus();
    } else if (k === 'mc') {
      $('typeHint').textContent = q.multi
        ? 'Select all that apply, then check.'
        : 'Choose one option, then check.';
      renderMc(q);
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
      sel = selectedMc();
      if (!sel.length) {
        feedback.className = 'feedback incorrect';
        feedback.innerHTML = '<span class="tag">Empty.</span> Choose at least one option.';
        show(feedback);
        return;
      }
      g = QuizNormalize.gradeMc(sel, q.correct || [], !!q.multi);
      scored += 1;
      if (g.exact) score += 1;
      opts = q.options || [];
      cor = g.correct;
      yourText = sel.map(function (ix) { return opts[ix] || String(ix); }).join(', ');
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
      html = '<span class="tag">' + (g.exact ? 'Correct' : (g.partial ? 'Partly right' : 'Not quite')) + '</span>' + correctHtml;
      if (note) html += '<p class="hint">' + escapeHtml(note) + '</p>';
      feedback.className = 'feedback ' + (g.exact ? 'correct' : 'incorrect');
      feedback.innerHTML = html;
      show(feedback);
      Array.prototype.forEach.call(mcBox.querySelectorAll('input'), function (inp) { inp.disabled = true; });
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
    var i, h, html;
    if (!list) return;
    html = '';
    for (i = 0; i < history.length; i++) {
      h = history[i];
      if (!h) continue;
      html += '<article class="review-item">';
      html += '<p class="rq-num">Question ' + (i + 1) +
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
      $('scoreLine').innerHTML = scored
        ? 'You got <strong>' + score + '</strong> of <strong>' + scored + '</strong> scored questions right.'
        : 'Review complete (' + quiz.questions.length + ' questions).';
      renderSelfReview();
      return;
    }
    renderQuestion();
  }

  function start() {
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
