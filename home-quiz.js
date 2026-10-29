/* Home-page quiz entry: live room join + validation. */
(function () {
  'use strict';
  var form = document.getElementById('liveJoinForm');
  var input = document.getElementById('roomCode');
  var err = document.getElementById('roomCodeError');
  if (!form || !input) return;

  function normalize(v) {
    return String(v || '').replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function validate(code) {
    return /^[A-Z0-9]{4}$/.test(code);
  }
  function showError(msg) {
    if (!err) return;
    err.textContent = msg || '';
    err.hidden = !msg;
  }

  input.addEventListener('input', function () {
    var start = input.selectionStart, end = input.selectionEnd;
    var before = input.value;
    var next = normalize(before).slice(0, 4);
    if (next !== before) {
      input.value = next;
      try { input.setSelectionRange(Math.min(start, next.length), Math.min(end, next.length)); } catch (e) {}
    }
    if (err && !err.hidden && validate(next)) showError('');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = normalize(input.value);
    input.value = code;
    if (!validate(code)) {
      showError('Enter the 4-character room code');
      input.focus();
      return;
    }
    showError('');
    window.location.href = 'quiz/play.html?room=' + encodeURIComponent(code);
  });
})();
