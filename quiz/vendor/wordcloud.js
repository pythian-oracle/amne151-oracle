/* Sphinx packed word cloud — Archimedean spiral, horizontal words, no build step. */
(function (global) {
  'use strict';

  var PALETTE = ['#A3461F', '#5F6B3A', '#B8954E', '#2B2420', '#8A3A19', '#3d5a2a', '#5E5348', '#7A4E2D'];

  function hash(s) {
    var h = 0, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function measure(el) {
    return { w: el.offsetWidth, h: el.offsetHeight };
  }

  function overlaps(a, b, pad) {
    return !(a.x + a.w / 2 + pad < b.x - b.w / 2 ||
      a.x - a.w / 2 - pad > b.x + b.w / 2 ||
      a.y + a.h / 2 + pad < b.y - b.h / 2 ||
      a.y - a.h / 2 - pad > b.y + b.h / 2);
  }

  function placeSpiral(items, width, height) {
    var placed = [];
    var cx = width / 2, cy = height / 2;
    var i, it, angle, r, step, tries, ok, j, x, y;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      angle = (hash(it.norm) % 360) * Math.PI / 180;
      r = 0;
      step = 0.35;
      ok = false;
      for (tries = 0; tries < 900; tries++) {
        x = cx + Math.cos(angle) * r;
        y = cy + Math.sin(angle) * r * 0.72;
        var box = { x: x, y: y, w: it.w, h: it.h };
        ok = true;
        if (x - it.w / 2 < 4 || x + it.w / 2 > width - 4 || y - it.h / 2 < 4 || y + it.h / 2 > height - 4) ok = false;
        if (ok) {
          for (j = 0; j < placed.length; j++) {
            if (overlaps(box, placed[j], 4)) { ok = false; break; }
          }
        }
        if (ok) {
          it.x = x; it.y = y;
          placed.push(box);
          break;
        }
        angle += step;
        r += 0.55;
      }
      if (!ok) {
        it.x = cx + (i % 5) * 12;
        it.y = cy + Math.floor(i / 5) * 14;
      }
    }
  }

  /** Font size: count 1 = base; grows with sqrt(count) up to ~3× base. */
  function fontSizeForCount(count, baseFs) {
    var c = Math.max(1, Number(count) || 1);
    var scale = Math.min(3, Math.sqrt(c));
    return Math.round(baseFs * scale);
  }

  /**
   * Render or update a word cloud in container.
   * words: [{label, norm, count}] sorted desc by count preferred.
   * opts: { animate: true, height, totalResponses }
   */
  function render(container, words, opts) {
    opts = opts || {};
    if (!container) return;
    var width = Math.max(280, container.clientWidth || 640);
    var height = Math.max(220, Number(opts.height) || 320);
    var totalResp = Number(opts.totalResponses || 0);
    var list = (words || []).slice().filter(function (w) { return w && w.label; });
    list.sort(function (a, b) { return (b.count || 0) - (a.count || 0) || String(a.label).localeCompare(String(b.label)); });

    var stage = container.querySelector('.wc-stage');
    var meta = container.querySelector('.wc-meta');
    if (!stage) {
      container.innerHTML = '';
      meta = document.createElement('div');
      meta.className = 'wc-meta';
      stage = document.createElement('div');
      stage.className = 'wc-stage';
      container.appendChild(meta);
      container.appendChild(stage);
    }
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    stage.style.position = 'relative';

    if (!list.length) {
      meta.innerHTML = '';
      stage.innerHTML = '<span class="wc-empty">Words will gather here…</span>';
      return;
    }

    var baseFs = Math.max(15, Math.min(20, Math.floor(width / 36)));
    var items = [];
    var i, w, fs, el, existing, isNew;

    var prev = Object.create(null);
    Array.prototype.forEach.call(stage.querySelectorAll('.wc-word'), function (node) {
      prev[node.getAttribute('data-norm')] = node;
    });

    var empty = stage.querySelector('.wc-empty');
    if (empty) empty.remove();

    var keep = Object.create(null);
    for (i = 0; i < list.length; i++) {
      w = list[i];
      fs = fontSizeForCount(w.count, baseFs);
      existing = prev[w.norm];
      isNew = !existing;
      if (!existing) {
        el = document.createElement('span');
        el.className = 'wc-word';
        el.setAttribute('data-norm', w.norm || w.label);
        el.textContent = w.label;
        stage.appendChild(el);
        if (opts.animate !== false) el.classList.add('wc-pop');
      } else {
        el = existing;
        el.classList.remove('wc-pop');
      }
      keep[w.norm] = true;
      el.style.fontSize = fs + 'px';
      el.style.color = PALETTE[hash(w.norm || w.label) % PALETTE.length];
      el.style.fontWeight = (i === 0 ? '700' : '600');
      el.classList.toggle('wc-top', i === 0);
      el.setAttribute('title', w.label + ' ×' + w.count);
      el.style.visibility = 'hidden';
      el.style.left = '0';
      el.style.top = '0';
      el.style.transform = 'none';
      var m = measure(el);
      items.push({ el: el, label: w.label, norm: w.norm, count: w.count, w: m.w, h: m.h, isNew: isNew });
    }

    Object.keys(prev).forEach(function (n) {
      if (!keep[n]) prev[n].remove();
    });

    placeSpiral(items, width, height);

    for (i = 0; i < items.length; i++) {
      el = items[i].el;
      el.style.visibility = 'visible';
      el.style.left = (items[i].x - items[i].w / 2) + 'px';
      el.style.top = (items[i].y - items[i].h / 2) + 'px';
      el.style.transform = 'none';
    }

    var top = list[0];
    meta.innerHTML =
      '<span class="wc-top-label">Top: <strong>' + top.label + '</strong> ×' + top.count + '</span>' +
      (totalResp ? '<span class="wc-total">' + totalResp + ' response' + (totalResp === 1 ? '' : 's') + '</span>' : '');
  }

  global.SphinxWordCloud = { render: render, fontSizeForCount: fontSizeForCount };
})(typeof window !== 'undefined' ? window : globalThis);
