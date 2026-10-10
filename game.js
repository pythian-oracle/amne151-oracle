/* =====================================================================
   CONFIG — the only part your TA needs to edit.
   Paste the values logged by project-approval-form.gs (or read them from
   the form's "Get pre-filled link"). See README.md.
   ===================================================================== */
var CONFIG = {
  // https://docs.google.com/forms/d/e/<FORM_ID>/formResponse
  FORM_ACTION_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSeT-DgBismRYpqYfUzsHd3p2uETj49aEoPgtGJbFdaa4B7PpA/formResponse',
  ENTRY: {
    email:        'emailAddress',     // Google's built-in email field (Responder input)
    fullName:     'entry.410167239',
    tutorial:     'entry.876568848',
    format:       'entry.1010395158',
    idea:         'entry.1443301633',
    question:     'entry.398201136'   // form item "Question for your TA" (question-only path)
  },
  TYPE_SPEED_MS: 22,
  // Background lyre music (made in the browser, no audio files). Set to false to start muted.
  MUSIC_DEFAULT_ON: true,
  MUSIC_VOLUME: 0.15
};
/* ===================================================================== */

(function () {
  'use strict';
  var QUESTIONS = [
    { key: 'email', type: 'email', required: true, label: 'Email address',
      flavour: 'Welcome, traveller. Before I give you the answer of Apollo, I must know where to send it.',
      hint: 'Your UBC student email is best.' },
    { key: 'fullName', type: 'text', required: true, label: 'Name (If group: names of all group members)',
      flavour: 'Every supplicant at Delphi gives a name. What is yours? If you come as a company, name them all.' },
    { key: 'tutorial', type: 'radio', required: true, label: 'Which tutorial are you in?',
      options: ['11 a.m.', '12 p.m.', '1 p.m.'],
      flavour: 'The god keeps careful records. At which hour do you gather with your fellows?' },
    { key: 'idea', mode: 'main', type: 'textarea', required: true, label: 'Project idea in 2–3 sentences. Include the primary source(s) that inspires it.',
      flavour: 'Now tell me what you mean to make. But hear me well: the god accepts no offering that is not rooted in the ancient sources themselves. Name the primary source that inspires you.' },
    { key: 'format', mode: 'main', type: 'text', required: true, label: 'What will your finished project look like?',
      placeholder: 'e.g. a short story, a painting, a board game, a recipe…',
      flavour: 'Last: offerings came to Delphi in many shapes, bronze tripods, painted vases, hymns sung to the god. What shape will yours take?' },
    { key: 'question', mode: 'question', type: 'textarea', required: true, label: 'What is your question?',
      flavour: 'Even the wisest seekers come with questions first. Speak it plainly, and I shall carry it to your TA.',
      hint: 'Ask anything about the Final Project. You can send your idea later.' }
  ];

  var answers = {};
  var idx = -1, typingTimer = null, fullText = '', afterTyping = null;
  var $ = function (id) { return document.getElementById(id); };
  var speech = $('speech'), content = $('content'), svg = $('pythia'), laurelsEl = $('laurels'), skipBtn = $('skipType');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html) e.innerHTML = html;
    return e;
  }
  var QUESTION_ONLY = '(Question only, no project idea yet)';
  function mode() { return answers._mode === 'question' ? 'question' : 'main'; }
  function visible() { var m = mode(); return QUESTIONS.filter(function (q) { return (!q.mode || q.mode === m) && (!q.showIf || q.showIf(answers)); }); }


  /* ---------- music: procedural plucked lyre (Web Audio, Karplus-Strong) ---------- */
  var Music = (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, master = null, bus = null, timer = null, drone = null, cache = {};
    var KEY = 'oracle-music-on';
    var on = (function () { try { var v = localStorage.getItem(KEY); return v === null ? CONFIG.MUSIC_DEFAULT_ON : v === '1'; } catch (e) { return CONFIG.MUSIC_DEFAULT_ON; } })();
    // D Dorian-ish, two octaves (D E F G A B C), with Phrygian E-flat colour occasionally
    var SCALE = [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00];
    var pos = 4;

    function impulse(sec, decay) {
      var len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = buf.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return buf;
    }
    function pluckBuffer(freq) {
      var k = Math.round(freq);
      if (cache[k]) return cache[k];
      var sr = ctx.sampleRate, len = Math.floor(sr * 3.5), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      var N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N), i;
      for (i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      var prev = 0;   // pre-soften the excitation (warmer, gut-string-like)
      for (i = 0; i < N; i++) { prev = ring[i] = 0.5 * ring[i] + 0.5 * prev; }
      for (i = 0; i < len; i++) {
        var j = i % N, nx = (j + 1) % N;
        var v = 0.4985 * (ring[j] + ring[nx]);
        d[i] = ring[j]; ring[j] = v;
      }
      return (cache[k] = buf);
    }
    function pluck(freq, when, vol, pan) {
      var src = ctx.createBufferSource(); src.buffer = pluckBuffer(freq);
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.004;   // tiny detune
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + Math.random() * 600;
      var g = ctx.createGain(); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 3.4);
      src.connect(lp); lp.connect(g);
      if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(bus); } else g.connect(bus);
      src.start(when); src.stop(when + 3.5);
    }
    function phrase() {
      if (!ctx || !on) return;
      if (document.hidden) { timer = setTimeout(phrase, 2000); return; }
      var t = ctx.currentTime + 0.05, n = 3 + Math.floor(Math.random() * 4), gap;
      for (var i = 0; i < n; i++) {
        pos = Math.min(SCALE.length - 1, Math.max(0, pos + [-2, -1, -1, 1, 1, 2, 3][Math.floor(Math.random() * 7)]));
        var f = SCALE[pos];
        if (pos === 1 && Math.random() < 0.3) f = 155.56;            // Phrygian E-flat, now and then
        pluck(f, t, 0.5 + Math.random() * 0.25, (Math.random() - 0.5) * 0.6);
        if (Math.random() < 0.2) pluck(f * 1.5, t + 0.02, 0.3, 0.3);     // open fifth
        gap = 0.45 + Math.random() * 0.6; if (Math.random() < 0.2) gap *= 2;
        t += gap;
      }
      if (Math.random() < 0.35) { pluck(146.83, t, 0.45, -0.2); pluck(220, t + 0.03, 0.35, 0.2); }  // resting D–A fifth
      timer = setTimeout(phrase, (t - ctx.currentTime + 2 + Math.random() * 4) * 1000);
    }
    function startDrone() {
      drone = ctx.createGain(); drone.gain.value = 0.05;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      [73.42, 110].forEach(function (f, i) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = i ? 3 : -3;
        o.connect(lp); o.start();
      });
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.025;
      lfo.connect(lg); lg.connect(drone.gain); lfo.start();
      lp.connect(drone); drone.connect(master);
    }
    function init() {
      if (ctx || !AC) return !!ctx;
      try {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
        bus = ctx.createGain(); bus.gain.value = 0.5;
        var dry = ctx.createGain(); dry.gain.value = 0.7; bus.connect(dry); dry.connect(master);
        var rev = ctx.createConvolver(); rev.buffer = impulse(3.2, 2.6);
        var wet = ctx.createGain(); wet.gain.value = 0.55; bus.connect(rev); rev.connect(wet); wet.connect(master);
        var dl = ctx.createDelay(1); dl.delayTime.value = 0.42; var fb = ctx.createGain(); fb.gain.value = 0.28;
        var dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 1200;
        bus.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(wet);
        startDrone();
        document.addEventListener('visibilitychange', function () {
          if (!ctx) return;
          if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
        });
        return true;
      } catch (e) { ctx = null; return false; }
    }
    function fadeTo(v) {
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(v, t + 1.5);
    }
    function apply() {
      if (!ctx) return;
      try {
        clearTimeout(timer);
        if (on) { ctx.resume(); fadeTo(CONFIG.MUSIC_VOLUME); phrase(); }
        else { fadeTo(0); setTimeout(function () { if (!on) ctx.suspend(); }, 1700); }
      } catch (e) {}
    }
    return {
      available: !!AC,
      isOn: function () { return on; },
      start: function () { if (init()) apply(); },
      toggle: function () {
        on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
        if (on) { if (init()) apply(); } else apply();
        return on;
      },
      whoosh: function () {
        if (!ctx || !on || document.hidden) return;
        try {
          var t = ctx.currentTime, n = Math.floor(ctx.sampleRate * 1.1), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
          for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35);
          var src = ctx.createBufferSource(); src.buffer = b;
          var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
          f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.35); f.frequency.exponentialRampToValueAtTime(700, t + 1.1);
          var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
          src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t); src.stop(t + 1.15);
        } catch (e) {}
      },
      chime: function () {
        if (!ctx || !on || document.hidden) return;
        try { pluck(587.33, ctx.currentTime + 0.01, 0.22, 0.1); pluck(880, ctx.currentTime + 0.09, 0.14, -0.1); } catch (e) {}
      }
    };
  })();

  var musicBtn = $('musicToggle');
  function paintMusic() {
    var o = Music.isOn();
    musicBtn.setAttribute('aria-pressed', o ? 'true' : 'false');
    musicBtn.querySelector('.music-label').textContent = o ? 'Music on' : 'Music off';
    musicBtn.querySelector('.music-icon').textContent = o ? '\u266B' : '\u266A\u0338';
  }
  if (!Music.available) musicBtn.hidden = true;
  else { paintMusic(); musicBtn.addEventListener('click', function () { Music.toggle(); paintMusic(); }); }

  /* ---------- oracle speech ---------- */
  function say(text, done) {
    clearInterval(typingTimer);
    fullText = text; afterTyping = done || null;
    Music.chime();
    if (reduced) { finishTyping(); return; }
    var i = 0; speech.textContent = ''; speech.classList.add('typing'); svg.classList.add('speaking');
    skipBtn.hidden = false;
    typingTimer = setInterval(function () {
      i += 1; speech.textContent = fullText.slice(0, i);
      if (i >= fullText.length) finishTyping();
    }, CONFIG.TYPE_SPEED_MS);
  }
  function finishTyping() {
    clearInterval(typingTimer); typingTimer = null;
    speech.textContent = fullText; speech.classList.remove('typing'); svg.classList.remove('speaking');
    skipBtn.hidden = true;
    if (afterTyping) { var f = afterTyping; afterTyping = null; f(); }
  }
  skipBtn.addEventListener('click', finishTyping);
  $('scroll').addEventListener('click', function (e) { if (typingTimer && e.target !== skipBtn) finishTyping(); });
  document.addEventListener('keydown', function (e) {
    if (typingTimer && (e.key === 'Enter' || e.key === 'Escape') && !(e.target && e.target.closest && e.target.closest('.offering'))) { e.preventDefault(); finishTyping(); }
  });

  /* ---------- progress ---------- */
  var LEAF = '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="leaf" d="M3 17 C3 8 9 3 17 3 C17 11 12 17 3 17Z"/><path d="M3 17 L13 7" stroke="#5F6B3A" stroke-width="1"/></svg>';
  function renderLaurels(current) {
    laurelsEl.innerHTML = '';
    var qs = visible();
    if (current < 0) { laurelsEl.removeAttribute('aria-label'); return; }
    laurelsEl.setAttribute('aria-label', current >= qs.length ? 'All questions answered' : 'Question ' + (current + 1) + ' of ' + qs.length);
    qs.forEach(function (q, i) {
      var li = el('li', { 'aria-hidden': 'true' }, LEAF);
      if (i < current) li.className = 'done'; else if (i === current) li.className = 'current';
      laurelsEl.appendChild(li);
    });
  }

  /* ---------- screens ---------- */
  /* ---------- save & resume (this browser only) ---------- */
  var TA_EMAIL_HTML = '<a href="mailto:tesa@student.ubc.ca?subject=AMNE151%20Project%20Proposal">tesa@student.ubc.ca</a>';
  var DRAFT_KEY = 'amne151-oracle-draft-v1', saveTimer = null;
  function saveDraft(where) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, answers: answers, at: where, t: Date.now() })); } catch (e) {}
  }
  function loadDraft() {
    try {
      var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d && d.v === 1 && d.answers && Object.keys(d.answers).some(function (k) { return k !== '_mode' && d.answers[k]; })) return d;
    } catch (e) {}
    return null;
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }

  function intro() {
    var draft = loadDraft();
    if (draft) { resumeScreen(draft); return; }
    freshIntro();
  }
  function resumeScreen(draft) {
    idx = -1; renderLaurels(-1); content.innerHTML = '';
    say('You have returned! The vapours remember your words. Shall we continue where we left off?', function () {
      var nav = el('div', { 'class': 'nav' });
      var go = el('button', { type: 'button', 'class': 'btn primary', text: 'Continue' });
      go.addEventListener('click', function () {
        answers = draft.answers; Music.start();
        if (draft.at === 'review') review();
        else show(Math.max(0, Math.min(+draft.at || 0, visible().length - 1)));
      });
      var over = el('button', { type: 'button', 'class': 'btn', text: 'Start over' });
      over.addEventListener('click', function () {
        if (window.confirm('Start over? Your saved answers will be erased.')) { clearDraft(); answers = {}; freshIntro(); }
      });
      nav.appendChild(over); nav.appendChild(go); content.appendChild(nav);
      go.focus();
    });
  }
  function freshIntro() {
    idx = -1; renderLaurels(-1); content.innerHTML = '';
    say('Greetings, student of AMNE 151. I am the Pythia, priestess of Apollo at Delphi.\nBring me your idea for the Final Project, and I shall carry it to your TA for approval. A few questions, one at a time. Your Proposal is due Friday 23 October at 10 p.m., so do not tarry.', function () {
      var b = el('button', { type: 'button', 'class': 'btn primary', text: 'Approach the oracle' });
      b.addEventListener('click', function () { answers = {}; Music.start(); show(0); });
      var q = el('button', { type: 'button', 'class': 'btn', text: 'Not ready yet, but I have a question' });
      q.addEventListener('click', function () { answers = { _mode: 'question' }; Music.start(); show(0); });
      var nav = el('div', { 'class': 'nav' }); nav.appendChild(b); nav.appendChild(q); content.appendChild(nav);
      content.appendChild(el('p', { 'class': 'guide-link' }, 'New here? <a href="info.html">Read the Project Proposal Guide first</a>. Your progress is saved if you step away.'));
      b.focus();
    });
  }

  function show(i, fromReview) {
    var qs = visible(); idx = i; var q = qs[i];
    saveDraft(i);
    renderLaurels(i); content.innerHTML = '';
    say(q.flavour, function () { renderQuestion(q, i, qs.length, fromReview); });
  }

  function renderQuestion(q, i, total, fromReview) {
    var form = el('form', { novalidate: 'novalidate' });
    var id = 'q-' + q.key, err = el('p', { 'class': 'error', id: id + '-err', role: 'alert' });
    var labelHtml = '<span class="sr-only">Question ' + (i + 1) + ' of ' + total + ': </span>' + q.label +
      (q.required ? ' <span class="req" aria-hidden="true">*</span><span class="sr-only">(required)</span>' : ' <span class="hint">(optional)</span>');
    var focusTarget;
    if (q.type === 'radio' || q.type === 'checkbox') {
      var fs = el('fieldset', { 'aria-describedby': id + '-err' });
      fs.appendChild(el('legend', { 'class': 'q-label' }, labelHtml));
      if (q.hint) fs.appendChild(el('p', { 'class': 'hint', text: q.hint }));
      var box = el('div', { 'class': 'choices' });
      q.options.forEach(function (opt, j) {
        var lab = el('label', { 'class': 'choice' });
        var inp = el('input', { type: q.type, name: id, value: opt, id: id + '-' + j });
        if (q.type === 'radio' ? answers[q.key] === opt : false) inp.checked = true;
        lab.appendChild(inp); lab.appendChild(el('span', { text: opt })); box.appendChild(lab);
        if (!focusTarget) focusTarget = inp;
      });
      fs.appendChild(box); form.appendChild(fs);
    } else {
      form.appendChild(el('label', { 'for': id, 'class': 'q-label' }, labelHtml));
      if (q.hint) form.appendChild(el('p', { 'class': 'hint', id: id + '-hint', text: q.hint }));
      var input = q.type === 'textarea' ? el('textarea', { id: id }) : el('input', { id: id, type: q.type, autocomplete: q.type === 'email' ? 'email' : (q.key === 'fullName' ? 'name' : 'off') });
      input.setAttribute('aria-describedby', (q.hint ? id + '-hint ' : '') + id + '-err');
      if (q.required) input.setAttribute('aria-required', 'true');
      if (q.placeholder) input.setAttribute('placeholder', q.placeholder);
      input.value = answers[q.key] || '';
      form.appendChild(input); focusTarget = input;
    }
    form.appendChild(err);

    var nav = el('div', { 'class': 'nav' });
    var back = el('button', { type: 'button', 'class': 'btn', text: i === 0 ? 'Back to start' : 'Back' });
    back.addEventListener('click', function () { collect(q, form); i === 0 ? intro() : show(i - 1); });
    var next = el('button', { type: 'submit', 'class': 'btn primary', text: fromReview ? 'Save and review' : (i === total - 1 ? 'Review my answers' : 'Next') });
    nav.appendChild(back); nav.appendChild(next); form.appendChild(nav);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); collect(q, form);
      var msg = validate(q);
      if (msg) { err.textContent = msg; if (focusTarget) focusTarget.setAttribute('aria-invalid', 'true'); (focusTarget || next).focus(); return; }
      var qs = visible(); var cur = qs.indexOf(q);
      if (fromReview || cur === qs.length - 1) review(); else show(cur + 1);
    });
    form.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { collect(q, form); saveDraft(fromReview ? 'review' : i); }, 400);
    });
    form.addEventListener('change', function () { collect(q, form); saveDraft(fromReview ? 'review' : i); });
    content.appendChild(form);
    if (focusTarget) focusTarget.focus();
  }

  function collect(q, form) {
    var id = 'q-' + q.key;
    if (q.type === 'radio') { var c = form.querySelector('input[name="' + id + '"]:checked'); answers[q.key] = c ? c.value : ''; }
    else { var inp = form.querySelector('#' + id); answers[q.key] = inp.value.trim(); }
  }

  function validate(q) {
    var v = answers[q.key] || '';
    if (q.required && !v) return q.type === 'radio' ? 'Please choose one option.' : 'This one is required. The oracle awaits your answer.';
    if (q.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'That does not look like an email address (e.g. name@student.ubc.ca).';
    return '';
  }

  function display(q) {
    return answers[q.key] || '—';
  }
  function asText() {
    return (mode() === 'question' ? 'AMNE 151 Final Project question' : 'AMNE 151 Final Project idea') + '\n\n' + visible().map(function (q) { return q.label + '\n' + display(q); }).join('\n\n');
  }

  function copyButton() {
    var b = el('button', { type: 'button', 'class': 'btn', text: 'Copy my answers' });
    var status = el('span', { role: 'status', 'class': 'hint' });
    b.addEventListener('click', function () {
      var t = asText();
      var ok = function () { status.textContent = ' Copied. Paste it into an email to your TA if needed.'; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, function () { fallbackCopy(t) && ok(); });
      else if (fallbackCopy(t)) ok(); else status.textContent = ' Could not copy automatically; please select the text above.';
    });
    var w = el('div'); w.appendChild(b); w.appendChild(status); return w;
  }
  function fallbackCopy(t) {
    var ta = el('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); return ok;
  }

  function review() {
    var qs = visible(); renderLaurels(qs.length); content.innerHTML = '';
    saveDraft('review');
    say('Let us look upon your words once more before I carry them to the god. Change anything you wish.', function () {
      content.appendChild(el('h2', { 'class': 'q-label', text: 'Review your answers, then transmit', tabindex: '-1' }));
      var dl = el('dl', { 'class': 'review' });
      qs.forEach(function (q, i) {
        var dt = el('dt'); dt.appendChild(el('span', { text: q.label }));
        var edit = el('button', { type: 'button', 'class': 'linkish', 'aria-label': 'Edit: ' + q.label, text: 'Edit' });
        edit.addEventListener('click', function () { show(i, true); });
        dt.appendChild(edit); dl.appendChild(dt); dl.appendChild(el('dd', { text: display(q) }));
      });
      content.appendChild(dl);
      var note = el('div', { 'class': 'notice', role: 'status' });
      var nav = el('div', { 'class': 'nav' });
      var back = el('button', { type: 'button', 'class': 'btn', text: 'Back' });
      back.addEventListener('click', function () { show(qs.length - 1); });
      var sub = el('button', { type: 'button', 'class': 'btn primary', text: 'Transmit to the oracle' });
      sub.addEventListener('click', function () { submit(sub, note); });
      nav.appendChild(back); nav.appendChild(sub);
      content.appendChild(nav); content.appendChild(copyButton()); content.appendChild(note);
      note.hidden = true;
      content.querySelector('h2').focus();
    });
  }

  function configured() {
    if (/PASTE_FORM_ID_HERE|<ID>/.test(CONFIG.FORM_ACTION_URL) || !/\/formResponse$/.test(CONFIG.FORM_ACTION_URL)) return false;
    var keys = ['fullName', 'tutorial', 'format', 'idea'];   // main path; the question entry is checked separately
    for (var i = 0; i < keys.length; i++) { if (!CONFIG.ENTRY[keys[i]] || /entry\.0000000/.test(CONFIG.ENTRY[keys[i]])) return false; }
    if (mode() === 'question' && !/^entry\.\d+$/.test(CONFIG.ENTRY.question || '')) return false;
    return true;
  }

  function submit(btn, note) {
    if (!configured()) {
      note.hidden = false;
      note.innerHTML = 'The oracle\'s messenger has not been set up yet, so this answer cannot be transmitted automatically. Use "Copy my answers" and email them to your TA at ' + TA_EMAIL_HTML + '.';
      return;
    }
    var p = new URLSearchParams(), E = CONFIG.ENTRY;
    p.append(E.email, answers.email);
    p.append(E.fullName, answers.fullName);
    p.append(E.tutorial, answers.tutorial);
    if (mode() === 'question') {
      p.append(E.format, QUESTION_ONLY);
      p.append(E.idea, QUESTION_ONLY);
      p.append(E.question, answers.question);
    } else {
      p.append(E.format, answers.format);
      p.append(E.idea, answers.idea);
    }
    btn.disabled = true; btn.textContent = 'The vapours rise…';
    fetch(CONFIG.FORM_ACTION_URL, { method: 'POST', mode: 'no-cors', body: p })
      .then(function () { clearTimeout(saveTimer); clearDraft(); ending(); })   // no-cors: an opaque reply is the best confirmation we get
      .catch(function () {
        btn.disabled = false; btn.textContent = 'Try transmitting again'; note.hidden = false;
        note.innerHTML = 'Your answers could not be transmitted (are you offline?). Try again, or use "Copy my answers" and email them to your TA at ' + TA_EMAIL_HTML + '.';
      });
  }

  function ending() {
    content.innerHTML = '';
    var name = (answers.fullName || '').split(' ')[0];
    var qOnly = mode() === 'question';
    var line = qOnly
      ? 'It is done' + (name ? ', ' + name : '') + '. Your question has been carried to your TA, who will reply by email.\nReturn to me when your idea is ripe. Remember, your Proposal is due Friday 23 October at 10 p.m.'
      : 'It is done' + (name ? ', ' + name : '') + '. Your idea has been transmitted through the vapours to your TA.\nThe god has spoken: "Seek the sources, read closely, and make something worthy of the Muses." Remember, your Proposal is due Friday 23 October at 10 p.m.';
    say(line, function () {
      content.appendChild(el('p', { 'class': 'q-label', text: qOnly ? 'Your question has been carried to your TA, who will reply by email.' : 'Your TA will reply by email.', tabindex: '-1' }));
      content.appendChild(el('p', { 'class': 'hint' }, 'Questions in the meantime? Email your TA: ' + TA_EMAIL_HTML));
      content.appendChild(el('p', { 'class': 'hint', text: 'Keep a copy of your answers for your records:' }));
      content.appendChild(copyButton());
      var again = el('button', { type: 'button', 'class': 'linkish', text: 'Start over' });
      again.addEventListener('click', function () { clearDraft(); answers = {}; freshIntro(); });
      content.appendChild(el('div', { 'class': 'nav' })).appendChild(again);
      content.querySelector('p').focus();
    });
  }

  /* ---------- offering minigame (purely decorative; never touches the form) ---------- */
  (function () {
    var svg = $('pythia'), btns = document.querySelectorAll('.offering');
    if (!svg || !btns.length) return;
    var LINES = { myrtle: 'Myrtle, sweet to the gods.', lamb: 'A fine lamb. The god is pleased.', ox: 'An ox! A hecatomb begins with one.' };
    var live = $('offerSay'), bubble = $('offerBubble'), sayT = null, NS = 'http://www.w3.org/2000/svg';
    function flameXY() {
      var r = svg.getBoundingClientRect();
      return { x: r.left + r.width * 200 / 400, y: r.top + r.height * 318 / 420, s: r.width / 400 };
    }
    function retrigger(node, cls) { if (!node) return; node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); setTimeout(function () { node.classList.remove(cls); }, 1700); }
    function smoke(count) {
      var g = svg;
      for (var i = 0; i < count; i++) {
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', 192 + Math.random() * 16); c.setAttribute('cy', reduced ? 290 - i * 14 : 305);
        c.setAttribute('r', 10 + Math.random() * 8); c.setAttribute('fill', i % 2 ? '#8C867A' : '#A8A296');
        c.setAttribute('class', 'smoke-puff');
        c.style.setProperty('--dx', (Math.random() * 50 - 25) + 'px');
        c.style.animationDelay = (i * 0.18) + 's';
        g.appendChild(c);
        (function (c) { setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, reduced ? 1200 : 4200); })(c);
      }
    }
    function speak(kind) {
      var line = LINES[kind] || '';
      live.textContent = ''; setTimeout(function () { live.textContent = line; }, 50);
      bubble.textContent = '\u201C' + line + '\u201D'; bubble.classList.add('show');
      clearTimeout(sayT); sayT = setTimeout(function () { bubble.classList.remove('show'); }, 3200);
    }
    function burn() {
      retrigger(svg.querySelector('.flame'), 'flare'); retrigger(svg.querySelector('.glow'), 'flare');
      smoke(reduced ? 3 : 7); Music.whoosh();
    }
    function offer(btn) {
      if (btn.classList.contains('gone')) return;
      var kind = btn.getAttribute('data-offer');
      var r = btn.getBoundingClientRect(), f = flameXY();
      if (document.activeElement === btn) { var nxt = Array.prototype.filter.call(btns, function (b) { return b !== btn && !b.classList.contains('gone'); })[0]; if (nxt) nxt.focus(); }
      btn.classList.add('gone');
      speak(kind);
      setTimeout(function () { btn.classList.remove('gone'); btn.classList.add('back'); setTimeout(function () { btn.classList.remove('back'); }, 700); }, reduced ? 2500 : 4000);
      if (reduced || !Element.prototype.animate) { burn(); return; }
      var fly = document.createElement('div'); fly.className = 'offer-fly'; fly.setAttribute('aria-hidden', 'true');
      fly.innerHTML = btn.querySelector('svg').outerHTML;
      fly.style.left = r.left + 'px'; fly.style.top = r.top + 'px'; fly.style.width = r.width + 'px'; fly.style.height = r.height + 'px';
      document.body.appendChild(fly);
      var dx = f.x - (r.left + r.width / 2), dy = f.y - (r.top + r.height / 2), lift = -Math.max(60, 90 * f.s * 2);
      var frames = [];
      for (var i = 0; i <= 10; i++) {
        var t = i / 10, x = dx * t, y = dy * t + lift * 4 * t * (1 - t);
        frames.push({ transform: 'translate(' + x + 'px,' + y + 'px) rotate(' + (t * 200) + 'deg) scale(' + (1 - 0.35 * t) + ')', offset: t * 0.6 });
      }
      frames.push({ transform: 'translate(' + dx + 'px,' + (dy - 6) + 'px) rotate(220deg) scale(.5)', filter: 'brightness(.35) sepia(1)', opacity: 0.8, offset: 0.8 });
      frames.push({ transform: 'translate(' + dx + 'px,' + (dy - 14) + 'px) rotate(240deg) scale(.05)', filter: 'brightness(0)', opacity: 0, offset: 1 });
      frames[0].filter = 'brightness(1) sepia(0)'; frames[0].opacity = 1;
      var anim = fly.animate(frames, { duration: 1500, easing: 'linear' });
      setTimeout(burn, 900);
      anim.onfinish = function () { if (fly.parentNode) fly.parentNode.removeChild(fly); };
    }
    Array.prototype.forEach.call(btns, function (b) { b.addEventListener('click', function (e) { e.preventDefault(); offer(b); }); });
  })();

  intro();
})();
