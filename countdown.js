/* Deadline countdowns (computed from UTC instants, so correct in any timezone). */
(function () {
  var D = [
    // Fri 20 Nov 2026, 10 p.m. America/Vancouver (PST UTC-8 after DST ends 1 Nov) = 06:00 UTC 21 Nov
    { id: 'cdFinalProject', label: 'Final Project (the creative work)', at: Date.UTC(2026, 10, 21, 6, 0) }
  ];
  function pl(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function fmt(ms) {
    var m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d >= 1) return pl(d, 'day') + ', ' + pl(h, 'hour');
    return pl(h, 'hour') + ', ' + pl(mi, 'minute');
  }
  function tick() {
    var now = Date.now();
    D.forEach(function (x) {
      var e = document.getElementById(x.id); if (!e) return;
      var left = x.at - now;
      e.textContent = left > 0 ? x.label + ' due in ' + fmt(left) : x.label + ' deadline has passed';
      e.classList.toggle('passed', left <= 0);
    });
  }
  tick(); setInterval(tick, 60000);
})();

/* "Reading for this week": point to the next lecture on or after today (Vancouver date), same rule as the syllabus "Up next" badge. */
(function () {
  var a = document.getElementById('cdReading'); if (!a) return;
  var W = [['lecture-1','2026-09-08'],['lecture-2','2026-09-15'],['lecture-3','2026-09-22'],['lecture-4','2026-09-29'],
    ['lecture-5','2026-10-06'],['lecture-6','2026-10-13'],['lecture-7','2026-10-20'],['lecture-8','2026-10-27'],
    ['lecture-9','2026-11-03'],['reading-week','2026-11-10'],['lecture-10','2026-11-17'],['lecture-11','2026-11-24'],['lecture-12','2026-12-01']];
  var today;
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { var d = new Date(); today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  var pick = W[W.length - 1];
  for (var i = 0; i < W.length; i++) { if (W[i][1] >= today) { pick = W[i]; break; } }
  a.href = 'syllabus.html#' + pick[0];
})();
