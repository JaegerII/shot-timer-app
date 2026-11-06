/* ============ Video-Analyse ============
   Stage-Video laden, Startsignal und Schüsse aus der Tonspur erkennen,
   Timer oben links und Splits unten einblenden, Marker auf der Tonspur
   verschieben und das Video mit Einblendung als neue Datei exportieren.
   Alles passiert auf dem Gerät; das Video verlässt das Telefon nur, wenn
   man es selbst teilt.

   Eingebunden aus index.html: window.FTVideo(api) mit den Hilfen der App. */
window.FTVideo = function (api) {
  'use strict';
  const { t, de, showToast, keepAwake, allowSleep } = api;
  const $ = (s) => document.querySelector(s);

  // Farben wie Leuchtrand und Akzent der App.
  const C = { ready: '#ffc83d', live: '#18e5ff', ink: '#f4f4ee' };
  const EXPORT_MAX = 1920;      // längste Kante des exportierten Videos
  const MAX_FILE = 1.5e9;       // größere Dateien sprengen den Speicher beim Dekodieren
  const NUDGE = 0.01;           // Schritt der Pfeiltasten in Sekunden
  const MAX_PX_PER_S = 600;      // stärkste Vergrößerung der Tonspur
  const FFT_N = 1024, HOP = 512; // Startsignal: Spektrum in ~21-ms-Fenstern

  const S = {
    file: null, url: null, dur: 0, w: 0, h: 0,
    pcm: null, rate: 48000, env: null, envMax: 1,
    beep: null, beepEnd: null, shots: [], sel: null,
    zoom: 1, sens: 50, rateIdx: 0, busy: false, cancel: false, result: null
  };
  const video = $('#vidEl'), over = $('#vidOver'), wave = $('#vidWave'), track = $('#vidTrack'), inner = $('#vidTrackInner');

  /* ---------- Hilfen ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sec = (v) => de(Math.max(0, v));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function setBusy(text, pct) {
    const box = $('#vidBusy');
    box.hidden = !text;
    if (!text) return;
    $('#vidBusyText').textContent = text;
    const bar = $('#vidBusyBar');
    bar.hidden = pct == null;
    if (pct != null) bar.firstElementChild.style.width = Math.round(pct * 100) + '%';
  }

  /* ---------- Laden ---------- */
  $('#vidFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) load(f);
  });
  $('#vidNew').onclick = () => { if (!S.busy) $('#vidFile').click(); };

  async function load(file) {
    if (S.busy) return;
    if (file.size > MAX_FILE) { showToast(t('Video zu groß – bitte vorher kürzen.')); return; }
    unload();
    S.file = file;
    S.url = URL.createObjectURL(file);
    $('#vidEmpty').hidden = true;
    $('#vidEdit').hidden = false;
    $('#vidNew').hidden = false;
    $('#videoSub').textContent = file.name || '';
    S.busy = true;
    setBusy(t('Video wird geladen …'));
    try {
      video.src = S.url;
      await new Promise((res, rej) => {
        video.onloadedmetadata = res;
        video.onerror = () => rej(new Error('video'));
      });
      S.dur = video.duration;
      S.w = video.videoWidth; S.h = video.videoHeight;
      layout();
      // Erstes Bild zeigen (iOS lädt sonst nichts, bis abgespielt wird).
      video.currentTime = Math.min(0.05, S.dur / 2);
      setBusy(t('Ton wird analysiert …'));
      await tick();
      const buf = await file.arrayBuffer();
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const ac = new Offline(1, 1, 48000);
      const audio = await new Promise((res, rej) => {
        const p = ac.decodeAudioData(buf, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      S.rate = audio.sampleRate;
      S.pcm = mono(audio);
      S.env = envelope(S.pcm, S.rate);
      S.envMax = S.env.reduce((m, v) => (v > m ? v : m), 1e-6);
      await detect(true);
      S.busy = false;
      setBusy(null);
      S.zoom = 1;
      renderAll();
      fitStage();
      if (S.beep == null) showToast(t('Kein Startsignal erkannt – setze den Start-Marker selbst.'));
    } catch (err) {
      S.busy = false;
      setBusy(null);
      const keinTon = err && err.message !== 'video';
      showToast(keinTon ? t('Die Tonspur konnte nicht gelesen werden.') : t('Dieses Video kann nicht geöffnet werden.'));
      if (!keinTon) unload(true);
      else { S.pcm = null; renderAll(); }
    }
  }

  function unload(toEmpty) {
    video.pause();
    if (S.url) URL.revokeObjectURL(S.url);
    Object.assign(S, { file: null, url: null, pcm: null, env: null, beep: null, beepEnd: null, shots: [], sel: null, result: null });
    video.removeAttribute('src');
    video.load();
    if (toEmpty) {
      $('#vidEmpty').hidden = false;
      $('#vidEdit').hidden = true;
      $('#vidNew').hidden = true;
      requestAnimationFrame(drawDemo);
      $('#videoSub').textContent = t('Timer und Splits im eigenen Stage-Video');
    }
  }

  function mono(buf) {
    const n = buf.length, c = buf.numberOfChannels;
    if (c === 1) return buf.getChannelData(0);
    const out = new Float32Array(n);
    for (let ch = 0; ch < c; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] += d[i] / c;
    }
    return out;
  }
  // Hüllkurve: Spitzenwert je Millisekunde.
  function envelope(pcm, rate) {
    const blk = Math.max(1, Math.round(rate / 1000));
    const n = Math.ceil(pcm.length / blk);
    const env = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      let m = 0;
      const end = Math.min(pcm.length, (b + 1) * blk);
      for (let i = b * blk; i < end; i++) { const v = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (v > m) m = v; }
      env[b] = m;
    }
    return env;
  }

  /* ---------- Erkennung ---------- */
  // FFT (radix 2, in place) für die Suche nach dem Startsignal.
  const fft = (() => {
    const n = FFT_N, rev = new Uint16Array(n), cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
    return (re, im) => {
      for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let s = 0; s < n; s += size) {
          for (let k = 0; k < half; k++) {
            const a = s + k, b = a + half, c = cos[k * step], d = sin[k * step];
            const tr = re[b] * c - im[b] * d, ti = re[b] * d + im[b] * c;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  })();

  /* Startsignal: ein gleichbleibender Ton zwischen 1,4 und 5 kHz, mindestens
     ~70 ms lang, der sich deutlich aus dem Rest des Spektrums hebt. Shot
     Timer piepen alle in diesem Bereich (diese App: 2,7 kHz). */
  async function findBeep() {
    const pcm = S.pcm, rate = S.rate, n = FFT_N;
    const frames = Math.floor((pcm.length - n) / HOP);
    if (frames < 4) return null;
    const win = new Float32Array(n);
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    const re = new Float32Array(n), im = new Float32Array(n);
    const binHz = rate / n;
    const lo = Math.round(1400 / binHz), hi = Math.round(5000 / binHz), all0 = Math.round(150 / binHz), all1 = Math.min(n / 2 - 1, Math.round(12000 / binHz));
    const tonal = new Float32Array(frames), peak = new Int16Array(frames), energy = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
      const o = f * HOP;
      for (let i = 0; i < n; i++) { re[i] = pcm[o + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let sum = 0, best = 0, bi = lo;
      for (let k = all0; k <= all1; k++) {
        const p = re[k] * re[k] + im[k] * im[k];
        sum += p;
        if (k >= lo && k <= hi && p > best) { best = p; bi = k; }
      }
      const band = (re[bi - 1] ** 2 + im[bi - 1] ** 2) + best + (re[bi + 1] ** 2 + im[bi + 1] ** 2);
      tonal[f] = sum > 0 ? band / sum : 0;
      peak[f] = bi;
      energy[f] = sum;
      if (f % 400 === 399) await tick();
    }
    const sorted = Float32Array.from(energy).sort();
    const floor = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const minRun = Math.ceil(0.07 * rate / HOP);
    let start = -1;
    for (let f = 0; f <= frames; f++) {
      const ok = f < frames && tonal[f] > 0.45 && energy[f] > floor * 2 && (start < 0 || Math.abs(peak[f] - peak[start]) <= 2);
      if (ok && start < 0) start = f;
      else if (!ok && start >= 0) {
        if (f - start >= minRun) return refineBeep(start, f, peak[start] * binHz);
        start = ok ? f : -1;
      }
    }
    return null;
  }
  // Genauer Einsatz und Ende des Tons über Goertzel in 4-ms-Fenstern.
  function refineBeep(f0, f1, hz) {
    const rate = S.rate, pcm = S.pcm, len = Math.round(rate * 0.004), step = Math.round(rate / 1000);
    const w = 2 * Math.cos(2 * Math.PI * hz / rate);
    const amp = (o) => {
      let s1 = 0, s2 = 0;
      for (let i = 0; i < len; i++) { const s = (pcm[o + i] || 0) + w * s1 - s2; s2 = s1; s1 = s; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - w * s1 * s2));
    };
    const a = f0 * HOP, b = f1 * HOP + FFT_N;
    let plateau = 0;
    for (let o = a; o < b; o += step) plateau = Math.max(plateau, amp(o));
    let on = a;
    for (let o = Math.max(0, a - FFT_N); o < b; o += step) if (amp(o) > plateau * 0.5) { on = o; break; }
    let off = b;
    for (let o = Math.min(pcm.length - len, b + FFT_N); o > on; o -= step) if (amp(o) > plateau * 0.5) { off = o + len; break; }
    return { at: on / rate, end: off / rate };
  }

  /* Schüsse: steiler Anstieg der Hüllkurve gegenüber den 20 ms davor.
     Empfindlichkeit 0–100 verschiebt Mindestlautstärke und Anstieg. */
  function findShots(from) {
    const env = S.env, n = env.length, k = S.sens / 100;
    const rise = 4.2 - 2.6 * k;                         // 4,2 … 1,6-fach
    const rel = 0.7 * Math.pow(0.1, k);                 // 70 % … 7 % des lautesten Schusses
    const sorted = Float32Array.from(env).sort();
    const noise = sorted[Math.floor(n * 0.5)] || 0;
    const cands = [];
    for (let i = Math.max(25, Math.ceil(from * 1000)); i < n - 5; i++) {
      let pre = 0;
      for (let j = i - 25; j < i - 5; j++) pre += env[j];
      pre = pre / 20 + 1e-5;
      if (env[i] > noise * 3 && env[i] > pre * rise) {
        let pk = 0;
        for (let j = i; j < Math.min(n, i + 30); j++) if (env[j] > pk) pk = env[j];
        cands.push({ i, pk });
        i += 60; // kürzester realistischer Split
      }
    }
    if (!cands.length) return [];
    const loud = cands.map((c) => c.pk).sort((a, b) => a - b);
    const ref = loud[Math.floor((loud.length - 1) * 0.9)];
    // Ende der Stage: Nach einer Pause muss der nächste Schuss lauter sein, um
    // noch dazuzugehören (eigene Schüsse sind an der Kamera am lautesten);
    // nach langer Stille ist Schluss. So fallen Nachbarstand, Hantieren und
    // angehängte Szenen weg.
    const own = [], base = 0.6 * Math.pow(0.55, k), maxGap = 4000 + 3000 * k;
    for (const c of cands) {
      if (c.pk < ref * rel) continue;
      if (own.length) {
        const pause = (c.i - own[own.length - 1].i) / 1000;
        if (pause * 1000 > maxGap) break;
        if (c.pk < ref * base * Math.min(1.8, 1 + 0.15 * pause)) continue;
      }
      own.push(c);
    }
    return own.map((c) => onset(c.i, c.pk));
  }
  // Auf die Probe genau: erstes Sample über 30 % der Spitze.
  function onset(ms, pk) {
    const blk = Math.max(1, Math.round(S.rate / 1000)), pcm = S.pcm;
    const a = Math.max(0, (ms - 3) * blk), b = Math.min(pcm.length, (ms + 6) * blk);
    for (let i = a; i < b; i++) if (Math.abs(pcm[i]) >= pk * 0.3) return i / S.rate;
    return ms / 1000;
  }

  async function detect(withBeep) {
    if (!S.pcm) return;
    if (withBeep) {
      const b = await findBeep();
      S.beep = b ? b.at : null;
      S.beepEnd = b ? b.end : null;
    }
    const from = S.beep == null ? 0 : Math.max(S.beepEnd || S.beep, S.beep + 0.12) + 0.02;
    S.shots = findShots(from);
    S.sel = null;
  }

  /* ---------- Einblendung ---------- */
  // Eigene Formensprache: Kanten oben rechts und unten links abgeschrägt,
  // große Zeit mit kleinen Hundertsteln, darunter die „Trace“: der Lauf als Linie
  // mit einem Strich je Schuss.
  function phaseAt(time, D) {
    const beep = D.beep, shots = D.shots;
    if (beep == null || time < beep) return { phase: 'ready', el: 0, n: 0 };
    let n = 0;
    while (n < shots.length && shots[n] <= time) n++;
    const last = shots.length ? shots[shots.length - 1] : null;
    if (last != null && time >= last) return { phase: 'done', el: last - beep, n };
    return { phase: 'go', el: time - beep, n };
  }
  function cut(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c);
    ctx.closePath();
  }
  function glass(ctx, x, y, w, h, c, u) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(5,8,8,.9)');
    g.addColorStop(1, 'rgba(5,8,8,.72)');
    ctx.fillStyle = g;
    cut(ctx, x, y, w, h, c); ctx.fill();
    ctx.strokeStyle = 'rgba(237,237,230,.13)';
    ctx.lineWidth = Math.max(1, 0.16 * u);
    ctx.stroke();
  }
  // Ziffern in fester Breite, damit die laufende Zeit nicht zittert.
  function tab(ctx, text, x, y, draw) {
    const dw = ctx.measureText('0').width;
    let cx = x;
    for (const ch of text) {
      const cw = ctx.measureText(ch).width, w = /\d/.test(ch) ? dw : cw;
      if (draw) ctx.fillText(ch, cx + (w - cw) / 2, y);
      cx += w;
    }
    return cx - x;
  }
  // Gesperrte Schrift von Hand: ctx.letterSpacing fehlt in älteren WebViews.
  function spaced(ctx, text, x, y, sp, draw) {
    let cx = x;
    for (const ch of text) {
      if (draw) ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + sp;
    }
    return Math.max(0, cx - x - sp);
  }
  const font = (w, px) => w + ' ' + px + 'px Montserrat, system-ui, sans-serif';
  // „12,34“ → ['12', ',34']
  function parts(txt) {
    const i = txt.search(/[.,]\d+$/);
    return i < 0 ? [txt, ''] : [txt.slice(0, i), txt.slice(i)];
  }
  const ease = (a) => 1 - Math.pow(1 - clamp(a, 0, 1), 3);

  function drawOverlay(ctx, W, H, time, keep, D) {
    D = D || S;
    if (!keep) ctx.clearRect(0, 0, W, H);
    if (D.beep == null && !D.shots.length) return;
    const u = Math.min(W, H) / 100;
    const st = phaseAt(time, D), shots = D.shots, beep = D.beep ?? 0;
    const acc = st.phase === 'ready' ? C.ready : C.live;
    const lastShot = st.n ? shots[st.n - 1] : null;
    const flash = lastShot != null ? 1 - clamp((time - lastShot) / 0.32, 0, 1) : 0;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // --- Werte für das Feld oben links ---
    const label = st.phase === 'ready' ? t('BEREIT') : st.phase === 'go' ? (st.n ? t('SCHUSS {0}', st.n) : t('LÄUFT')) : t('ZEIT');
    const [whole, frac] = parts(sec(st.el));
    const cells = [];
    if (st.phase === 'done') {
      let best = Infinity;
      for (let i = 1; i < shots.length; i++) best = Math.min(best, shots[i] - shots[i - 1]);
      cells.push([t('Schüsse'), String(shots.length)], [t('Erster Schuss'), sec(shots[0] - beep)]);
      if (best < Infinity) cells.push([t('Bester Split'), sec(best), true]);
    } else if (st.n > 1) {
      cells.push(['Split', sec(shots[st.n - 1] - shots[st.n - 2]), true], [t('Erster Schuss'), sec(shots[0] - beep)]);
    } else if (st.n === 1) cells.push([t('Erster Schuss'), sec(shots[0] - beep), true]);

    const x = 3 * u, y = 3 * u, pad = 2.6 * u, c = 2.8 * u;
    const BIG = 15 * u, SMALL = 7.4 * u, LAB = 1.75 * u, VAL = 3.5 * u, CGAP = 3.2 * u;
    ctx.font = font(800, BIG);
    const ww = tab(ctx, whole.replace(/\d/g, '0'), 0, 0, false);
    ctx.font = font(800, SMALL);
    const fw = tab(ctx, frac.replace(/\d/g, '0'), 0, 0, false);
    const cw = cells.map((cl) => {
      ctx.font = font(750, LAB);
      const a = spaced(ctx, cl[0].toUpperCase(), 0, 0, 0.16 * u, false);
      ctx.font = font(800, VAL);
      return Math.max(a, tab(ctx, cl[1], 0, 0, false));
    });
    const cellsW = cw.reduce((a, b) => a + b, 0) + CGAP * Math.max(0, cw.length - 1);
    const bw = Math.max(36 * u, ww + fw + 0.6 * u + 2 * pad, cellsW + 2 * pad);

    const yLab = y + pad + 1.6 * u;
    const yTime = yLab + 1.7 * u + 10.9 * u;
    const yTrace = yTime + 2.9 * u;
    const yCellL = yTrace + 4.2 * u, yCellV = yCellL + 4.1 * u;
    const yBrand = (cells.length ? yCellV : yTrace + 1 * u) + 3.6 * u;
    const bh = yBrand + pad - 0.4 * u - y;

    // Rahmen, beim Schuss kurz aufleuchtend
    if (flash > 0) {
      ctx.save();
      ctx.shadowColor = acc; ctx.shadowBlur = 3 * u * flash;
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.85 * flash; ctx.lineWidth = 0.35 * u;
      cut(ctx, x, y, bw, bh, c); ctx.stroke();
      ctx.restore();
    }
    glass(ctx, x, y, bw, bh, c, u);
    ctx.fillStyle = acc;
    ctx.fillRect(x, y, bw - c, 0.5 * u);
    ctx.fillRect(x, y, 0.5 * u, 3.2 * u);

    // Zeile 1: Lampe, Phase, Haarlinie
    const L = x + pad;
    const led = 1.25 * u * (1 + 0.45 * flash);
    ctx.fillStyle = acc;
    ctx.fillRect(L, yLab - 0.62 * u - led / 2, led, led);
    ctx.font = font(800, 1.95 * u);
    const lw = spaced(ctx, label, L + 2.4 * u, yLab, 0.24 * u, true);
    ctx.fillStyle = 'rgba(237,237,230,.16)';
    const rx = L + 2.4 * u + lw + 1.6 * u;
    if (rx < x + bw - pad - c) ctx.fillRect(rx, yLab - 0.75 * u, x + bw - pad - c * 0.6 - rx, Math.max(1, 0.14 * u));

    // Zeile 2: Zeit
    ctx.fillStyle = st.phase === 'done' ? C.live : C.ink;
    ctx.font = font(800, BIG);
    const wDrawn = tab(ctx, whole, L - 0.5 * u, yTime, true);
    ctx.font = font(800, SMALL);
    ctx.globalAlpha = st.phase === 'done' ? 1 : 0.72;
    tab(ctx, frac, L - 0.5 * u + wDrawn + 0.3 * u, yTime, true);
    ctx.globalAlpha = 1;

    // Zeile 3: Trace
    const x0 = L, x1 = x + bw - pad;
    const span = shots.length ? Math.max(0.01, shots[shots.length - 1] - beep) : Math.max(1, st.el);
    const px = (s) => x0 + clamp((s - beep) / span, 0, 1) * (x1 - x0);
    const p = st.phase === 'ready' ? x0 : px(beep + st.el);
    ctx.fillStyle = 'rgba(237,237,230,.15)';
    ctx.fillRect(x0, yTrace - 0.12 * u, x1 - x0, 0.24 * u);
    if (st.phase !== 'ready') {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(24,229,255,.25)'); g.addColorStop(1, C.live);
      ctx.fillStyle = g;
      ctx.fillRect(x0, yTrace - 0.26 * u, p - x0, 0.52 * u);
    }
    ctx.fillStyle = C.ready;
    ctx.fillRect(x0, yTrace - 1.1 * u, 0.36 * u, 2.2 * u);
    for (let i = 0; i < st.n; i++) {
      const sx = px(shots[i]), nw = i === st.n - 1;
      const hgt = (nw ? 2.6 + 1.2 * flash : 1.9) * u;
      ctx.fillStyle = nw ? '#fff' : 'rgba(237,237,230,.85)';
      ctx.fillRect(sx - 0.18 * u, yTrace - hgt / 2, 0.36 * u, hgt);
    }
    if (st.phase === 'go') {
      const d = 0.95 * u;
      ctx.fillStyle = C.live;
      ctx.beginPath(); ctx.moveTo(p, yTrace - d); ctx.lineTo(p + d, yTrace); ctx.lineTo(p, yTrace + d); ctx.lineTo(p - d, yTrace); ctx.closePath(); ctx.fill();
    }

    // Zeile 4: Kennzahlen
    let cx = L;
    cells.forEach((cl, i) => {
      ctx.font = font(750, LAB);
      ctx.fillStyle = 'rgba(237,237,230,.55)';
      spaced(ctx, cl[0].toUpperCase(), cx, yCellL, 0.16 * u, true);
      ctx.font = font(800, VAL);
      ctx.fillStyle = cl[2] ? C.live : C.ink;
      tab(ctx, cl[1], cx, yCellV, true);
      cx += cw[i] + CGAP;
    });

    // Zeile 5: Marke
    ctx.fillStyle = C.live;
    ctx.beginPath();
    ctx.moveTo(L + 0.5 * u, yBrand - 1.3 * u); ctx.lineTo(L + 1.4 * u, yBrand - 1.3 * u);
    ctx.lineTo(L + 0.9 * u, yBrand); ctx.lineTo(L, yBrand); ctx.closePath(); ctx.fill();
    ctx.font = font(800, 1.45 * u);
    ctx.fillStyle = 'rgba(237,237,230,.62)';
    const bwm = spaced(ctx, 'FORTH TRACE', L + 2.2 * u, yBrand, 0.42 * u, true);
    ctx.fillStyle = 'rgba(237,237,230,.32)';
    spaced(ctx, 'SHOT TIMER', L + 2.2 * u + bwm + 1.2 * u, yBrand, 0.42 * u, true);

    // --- Splits unten ---
    if (!st.n) return;
    const K = W > H ? 7 : 4, gap = 1.1 * u, tc = 1.7 * u;
    const tw = (W - 6 * u - gap * (K - 1)) / K, th = 10.6 * u, by = H - 3 * u - th;
    const first = Math.max(0, st.n - K);
    let maxSplit = 0, best = Infinity, bestI = -1;
    for (let i = 1; i < st.n; i++) {
      const s = shots[i] - shots[i - 1];
      maxSplit = Math.max(maxSplit, s);
      if (s < best) { best = s; bestI = i; }
    }
    for (let i = first; i < st.n; i++) {
      const tx = 3 * u + (i - first) * (tw + gap);
      const nw = i === st.n - 1, a = nw ? ease((time - shots[i]) / 0.2) : 1;
      const ty = by + (1 - a) * 2.4 * u;
      const split = i ? shots[i] - shots[i - 1] : shots[0] - beep;
      const hi = i === bestI && st.n > 2;
      ctx.globalAlpha = 0.2 + 0.8 * a;
      glass(ctx, tx, ty, tw, th, tc, u);
      ctx.fillStyle = nw ? C.live : i === 0 ? C.ready : 'rgba(237,237,230,.22)';
      ctx.fillRect(tx, ty, tw - tc, (nw ? 0.42 : 0.24) * u);
      // Nummer links, Gesamtzeit rechts
      ctx.font = font(800, 1.7 * u);
      ctx.fillStyle = i === 0 ? C.ready : 'rgba(237,237,230,.55)';
      spaced(ctx, String(i + 1).padStart(2, '0'), tx + 1.4 * u, ty + 3.1 * u, 0.16 * u, true);
      ctx.font = font(700, 1.7 * u);
      ctx.fillStyle = 'rgba(237,237,230,.55)';
      ctx.textAlign = 'right';
      ctx.fillText(sec(shots[i] - beep), tx + tw - 1.4 * u, ty + 3.1 * u);
      ctx.textAlign = 'left';
      // Split groß
      ctx.font = font(800, 4.4 * u);
      const [sw, sf] = parts(sec(split));
      ctx.fillStyle = hi ? C.live : C.ink;
      const w1 = tab(ctx, sw, 0, 0, false);
      const sx = tx + 1.4 * u, sy = ty + th - 3.2 * u;
      ctx.font = font(800, 4.4 * u);
      tab(ctx, sw, sx, sy, true);
      ctx.font = font(800, 2.8 * u);
      tab(ctx, sf, sx + w1 + 0.15 * u, sy, true);
      // Rhythmus: Balkenlänge = Split im Verhältnis zum längsten Split
      const bx = tx + 1.4 * u, bwid = tw - 2.8 * u - tc * 0.4, bty = ty + th - 1.6 * u;
      ctx.fillStyle = 'rgba(237,237,230,.12)';
      ctx.fillRect(bx, bty, bwid, 0.34 * u);
      const f = i === 0 ? 1 : maxSplit ? split / maxSplit : 1;
      ctx.fillStyle = i === 0 ? C.ready : hi ? C.live : 'rgba(237,237,230,.7)';
      ctx.fillRect(bx, bty, Math.max(0.5 * u, bwid * f * a), 0.34 * u);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Vorschau ---------- */
  // Bühne im Seitenverhältnis des Videos, so groß wie der Platz erlaubt.
  function layout() {
    if (!S.w) return;
    const box = $('#vidStage'), fr = $('#vidFrame');
    const bw = box.clientWidth, bh = box.clientHeight;
    if (!bw || !bh) return;
    const s = Math.min(bw / S.w, bh / S.h);
    const w = Math.round(S.w * s), h = Math.round(S.h * s);
    fr.style.width = w + 'px'; fr.style.height = h + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    over.width = Math.round(w * dpr); over.height = Math.round(h * dpr);
    paint();
  }
  function paint() {
    if (!S.w) return;
    drawOverlay(over.getContext('2d'), over.width, over.height, video.currentTime);
    const sel = S.sel == null ? '' : '<b>' + (S.sel === 'beep' ? t('Start') : '#' + (S.sel + 1)) + '</b>';
    $('#vidClock').innerHTML = sel + sec(video.currentTime) + ' / ' + sec(S.dur) + ' s';
    placeHead();
  }
  let raf = 0;
  function loop() {
    paint();
    if (!video.paused && !video.ended) {
      followHead();
      raf = requestAnimationFrame(loop);
    } else raf = 0;
  }
  video.addEventListener('play', () => { setPlayIcon(true); if (!raf) raf = requestAnimationFrame(loop); });
  video.addEventListener('pause', () => setPlayIcon(false));
  video.addEventListener('ended', () => setPlayIcon(false));
  video.addEventListener('seeked', paint);
  video.addEventListener('loadeddata', paint);
  function setPlayIcon(playing) {
    $('#vidPlay').classList.toggle('playing', playing);
    $('#vidPlay').setAttribute('aria-label', playing ? t('Pause') : t('Abspielen'));
  }
  $('#vidPlay').onclick = () => {
    if (S.busy) return;
    resumeAudio();
    if (video.paused || video.ended) {
      if (video.ended || video.currentTime >= S.dur - 0.05) video.currentTime = 0;
      video.play().catch(() => {});
    } else video.pause();
  };
  const RATES = [1, 0.5, 0.25];
  $('#vidRate').onclick = () => {
    S.rateIdx = (S.rateIdx + 1) % RATES.length;
    video.playbackRate = RATES[S.rateIdx];
    $('#vidRate').textContent = String(RATES[S.rateIdx]).replace('.', api.DEC) + '×';
  };
  window.addEventListener('resize', () => { layout(); renderTrack(); });

  /* ---------- Tonspur ---------- */
  const innerW = () => inner.clientWidth || 1;
  const xOf = (time) => (time / (S.dur || 1)) * innerW();
  const tOf = (x) => clamp((x / innerW()) * S.dur, 0, S.dur);
  function renderTrack() {
    if (!S.w) return;
    const vw = track.clientWidth;
    if (!vw) return;
    S.zoom = clamp(S.zoom, 1, maxZoom());
    inner.style.width = Math.round(vw * S.zoom) + 'px';
    drawWave();
    renderMarks();
    placeHead();
  }
  function drawWave() {
    const w = innerW(), h = wave.clientHeight || 56;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cols = Math.min(16000, Math.round(w * dpr));
    wave.width = cols; wave.height = Math.round(h * dpr);
    const ctx = wave.getContext('2d'), H = wave.height, mid = H / 2;
    ctx.clearRect(0, 0, cols, H);
    if (!S.env) return;
    const env = S.env, n = env.length, msPerCol = n / cols;
    // Sekundenraster
    const pxs = cols / (S.dur || 1), step = pxs > 500 ? 0.1 : pxs > 40 ? 1 : 5;
    ctx.fillStyle = 'rgba(148,152,136,.16)';
    for (let k = 1; k * step < S.dur; k++) {
      const tt = k * step, major = step >= 1 || k % 10 === 0;
      ctx.fillRect(Math.round(tt * pxs), major ? 0 : H * 0.38, 1, major ? H : H * 0.24);
    }
    // Zwischen Signal und letztem Schuss: Welle in Akzentfarbe, Rest gedämpft.
    const a0 = S.beep != null ? (S.beep / S.dur) * cols : -1;
    const b0 = S.beep != null && S.shots.length ? (S.shots[S.shots.length - 1] / S.dur) * cols : a0;
    if (a0 >= 0) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(24,229,255,0)'); g.addColorStop(0.5, 'rgba(24,229,255,.12)'); g.addColorStop(1, 'rgba(24,229,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a0, 0, Math.max(1, b0 - a0), H);
    }
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim() || '#949888';
    const accent = css.getPropertyValue('--accent').trim() || '#18e5ff';
    for (let c = 0; c < cols; c++) {
      const a = Math.floor(c * msPerCol), b = Math.max(a + 1, Math.floor((c + 1) * msPerCol));
      let m = 0;
      for (let i = a; i < b && i < n; i++) if (env[i] > m) m = env[i];
      const v = Math.pow(m / S.envMax, 0.6) * (mid - 2 * dpr);
      const inStage = c >= a0 && c <= b0;
      ctx.fillStyle = inStage ? accent : muted;
      ctx.globalAlpha = inStage ? 0.85 : 0.5;
      ctx.fillRect(c, mid - v, 1, Math.max(1, v * 2));
    }
    ctx.globalAlpha = 1;
  }
  function renderMarks() {
    const box = $('#vidMarks');
    let html = '';
    // Dicht liegende Marker abwechselnd eine Reihe höher, damit jeder greifbar bleibt.
    let lastX = -1e9, up = false;
    if (S.beep != null) html += mark('beep', S.beep, 'S');
    S.shots.forEach((s, i) => { html += mark(i, s, String(i + 1)); });
    box.innerHTML = html;
    function mark(id, time, txt) {
      const sel = S.sel === id, x = xOf(time);
      up = x - lastX < 28 ? !up : false;
      lastX = x;
      return '<div class="vm' + (id === 'beep' ? ' beep' : '') + (sel ? ' sel' : '') + (up ? ' up' : '') + '" data-id="' + id + '" style="left:' + x.toFixed(1) + 'px"><b>' + txt + '</b></div>';
    }
  }
  function placeHead() {
    $('#vidHead').style.transform = 'translateX(' + xOf(video.currentTime).toFixed(1) + 'px)';
  }
  function followHead() {
    const x = xOf(video.currentTime), l = track.scrollLeft, w = track.clientWidth;
    if (x < l || x > l + w - 30) track.scrollLeft = x - w * 0.25;
  }
  const maxZoom = () => Math.max(1, (S.dur * MAX_PX_PER_S) / (track.clientWidth || 1));
  function zoomBy(f) {
    const z = clamp(S.zoom * f, 1, maxZoom());
    if (Math.abs(z - S.zoom) < 1e-3) return;
    S.zoom = z;
    renderTrack();
    const focus = S.sel != null ? markTime(S.sel) : video.currentTime;
    track.scrollLeft = xOf(focus) - track.clientWidth / 2;
  }
  $('#vidZoomIn').onclick = () => zoomBy(2);
  $('#vidZoomOut').onclick = () => zoomBy(0.5);
  // Nach dem Laden: Signal bis letzter Schuss füllen die Tonspur.
  function fitStage() {
    if (S.beep == null || !S.shots.length) return;
    const a = Math.max(0, S.beep - 0.6), b = Math.min(S.dur, S.shots[S.shots.length - 1] + 0.6);
    S.zoom = clamp(S.dur / (b - a), 1, maxZoom());
    renderTrack();
    track.scrollLeft = xOf(a);
  }

  // Antippen der Tonspur: dorthin springen.
  inner.addEventListener('click', (e) => {
    if (e.target.closest('.vm') || !S.dur) return;
    const r = inner.getBoundingClientRect();
    seek(tOf(e.clientX - r.left));
    select(null);
  });
  function seek(time) {
    video.currentTime = clamp(time, 0, S.dur);
    paint();
  }

  /* ---------- Marker bearbeiten ---------- */
  const markTime = (id) => (id === 'beep' ? S.beep : S.shots[id]);
  function setMark(id, time) {
    if (id === 'beep') S.beep = time;
    else S.shots[id] = time;
  }
  // Nach dem Verschieben sortieren; die Auswahl wandert mit.
  function sortShots() {
    if (S.sel == null || S.sel === 'beep') { S.shots.sort((a, b) => a - b); return; }
    const v = S.shots[S.sel];
    S.shots.sort((a, b) => a - b);
    S.sel = S.shots.indexOf(v);
  }
  function select(id) {
    S.sel = id;
    renderMarks();
    renderTools();
  }
  let drag = null;
  $('#vidMarks').addEventListener('pointerdown', (e) => {
    const m = e.target.closest('.vm');
    if (!m || S.busy) return;
    e.preventDefault();
    const id = m.dataset.id === 'beep' ? 'beep' : Number(m.dataset.id);
    video.pause();
    select(id);
    drag = { id, x: e.clientX, t0: markTime(id), el: $('#vidMarks .vm[data-id="' + id + '"]'), moved: false, seekAt: 0 };
    drag.el.setPointerCapture(e.pointerId);
    seek(drag.t0);
  });
  $('#vidMarks').addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 2) drag.moved = true;
    if (!drag.moved) return;
    const time = clamp(drag.t0 + (dx / innerW()) * S.dur, 0, S.dur);
    setMark(drag.id, time);
    drag.el.style.left = xOf(time).toFixed(1) + 'px';
    // Bild mitführen, damit man den Marker aufs Mündungsfeuer legen kann.
    const now = performance.now();
    if (now - drag.seekAt > 60) { drag.seekAt = now; video.currentTime = time; }
    paint();
    renderTools();
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) changed();
  };
  $('#vidMarks').addEventListener('pointerup', endDrag);
  $('#vidMarks').addEventListener('pointercancel', endDrag);

  function changed() {
    sortShots();
    drawWave();
    renderMarks();
    renderTools();
    renderSummary();
    if (S.sel != null) seek(markTime(S.sel));
    else paint();
  }
  function nudge(d) {
    if (S.sel == null) return;
    setMark(S.sel, clamp(markTime(S.sel) + d, 0, S.dur));
    changed();
  }
  holdRepeat($('#vidNudgeL'), () => nudge(-NUDGE));
  holdRepeat($('#vidNudgeR'), () => nudge(NUDGE));
  function holdRepeat(btn, fn) {
    let timer = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      const rep = (ms) => { timer = setTimeout(() => { fn(); rep(Math.max(40, ms * 0.8)); }, ms); };
      rep(380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // Tastatur
  }
  $('#vidAddShot').onclick = () => {
    if (!S.dur) return;
    video.pause();
    const time = video.currentTime;
    if (S.shots.some((s) => Math.abs(s - time) < 0.005)) return;
    S.shots.push(time);
    S.sel = S.shots.length - 1;
    changed();
  };
  $('#vidSetStart').onclick = () => {
    if (!S.dur) return;
    video.pause();
    S.beep = video.currentTime;
    S.sel = 'beep';
    changed();
  };
  $('#vidDel').onclick = () => {
    if (typeof S.sel !== 'number') return;
    S.shots.splice(S.sel, 1);
    S.sel = null;
    changed();
  };
  function renderTools() {
    const sel = S.sel;
    const has = sel != null;
    $('#vidNudgeL').disabled = $('#vidNudgeR').disabled = !has;
    $('#vidDel').disabled = typeof sel !== 'number';
    paint();
  }

  // Empfindlichkeit: erkennt die Schüsse neu (das Startsignal bleibt).
  let sensTimer = 0;
  $('#vidSens').addEventListener('input', (e) => {
    S.sens = Number(e.target.value);
    clearTimeout(sensTimer);
    sensTimer = setTimeout(async () => { await detect(false); changed(); fitStage(); }, 180);
  });

  function renderSummary() {
    const shots = S.shots, beep = S.beep;
    const box = $('#vidSum');
    if (beep == null || !shots.length) {
      box.innerHTML = '<span class="splits-empty">' + (S.pcm ? t('Keine Schüsse erkannt – Empfindlichkeit erhöhen oder mit + Schuss setzen.') : t('Ohne Tonspur: Start und Schüsse von Hand setzen.')) + '</span>';
      return;
    }
    let best = Infinity;
    for (let i = 1; i < shots.length; i++) best = Math.min(best, shots[i] - shots[i - 1]);
    let html = '<div class="chip first"><small>' + t('ZEIT') + '</small><b>' + sec(shots[shots.length - 1] - beep) + '</b></div>' +
      '<div class="chip"><small>' + t('SCHÜSSE') + '</small><b>' + shots.length + '</b></div>' +
      '<div class="chip"><small>' + t('ERSTER') + '</small><b>' + sec(shots[0] - beep) + '</b></div>';
    if (best < Infinity) html += '<div class="chip"><small>' + t('BESTER SPLIT') + '</small><b>' + sec(best) + '</b></div>';
    box.innerHTML = html;
  }
  function renderAll() {
    layout();
    renderTrack();
    renderTools();
    renderSummary();
    $('#vidSens').value = S.sens;
    $('#vidExport').disabled = !S.dur;
  }

  /* ---------- Ton der Vorschau und des Exports ----------
     Der Ton des Videos läuft über einen AudioContext, damit der Export ihn
     mitschneiden kann. Ein Video lässt sich nur einmal daran anschließen. */
  let ac = null, src = null;
  function audioGraph() {
    if (src) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      src = ac.createMediaElementSource(video);
      src.connect(ac.destination);
      return true;
    } catch (e) { return false; }
  }
  function resumeAudio() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); }

  /* ---------- Export ---------- */
  function pickMime() {
    if (!window.MediaRecorder) return null;
    const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  }
  $('#vidExport').onclick = () => { if (!S.busy && S.dur) openExport(); };
  function openExport() {
    const last = S.shots.length ? S.shots[S.shots.length - 1] : null;
    const canTrim = S.beep != null && last != null;
    $('#vidTrimRow').hidden = !canTrim;
    $('#vidExportSheet').hidden = false;
  }
  $('#vidExportCancel').onclick = () => { $('#vidExportSheet').hidden = true; };
  $('#vidTrim').onclick = (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  };
  $('#vidExportGo').onclick = () => {
    $('#vidExportSheet').hidden = true;
    // Noch innerhalb des Tippens: Ton und Wiedergabe freischalten. iOS
    // erlaubt play() später nur, wenn das Video einmal per Geste lief.
    if (audioGraph()) ac.resume().catch(() => {});
    const p = video.play();
    if (p && p.then) p.then(() => video.pause(), () => {});
    exportVideo();
  };
  $('#vidBusyCancel').onclick = () => { S.cancel = true; };

  async function exportVideo() {
    const mime = pickMime();
    const canvas = document.createElement('canvas');
    if (mime == null || !canvas.captureStream) { showToast(t('Export wird auf diesem Gerät nicht unterstützt.')); return; }
    const last = S.shots.length ? S.shots[S.shots.length - 1] : null;
    const trim = !$('#vidTrimRow').hidden && $('#vidTrim').classList.contains('on');
    const from = trim ? Math.max(0, S.beep - 2) : 0;
    const to = trim ? Math.min(S.dur, last + 2.5) : S.dur;
    const scale = Math.min(1, EXPORT_MAX / Math.max(S.w, S.h));
    const W = Math.round((S.w * scale) / 2) * 2, H = Math.round((S.h * scale) / 2) * 2;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, W, H);
      drawOverlay(ctx, W, H, video.currentTime, true);
    };

    S.busy = true; S.cancel = false;
    $('#vidBusyCancel').hidden = false;
    setBusy(t('Video wird erstellt …'), 0);
    keepAwake && keepAwake();
    video.pause();
    const rateBefore = video.playbackRate;
    video.playbackRate = 1;

    const stream = canvas.captureStream(30);
    let dest = null;
    if (audioGraph()) {
      await ac.resume().catch(() => {});
      dest = ac.createMediaStreamDestination();
      src.disconnect();
      src.connect(dest);
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, Object.assign(mime ? { mimeType: mime } : {}, { videoBitsPerSecond: 10e6, audioBitsPerSecond: 160e3 }));
    } catch (e) {
      rec = new MediaRecorder(stream);
    }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });

    let ok = false;
    try {
      video.currentTime = from;
      await new Promise((r) => { video.onseeked = () => { video.onseeked = null; r(); }; });
      drawFrame();
      // Erst aufnehmen, wenn das Video wirklich läuft – sonst landet die
      // Anlaufzeit nur in der Bildspur und Ton und Bild laufen versetzt.
      const playing = new Promise((r) => video.addEventListener('playing', r, { once: true }));
      await video.play();
      await playing;
      if (video.requestVideoFrameCallback) await new Promise((r) => video.requestVideoFrameCallback(r));
      drawFrame();
      rec.start(1000);
      await new Promise((resolve) => {
        const step = () => {
          if (S.cancel || video.ended || video.currentTime >= to) { resolve(); return; }
          drawFrame();
          setBusy(t('Video wird erstellt …'), (video.currentTime - from) / (to - from || 1));
          if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
          else requestAnimationFrame(step);
        };
        step();
        video.addEventListener('ended', resolve, { once: true });
      });
      video.pause();
      drawFrame();
      rec.stop();
      await stopped;
      ok = !S.cancel && chunks.length > 0;
    } catch (e) {
      try { rec.state !== 'inactive' && rec.stop(); } catch (_) {}
    }
    if (dest) { src.disconnect(); src.connect(ac.destination); }
    stream.getTracks().forEach((tr) => tr.stop());
    video.playbackRate = rateBefore;
    allowSleep && allowSleep();
    S.busy = false;
    $('#vidBusyCancel').hidden = true;
    setBusy(null);
    if (!ok) { if (!S.cancel) showToast(t('Export fehlgeschlagen.')); return; }
    const type = (rec.mimeType || mime || 'video/mp4').split(';')[0];
    const ext = type.includes('webm') ? 'webm' : 'mp4';
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const name = 'forth-trace-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.' + ext;
    S.result = { blob: new Blob(chunks, { type }), name, type };
    $('#vidDoneSize').textContent = (S.result.blob.size / 1048576).toFixed(1).replace('.', api.DEC) + ' MB';
    $('#vidDone').hidden = false;
  }

  /* Teilen bzw. Sichern. In der App über Filesystem + Share (Teilen-Menü
     mit „Video sichern“, Instagram usw.), im Browser über navigator.share
     oder als Download. */
  $('#vidDoneClose').onclick = () => { $('#vidDone').hidden = true; };
  $('#vidShare').onclick = async () => {
    const r = S.result;
    if (!r) return;
    const P = window.Capacitor && window.Capacitor.Plugins;
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    try {
      if (native && P.Filesystem && P.Share) {
        setBusy(t('Video wird vorbereitet …'));
        const buf = new Uint8Array(await r.blob.arrayBuffer());
        const CH = 3 * 1024 * 1024;
        for (let o = 0; o < buf.length; o += CH) {
          const data = b64(buf.subarray(o, Math.min(buf.length, o + CH)));
          const opt = { path: r.name, data, directory: 'CACHE' };
          if (o === 0) await P.Filesystem.writeFile(opt); else await P.Filesystem.appendFile(opt);
        }
        const { uri } = await P.Filesystem.getUri({ path: r.name, directory: 'CACHE' });
        setBusy(null);
        await P.Share.share({ files: [uri] });
        return;
      }
      const file = new File([r.blob], r.name, { type: r.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob);
      a.download = r.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      setBusy(null);
      if (e && e.name !== 'AbortError' && !/cancel/i.test(String(e && e.message))) showToast(t('Teilen fehlgeschlagen.'));
    }
  };
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // Vorschau im leeren Reiter: so sieht das fertige Video aus.
  const DEMO = { beep: 0, shots: [1.12, 1.41, 1.69, 2.33, 2.58, 3.04] };
  function drawDemo() {
    const cv = $('#vidDemo');
    if (!cv || $('#vidEmpty').hidden) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1d2422'); g.addColorStop(1, '#0b0d0c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Höhenlinien wie im Hintergrund der App
    ctx.strokeStyle = 'rgba(24,229,255,.07)'; ctx.lineWidth = Math.max(1, dpr);
    for (let k = 0; k < 9; k++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6 * dpr) {
        const y = H * (0.12 + k * 0.11) + Math.sin(x / W * 5.2 + k * 0.9) * H * 0.05 + Math.sin(x / W * 13 + k) * H * 0.012;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    drawOverlay(ctx, W, H, 3.3, true, DEMO);
  }
  window.addEventListener('resize', drawDemo);

  // Schrift für die Einblendung vorladen, danach die Vorschau zeichnen.
  if (document.fonts && document.fonts.load) document.fonts.load(font(800, 20)).then(drawDemo, () => {});

  return {
    // Beim Wechsel in den Reiter: Maße neu bestimmen, beim Verlassen anhalten.
    shown() { requestAnimationFrame(() => { layout(); renderTrack(); drawDemo(); }); },
    hidden() { video.pause(); },
    // Für Tests: Zustand und Zeichnen von außen.
    _state: S, _draw: drawOverlay
  };
};
