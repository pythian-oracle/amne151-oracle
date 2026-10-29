/* Background lyre music for the oracle home page (extracted from game.js). */
(function () {
  'use strict';
  var CONFIG = { MUSIC_DEFAULT_ON: true, MUSIC_VOLUME: 0.15 };
  function $(id) { return document.getElementById(id); }
  /* ---------- music: procedural plucked lyre (Web Audio, Karplus-Strong) ---------- */
  var Music = (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = null, master = null, bus = null, timer = null, drone = null, cache = {};
    var KEY = 'oracle-music-on', cueUntil = 0;
    var on = (function () { try { var v = localStorage.getItem(KEY); return v === null ? CONFIG.MUSIC_DEFAULT_ON : v === '1'; } catch (e) { return CONFIG.MUSIC_DEFAULT_ON; } })();
    // D Dorian-ish, two octaves (D E F G A B C), with Phrygian E-flat colour occasionally
    var SCALE = [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00];
    var pos = 4;

    function impulse(sec, decay) {
      var len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = buf.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return buf;
    }
    // nodes scheduled by the current offering cue, so a new cue (or mute / next step) can fade and stop them
    var trackList = null, active = null, cueVerb = null, lastCue = 0, duckTimer = null;
    function T(n) { if (trackList) trackList.push(n); }
    function stopCue(fade) {
      if (!active || !ctx) return;
      var a = active; active = null; fade = fade || 0.08;
      var t = ctx.currentTime;
      try { a.out.gain.cancelScheduledValues(t); a.out.gain.setValueAtTime(a.out.gain.value, t); a.out.gain.linearRampToValueAtTime(0, t + fade); } catch (e) {}
      a.nodes.forEach(function (n) { try { n.stop(t + fade + 0.02); } catch (e) {} });
      setTimeout(function () { try { a.out.disconnect(); } catch (e) {} }, (fade + 0.2) * 1000);
    }
    function unduck(over) {   // put the background lyre back at its proper level (or silence if muted)
      clearTimeout(duckTimer); duckTimer = null;
      if (!ctx) return;
      var t = ctx.currentTime, g = master.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(on ? CONFIG.MUSIC_VOLUME : 0, t + (over || 1.5));
    }
    function duck(hold) {
      clearTimeout(duckTimer);
      var t = ctx.currentTime, g = master.gain, mv = CONFIG.MUSIC_VOLUME;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(mv * 0.25, t + 0.3);
      duckTimer = setTimeout(function () { unduck(1.5); }, hold * 1000);   // timer, not a scheduled ramp, so it can't be lost
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
    function pluck(freq, when, vol, pan, dest) {
      var src = ctx.createBufferSource(); src.buffer = pluckBuffer(freq);
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.004;   // tiny detune
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + Math.random() * 600;
      var g = ctx.createGain(); g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + 3.4);
      src.connect(lp); lp.connect(g);
      if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(dest || bus); } else g.connect(dest || bus);
      src.start(when); src.stop(when + 3.5); T(src);
    }
    // ---- offering pieces: each gift gets its own short tune ----
    function reed(f, a, dur, vol, out, glide) {   // aulos-like double reed: buzzy, nasal, with vibrato
      var r = ctx.createOscillator(); r.type = 'sawtooth'; r.frequency.setValueAtTime(glide || f, a);
      if (glide) r.frequency.exponentialRampToValueAtTime(f, a + 0.08);
      var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.4; lg.gain.value = f * 0.007; lfo.connect(lg); lg.connect(r.frequency);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 2.5;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(vol, a + 0.06);
      g.gain.setValueAtTime(vol, a + dur - 0.08); g.gain.linearRampToValueAtTime(0.0001, a + dur);
      r.connect(bp); bp.connect(g); g.connect(out); r.start(a); lfo.start(a); r.stop(a + dur + 0.05); lfo.stop(a + dur + 0.05); T(r); T(lfo);
    }
    function drum(td, vol, hi, lo, out) {   // frame drum / tympanon thump
      var o = ctx.createOscillator(), dg = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(hi, td); o.frequency.exponentialRampToValueAtTime(lo, td + 0.4);
      dg.gain.setValueAtTime(0.0001, td); dg.gain.exponentialRampToValueAtTime(vol, td + 0.01); dg.gain.exponentialRampToValueAtTime(0.0001, td + 0.9);
      o.connect(dg); dg.connect(out); o.start(td); o.stop(td + 0.95); T(o);
    }
    function low(f, a, dur, vol, out) {     // solemn low drone voice
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(vol, a + 1.2);
      g.gain.setValueAtTime(vol, a + dur - 1.4); g.gain.linearRampToValueAtTime(0.0001, a + dur);
      o.connect(lp); lp.connect(g); g.connect(out); o.start(a); o.stop(a + dur + 0.05); T(o);
    }
    var OFFER_SOUNDS = {
      // myrtle: the original offering tune
      myrtle: function (t, out) {   // the original shared offering tune (from before 0f82248)
        // 1. rising lyre flourish while the gift flies
        [293.66, 349.23, 440, 523.25, 587.33, 698.46].forEach(function (f, i) { pluck(f, t + i * 0.2, 0.32, (i % 2 ? 0.3 : -0.3), out); });
        // 2. frame-drum thump on landing (~1.4 s)
        var td = t + 1.4, o = ctx.createOscillator(), dg = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(130, td); o.frequency.exponentialRampToValueAtTime(48, td + 0.35);
        dg.gain.setValueAtTime(0.0001, td); dg.gain.exponentialRampToValueAtTime(0.9, td + 0.01); dg.gain.exponentialRampToValueAtTime(0.0001, td + 0.7);
        o.connect(dg); dg.connect(out); o.start(td); o.stop(td + 0.75); T(o);
        // 3. aulos-like reedy drone with vibrato
        [146.83, 220].forEach(function (f, i) {
          var r = ctx.createOscillator(); r.type = i ? 'square' : 'sawtooth'; r.frequency.value = f;
          var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = f * 0.008; lfo.connect(lg); lg.connect(r.frequency);
          var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 4; bp.Q.value = 3;
          var g = ctx.createGain(), a = td + 0.1; g.gain.setValueAtTime(0.0001, a); g.gain.linearRampToValueAtTime(0.09, a + 0.8); g.gain.setValueAtTime(0.09, a + 3.6); g.gain.linearRampToValueAtTime(0.0001, a + 5);
          r.connect(bp); bp.connect(g); g.connect(out); r.start(a); lfo.start(a); r.stop(a + 5.1); lfo.stop(a + 5.1); T(r); T(lfo);
        });
        // 4. bright resolving chord (D major) as the smoke rises
        [293.66, 369.99, 440, 587.33].forEach(function (f, i) { pluck(f, t + 3 + i * 0.05, 0.3, (i - 1.5) * 0.25, out); pluck(f * 2, t + 3.1 + i * 0.05, 0.12, 0, out); });
      },
      // lamb: a pastoral aulos tune in D Dorian over a soft lyre bed
      lamb: function (t, out) {
        var m = [[293.66, 0.5], [329.63, 0.25], [349.23, 0.25], [392, 0.6], [349.23, 0.3], [329.63, 0.3], [293.66, 0.5], [261.63, 0.3], [293.66, 1.1]], a = t + 0.2;
        m.forEach(function (n, i) { reed(n[0], a, n[1] + 0.04, 0.085, out, i && Math.random() < 0.5 ? n[0] * 0.97 : 0); a += n[1]; });
        reed(146.83, t + 0.2, a - t - 0.1, 0.03, out);   // the second pipe holds the drone
        [146.83, 220, 293.66].forEach(function (f, i) { pluck(f, t + 0.2 + i * 1.3, 0.22, -0.2, out); });
        pluck(220, a, 0.2, 0.2, out); pluck(293.66, a + 0.04, 0.2, -0.2, out);
      },
      // ox: grand and solemn - low drone, slow heavy drum beats, deep lyre chords
      ox: function (t, out) {
        low(73.42, t, 6, 0.12, out); low(110, t + 0.3, 5.7, 0.08, out); low(36.71, t + 0.6, 5.2, 0.1, out);
        [0.2, 1.4, 2.6, 3.2, 3.8].forEach(function (d, i) { drum(t + d, i === 4 ? 1 : 0.8, i > 2 ? 110 : 90, 38, out); });
        [[146.83, 220, 293.66], [130.81, 196, 261.63], [146.83, 220, 293.66, 440]].forEach(function (ch, j) {
          ch.forEach(function (f, i) { pluck(f, t + 0.2 + j * 1.2 + i * 0.06, 0.32, (i - 1) * 0.25, out); });
        });
        reed(146.83, t + 4, 1.8, 0.05, out); reed(220, t + 4, 1.8, 0.04, out);
      }
    };
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
        if (!on && ctx) { stopCue(0.08); clearTimeout(duckTimer); duckTimer = null; }
        if (on) { if (init()) apply(); } else apply();
        return on;
      },
      cue: function (kind) {
        if (!on || document.hidden || !AC) return;
        if (!ctx && !init()) return;
        var now = Date.now();
        if (now - lastCue < 250) return;   // ignore double-fires from one click / key repeat
        lastCue = now;
        try {
          if (ctx.state !== 'running') { ctx.resume(); apply(); }
          stopCue(0.08);                     // fade out whatever offering music is still playing
          var t = ctx.currentTime + 0.1, k = OFFER_SOUNDS[kind] ? kind : 'myrtle';
          var out = ctx.createGain(); out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(0.9, t); out.connect(ctx.destination);
          if (!cueVerb) { cueVerb = ctx.createConvolver(); cueVerb.buffer = impulse(2.5, 2.4); var rw = ctx.createGain(); rw.gain.value = 0.4; cueVerb.connect(rw); rw.connect(ctx.destination); }
          out.connect(cueVerb);
          active = { out: out, nodes: [] };
          trackList = active.nodes;
          try { OFFER_SOUNDS[k](t, out); } finally { trackList = null; }
          duck(6.5);
          var mine = active;
          setTimeout(function () { if (active === mine) { active = null; setTimeout(function () { try { mine.out.disconnect(); } catch (e) {} }, 200); } }, 8000);
        } catch (e) { trackList = null; }
      },
      stopCue: function () { if (!ctx) return; var had = !!active; stopCue(0.08); if (had) unduck(0.6); },
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
  if (!musicBtn) return;
  function paintMusic() {
    var o = Music.isOn();
    musicBtn.setAttribute('aria-pressed', o ? 'true' : 'false');
    musicBtn.querySelector('.music-label').textContent = o ? 'Music on' : 'Music off';
    musicBtn.querySelector('.music-icon').textContent = o ? '\u266B' : '\u266A\u0338';
  }
  if (!Music.available) musicBtn.hidden = true;
  else {
    paintMusic();
    musicBtn.addEventListener('click', function () { Music.toggle(); paintMusic(); });
    // Browsers block audio until a gesture; resume if preference is already on.
    function kick() {
      if (Music.isOn()) Music.start();
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('keydown', kick);
    }
    document.addEventListener('pointerdown', kick);
    document.addEventListener('keydown', kick);
  }
})();
