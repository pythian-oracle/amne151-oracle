/* Deadline countdowns (computed from UTC instants, so correct in any timezone). */
(function () {
  var D = [
    { id: 'cdIdea', label: 'Idea', at: Date.UTC(2026, 9, 21, 5, 0) },       // Tue 20 Oct 2026, 10 p.m. PT
    { id: 'cdProposal', label: 'Proposal', at: Date.UTC(2026, 9, 24, 5, 0) } // Fri 23 Oct 2026, 10 p.m. PT
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
