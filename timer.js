/* Stage timer. Time is always derived from timestamps, never from counting ticks. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);
  const DEFAULT_CUES = ['巻いてください', 'あと5分', 'あと1分', 'まとめに入ってください', 'マイクを近づけて', '質疑応答へ'];
  const clampInt = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && value !== '' && value !== null ? Math.min(max, Math.max(min, number)) : fallback;
  };

  const saved = ES.store.get('timer', {}) || {};
  const config = {
    mode: ['down', 'up', 'until'].includes(saved.mode) ? saved.mode : 'down',
    minutes: clampInt(saved.minutes, 0, 999, 15),
    seconds: clampInt(saved.seconds, 0, 59, 0),
    until: typeof saved.until === 'string' ? saved.until : '',
    label: typeof saved.label === 'string' ? saved.label.slice(0, 60) : '',
    warn: clampInt(saved.warn, 0, 3600, 180),
    danger: clampInt(saved.danger, 0, 3600, 60),
    overtime: saved.overtime !== false,
    sound: saved.sound === true,
    clock: saved.clock !== false,
    cues: DEFAULT_CUES.map((text, i) => (Array.isArray(saved.cues) && typeof saved.cues[i] === 'string' ? saved.cues[i].slice(0, 40) : text))
  };
  /* The rundown can hand over a duration: timer.html?m=20&label=... */
  const params = new URLSearchParams(window.location.search);
  if (params.has('m')) {
    config.mode = 'down';
    config.minutes = clampInt(params.get('m'), 0, 999, config.minutes);
    config.seconds = clampInt(params.get('s') ?? 0, 0, 59, 0);
    if (params.has('label')) config.label = String(params.get('label')).slice(0, 60);
  }
  const save = () => ES.store.set('timer', config);

  /* ---------- Session (what the clock is doing right now) ---------- */
  const session = { signature: '', mode: 'down', totalMs: 0, targetTs: 0, running: false, startedAt: 0, accumulated: 0, chimed: false };
  const signature = () => [config.mode, config.minutes, config.seconds, config.until].join('|');
  function untilTimestamp(text) {
    const minutes = ES.schedule.parseTime(text);
    if (minutes === null) return null;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes, 0, 0).getTime();
    /* A time more than 12 hours behind us means the next day (e.g. "00:30" set at 23:50). */
    return now.getTime() - target > 12 * 3600 * 1000 ? target + 24 * 3600 * 1000 : target;
  }
  function resetSession() {
    session.signature = signature();
    session.mode = config.mode;
    session.running = false;
    session.startedAt = 0;
    session.accumulated = 0;
    session.chimed = false;
    if (config.mode === 'down') session.totalMs = (config.minutes * 60 + config.seconds) * 1000;
    else if (config.mode === 'until') {
      session.targetTs = untilTimestamp(config.until) ?? Date.now();
      session.totalMs = Math.max(0, session.targetTs - Date.now());
      session.chimed = session.totalMs === 0;
    } else session.totalMs = 0;
  }
  const elapsedMs = () => session.accumulated + (session.running ? Date.now() - session.startedAt : 0);
  const remainingMs = () => (session.mode === 'until' ? session.targetTs - Date.now() : session.totalMs - elapsedMs());
  const sessionStarted = () => session.signature !== '' && (session.mode === 'until' || session.running || session.accumulated > 0);

  function view() {
    if (session.mode === 'up') {
      const elapsed = elapsedMs();
      return { text: ES.format.duration(elapsed / 1000), phase: 'normal', state: session.running ? '計測中' : (elapsed > 0 ? '一時停止中' : 'スタート待ち'), progress: null };
    }
    const remaining = remainingMs();
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      let phase = 'normal';
      if (config.danger && seconds <= config.danger) phase = 'danger';
      else if (config.warn && seconds <= config.warn) phase = 'warn';
      let state;
      if (session.mode === 'until') state = `${ES.schedule.formatTime(ES.schedule.parseTime(config.until) ?? 0)} まで`;
      else if (session.running) state = phase === 'normal' ? '' : '残りわずか';
      else state = elapsedMs() > 0 ? '一時停止中' : 'スタート待ち';
      return { text: ES.format.duration(seconds), phase, state, progress: session.totalMs > 0 ? Math.min(1, Math.max(0, 1 - remaining / session.totalMs)) : 0 };
    }
    if (config.overtime) {
      const over = Math.floor(-remaining / 1000);
      return { text: (over > 0 ? '+' : '') + ES.format.duration(over), phase: 'over', state: over > 0 ? '時間を過ぎています' : '時間です', progress: 1 };
    }
    return { text: '00:00', phase: 'over', state: '時間です', progress: 1 };
  }

  /* ---------- Sound ---------- */
  let audio = null;
  function primeAudio() {
    if (!config.sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      audio = audio || new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { audio = null; }
  }
  function chime() {
    if (!config.sound || !audio) return;
    const start = audio.currentTime + 0.05;
    [0, 0.45, 0.9].forEach((offset, i) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.4);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.42);
    });
  }

  /* ---------- Stage ---------- */
  const stageElement = $('stage');
  let cueIndex = -1;
  let cueTimer = 0;
  function clearCue() {
    cueIndex = -1;
    clearTimeout(cueTimer);
    $('cue').hidden = true;
    $('stageCues').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  }
  function showCue(index) {
    const text = (config.cues[index] || '').trim();
    if (!text) return;
    if (cueIndex === index) { clearCue(); return; }
    clearCue();
    cueIndex = index;
    $('cue').textContent = text;
    $('cue').hidden = false;
    $('stageCues').querySelector(`[data-cue="${index}"]`)?.setAttribute('aria-pressed', 'true');
    cueTimer = setTimeout(clearCue, 20000);
  }
  function toggleRun() {
    if (session.mode === 'until') return;
    primeAudio();
    if (session.running) {
      session.accumulated = elapsedMs();
      session.running = false;
    } else {
      if (session.mode === 'down' && !config.overtime && remainingMs() <= 0) return;
      session.startedAt = Date.now();
      session.running = true;
    }
    render();
  }
  function reset() {
    if (session.running) { ES.toast('動いているあいだはリセットできません。一時停止してからどうぞ。'); return; }
    resetSession();
    clearCue();
    render();
  }
  function adjust(deltaMs) {
    if (session.mode === 'up') return;
    if (session.mode === 'until') { session.targetTs += deltaMs; session.totalMs = Math.max(0, session.totalMs + deltaMs); }
    else session.totalMs = Math.max(0, session.totalMs + deltaMs);
    if (remainingMs() > 0) session.chimed = false;
    render();
  }
  const stage = ES.createStage(stageElement, {
    onBlackout(on) { $('blackoutBtn').textContent = on ? '暗転解除' : '暗転'; },
    onExit() { clearCue(); $('blackoutBtn').textContent = '暗転'; render(); $('open').focus(); },
    onKey(event) {
      const key = event.key;
      if (key === ' ') { event.preventDefault(); if (!event.repeat) toggleRun(); }
      else if (key.toLowerCase() === 'r') { if (!event.repeat) reset(); }
      else if (key === 'ArrowUp') { event.preventDefault(); adjust(60000); }
      else if (key === 'ArrowDown') { event.preventDefault(); adjust(-60000); }
      else if (key === '0') clearCue();
      else if (/^[1-6]$/.test(key)) { if (!event.repeat) showCue(Number(key) - 1); }
    }
  });

  let lastText = '';
  function render() {
    const now = view();
    /* Freeze at zero when overtime counting is off. */
    if (session.mode === 'down' && session.running && !config.overtime && remainingMs() <= 0) {
      session.accumulated = session.totalMs;
      session.running = false;
    }
    if (session.mode !== 'up' && sessionStarted() && !session.chimed && remainingMs() <= 0) {
      session.chimed = true;
      chime();
    }
    if (stage.isActive()) {
      const digits = $('digits');
      if (now.text !== lastText) {
        digits.textContent = now.text;
        digits.classList.toggle('mid', now.text.length === 6);
        digits.classList.toggle('long', now.text.length >= 7);
        lastText = now.text;
      }
      stageElement.classList.toggle('phase-warn', now.phase === 'warn');
      stageElement.classList.toggle('phase-danger', now.phase === 'danger');
      stageElement.classList.toggle('phase-over', now.phase === 'over');
      $('stageState').textContent = now.state;
      $('stageClock').textContent = config.clock ? ES.format.clock(new Date(), false) : '';
      $('bar').style.width = now.progress === null ? '0' : (now.progress * 100).toFixed(2) + '%';
      $('toggle').textContent = session.running ? '一時停止' : (elapsedMs() > 0 ? '再開' : 'スタート');
      $('toggle').disabled = session.mode === 'until';
      $('reset').disabled = session.mode === 'until';
      $('minus').disabled = $('plus').disabled = session.mode === 'up';
    }
    const status = $('sessionStatus');
    if (sessionStarted()) {
      const label = session.mode === 'up' ? '経過' : (now.phase === 'over' ? '超過' : '残り');
      status.textContent = `タイマーは${session.mode === 'until' || session.running ? '動いています' : '一時停止中です'}（${label} ${now.text}）。`;
      $('open').textContent = signature() === session.signature ? '表示に戻る' : '新しい時間で表示する';
      $('setupReset').hidden = session.mode === 'until' ? false : session.running;
    } else {
      status.textContent = '表示したあと、Space キーでスタートします。';
      $('open').textContent = '全画面で表示する';
      $('setupReset').hidden = true;
    }
  }

  /* ---------- Form ---------- */
  function syncPanels() {
    $('downPanel').hidden = config.mode !== 'down';
    $('untilPanel').hidden = config.mode !== 'until';
    $('upPanel').hidden = config.mode !== 'up';
  }
  function validate() {
    const status = $('formStatus');
    status.classList.remove('error');
    status.textContent = '';
    $('until').removeAttribute('aria-invalid');
    if (config.mode === 'down' && config.minutes * 60 + config.seconds <= 0) {
      status.textContent = '時間を1秒以上にしてください。';
      status.classList.add('error');
      return false;
    }
    if (config.mode === 'until' && ES.schedule.parseTime(config.until) === null) {
      status.textContent = '終了時刻を「15:30」の形で入力してください。';
      status.classList.add('error');
      $('until').setAttribute('aria-invalid', 'true');
      return false;
    }
    return true;
  }
  function buildCues() {
    const editor = $('cues');
    const bar = $('stageCues');
    editor.textContent = '';
    bar.textContent = '';
    config.cues.forEach((text, i) => {
      const row = document.createElement('label');
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 40;
      input.value = text;
      input.setAttribute('aria-label', `カンペ ${i + 1}`);
      input.addEventListener('input', () => {
        config.cues[i] = input.value;
        save();
        const button = bar.querySelector(`[data-cue="${i}"]`);
        button.textContent = `${i + 1}　${input.value.trim() || '（なし）'}`;
        button.disabled = !input.value.trim();
      });
      row.append(key, input);
      editor.appendChild(row);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cue = String(i);
      button.setAttribute('aria-pressed', 'false');
      button.textContent = `${i + 1}　${text.trim() || '（なし）'}`;
      button.disabled = !text.trim();
      button.addEventListener('click', () => showCue(i));
      bar.appendChild(button);
    });
  }

  document.querySelectorAll('input[name=mode]').forEach(radio => {
    radio.checked = radio.value === config.mode;
    radio.addEventListener('change', () => { if (radio.checked) { config.mode = radio.value; syncPanels(); save(); validate(); render(); } });
  });
  $('minutes').value = config.minutes;
  $('seconds').value = config.seconds;
  $('until').value = config.until;
  $('label').value = config.label;
  $('warn').value = String(config.warn);
  $('danger').value = String(config.danger);
  if ($('warn').selectedIndex < 0) $('warn').value = '180';
  if ($('danger').selectedIndex < 0) $('danger').value = '60';
  $('overtime').checked = config.overtime;
  $('sound').checked = config.sound;
  $('showClock').checked = config.clock;
  $('minutes').addEventListener('input', () => { config.minutes = clampInt($('minutes').value, 0, 999, 0); save(); validate(); render(); });
  $('seconds').addEventListener('input', () => { config.seconds = clampInt($('seconds').value, 0, 59, 0); save(); validate(); render(); });
  $('until').addEventListener('input', () => { config.until = $('until').value; save(); render(); });
  $('until').addEventListener('change', () => {
    const minutes = ES.schedule.parseTime($('until').value);
    if (minutes !== null) { config.until = $('until').value = ES.schedule.formatTime(minutes); save(); }
    validate();
    render();
  });
  $('label').addEventListener('input', () => { config.label = $('label').value; save(); $('stageLabel').textContent = config.label; });
  $('warn').addEventListener('change', () => { config.warn = Number($('warn').value); save(); });
  $('danger').addEventListener('change', () => { config.danger = Number($('danger').value); save(); });
  $('overtime').addEventListener('change', () => { config.overtime = $('overtime').checked; save(); });
  $('sound').addEventListener('change', () => { config.sound = $('sound').checked; save(); primeAudio(); });
  $('showClock').addEventListener('change', () => { config.clock = $('showClock').checked; save(); });
  $('presets').addEventListener('click', event => {
    const button = event.target.closest('button[data-min]');
    if (!button) return;
    config.minutes = Number(button.dataset.min);
    config.seconds = 0;
    $('minutes').value = config.minutes;
    $('seconds').value = 0;
    save();
    validate();
    render();
  });

  $('open').addEventListener('click', () => {
    if (!validate()) return;
    if (session.signature !== signature() || !sessionStarted()) resetSession();
    primeAudio();
    $('stageLabel').textContent = config.label;
    lastText = '';
    stage.enter();
    render();
  });
  $('setupReset').addEventListener('click', () => { session.running = false; resetSession(); session.signature = ''; render(); });
  $('toggle').addEventListener('click', toggleRun);
  $('reset').addEventListener('click', reset);
  $('minus').addEventListener('click', () => adjust(-60000));
  $('plus').addEventListener('click', () => adjust(60000));
  $('blackoutBtn').addEventListener('click', () => stage.blackout());
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());

  buildCues();
  syncPanels();
  render();
  setInterval(render, 200);
})();
