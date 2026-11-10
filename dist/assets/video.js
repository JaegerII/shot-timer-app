/* ============ Video-Analyse ============
   Stage-Video laden, Startsignal und Schüsse aus der Tonspur erkennen,
   Timer mit durchlaufenden Splits in einer wählbaren Ecke einblenden, Marker auf der Tonspur
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
  const EXPORT_MAX = 3840;      // längste Kante des exportierten Videos (bis 4K, sonst Originalgröße)
  const MAX_FILE = 1.5e9;       // größere Dateien sprengen den Speicher beim Dekodieren
  const NUDGE = 0.01;           // Schritt der Pfeiltasten in Sekunden
  const MAX_PX_PER_S = 600;      // stärkste Vergrößerung der Tonspur
  const FFT_N = 1024, HOP = 512; // Startsignal: Spektrum in ~21-ms-Fenstern

  const S = {
    file: null, url: null, dur: 0, w: 0, h: 0,
    pcm: null, rate: 48000, env: null, envMax: 1,
    beep: null, beepEnd: null, shots: [], sel: null,
    zoom: 1, sens: 50, rateIdx: 0, busy: false, cancel: false, result: null,
    corner: 'tl', pxs: 160, view: 0, muted: false,
    startMode: 'beep',   // 'beep': Startsignal · 'shot': der erste Schuss startet die Zeit (z. B. 1R1)
    cut: null,           // eigener Ausschnitt {a, b} in s, sonst automatisch die Stage
    res: 'orig'          // Export: 'orig', '1080' oder '720'
  };
  try {
    const c = localStorage.getItem('ft-video-corner'); if (c) S.corner = c;
    if (localStorage.getItem('ft-video-start') === 'shot') S.startMode = 'shot';
    const r = localStorage.getItem('ft-video-res'); if (r === '1080' || r === '720') S.res = r;
  } catch (e) {}
  const video = $('#vidEl'), over = $('#vidOver'), wave = $('#vidWave'), track = $('#vidTrack');

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
  $('#vidNew').onclick = () => { if (!S.busy) { api.closeModals(); $('#vidFile').click(); } };

  async function load(file) {
    if (S.busy) return;
    if (file.size > MAX_FILE) { showToast(t('Video zu groß – bitte vorher kürzen.')); return; }
    unload();
    S.file = file;
    S.url = URL.createObjectURL(file);
    $('#vidEmpty').hidden = true;
    $('#vidEdit').hidden = false;
    $('#vidNew').hidden = false;
    $('#vidExport').hidden = false;
    $('#vidClose').hidden = false;
    $('#videoSub').textContent = file.name || '';
    S.busy = true;
    setBusy(t('Video wird geladen …'));
    try {
      stage = 'video';
      diag = [(file.size / 1048576).toFixed(0) + 'MB', file.type || '?', (/\.(\w+)$/.exec(file.name || '') || [, '?'])[1]];
      try {
        await openSrc(S.url, 10000);
      } catch (e) {
        // iOS-App: WKWebView kann blob:-Adressen oft nicht als Video laden.
        // Dann das Video in den App-Cache kopieren und von dort öffnen.
        const src = await nativeCopy(file);
        if (!src) throw e;
        await openSrc(src, 20000);
      }
      S.dur = video.duration;
      S.w = video.videoWidth; S.h = video.videoHeight;
      layout();
      // Erstes Bild zeigen (iOS lädt sonst nichts, bis abgespielt wird).
      video.currentTime = Math.min(0.05, S.dur / 2);
      setBusy(t('Ton wird analysiert …'));
      await tick();
      stage = 'audio';
      let audio, trim = 0;
      const raw = await file.arrayBuffer();
      await toMemory(file, raw);
      try {
        audio = await decodeAudio(raw);
      } catch (e1) {
        // Safari dekodiert den Ton aus iPhone-.mov nicht direkt. Dann die
        // AAC-Spur selbst aus dem Container holen und als ADTS dekodieren.
        diag.push('D1');
        const a = mp4Adts(new Uint8Array(await file.arrayBuffer()));
        if (typeof a === 'string') { diag.push(a); throw new Error('audio'); }
        try { audio = await decodeAudio(a.data.slice().buffer); } catch (e2) { diag.push('D2'); throw new Error('audio'); }
        trim = a.trim;
      }
      S.rate = audio.sampleRate;
      S.pcm = mono(audio);
      if (trim > 0) S.pcm = S.pcm.subarray(Math.min(S.pcm.length - 1, Math.round(trim * S.rate)));
      S.env = envelope(S.pcm, S.rate);
      S.envMax = S.env.reduce((m, v) => (v > m ? v : m), 1e-6);
      await detect(true);
      await warmUp();
      S.busy = false;
      setBusy(null);
      S.view = 0;
      renderAll();
      fitStage();
      if (S.beep == null && S.startMode === 'beep') showToast(t('Kein Startsignal erkannt – setze den Start-Marker selbst.'));
    } catch (err) {
      S.busy = false;
      setBusy(null);
      const keinTon = stage === 'audio';
      if (keinTon && err && err.message !== 'audio') diag.push('A:' + String(err.name || err.message || err).slice(0, 40));
      showToast((keinTon ? t('Die Tonspur konnte nicht gelesen werden.') : t('Dieses Video kann nicht geöffnet werden.')) + ' [' + diag.join(' ') + ']');
      const el = document.getElementById('toast');
      if (el) { clearTimeout(el.t); el.t = setTimeout(() => el.classList.remove('show'), 10000); }
      if (!keinTon) unload(true);
      else { S.pcm = null; renderAll(); }
    }
  }

  /* Flüssige Wiedergabe auf dem iPhone: Safari liest ein Video aus der
     gewählten Datei stückweise nach und bleibt dabei kurz nach dem Start
     hängen. Bis 500 MB spielt die App deshalb aus dem Arbeitsspeicher
     (die Datei wird für den Ton ohnehin ganz gelesen) und lässt das Video
     einmal stumm anlaufen, damit Decoder und Puffer schon bereit sind. */
  async function toMemory(file, raw) {
    if (!S.url || S.url.slice(0, 5) !== 'blob:' || file.size > 500e6) return;
    const at = video.currentTime;
    const mem = URL.createObjectURL(new Blob([raw], { type: file.type || 'video/mp4' }));
    try {
      await openSrc(mem, 8000);
      URL.revokeObjectURL(S.url);
      S.url = mem;
    } catch (e) {
      URL.revokeObjectURL(mem);
      await openSrc(S.url, 8000).catch(() => {});
    }
    video.currentTime = at;
  }
  async function warmUp() {
    const was = video.muted, at = video.currentTime;
    video.muted = true;
    try {
      await video.play();
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {}
    video.pause();
    video.currentTime = at;
    video.muted = was;
    await new Promise((r) => { video.addEventListener('seeked', r, { once: true }); setTimeout(r, 1500); });
  }

  function openSrc(src, ms) {
    return new Promise((res, rej) => {
      let to = 0;
      const done = (ok, why) => {
        clearTimeout(to);
        if (!ok) diag.push((src.slice(0, 4) === 'blob' ? 'B' : 'F') + (why || (video.error ? video.error.code : '?')));
        video.onloadedmetadata = video.onerror = null;
        if (ok) res(); else rej(new Error('video'));
      };
      to = setTimeout(() => done(false, 'T'), ms);
      video.onloadedmetadata = () => done(true);
      video.onerror = () => done(false);
      video.src = src;
      video.load();
    });
  }

  let cacheName = null;
  let stage = 'video';

  function decodeAudio(buf) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ac = new Offline(1, 1, 48000);
    return new Promise((res, rej) => {
      const p = ac.decodeAudioData(buf, res, (e) => rej(e || new Error('decode')));
      if (p && p.then) p.then(res, (e) => rej(e || new Error('decode')));
    });
  }

  /* Holt die AAC-Tonspur aus einer MP4/MOV-Datei und baut daraus einen
     ADTS-Strom. Gibt {data, trim} zurück (trim = Vorlauf des Encoders in s,
     aus der Edit-Liste) oder einen kurzen Fehlercode als Text. */
  function mp4Adts(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const typ = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    function boxes(start, end) {
      const out = [];
      let o = start;
      while (o + 8 <= end) {
        let size = dv.getUint32(o), hdr = 8;
        if (size === 1) { size = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); hdr = 16; }
        else if (size === 0) size = end - o;
        if (size < hdr || o + size > end) break;
        out.push({ type: typ(o + 4), start: o + hdr, end: o + size });
        o += size;
      }
      return out;
    }
    const child = (b, t) => b && boxes(b.start, b.end).find((x) => x.type === t);
    const path = (b, ...ts) => ts.reduce((x, t) => child(x, t), b);
    const moov = boxes(0, u8.length).find((x) => x.type === 'moov');
    if (!moov) return 'M0';
    let trak = null;
    for (const tk of boxes(moov.start, moov.end)) {
      if (tk.type !== 'trak') continue;
      const h = path(tk, 'mdia', 'hdlr');
      if (h && typ(h.start + 8) === 'soun') { trak = tk; break; }
    }
    if (!trak) return 'M1';
    const mdhd = path(trak, 'mdia', 'mdhd');
    const scale = mdhd ? dv.getUint32(mdhd.start + (u8[mdhd.start] === 1 ? 20 : 12)) : 0;
    const stbl = path(trak, 'mdia', 'minf', 'stbl');
    const stsd = child(stbl, 'stsd');
    if (!stsd) return 'M2';
    const ent = stsd.start + 8;
    const fmt = typ(ent + 4);
    if (fmt !== 'mp4a') return 'F:' + fmt.trim();
    const sdEnd = ent + dv.getUint32(ent);
    // esds steckt je nach Version direkt im Eintrag oder in einer wave-Box.
    let es = -1;
    for (let o = ent + 28; o + 8 <= sdEnd; o++) {
      if (u8[o + 4] === 0x65 && typ(o + 4) === 'esds') { es = o + 12; break; }
    }
    let ch = dv.getUint16(ent + 24);
    let aot = 2, sfi = -1;
    if (es > 0) {
      let o = es;
      const len = () => { let n = 0; for (let i = 0; i < 4; i++) { const b = u8[o++]; n = (n << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return n; };
      const lim = Math.min(sdEnd, es + 200);
      while (o < lim) {
        const tag = u8[o++]; const l = len();
        if (tag === 0x03) { const fl = u8[o + 2]; o += 3; if (fl & 0x80) o += 2; if (fl & 0x40) o += 1 + u8[o]; if (fl & 0x20) o += 2; }
        else if (tag === 0x04) { o += 13; }
        else if (tag === 0x05) {
          aot = u8[o] >> 3;
          sfi = ((u8[o] & 7) << 1) | (u8[o + 1] >> 7);
          const c = (u8[o + 1] >> 3) & 15;
          if (c) ch = c;
          break;
        } else o += l;
      }
    }
    if (sfi < 0 || sfi > 12) {
      const rate = dv.getUint32(ent + 32) >>> 16;
      sfi = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350].indexOf(rate);
      if (sfi < 0) return 'R:' + rate;
    }
    if (aot === 5 || aot === 29) aot = 2;  // HE-AAC: Grundschicht als AAC-LC
    if (aot < 1 || aot > 4) return 'O:' + aot;
    // Probentabellen
    const stsz = child(stbl, 'stsz'), stsc = child(stbl, 'stsc');
    const stco = child(stbl, 'stco'), co64 = child(stbl, 'co64');
    if (!stsz || !stsc || !(stco || co64)) return 'M3';
    const fix = dv.getUint32(stsz.start + 4), n = dv.getUint32(stsz.start + 8);
    const size = (i) => fix || dv.getUint32(stsz.start + 12 + i * 4);
    const nc = dv.getUint32((stco || co64).start + 4);
    const chunk = (i) => co64
      ? dv.getUint32(co64.start + 8 + i * 8) * 4294967296 + dv.getUint32(co64.start + 12 + i * 8)
      : dv.getUint32(stco.start + 8 + i * 4);
    const ns = dv.getUint32(stsc.start + 4);
    let total = 0;
    for (let i = 0; i < n; i++) total += size(i) + 7;
    const out = new Uint8Array(total);
    let w = 0, si = 0;
    for (let e = 0; e < ns && si < n; e++) {
      const first = dv.getUint32(stsc.start + 8 + e * 12) - 1;
      const per = dv.getUint32(stsc.start + 12 + e * 12);
      const next = e + 1 < ns ? dv.getUint32(stsc.start + 8 + (e + 1) * 12) - 1 : nc;
      for (let c = first; c < next && si < n; c++) {
        let off = chunk(c);
        for (let k = 0; k < per && si < n; k++, si++) {
          const sz = size(si), fl = sz + 7;
          if (off + sz > u8.length) return 'M4';
          out[w] = 0xff; out[w + 1] = 0xf1;
          out[w + 2] = ((aot - 1) << 6) | (sfi << 2) | ((ch >> 2) & 1);
          out[w + 3] = ((ch & 3) << 6) | ((fl >> 11) & 3);
          out[w + 4] = (fl >> 3) & 0xff;
          out[w + 5] = ((fl & 7) << 5) | 0x1f;
          out[w + 6] = 0xfc;
          out.set(u8.subarray(off, off + sz), w + 7);
          w += fl; off += sz;
        }
      }
    }
    if (!w) return 'M5';
    // Encoder-Vorlauf aus der Edit-Liste, damit Ton und Bild synchron bleiben.
    let trim = 0;
    const elst = path(trak, 'edts', 'elst');
    if (elst && scale) {
      const v1 = u8[elst.start] === 1, cnt = dv.getUint32(elst.start + 4);
      for (let i = 0, o = elst.start + 8; i < cnt; i++, o += v1 ? 20 : 12) {
        const mt = v1 ? dv.getInt32(o + 8) * 4294967296 + dv.getUint32(o + 12) : dv.getInt32(o + 4);
        if (mt >= 0) { trim = mt / scale; break; }
      }
    }
    return { data: out.subarray(0, w), trim };
  }
  let diag = [];
  async function nativeCopy(file) {
    const C = window.Capacitor;
    const P = C && C.Plugins;
    if (!(C && C.isNativePlatform && C.isNativePlatform())) { diag.push('web'); return null; }
    if (!(P && P.Filesystem && C.convertFileSrc)) { diag.push('noFS'); return null; }
    try {
      if (cacheName) { try { await P.Filesystem.deleteFile({ path: cacheName, directory: 'CACHE' }); } catch (_) {} }
      const m = /\.(\w{2,4})$/.exec(file.name || '');
      cacheName = 'quelle-' + Date.now() + '.' + (m ? m[1].toLowerCase() : 'mov');
      const CH = 3 * 1024 * 1024;
      for (let o = 0; o < file.size; o += CH) {
        setBusy(t('Video wird geladen …'), o / file.size);
        const part = new Uint8Array(await file.slice(o, Math.min(file.size, o + CH)).arrayBuffer());
        const opt = { path: cacheName, data: b64(part), directory: 'CACHE' };
        if (o === 0) await P.Filesystem.writeFile(opt); else await P.Filesystem.appendFile(opt);
      }
      setBusy(t('Video wird geladen …'));
      const { uri } = await P.Filesystem.getUri({ path: cacheName, directory: 'CACHE' });
      return C.convertFileSrc(uri);
    } catch (e) { diag.push('C:' + String((e && e.message) || e).slice(0, 40)); return null; }
  }

  function unload(toEmpty) {
    video.pause();
    if (S.url) URL.revokeObjectURL(S.url);
    Object.assign(S, { file: null, url: null, pcm: null, env: null, beep: null, beepEnd: null, shots: [], sel: null, result: null, view: 0, cut: null });
    edit = null;
    cutting = null;
    video.removeAttribute('src');
    video.load();
    if (toEmpty) {
      $('#vidEmpty').hidden = false;
      $('#vidEdit').hidden = true;
      $('#vidNew').hidden = true;
      $('#vidExport').hidden = true;
      $('#vidClose').hidden = true;
      if ($('#vidSetModal').classList.contains('show')) api.closeModals();
      $('#vidExportSheet').hidden = true;
      $('#vidDone').hidden = true;
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
  function findShots(from, firstMin) {
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
      // Start per Schuss: der erste muss ein kräftiger Schuss sein, kein Hantieren.
      if (!own.length && firstMin && c.pk < ref * firstMin) continue;
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
    if (S.startMode === 'shot') {
      // Nur ab dem Anfang des Ausschnitts suchen: Geräusche davor zählen nicht.
      const all = findShots(S.cut ? S.cut.a : 0, 0.5);
      S.beep = all.length ? all[0] : null;
      S.beepEnd = null;
      S.shots = all.slice(1);
      S.sel = null;
      return;
    }
    if (withBeep) {
      const b = await findBeep();
      S.beep = b ? b.at : null;
      S.beepEnd = b ? b.end : null;
    }
    const from = S.beep == null ? 0 : Math.max(S.beepEnd || S.beep, S.beep + 0.12) + 0.02;
    S.shots = findShots(from);
    S.sel = null;
  }

  /* ---------- Einblendung ----------
     Ein halbtransparentes Feld in der gewählten Ecke: oben die große Zeit,
     darunter laufen die Schüsse mit Gesamtzeit und Split durch, am Ende die
     Kennzahlen. Der Rest des Videos bleibt frei. */
  function phaseAt(time, D) {
    const beep = D.beep, shots = D.shots;
    if (beep == null || time < beep) return { phase: 'ready', el: 0, n: 0 };
    let n = 0;
    while (n < shots.length && shots[n] <= time) n++;
    const last = shots.length ? shots[shots.length - 1] : null;
    if (last != null && time >= last) return { phase: 'done', el: last - beep, n };
    return { phase: 'go', el: time - beep, n };
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
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
  const CORNERS = ['tl', 'tr', 'bl', 'br'];

  function drawOverlay(ctx, W, H, time, keep, D, corner) {
    D = D || S;
    corner = corner || S.corner;
    // Start per Schuss: der Start-Schuss ist Schuss 1 und steht als #01 in der Liste.
    const shotStart = D.startMode === 'shot' && D.beep != null;
    if (shotStart) D = { beep: D.beep, shots: [D.beep].concat(D.shots) };
    if (!keep) ctx.clearRect(0, 0, W, H);
    if (D.beep == null && !D.shots.length) return;
    const u = Math.min(W, H) / 100;
    const st = phaseAt(time, D), shots = D.shots, beep = D.beep ?? 0;
    const acc = st.phase === 'ready' ? C.ready : C.live;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // --- Maße ---
    const pad = 2.4 * u, BIG = 11.5 * u, SMALL = 6 * u, ROW = 3.9 * u, RF = 2.7 * u;
    const K = Math.min(W > H ? 4 : 5, shots.length);          // sichtbare Zeilen
    const label = st.phase === 'ready' ? t('BEREIT') : st.phase === 'go' ? (st.n ? t('SCHUSS {0}', st.n) : t('LÄUFT')) : t('ZEIT');
    const [whole, frac] = parts(sec(st.el));
    let best = Infinity;
    for (let i = 1; i < shots.length; i++) best = Math.min(best, shots[i] - shots[i - 1]);
    // Breite immer mit den Kennzahlen vom Ende rechnen, damit das Feld nicht springt.
    const statsAll = shots.length
      ? [[t('Schüsse'), String(shots.length)]].concat(shotStart ? [] : [[t('Erster Schuss'), sec(shots[0] - beep)]], best < Infinity ? [[t('Bester Split'), sec(best)]] : [])
      : [];
    const stats = st.phase === 'done' ? statsAll : [];
    ctx.font = font(800, BIG);
    const ww = tab(ctx, '00', 0, 0, false);
    ctx.font = font(800, SMALL);
    const fw = tab(ctx, ',00', 0, 0, false);
    ctx.font = font(700, RF);
    const colN = ctx.measureText('#00').width, colV = tab(ctx, '00,00', 0, 0, false), colS = tab(ctx, '+0,00', 0, 0, false);
    const rowW = colN + colV + colS + 5 * u;
    const statW = statsAll.reduce((a, s) => {
      ctx.font = font(700, 1.55 * u);
      const l = spaced(ctx, s[0].toUpperCase(), 0, 0, 0.12 * u, false);
      ctx.font = font(800, 3 * u);
      return a + Math.max(l, tab(ctx, s[1], 0, 0, false));
    }, 0) + 2.6 * u * Math.max(0, statsAll.length - 1);
    const bw = Math.max(30 * u, ww + fw + 2 * pad + 4 * u, rowW + 2 * pad, statW + 2 * pad);
    const hHead = pad + 1.6 * u + 1.4 * u + 9 * u;               // Phase + Zeit bis Grundlinie
    // Liste wächst mit jedem Schuss, bis K Zeilen erreicht sind.
    const aNew = st.n ? ease((time - shots[st.n - 1]) / 0.18) : 1;
    const rows = st.n <= K ? Math.max(0, st.n - 1 + aNew) : K;
    const hList = rows > 0 ? 2 * u + rows * ROW : 0;
    const hStats = stats.length ? 2 * u + 1.6 * u + 1 * u + 3 * u : 0;
    const hBrand = 3 * u;
    const bh = hHead + hList + hStats + hBrand + pad - 0.6 * u;
    const m = 3 * u;
    const x = corner === 'tr' || corner === 'br' ? W - m - bw : m;
    const y = corner === 'bl' || corner === 'br' ? H - m - bh : m;

    // --- Hintergrund: leichter Verlauf am unteren Rand über die ganze Breite ---
    {
      const gh = H * 0.24;
      const g = ctx.createLinearGradient(0, H, 0, H - gh);
      g.addColorStop(0, 'rgba(0,0,0,.5)');
      g.addColorStop(0.5, 'rgba(0,0,0,.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - gh, W, gh);
    }
    // --- dazu ein weicher schwarzer Verlauf aus der Ecke, kein Kasten ---
    {
      const ox = corner === 'tr' || corner === 'br' ? W : 0;
      const oy = corner === 'bl' || corner === 'br' ? H : 0;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale((bw + m) * 1.9, (bh + m) * 1.9);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(0,0,0,.6)');
      g.addColorStop(0.45, 'rgba(0,0,0,.45)');
      g.addColorStop(0.75, 'rgba(0,0,0,.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    // Feiner, scharfer Schatten für helle Stellen; weichgezeichnete Schatten
    // je Ziffer würden den Export bremsen.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowOffsetY = Math.max(1, 0.18 * u);
    const L = x + pad, R = x + bw - pad;

    // Phase
    let cy = y + pad + 1.6 * u;
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(L + 0.6 * u, cy - 0.6 * u, 0.6 * u, 0, Math.PI * 2); ctx.fill();
    ctx.font = font(800, 1.8 * u);
    spaced(ctx, label, L + 2 * u, cy, 0.2 * u, true);

    // Zeit
    cy += 1.4 * u + 9 * u;
    ctx.fillStyle = st.phase === 'done' ? C.live : C.ink;
    ctx.font = font(800, BIG);
    const wd = tab(ctx, whole, L - 0.4 * u, cy, true);
    ctx.font = font(800, SMALL);
    tab(ctx, frac, L - 0.4 * u + wd + 0.2 * u, cy, true);

    // Schüsse: die letzten K, neue Zeile schiebt die Liste nach oben.
    if (rows > 0) {
      cy += 2 * u;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(L, cy - 0.6 * u, R - L, Math.max(1, 0.12 * u));
      const top = cy, listH = rows * ROW;
      const lastIdx = st.n - 1, a = aNew;
      const shift = st.n > K ? (1 - a) * ROW : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, top - 0.4 * u, bw, listH + 0.4 * u); ctx.clip();
      const first = Math.max(0, st.n - K - (shift > 0 ? 1 : 0));
      for (let i = first; i < st.n; i++) {
        const slot = i - Math.max(0, st.n - K);                  // 0 … K-1, -1 = rutscht hinaus
        const ry = top + (slot + 1) * ROW - 1.1 * u + shift;
        const nw = i === lastIdx, split = i ? shots[i] - shots[i - 1] : shots[0] - beep;
        ctx.globalAlpha = nw ? 0.25 + 0.75 * a : 1;
        ctx.font = font(700, RF);
        ctx.fillStyle = 'rgba(244,244,238,.55)';
        ctx.fillText('#' + String(i + 1).padStart(2, '0'), L, ry);
        ctx.fillStyle = nw ? C.live : C.ink;
        ctx.font = font(800, RF);
        ctx.textAlign = 'right';
        tabRight(ctx, sec(shots[i] - beep), L + colN + 2.5 * u + colV, ry);
        ctx.fillStyle = nw ? C.live : best < Infinity && i && Math.abs(split - best) < 1e-6 && st.phase === 'done' ? C.ready : 'rgba(244,244,238,.8)';
        ctx.font = font(700, RF);
        if (i || !shotStart) tabRight(ctx, (i ? '+' : '') + sec(split), R, ry);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      cy = top + listH;
    }

    // Kennzahlen am Ende
    if (stats.length) {
      cy += 2 * u;
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(L, cy - 0.6 * u, R - L, Math.max(1, 0.12 * u));
      const gap = stats.length > 1 ? (R - L - stats.reduce((acc2, s) => {
        ctx.font = font(700, 1.55 * u);
        const l = spaced(ctx, s[0].toUpperCase(), 0, 0, 0.12 * u, false);
        ctx.font = font(800, 3 * u);
        return acc2 + Math.max(l, tab(ctx, s[1], 0, 0, false));
      }, 0)) / (stats.length - 1) : 0;
      let cx = L;
      const ly = cy + 1.6 * u, vy = ly + 1 * u + 3 * u;
      stats.forEach((s, i) => {
        ctx.font = font(700, 1.55 * u);
        ctx.fillStyle = 'rgba(244,244,238,.55)';
        const l = spaced(ctx, s[0].toUpperCase(), cx, ly, 0.12 * u, true);
        ctx.font = font(800, 3 * u);
        ctx.fillStyle = i === 2 ? C.ready : C.ink;
        const v = tab(ctx, s[1], cx, vy, true);
        cx += Math.max(l, v) + gap;
      });
      cy = vy;
    }

    // Marke
    ctx.font = font(800, 1.3 * u);
    ctx.fillStyle = 'rgba(244,244,238,.45)';
    spaced(ctx, 'FORTH TRACE SHOT TIMER', L, y + bh - pad + 0.6 * u, 0.35 * u, true);
    ctx.restore();
  }
  // Rechtsbündig mit fester Ziffernbreite.
  function tabRight(ctx, text, xr, y) {
    const al = ctx.textAlign;
    ctx.textAlign = 'left';
    const w = tab(ctx, text, 0, 0, false);
    tab(ctx, text, xr - w, y, true);
    ctx.textAlign = al;
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
  // Angezeigte Zeit: beim Abspielen die des Videos, sonst die gewählte (das
  // Video springt beim Ziehen nur verzögert hinterher).
  const nowT = () => (video.paused ? S.view : video.currentTime);
  // 6,2 → „00:06,20“
  function clock(v) {
    v = Math.max(0, v);
    const m = Math.floor(v / 60), s = v - m * 60;
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0').replace('.', api.DEC);
  }
  function paint() {
    if (!S.w) return;
    const tm = nowT();
    drawOverlay(over.getContext('2d'), over.width, over.height, tm);
    $('#vidClock').textContent = clock(tm);
    $('#vidRemain').textContent = '-' + clock(S.dur - tm);
    $('#vidScrubKnob').style.left = (S.dur ? (tm / S.dur) * 100 : 0).toFixed(3) + '%';
    if (edit) renderEditBar();
    drawWave();
  }
  let raf = 0;
  function loop() {
    if (!video.paused && !video.ended) {
      S.view = video.currentTime;
      paint();
      raf = requestAnimationFrame(loop);
    } else { raf = 0; paint(); }
  }
  video.addEventListener('play', () => { setPlayIcon(true); if (!raf) raf = requestAnimationFrame(loop); });
  video.addEventListener('pause', () => { setPlayIcon(false); S.view = video.currentTime; paint(); });
  video.addEventListener('ended', () => setPlayIcon(false));
  video.addEventListener('loadeddata', paint);
  function setPlayIcon(playing) {
    $('#vidPlay').classList.toggle('playing', playing);
    $('#vidPlay').setAttribute('aria-label', playing ? t('Pause') : t('Abspielen'));
  }
  $('#vidPlay').onclick = () => {
    if (S.busy) return;
    resumeAudio();
    if (video.paused || video.ended) {
      if (video.ended || S.view >= S.dur - 0.05) seek(0, true);
      video.play().catch(() => {});
    } else video.pause();
  };
  const RATES = [1, 0.5, 0.25];
  function rateLabel() { return String(RATES[S.rateIdx].toFixed(RATES[S.rateIdx] < 1 ? 2 : 1)).replace('.', api.DEC) + '×'; }
  $('#vidRate').onclick = () => {
    S.rateIdx = (S.rateIdx + 1) % RATES.length;
    video.playbackRate = RATES[S.rateIdx];
    $('#vidRate').textContent = rateLabel();
  };
  // Ton der Vorschau; der Export nimmt den Ton immer mit.
  function setMute(m) {
    S.muted = m;
    if (gain) gain.gain.value = m ? 0 : 1;
    else video.muted = m;
    $('#vidMute').classList.toggle('off', m);
    $('#vidMute').setAttribute('aria-label', m ? t('Ton an') : t('Ton aus'));
  }
  $('#vidMute').onclick = () => setMute(!S.muted);
  window.addEventListener('resize', () => { layout(); drawWave(); });

  /* ---------- Tonspur ----------
     Die Linie in der Mitte ist die aktuelle Zeit, die Welle läuft darunter
     durch. Ziehen verschiebt die Zeit; im Bearbeiten-Modus wandert der
     gewählte Marker mit. Zwei Finger (oder Strg + Mausrad) zoomen. */
  const PXS_MIN = 25, PXS_MAX = 1200;
  let edit = null;               // { orig } solange ein Marker bearbeitet wird
  let hits = [];                 // Trefferflächen der Marker
  let col = {};                  // Farben aus dem Thema
  function readColors() {
    const css = getComputedStyle(document.documentElement);
    const g = (n, d) => css.getPropertyValue(n).trim() || d;
    col = { muted: g('--muted', '#949888'), accent: g('--accent', '#18e5ff'), text: g('--text', '#edede6'), faint: g('--faint', '#5a625b'), line: g('--line', 'rgba(237,237,230,.12)') };
  }
  const tw = () => track.clientWidth || 1;
  const xAt = (time) => tw() / 2 + (time - S.view) * S.pxs;
  const tAt = (x) => S.view + (x - tw() / 2) / S.pxs;
  function renderTrack() { drawWave(); renderDots(); }
  function drawWave() {
    const w = track.clientWidth, h = track.clientHeight;
    if (!w || !h || !S.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (wave.width !== W || wave.height !== H) { wave.width = W; wave.height = H; }
    const ctx = wave.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const RUL = 20, LAB = 22, mid = RUL + (h - RUL - LAB) / 2, amp = (h - RUL - LAB) / 2 - 4;
    const t0 = tAt(0), t1 = tAt(w);

    // Stage hinterlegen
    if (S.beep != null) {
      const last = S.shots.length ? S.shots[S.shots.length - 1] : S.beep;
      const a = Math.max(0, xAt(S.beep)), b = Math.min(w, xAt(last));
      if (b > a) { ctx.fillStyle = 'rgba(24,229,255,.07)'; ctx.fillRect(a, RUL, b - a, h - RUL - LAB); }
    }
    // Lineal mit Sekunden
    const step = S.pxs >= 500 ? 0.5 : S.pxs >= 110 ? 1 : S.pxs >= 50 ? 2 : 5;
    const sub = step / 5;
    ctx.font = '700 10px Montserrat, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let k = Math.max(0, Math.floor(t0 / sub)); k * sub <= Math.min(S.dur, t1); k++) {
      const tt = k * sub, x = Math.round(xAt(tt)) + 0.5, major = k % 5 === 0;
      ctx.fillStyle = major ? col.muted : col.faint;
      ctx.fillRect(x - 0.5, major ? RUL - 7 : RUL - 4, 1, major ? 7 : 4);
      if (major) ctx.fillText(String(+tt.toFixed(1)).replace('.', api.DEC) + 's', x, RUL - 9);
    }
    // Welle als feine Balken
    if (S.env) {
      const env = S.env, n = env.length, bar = 2;
      const stA = S.beep ?? Infinity, stB = S.shots.length ? S.shots[S.shots.length - 1] : stA;
      for (let x = 0; x < w; x += bar) {
        const ta = tAt(x), tb = tAt(x + bar);
        if (tb < 0 || ta > S.dur) continue;
        const a = Math.max(0, Math.floor(ta * 1000)), b = Math.min(n, Math.max(a + 1, Math.ceil(tb * 1000)));
        let m = 0;
        for (let i = a; i < b; i++) if (env[i] > m) m = env[i];
        const v = Math.max(0.5, Math.pow(m / S.envMax, 0.6) * amp);
        const inSt = ta >= stA && ta <= stB;
        ctx.fillStyle = inSt ? col.accent : col.muted;
        ctx.globalAlpha = inSt ? 0.9 : 0.55;
        ctx.fillRect(x, mid - v, 1.2, v * 2);
      }
      ctx.globalAlpha = 1;
    }
    // Ausschnitt: außerhalb abdunkeln, Grenzen als gelbe Klammern
    if (cutting || S.cut) {
      const r = range();
      const xa = xAt(r.a), xb = xAt(r.b), top = RUL, bot = h - LAB;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      if (xa > 0) ctx.fillRect(0, top, Math.min(w, xa), bot - top);
      if (xb < w) ctx.fillRect(Math.max(0, xb), top, w - Math.max(0, xb), bot - top);
      ctx.fillStyle = '#ffc83d';
      for (const [x, d] of [[xa, 1], [xb, -1]]) {
        if (x < -6 || x > w + 6) continue;
        ctx.fillRect(Math.round(x) - (d > 0 ? 0 : 3), top, 3, bot - top);
        ctx.fillRect(Math.round(x) - (d > 0 ? 0 : 9), top, 9, 3);
        ctx.fillRect(Math.round(x) - (d > 0 ? 0 : 9), bot - 3, 9, 3);
      }
    }
    // Marker als Pillen mit Zeit darunter
    hits = [];
    const marks = [];
    if (S.beep != null) marks.push({ id: 'beep', time: S.beep, txt: S.startMode === 'shot' ? '1' : 'S' });
    S.shots.forEach((s, i) => marks.push({ id: i, time: s, txt: String(i + 1 + (S.startMode === 'shot' ? 1 : 0)) }));
    const PW = 22, PH = 32;
    let lastX = -1e9, lastLab = -1e9, up = false;
    const draws = [];
    marks.forEach((m) => {
      const x = xAt(m.time);
      up = x - lastX < PW + 2 ? !up : false;
      lastX = x;
      if (x < -40 || x > w + 40) return;
      const sel = S.sel === m.id;
      const lab = sel || x - lastLab >= 46;
      if (lab) lastLab = x;
      draws.push({ m, x, y: mid + (sel ? 0 : up ? -PH * 0.55 : 0), sel, lab });
    });
    // Ausgewählter Marker zuletzt, damit er oben liegt.
    draws.sort((a, b) => (a.sel ? 1 : 0) - (b.sel ? 1 : 0));
    draws.forEach(({ m, x, y, sel, lab }) => {
      const beep = m.id === 'beep';
      const fill = beep ? '#ffc83d' : col.accent;
      ctx.globalAlpha = edit && !sel ? 0.4 : 1;
      rrect(ctx, x - PW / 2, y - PH / 2, PW, PH, PW / 2);
      if (sel) {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = fill; ctx.stroke();
      } else { ctx.fillStyle = fill; ctx.fill(); }
      ctx.fillStyle = sel ? fill : '#06171a';
      ctx.font = '900 ' + (m.txt.length > 2 ? 10 : 12) + 'px Montserrat, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.txt, x, y + 0.5);
      ctx.textBaseline = 'alphabetic';
      hits.push({ id: m.id, x0: x - PW / 2 - 4, x1: x + PW / 2 + 4, y0: y - PH / 2 - 6, y1: y + PH / 2 + 6, sel });
      // Zeit: Schuss ab Signal, Start als „Start“
      const label = beep ? t('Start') : sec(m.time - (S.beep ?? 0)) + 's';
      if (lab) {
        ctx.font = '700 10px Montserrat, system-ui, sans-serif';
        const lw = ctx.measureText(label).width + 10;
        const ly = h - LAB / 2 - 1;
        rrect(ctx, x - lw / 2, ly - 8, lw, 16, 5);
        ctx.fillStyle = sel ? fill : 'rgba(0,0,0,.25)'; ctx.fill();
        ctx.strokeStyle = sel ? fill : col.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = sel ? '#06171a' : col.muted;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, x, ly + 0.5);
        ctx.textBaseline = 'alphabetic';
      }
    });
    ctx.globalAlpha = 1;
    // Feste Mitte; im Bearbeiten-Modus mit Pfeilen auf den Marker
    const cx = Math.round(w / 2) + 0.5;
    ctx.fillStyle = col.text;
    ctx.fillRect(cx - 1, RUL, 2, h - RUL - LAB + 2);
    ctx.beginPath(); ctx.moveTo(cx - 6, RUL); ctx.lineTo(cx + 6, RUL); ctx.lineTo(cx, RUL + 7); ctx.closePath(); ctx.fill();
    if (edit) {
      const yb = h - LAB + 2;
      ctx.beginPath(); ctx.moveTo(cx - 6, yb); ctx.lineTo(cx + 6, yb); ctx.lineTo(cx, yb - 7); ctx.closePath(); ctx.fill();
    }
  }

  // Übersicht: ganze Länge mit Punkten für Start und Schüsse
  function renderDots() {
    let html = '';
    const p = (v) => (S.dur ? (v / S.dur) * 100 : 0).toFixed(3) + '%';
    if (S.beep != null) html += '<i class="beep" style="left:' + p(S.beep) + '"></i>';
    S.shots.forEach((s) => { html += '<i style="left:' + p(s) + '"></i>'; });
    $('#vidScrubDots').innerHTML = html;
  }

  // Zeit setzen: Ansicht sofort, Video gedrosselt hinterher.
  let seekAt = 0, seekTimer = 0;
  function seek(time, now) {
    S.view = clamp(time, 0, S.dur || 0);
    if (edit && S.sel != null) { setMark(S.sel, S.view); sortShots(); renderDots(); }
    const go = () => { seekAt = performance.now(); video.currentTime = S.view; };
    clearTimeout(seekTimer);
    if (now || performance.now() - seekAt > 70) go();
    else seekTimer = setTimeout(go, 70);
    paint();
  }

  // Ziehen, Antippen, Zoomen auf der Tonspur
  const ptrs = new Map();
  let gest = null;
  function hitAt(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const hh = hits[i];
      if (x >= hh.x0 && x <= hh.x1 && y >= hh.y0 && y <= hh.y1) return hh.id;
    }
    return null;
  }
  wave.addEventListener('pointerdown', (e) => {
    if (!S.dur || S.busy) return;
    e.preventDefault();
    try { wave.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs.set(e.pointerId, e.clientX);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gest = { pinch: true, d0: Math.max(10, Math.abs(a - b)), p0: S.pxs };
      return;
    }
    if (ptrs.size > 2) return;
    video.pause();
    closeAddMenu();
    const r = wave.getBoundingClientRect();
    gest = { x0: e.clientX, v0: S.view, moved: false, hit: hitAt(e.clientX - r.left, e.clientY - r.top), lx: e.clientX - r.left };
  });
  wave.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, e.clientX);
    if (!gest) return;
    if (gest.pinch) {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      S.pxs = clamp(gest.p0 * (Math.max(10, Math.abs(a - b)) / gest.d0), PXS_MIN, PXS_MAX);
      drawWave();
      return;
    }
    const dx = e.clientX - gest.x0;
    if (Math.abs(dx) > 4) gest.moved = true;
    if (gest.moved) seek(gest.v0 - dx / S.pxs);
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (!gest) return;
    if (gest.pinch) { if (!ptrs.size) gest = null; return; }
    const g = gest;
    gest = null;
    if (g.moved) { seek(S.view, true); return; }
    if (g.hit != null) { if (S.sel !== g.hit) startEdit(g.hit); return; }
    if (!edit) seek(tAt(g.lx), true);
  };
  wave.addEventListener('pointerup', endPtr);
  wave.addEventListener('pointercancel', endPtr);
  wave.addEventListener('wheel', (e) => {
    if (!S.dur) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { S.pxs = clamp(S.pxs * Math.exp(-e.deltaY * 0.01), PXS_MIN, PXS_MAX); drawWave(); return; }
    video.pause();
    seek(S.view + (e.deltaX || e.deltaY) / S.pxs);
  }, { passive: false });

  // Übersicht antippen oder ziehen
  const scrub = $('#vidScrub');
  let scrubbing = false;
  const scrubTo = (e) => {
    const r = scrub.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * S.dur);
  };
  scrub.addEventListener('pointerdown', (e) => {
    if (!S.dur || S.busy || edit) return;
    scrubbing = true; video.pause();
    try { scrub.setPointerCapture(e.pointerId); } catch (err) {}
    scrubTo(e);
  });
  scrub.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
  const endScrub = () => { if (scrubbing) { scrubbing = false; seek(S.view, true); } };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);

  // Nach dem Laden: Stage füllt die Tonspur, Ansicht auf dem Startsignal.
  function fitStage() {
    if (S.beep == null || !S.shots.length) { S.pxs = 160; renderTrack(); return; }
    // So weit hineinzoomen, dass typische Splits ihre Pille frei haben.
    const sp = S.shots.map((v, i) => v - (i ? S.shots[i - 1] : S.beep)).sort((a, b) => a - b);
    const med = sp[Math.floor(sp.length / 2)] || 0.3;
    const span = S.shots[S.shots.length - 1] - S.beep + 1.2;
    S.pxs = clamp(Math.max((tw() * 0.9) / span, 30 / med), 60, 400);
    seek(Math.max(0, S.beep + Math.min(1, (tw() * 0.3) / S.pxs)), true);
    renderTrack();
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
  function startEdit(id, isNew) {
    if (edit) commitEdit(true);
    video.pause();
    S.sel = id;
    edit = { orig: isNew ? null : markTime(id) };
    seek(markTime(id), true);
    renderTools();
  }
  function commitEdit(quiet) {
    if (!edit) return;
    edit = null; S.sel = null;
    if (!quiet) changed(); else { sortShots(); renderSummary(); renderDots(); }
  }
  function cancelEdit() {
    if (!edit) return;
    if (edit.orig == null) { deleteSel(); return; }       // neu gesetzt: wieder weg
    setMark(S.sel, edit.orig);
    sortShots();
    edit = null; S.sel = null;
    changed();
  }
  function deleteSel() {
    if (typeof S.sel !== 'number') { if (S.sel === 'beep' && edit && edit.orig == null) S.beep = null; else return; }
    else S.shots.splice(S.sel, 1);
    edit = null; S.sel = null;
    changed();
  }
  function changed() {
    sortShots();
    renderDots();
    renderTools();
    renderSummary();
    paint();
  }
  function renderEditBar() {
    const id = S.sel;
    $('#vidEditName').textContent = id === 'beep' ? t('Start') : t('Schuss {0}', id + 1 + (S.startMode === 'shot' ? 1 : 0)) + ' · ' + sec(S.shots[id] - (S.beep ?? 0)) + ' s';
    $('#vidEditTime').textContent = clock(markTime(id));
  }
  function renderTools() {
    const on = !!edit;
    $('#vidEditBar').hidden = !on;
    $('#vidCutBar').hidden = !cutting;
    $('#vidInfo').hidden = $('#vidScrubRow').hidden = $('#vidTransport').hidden = on || !!cutting;
    if (cutting) renderCutBar();
    $('#vidDel').disabled = !(typeof S.sel === 'number' || (S.sel === 'beep' && edit && edit.orig == null));
    if (on) renderEditBar();
    paint();
  }
  $('#vidOkEdit').onclick = () => commitEdit();
  $('#vidCancelEdit').onclick = cancelEdit;
  $('#vidDel').onclick = deleteSel;
  document.querySelectorAll('#vidNudges button').forEach((b) => {
    holdRepeat(b, () => { if (edit) seek(markTime(S.sel) + Number(b.dataset.nudge), true); });
  });
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
  // Springen: voriger/nächster Marker, eine Sekunde zurück/vor
  function allMarks() { return (S.beep != null ? [S.beep] : []).concat(S.shots).sort((a, b) => a - b); }
  $('#vidPrev').onclick = () => { video.pause(); const m = allMarks().filter((v) => v < S.view - 0.005); seek(m.length ? m[m.length - 1] : 0, true); };
  $('#vidNext').onclick = () => { video.pause(); const m = allMarks().find((v) => v > S.view + 0.005); seek(m != null ? m : S.dur, true); };
  holdRepeat($('#vidBack'), () => { video.pause(); seek(S.view - 1, true); });
  holdRepeat($('#vidFwd'), () => { video.pause(); seek(S.view + 1, true); });
  // „+“: Start oder Schuss an der Mitte setzen
  function closeAddMenu() { $('#vidAddMenu').hidden = true; $('#vidAdd').classList.remove('open'); }
  $('#vidAdd').onclick = (e) => {
    e.stopPropagation();
    if (!S.dur || S.busy) return;
    const open = $('#vidAddMenu').hidden;
    $('#vidAddMenu').hidden = !open;
    $('#vidAdd').classList.toggle('open', open);
  };
  $('#vidAddShot').onclick = () => {
    closeAddMenu();
    video.pause();
    const time = S.view;
    if (S.shots.some((s) => Math.abs(s - time) < 0.005)) return;
    if (edit) commitEdit(true);
    S.shots.push(time);
    S.shots.sort((a, b) => a - b);
    startEdit(S.shots.indexOf(time), true);
    renderDots(); renderSummary();
  };
  $('#vidSetStart').onclick = () => {
    closeAddMenu();
    video.pause();
    if (edit) commitEdit(true);
    const had = S.beep != null;
    const before = S.beep;
    S.beep = S.view;
    startEdit('beep', !had);
    if (had) edit.orig = before;
    renderDots(); renderSummary();
  };
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#vidAdd,#vidAddMenu')) closeAddMenu(); });

  // Empfindlichkeit: erkennt die Schüsse neu (das Startsignal bleibt).
  let sensTimer = 0;
  $('#vidSens').addEventListener('input', (e) => {
    S.sens = Number(e.target.value);
    $('#vidSensValue').textContent = S.sens + ' %';
    clearTimeout(sensTimer);
    sensTimer = setTimeout(async () => { await detect(false); changed(); fitStage(); }, 180);
  });

  // Ecke der Einblendung: oben links, oben rechts, unten links, unten rechts.
  function renderCorner() {
    // Ton- und Tempo-Knopf auf die andere Seite, damit sie die Einblendung nicht verdecken.
    $('#vidStage').classList.toggle('ov-top', S.corner === 'bl' || S.corner === 'br');
    document.querySelectorAll('#vidCorners button').forEach((b) => {
      const on = b.dataset.corner === S.corner;
      b.classList.toggle('on', on);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  $('#vidCorners').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-corner]');
    if (!b || S.busy) return;
    S.corner = CORNERS.includes(b.dataset.corner) ? b.dataset.corner : 'tl';
    try { localStorage.setItem('ft-video-corner', S.corner); } catch (err) {}
    renderCorner();
    paint();
    drawDemo();
  });
  renderCorner();
  $('#vidSettings').onclick = () => { if (!S.busy) { video.pause(); api.openModal('vidSetModal'); } };
  $('#vidSetClose').onclick = () => api.closeModals();
  document.querySelectorAll('#vidNudges button').forEach((b) => {
    const d = Number(b.dataset.nudge);
    b.querySelector('small').textContent = (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2).replace('.', api.DEC);
  });

  /* ---------- Schneiden ----------
     Ohne eigenen Ausschnitt gilt die Stage (2 s vor dem Start bis 2,5 s nach
     dem letzten Schuss). Anfang und Ende werden an der Mittellinie gesetzt. */
  let cutting = null;
  function autoRange() {
    const last = S.shots.length ? S.shots[S.shots.length - 1] : null;
    if (S.beep != null && last != null) return { a: Math.max(0, S.beep - 2), b: Math.min(S.dur, last + 2.5) };
    return { a: 0, b: S.dur };
  }
  function range() { return cutting ? { a: cutting.a, b: cutting.b } : S.cut || autoRange(); }
  function rangeText(r) { return clock(r.a) + ' – ' + clock(r.b) + ' · ' + sec(r.b - r.a) + ' s'; }
  function startCut(fromExport) {
    if (!S.dur || S.busy) return;
    if (edit) commitEdit(true);
    video.pause();
    const r = range();
    cutting = { a: r.a, b: r.b, fromExport: !!fromExport };
    renderTools();
    renderTrack();
    seek(clamp(S.view, r.a, r.b), true);
  }
  function endCut(ok) {
    if (!cutting) return;
    const c = cutting;
    cutting = null;
    if (ok) {
      const auto = autoRange();
      const full = c.a <= 0.01 && c.b >= S.dur - 0.01;
      S.cut = Math.abs(c.a - auto.a) < 0.005 && Math.abs(c.b - auto.b) < 0.005 ? null : full ? { a: 0, b: S.dur } : { a: c.a, b: c.b };
    }
    // Schneiden ändert nie die Marker: gesetzte, verschobene und gelöschte Schüsse bleiben so.
    renderTools();
    renderTrack();
    if (c.fromExport) openExport();
  }
  function renderCutBar() {
    $('#vidCutTime').textContent = clock(cutting.a) + ' – ' + clock(cutting.b);
    $('#vidCutLen').textContent = t('Länge {0} s', sec(cutting.b - cutting.a));
  }
  $('#vidCut').onclick = () => startCut(false);
  $('#vidRangeEdit').onclick = () => { $('#vidExportSheet').hidden = true; startCut(true); };
  $('#vidCutOk').onclick = () => endCut(true);
  $('#vidCutCancel').onclick = () => endCut(false);
  $('#vidCutA').onclick = () => { if (!cutting) return; cutting.a = clamp(S.view, 0, cutting.b - 0.3); renderCutBar(); renderTrack(); };
  $('#vidCutB').onclick = () => { if (!cutting) return; cutting.b = clamp(S.view, cutting.a + 0.3, S.dur); renderCutBar(); renderTrack(); };
  $('#vidCutAll').onclick = () => { if (!cutting) return; cutting.a = 0; cutting.b = S.dur; renderCutBar(); renderTrack(); };

  // Start: Signal oder erster Schuss (z. B. 1R1 ohne Piep).
  function renderStartMode() {
    document.querySelectorAll('#vidStartMode button').forEach((b) => {
      const on = b.dataset.mode === S.startMode;
      b.classList.toggle('on', on);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  $('#vidStartMode').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b || S.busy || b.dataset.mode === S.startMode) return;
    S.startMode = b.dataset.mode === 'shot' ? 'shot' : 'beep';
    try { localStorage.setItem('ft-video-start', S.startMode); } catch (err) {}
    renderStartMode();
    if (edit) commitEdit(true);
    if (S.pcm) { await detect(true); changed(); fitStage(); }
    else { renderSummary(); paint(); }
  });
  renderStartMode();

  // Zurück: Video schließen und zur Auswahl.
  $('#vidClose').onclick = () => {
    if (S.busy) return;
    if (edit) commitEdit(true);
    cutting = null;
    unload(true);
    renderTools();
  };

  function renderSummary() {
    const shots = S.shots, beep = S.beep, off = S.startMode === 'shot' ? 1 : 0;
    const cnt = $('#vidCount'), box = $('#vidSum');
    if (off) {
      const n = shots.length + (beep != null ? 1 : 0);
      cnt.textContent = t('{0} Schüsse erkannt', n) + (shots.length ? ' · ' + sec(shots[shots.length - 1] - beep) + ' s' : '');
      let best = Infinity;
      for (let i = 0; i < shots.length; i++) best = Math.min(best, shots[i] - (i ? shots[i - 1] : beep));
      box.innerHTML = '<i style="background:#ffc83d"></i>' + t('Start mit dem ersten Schuss') +
        (best < Infinity ? '<i style="background:var(--accent);margin-left:12px"></i>' + t('Bester Split') + ' <b>' + sec(best) + '</b>' : '');
      if (!n) box.textContent = S.pcm ? t('Keine Schüsse erkannt – Empfindlichkeit erhöhen oder mit + Schuss setzen.') : t('Ohne Tonspur: Start und Schüsse von Hand setzen.');
      return;
    }
    if (beep == null || !shots.length) {
      cnt.textContent = t('{0} Schüsse erkannt', shots.length);
      box.textContent = beep == null && shots.length ? t('Kein Startsignal erkannt – setze den Start-Marker selbst.')
        : S.pcm ? t('Keine Schüsse erkannt – Empfindlichkeit erhöhen oder mit + Schuss setzen.') : t('Ohne Tonspur: Start und Schüsse von Hand setzen.');
      return;
    }
    let best = Infinity;
    for (let i = 1; i < shots.length; i++) best = Math.min(best, shots[i] - shots[i - 1]);
    cnt.textContent = t('{0} Schüsse erkannt', shots.length) + ' · ' + sec(shots[shots.length - 1] - beep) + ' s';
    box.innerHTML = '<i style="background:#ffc83d"></i>' + t('Erster Schuss') + ' <b>' + sec(shots[0] - beep) + '</b>' +
      (best < Infinity ? '<i style="background:var(--accent)"></i>' + t('Bester Split') + ' <b>' + sec(best) + '</b>' : '');
  }
  function renderAll() {
    readColors();
    layout();
    renderTrack();
    renderTools();
    renderSummary();
    $('#vidSens').value = S.sens;
    $('#vidSensValue').textContent = S.sens + ' %';
    $('#vidRate').textContent = rateLabel();
    $('#vidExport').disabled = !S.dur;
  }


  /* ---------- Ton der Vorschau und des Exports ----------
     Der Ton des Videos läuft über einen AudioContext, damit der Export ihn
     mitschneiden kann. Ein Video lässt sich nur einmal daran anschließen. */
  let ac = null, src = null, gain = null;
  function audioGraph() {
    if (src) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      src = ac.createMediaElementSource(video);
      gain = ac.createGain();
      gain.gain.value = S.muted ? 0 : 1;
      video.muted = false;
      src.connect(gain);
      gain.connect(ac.destination);
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
  function resOptions() {
    const short = Math.min(S.w, S.h);
    const list = [{ id: 'orig', label: t('Original'), sub: short + 'p' }];
    if (short > 1080) list.push({ id: '1080', label: 'HD 1080p', sub: 'Full HD' });
    if (short > 720) list.push({ id: '720', label: 'HD 720p', sub: t('kleiner') });
    return list;
  }
  function renderRes() {
    const list = resOptions();
    if (!list.some((o) => o.id === S.res)) S.res = 'orig';
    $('#vidRes').innerHTML = list.map((o) => '<button type="button" role="radio" data-res="' + o.id + '" class="' + (o.id === S.res ? 'on' : '') +
      '" aria-checked="' + (o.id === S.res) + '">' + o.label + '<small>' + o.sub + '</small></button>').join('');
  }
  $('#vidRes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-res]');
    if (!b) return;
    S.res = b.dataset.res;
    try { localStorage.setItem('ft-video-res', S.res); } catch (err) {}
    renderRes();
  });
  function openExport() {
    const r = range();
    $('#vidRange').textContent = (S.cut ? '' : (S.beep != null && S.shots.length ? t('Stage') + ': ' : '')) + rangeText(r);
    renderRes();
    $('#vidExportSheet').hidden = false;
  }
  $('#vidExportCancel').onclick = () => { $('#vidExportSheet').hidden = true; };
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
    const rg = range();
    const from = rg.a, to = rg.b;
    const target = S.res === '720' ? 720 : S.res === '1080' ? 1080 : Infinity;
    const scale = Math.min(1, EXPORT_MAX / Math.max(S.w, S.h), target / Math.min(S.w, S.h));
    const W = Math.round((S.w * scale) / 2) * 2, H = Math.round((S.h * scale) / 2) * 2;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // Hohe Datenrate (≈ 0,3 Bit je Bildpunkt bei 30 Bildern/s), damit das
    // Ergebnis optisch nicht vom Original zu unterscheiden ist.
    const vbr = Math.round(clamp(W * H * 30 * 0.3, 12e6, 80e6));
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

    // Bis 60 Bilder/s: gezeichnet wird je Videobild, also mit der Bildrate des Originals.
    const stream = canvas.captureStream(60);
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
      rec = new MediaRecorder(stream, Object.assign(mime ? { mimeType: mime } : {}, { videoBitsPerSecond: vbr, audioBitsPerSecond: 256e3 }));
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
    if (dest) { src.disconnect(); src.connect(gain); }
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
    shown() { requestAnimationFrame(() => { readColors(); layout(); renderTrack(); drawDemo(); }); },
    hidden() { video.pause(); if (edit) commitEdit(); if (cutting) endCut(false); },
    // Für Tests: Zustand und Zeichnen von außen.
    _state: S, _draw: drawOverlay
  };
};
