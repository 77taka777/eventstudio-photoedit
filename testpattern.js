/* Display test patterns (drawn on a canvas at the screen's real pixel size)
   and speaker test tones (Web Audio; nothing is loaded from the network). */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);
  const FONT = '"Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, system-ui, sans-serif';

  /* ---------- Patterns ---------- */
  function label(ctx, text, x, y, size, color = '#fff', background = 'rgba(0,0,0,.78)', align = 'center') {
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const width = ctx.measureText(text).width;
    const left = align === 'center' ? x - width / 2 : (align === 'right' ? x - width : x);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(left - size * 0.5, y - size * 0.85, width + size, size * 1.7);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  const solid = color => (ctx, w, h) => { ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); };
  const PATTERNS = [
    { name: 'カラーバー', note: '色の出方と階調', swatch: 'linear-gradient(90deg,#fff 0 14%,#ff0 14% 28%,#0ff 28% 42%,#0f0 42% 57%,#f0f 57% 71%,#f00 71% 85%,#00f 85%)', draw(ctx, w, h) {
      const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
      const top = Math.round(h * 0.68);
      const middle = Math.round(h * 0.84);
      colors.forEach((color, i) => {
        const x0 = Math.round(w * i / colors.length);
        ctx.fillStyle = color;
        ctx.fillRect(x0, 0, Math.round(w * (i + 1) / colors.length) - x0, top);
      });
      for (let i = 0; i <= 10; i++) {
        const value = Math.round(255 * i / 10);
        const x0 = Math.round(w * i / 11);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x0, top, Math.round(w * (i + 1) / 11) - x0, middle - top);
      }
      const ramp = ctx.createLinearGradient(0, 0, w, 0);
      ramp.addColorStop(0, '#000');
      ramp.addColorStop(1, '#fff');
      ctx.fillStyle = ramp;
      ctx.fillRect(0, middle, w, h - middle);
    } },
    { name: 'グリッドと円', note: 'ゆがみ・ピント・四隅', swatch: 'repeating-linear-gradient(90deg,#000 0 6px,#fff 6px 7px)', draw(ctx, w, h, dpr) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const short = Math.min(w, h);
      const step = Math.max(8, Math.round(short / 12));
      const line = Math.max(1, Math.round(dpr));
      ctx.fillStyle = '#9aa3b0';
      for (let x = (w / 2) % step; x < w; x += step) ctx.fillRect(Math.round(x - line / 2), 0, line, h);
      for (let y = (h / 2) % step; y < h; y += step) ctx.fillRect(0, Math.round(y - line / 2), w, line);
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(w / 2 - line), 0, line * 2, h);
      ctx.fillRect(0, Math.round(h / 2 - line), w, line * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = line * 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, short * 0.45, 0, Math.PI * 2);
      ctx.stroke();
      const corner = short * 0.11;
      for (const [cx, cy] of [[corner * 1.25, corner * 1.25], [w - corner * 1.25, corner * 1.25], [corner * 1.25, h - corner * 1.25], [w - corner * 1.25, h - corner * 1.25]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, corner, 0, Math.PI * 2);
        ctx.stroke();
      }
      /* The outermost pixels: all four edges should be visible on the screen. */
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(0, 0, w, line);
      ctx.fillRect(0, h - line, w, line);
      ctx.fillRect(0, 0, line, h);
      ctx.fillRect(w - line, 0, line, h);
      label(ctx, `${w} × ${h} px`, w / 2, h / 2 - short * 0.09, short * 0.045);
      label(ctx, '赤い外枠が四辺とも見えていれば、画面全体が表示されています', w / 2, h / 2 + short * 0.09, Math.max(12 * dpr, short * 0.024));
    } },
    { name: 'グレースケール', note: '明るさ・コントラスト', swatch: 'linear-gradient(90deg,#000,#fff)', draw(ctx, w, h, dpr) {
      const top = Math.round(h * 0.6);
      for (let i = 0; i < 16; i++) {
        const value = Math.round(255 * i / 15);
        const x0 = Math.round(w * i / 16);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x0, 0, Math.round(w * (i + 1) / 16) - x0, top);
      }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, top, w / 2, h - top);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w / 2, top, w / 2, h - top);
      const size = Math.min(w / 16, (h - top) * 0.42);
      const y = top + (h - top) / 2 - size / 2;
      [2, 4, 6, 8, 10].forEach((percent, i) => {
        const value = Math.round(255 * percent / 100);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        const x = w * 0.25 + (i - 2.5) * size * 1.3 + size * 0.15;
        ctx.fillRect(x, y, size, size);
        label(ctx, `${percent}%`, x + size / 2, y + size + 14 * dpr, 11 * dpr, '#9aa3b0', null);
      });
      [90, 92, 94, 96, 98].forEach((percent, i) => {
        const value = Math.round(255 * percent / 100);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        const x = w * 0.75 + (i - 2.5) * size * 1.3 + size * 0.15;
        ctx.fillRect(x, y, size, size);
        label(ctx, `${percent}%`, x + size / 2, y + size + 14 * dpr, 11 * dpr, '#5b6472', null);
      });
      label(ctx, '黒の中の四角が見分けられるか', w * 0.25, top + 20 * dpr, 12 * dpr, '#c9d1dc', null);
      label(ctx, '白の中の四角が見分けられるか', w * 0.75, top + 20 * dpr, 12 * dpr, '#3d4654', null);
    } },
    { name: '白', note: 'ムラ・ドット欠け', swatch: '#fff', draw: solid('#fff') },
    { name: '黒', note: '光もれ・黒浮き', swatch: '#000', draw: solid('#000') },
    { name: '赤', note: '単色の確認', swatch: '#f00', draw: solid('#f00') },
    { name: '緑', note: '単色の確認', swatch: '#0f0', draw: solid('#0f0') },
    { name: '青', note: '単色の確認', swatch: '#00f', draw: solid('#00f') },
    { name: 'セーフエリア', note: '端が切れないか', swatch: 'radial-gradient(#26303f 0 55%,#ffd166 55% 62%,#101318 62%)', draw(ctx, w, h, dpr) {
      ctx.fillStyle = '#101318';
      ctx.fillRect(0, 0, w, h);
      const line = Math.max(1, Math.round(dpr * 1.5));
      const box = (ratio, color, text) => {
        const bw = w * ratio;
        const bh = h * ratio;
        ctx.strokeStyle = color;
        ctx.lineWidth = line;
        ctx.strokeRect((w - bw) / 2, (h - bh) / 2, bw, bh);
        label(ctx, text, w / 2, (h - bh) / 2 + 16 * dpr, 12 * dpr, color, '#101318');
      };
      box(1 - line / Math.min(w, h), '#ffffff', '100%（画面の端）');
      box(0.9, '#ffd166', '90%（大事なものはこの内側に）');
      box(0.8, '#7fd6ff', '80%（文字はこの内側が安全）');
      const guide = (ratioW, ratioH, text) => {
        let gw = w;
        let gh = w * ratioH / ratioW;
        if (gh > h) { gh = h; gw = h * ratioW / ratioH; }
        if (Math.abs(gw - w) < 2 && Math.abs(gh - h) < 2) return;
        ctx.setLineDash([10 * dpr, 8 * dpr]);
        ctx.strokeStyle = '#a8dfc7';
        ctx.lineWidth = line;
        ctx.strokeRect((w - gw) / 2 + line, (h - gh) / 2 + line, gw - line * 2, gh - line * 2);
        ctx.setLineDash([]);
        label(ctx, text, (w - gw) / 2 + gw * 0.5, h - (h - gh) / 2 - 18 * dpr, 12 * dpr, '#a8dfc7', '#101318');
      };
      guide(16, 9, '16:9');
      guide(4, 3, '4:3');
      ctx.fillStyle = '#fff';
      ctx.fillRect(w / 2 - 30 * dpr, h / 2 - line / 2, 60 * dpr, line);
      ctx.fillRect(w / 2 - line / 2, h / 2 - 30 * dpr, line, 60 * dpr);
    } },
    { name: '文字の見え方', note: '後ろの席から読めるか', swatch: 'linear-gradient(90deg,#fff 50%,#000 50%)', draw(ctx, w, h, dpr) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = '#000';
      ctx.fillRect(w / 2, 0, w / 2, h);
      const sizes = [12, 16, 20, 24, 32, 48, 72, 96];
      let y = 24 * dpr;
      for (const size of sizes) {
        const px = size * dpr;
        if (y + px * 1.5 > h) break;
        ctx.font = `600 ${px}px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const text = `${size}px 読めますか？ ABC 0123`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w / 2, h);
        ctx.clip();
        ctx.fillStyle = '#000';
        ctx.fillText(text, 24 * dpr, y);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(w / 2, 0, w / 2, h);
        ctx.clip();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, w / 2 + 24 * dpr, y);
        ctx.restore();
        y += px * 1.55;
      }
    } },
    { name: '動きの滑らかさ', note: 'カクつき・残像', swatch: 'linear-gradient(90deg,#000 0 40%,#fff 40% 50%,#000 50%)', animated: true, draw(ctx, w, h, dpr, time) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const bar = Math.max(8, w * 0.02);
      const x = ((time / 1000) * w * 0.5) % (w + bar) - bar;
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, 0, bar, h * 0.7);
      const count = 12;
      const active = Math.floor(time / 250) % count;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = i === active ? '#fff' : '#2a3340';
        ctx.fillRect(w * 0.1 + i * (w * 0.8 / count) + 4 * dpr, h * 0.78, w * 0.8 / count - 8 * dpr, h * 0.1);
      }
      label(ctx, '白い帯がなめらかに流れ、下の四角が一定のテンポで進めば正常です', w / 2, h * 0.94, Math.max(12 * dpr, h * 0.022), '#c9d1dc', null);
    } }
  ];

  const stageElement = $('stage');
  const canvas = $('canvas');
  const context2d = canvas.getContext('2d');
  let current = 0;
  let frame = 0;
  function paint(time = performance.now()) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(stageElement.clientWidth * dpr));
    const h = Math.max(1, Math.round(stageElement.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    context2d.setLineDash([]);
    PATTERNS[current].draw(context2d, w, h, dpr, time);
    $('stageName').textContent = `${current + 1} / ${PATTERNS.length}　${PATTERNS[current].name}`;
    $('stageSize').textContent = `${w} × ${h} px（表示倍率 ${Math.round(dpr * 100)}%）　← →：切り替え　Esc：戻る`;
  }
  function loop(time) {
    if (!stage.isActive() || !PATTERNS[current].animated) { frame = 0; return; }
    paint(time);
    frame = requestAnimationFrame(loop);
  }
  function show(index) {
    current = ((index % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
    cancelAnimationFrame(frame);
    frame = 0;
    paint();
    if (PATTERNS[current].animated) frame = requestAnimationFrame(loop);
  }
  const stage = ES.createStage(stageElement, {
    blackout: false,
    onExit() { cancelAnimationFrame(frame); frame = 0; $('patterns').querySelectorAll('button')[current]?.focus(); },
    onKey(event) {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); show(current + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    }
  });
  PATTERNS.forEach((pattern, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const swatch = document.createElement('i');
    swatch.style.background = pattern.swatch;
    const name = document.createElement('strong');
    name.textContent = pattern.name;
    const note = document.createElement('span');
    note.textContent = pattern.note;
    button.append(swatch, name, note);
    button.addEventListener('click', () => { stage.enter(); show(index); });
    $('patterns').appendChild(button);
  });
  $('prev').addEventListener('click', () => show(current - 1));
  $('next').addEventListener('click', () => show(current + 1));
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());
  const repaint = () => { if (stage.isActive()) paint(); };
  window.addEventListener('resize', repaint);
  document.addEventListener('fullscreenchange', () => setTimeout(repaint, 60));

  /* ---------- Test tones ---------- */
  const SOUND_NAMES = { 1000: '1kHz のサイン波', 440: '440Hz のサイン波', 100: '100Hz のサイン波（低音）', left: '左チャンネルだけ', right: '右チャンネルだけ', alternate: '左右を交互に', pink: 'ピンクノイズ' };
  let audio = null;
  let master = null;
  let playing = null;
  let alternateTimer = 0;
  const masterGain = () => (Number($('volume').value) / 100) ** 2 * 0.9;
  const soundStatus = (text, error = false) => { $('soundStatus').textContent = text; $('soundStatus').classList.toggle('error', error); };
  function stopSound() {
    clearInterval(alternateTimer);
    if (playing) {
      const { source, envelope, nodes } = playing;
      const now = audio.currentTime;
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(envelope.gain.value, now);
      envelope.gain.linearRampToValueAtTime(0, now + 0.04);
      try { source.stop(now + 0.06); } catch (_) { /* already stopped */ }
      setTimeout(() => nodes.forEach(node => { try { node.disconnect(); } catch (_) { /* gone */ } }), 200);
      playing = null;
    }
    $('sounds').querySelectorAll('[data-sound]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    $('stopSound').disabled = true;
    soundStatus('止まっています。');
  }
  function pinkBuffer() {
    const length = audio.sampleRate * 4;
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }
  function startSound(kind) {
    if (playing && playing.kind === kind) { stopSound(); return; }
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      audio = audio || new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      if (!master) {
        master = audio.createGain();
        master.gain.value = masterGain();
        master.connect(audio.destination);
      }
    } catch (_) {
      soundStatus('このブラウザでは音を出せませんでした。', true);
      return;
    }
    stopSound();
    const envelope = audio.createGain();
    const left = audio.createGain();
    const right = audio.createGain();
    const merger = audio.createChannelMerger(2);
    envelope.connect(left);
    envelope.connect(right);
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(master);
    let source;
    if (kind === 'pink') {
      source = audio.createBufferSource();
      source.buffer = pinkBuffer();
      source.loop = true;
    } else {
      source = audio.createOscillator();
      source.type = 'sine';
      source.frequency.value = /^\d+$/.test(kind) ? Number(kind) : 1000;
    }
    source.connect(envelope);
    left.gain.value = kind === 'right' ? 0 : 1;
    right.gain.value = kind === 'left' ? 0 : 1;
    const now = audio.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.04);
    source.start(now);
    playing = { kind, source, envelope, nodes: [source, envelope, left, right, merger] };
    $('sounds').querySelector(`[data-sound="${kind}"]`)?.setAttribute('aria-pressed', 'true');
    $('stopSound').disabled = false;
    soundStatus(`再生中：${SOUND_NAMES[kind]}`);
    if (kind === 'alternate') {
      let side = 'left';
      const apply = () => {
        left.gain.setTargetAtTime(side === 'left' ? 1 : 0, audio.currentTime, 0.01);
        right.gain.setTargetAtTime(side === 'left' ? 0 : 1, audio.currentTime, 0.01);
        soundStatus(`再生中：いま鳴っているのは【${side === 'left' ? '左' : '右'}】のスピーカー`);
      };
      apply();
      alternateTimer = setInterval(() => { side = side === 'left' ? 'right' : 'left'; apply(); }, 1500);
    }
  }
  $('sounds').addEventListener('click', event => {
    const button = event.target.closest('[data-sound]');
    if (button) startSound(button.dataset.sound);
  });
  $('stopSound').addEventListener('click', stopSound);
  $('volume').addEventListener('input', () => {
    $('volumeValue').textContent = `${$('volume').value}%`;
    if (master) master.gain.setTargetAtTime(masterGain(), audio.currentTime, 0.02);
  });
  window.addEventListener('pagehide', () => { if (playing) stopSound(); });
})();
