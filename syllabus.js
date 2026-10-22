/* Syllabus page: highlight the next lecture (by today's date in Vancouver), mark passed due dates,
   keep the contents list in sync while scrolling, and open collapsed sections when linked to. */
(function () {
  var today;
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch (e) { var d = new Date(); today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // Weeks: past ones are dimmed, the first lecture on or after today is "Up next" (today's lecture counts).
  var weeks = document.querySelectorAll('.sy-week[data-date]');
  var next = null;
  for (var i = 0; i < weeks.length; i++) {
    var w = weeks[i], dt = w.getAttribute('data-date');
    if (dt < today) {
      // Only dim a past week once everything due in it has passed too.
      var pending = false, ds = w.querySelectorAll('[data-due]');
      for (var q = 0; q < ds.length; q++) if (ds[q].getAttribute('data-due') >= today) pending = true;
      if (!pending) w.classList.add('past');
    }
    else if (!next) next = w;
  }
  if (!next) next = document.getElementById('final-exam');
  if (next) {
    next.classList.add('current');
    var badge = document.createElement('span');
    badge.className = 'sy-badge';
    badge.textContent = next.getAttribute('data-date') === today ? 'Today' : 'Up next';
    var when = next.querySelector('.sy-when');
    if (when) when.appendChild(badge);
    var jump = document.getElementById('jumpNext');
    var label = when ? when.firstChild.textContent.trim() : '';
    if (jump && next.id) { jump.href = '#' + next.id; jump.textContent = 'Jump to the next lecture' + (label ? ': ' + label : ''); }
    var note = document.getElementById('schedNote');
    if (note && next.id) note.innerHTML = 'Lectures are on Tuesdays. <a href="#' + next.id + '">Up next: ' + label + '</a>.';
  }

  // Due lines and Book Club rows whose date has passed.
  var dues = document.querySelectorAll('[data-due]');
  for (var j = 0; j < dues.length; j++) if (dues[j].getAttribute('data-due') < today) dues[j].classList.add('passed');

  // Open a collapsed section when a link points at it (or into it).
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
    var el = document.getElementById(id); if (!el) return;
    var d = el.querySelector('details') || (el.closest && el.closest('details'));
    if (d && !d.open) { d.open = true; el.scrollIntoView(); }
  }
  window.addEventListener('hashchange', openTarget); openTarget();

  // Highlight the contents entry for the section being read.
  var links = document.querySelectorAll('.sy-toc a[href^="#"]');
  if (!('IntersectionObserver' in window) || !links.length) return;
  var map = {};
  for (var k = 0; k < links.length; k++) map[links[k].getAttribute('href').slice(1)] = links[k];
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var a = map[en.target.id]; if (!a) return;
      for (var m = 0; m < links.length; m++) links[m].removeAttribute('aria-current');
      a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-10% 0px -80% 0px' });
  Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
})();
/* Print the whole syllabus, including collapsed sections. */
window.addEventListener('beforeprint', function () { var d = document.querySelectorAll('details'); for (var i = 0; i < d.length; i++) d[i].open = true; });
