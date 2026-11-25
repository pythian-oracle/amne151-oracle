/* Offerings minigame: myrtle, lamb, ox (extracted from game.js so the home page
   can keep the ritual without loading the closed idea-submission flow).
   Relies on window.Music.cue from music.js for the per-offering ritual cue. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- offering minigame (purely decorative; never touches the form) ---------- */
  (function () {
    var svg = $('pythia'), btns = document.querySelectorAll('.offering');
    if (!svg || !btns.length) return;
    // Verbatim quotes from public-domain translations of syllabus works (Butler 1898/1900; Evelyn-White 1914, Project Gutenberg).
    // Full Chicago (17th ed.) first-note citations.
    var EW = ', in <em>Hesiod, the Homeric Hymns, and Homerica</em>, trans. Hugh G. Evelyn-White (London: William Heinemann, 1914), ';
    var GB348 = '.';
    function il(bk) { return 'Homer, <em>The Iliad</em>, trans. Samuel Butler (London: Longmans, Green, 1898), ' + bk + '.'; }
    function od(bk) { return 'Homer, <em>The Odyssey</em>, trans. Samuel Butler (London: Longmans, Green, 1900), ' + bk + '.'; }
    function hy(god, ll) { return '<em>Homeric Hymn to ' + god + '</em>' + EW + ll + GB348; }
    var LINES = {
      myrtle: [
        { q: '…sacrifice to the deathless gods purely and cleanly, and burn rich meats also, and at other times propitiate them with libations and incense', c: 'Hesiod, <em>Works and Days</em>' + EW + '336\u201338' + GB348 },
        { q: '…let all the people build me a great temple and an altar below it', c: hy('Demeter', '270\u201371') },
        { q: '…pour an offering to the blessed gods who dwell on Olympus.', c: hy('Pythian Apollo', '498') },
        { q: 'If I have ever decked your temple with garlands, or burned your thigh-bones in fat of bulls or goats, grant my prayer', c: il('1.39\u201341') }
      ],
      lamb: [
        { q: '…whether he will accept the savour of lambs and goats without blemish', c: il('1.66\u201367') },
        { q: '…hymning him and chaunting the joyous paean, and the god took pleasure in their voices', c: il('1.473\u201374') },
        { q: '…I sacrificed it on the sea shore, and burned its thigh bones to Jove, who is the lord of all.', c: od('9.551\u201353') },
        { q: '…Teiresias should have a black sheep to himself, the best in all my flocks.', c: od('11.32\u201333') },
        { q: 'Thus did he pray, and Apollo heard his prayer.', c: il('1.43') }
      ],
      ox: [
        { q: '…the smoke with the savour of their sacrifice rose curling up towards heaven.', c: il('1.317') },
        { q: '…hither they will always bring perfect hecatombs', c: hy('Pythian Apollo', '248\u201349') },
        { q: '…divided them into twelve portions distributed by lot, making each portion wholly honourable.', c: hy('Hermes', '128\u201329') },
        { q: '…so shall mortals ever sacrifice perfect hecatombs to you at your feasts each three years.', c: hy('Dionysus', '11\u201312') }
      ]
    };
    var bag = {}, last = {};
    function nextLine(kind) {
      if (!bag[kind] || !bag[kind].length) {
        var a = LINES[kind].slice();
        for (var i = a.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[k]; a[k] = x; }
        if (a[a.length - 1] === last[kind]) a.unshift(a.pop());   // no immediate repeat across reshuffles
        bag[kind] = a;
      }
      return (last[kind] = bag[kind].pop());
    }
    var live = $('offerSay'), bubble = $('offerBubble'), sayT = null;
    // clock hook: screenshots may set window.__offerClock to freeze time
    function now() { return window.__offerClock ? window.__offerClock() : performance.now(); }
    function geo() {
      var r = svg.getBoundingClientRect();
      return { x: r.left + r.width * 200 / 400, y: r.top + r.height * 318 / 420, top: r.top, s: r.width / 400 };
    }
    function retrigger(node, cls) { if (!node) return; node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); setTimeout(function () { node.classList.remove(cls); }, 1700); }
    function speak(kind) {
      var l = nextLine(kind);
      live.textContent = ''; setTimeout(function () { live.textContent = '\u201C' + l.q + '\u201D ' + l.c.replace(/<[^>]+>/g, ''); }, 50);
      bubble.textContent = '\u201C' + l.q + '\u201D';
      var c = document.createElement('cite'); c.innerHTML = l.c; bubble.appendChild(c);   // l.c is a trusted constant above
      bubble.classList.add('show');
      clearTimeout(sayT); sayT = setTimeout(function () { bubble.classList.remove('show'); }, 9000);
    }
    function loop(dur, step, done) {
      var t0 = now();
      (function f() { var p = Math.min(1, Math.max(0, (now() - t0) / dur)); step(p); if (p < 1) requestAnimationFrame(f); else if (done) done(); })();
    }
    function plume() {
      var g = geo(), N = reduced ? 3 : 10, h = g.y - g.top, rise = h + 120 * Math.max(.7, g.s * 2.5);
      for (var i = 0; i < N; i++) (function (i) {
        var d = document.createElement('div'); d.className = 'offer-smoke'; d.setAttribute('aria-hidden', 'true');
        var sz = (26 + Math.random() * 14) * Math.max(.6, g.s * 2.2);
        d.style.width = d.style.height = sz + 'px'; d.style.left = (g.x - sz / 2) + 'px'; d.style.top = (g.y - sz / 2) + 'px';
        document.body.appendChild(d);
        if (reduced) { d.style.opacity = '.4'; d.style.transform = 'translate(' + (i - 1) * sz * .5 + 'px,' + (-i * sz * .4 - 10) + 'px)'; setTimeout(function () { d.remove(); }, 1400); return; }
        d.style.opacity = '0';
        var drift = (Math.random() * 2 - 1) * 40, ph = Math.random() * 6;
        setTimeout(function () {
          loop(2600 + Math.random() * 600, function (p) {
            var e = 1 - Math.pow(1 - p, 2.2);                    // fast start, slows as it climbs
            var y = -rise * e, x = drift * p + Math.sin(ph + p * 5) * 14 * p;
            var face = (-y > h * 0.35 && -y < h * 0.85) ? 0.45 : 1;   // lighter over her head and face
            d.style.opacity = (Math.min(1, p * 8) * (1 - p * .85) * 0.6 * face).toFixed(3);
            d.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (0.6 + 3.4 * p) + ')';
          }, function () { d.remove(); });
        }, i * 160);
      })(i);
    }
    function burn() {
      retrigger(svg.querySelector('.flame'), 'flare'); retrigger(svg.querySelector('.glow'), 'flare');
      plume();
    }
    function offer(btn) {
      if (btn.classList.contains('gone')) return;
      var kind = btn.getAttribute('data-offer');
      var r = btn.getBoundingClientRect(), g = geo();
      if (document.activeElement === btn) { var nxt = Array.prototype.filter.call(btns, function (b) { return b !== btn && !b.classList.contains('gone'); })[0]; if (nxt) nxt.focus(); }
      btn.classList.add('gone');
      speak(kind); if (window.Music && window.Music.cue) window.Music.cue(kind);
      setTimeout(function () { btn.classList.remove('gone'); btn.classList.add('back'); setTimeout(function () { btn.classList.remove('back'); }, 700); }, reduced ? 2500 : 4500);
      if (reduced) { burn(); return; }
      var fly = document.createElement('div'); fly.className = 'offer-fly'; fly.setAttribute('aria-hidden', 'true');
      fly.innerHTML = btn.querySelector('svg').outerHTML;
      var w = r.width, x0 = r.left + w / 2, y0 = r.top + r.height / 2, x2 = g.x, y2 = g.y - w * 0.1;
      var peak = Math.min(y0, y2) - Math.max(80, 230 * g.s);       // apex well above both ends
      var cx = (x0 + x2) / 2, cy = 2 * peak - (y0 + y2) / 2;       // quadratic Bezier whose apex is `peak`
      fly.style.left = '0px'; fly.style.top = '0px'; fly.style.width = w + 'px'; fly.style.height = w + 'px';
      document.body.appendChild(fly);
      var FLY = 1400, BURN = 900, TOT = FLY + BURN, burned = false;
      loop(TOT, function (p) {
        var ms = p * TOT, x, y, sc, rot, f = '', op = 1;
        if (ms < FLY) {
          var u = ms / FLY; u = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // easeInOutQuad
          var a = 1 - u; x = a * a * x0 + 2 * a * u * cx + u * u * x2; y = a * a * y0 + 2 * a * u * cy + u * u * y2;
          sc = 1 - 0.3 * u; rot = Math.sin(u * Math.PI) * 25 + u * 15;
        } else {
          var b = (ms - FLY) / BURN;
          if (!burned) { burned = true; burn(); }
          x = x2; y = y2 - 6 * b; sc = 0.7 * (1 - 0.9 * b); rot = 15;
          f = 'brightness(' + (1 - 0.85 * b).toFixed(2) + ') sepia(' + b.toFixed(2) + ')'; op = 1 - b;
        }
        fly.style.transform = 'translate(' + (x - w / 2) + 'px,' + (y - w / 2) + 'px) rotate(' + rot + 'deg) scale(' + sc + ')';
        fly.style.filter = f; fly.style.opacity = op;
      }, function () { fly.remove(); });
    }
    Array.prototype.forEach.call(btns, function (b) { b.addEventListener('click', function (e) { e.preventDefault(); offer(b); }); });
  })();

})();
