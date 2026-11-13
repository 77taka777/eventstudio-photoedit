/* Rundown: a timetable that knows what time it is. Saved in this browser only. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const S = ES.schedule;
  const $ = id => document.getElementById(id);
  const rows = $('rows');
  const rowNodes = new Map();
  const MAX_OFFSET = 12 * 3600;

  const saved = ES.store.get('rundown', {}) || {};
  const data = {
    items: (Array.isArray(saved.items) ? saved.items : []).filter(item => item && typeof item === 'object').slice(0, 300).map(item => ({
      id: typeof item.id === 'string' && item.id ? item.id : ES.uid(),
      time: String(item.time ?? ''),
      title: String(item.title ?? ''),
      owner: String(item.owner ?? ''),
      note: String(item.note ?? '')
    })),
    offsetSec: Number.isFinite(saved.offsetSec) ? Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(saved.offsetSec))) : 0
  };
  const save = () => ES.store.set('rundown', data);
  const minutesOf = item => S.parseTime(item.time);

  function sortItems() {
    const keyed = data.items.map((item, index) => ({ item, index, min: minutesOf(item) }));
    keyed.sort((a, b) => {
      if (a.min === null && b.min === null) return a.index - b.index;
      if (a.min === null) return 1;
      if (b.min === null) return -1;
      return a.min - b.min || a.index - b.index;
    });
    data.items = keyed.map(entry => entry.item);
  }

  /* ---------- Rows ---------- */
  function field(className, name, value, label, placeholder) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.dataset.field = name;
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    return input;
  }
  function buildRow(item) {
    const row = document.createElement('div');
    row.className = 'rd-row';
    row.dataset.id = item.id;
    row.setAttribute('role', 'listitem');
    const time = field('rd-time', 'time', item.time, '開始時刻', '18:00');
    time.inputMode = 'numeric';
    time.maxLength = 8;
    const duration = document.createElement('span');
    duration.className = 'rd-dur';
    const title = field('rd-title', 'title', item.title, '内容', '内容');
    title.maxLength = 80;
    const owner = field('rd-owner', 'owner', item.owner, '担当', '担当');
    owner.maxLength = 40;
    const note = field('rd-note', 'note', item.note, 'メモ', 'メモ');
    note.maxLength = 120;
    const actions = document.createElement('div');
    actions.className = 'rd-actions';
    const start = document.createElement('button');
    start.type = 'button';
    start.dataset.act = 'start';
    start.textContent = 'いま開始';
    start.title = 'この行がいま始まった扱いにして、以降をずらします';
    const timer = document.createElement('a');
    timer.dataset.act = 'timer';
    timer.textContent = 'タイマー';
    timer.title = 'この行の長さでステージタイマーを開きます';
    timer.target = '_blank';
    timer.rel = 'noopener';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.act = 'delete';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', 'この行を削除');
    actions.append(start, timer, remove);
    row.append(time, duration, title, owner, note, actions);
    return row;
  }
  function renderRows() {
    rows.textContent = '';
    rowNodes.clear();
    for (const item of data.items) {
      const node = buildRow(item);
      rowNodes.set(item.id, node);
      rows.appendChild(node);
    }
    updateDerived();
  }
  /* Reorder existing nodes instead of rebuilding, so typing is never interrupted. */
  function syncOrder() {
    const active = document.activeElement;
    let cursor = rows.firstElementChild;
    for (const item of data.items) {
      const node = rowNodes.get(item.id);
      if (!node) continue;
      if (node !== cursor) rows.insertBefore(node, cursor);
      else cursor = cursor.nextElementSibling;
    }
    if (active && rows.contains(active) && document.activeElement !== active) active.focus();
    updateDerived();
  }
  function updateDerived() {
    const has = data.items.length > 0;
    $('empty').hidden = has;
    $('colhead').hidden = !has;
    data.items.forEach((item, index) => {
      const node = rowNodes.get(item.id);
      if (!node) return;
      const min = minutesOf(item);
      const nextMin = index + 1 < data.items.length ? minutesOf(data.items[index + 1]) : null;
      const length = min !== null && nextMin !== null ? nextMin - min : null;
      node.querySelector('.rd-dur').textContent = length !== null && length > 0 ? `${length}分` : '';
      const timer = node.querySelector('[data-act=timer]');
      if (length !== null && length > 0 && length <= 999) {
        timer.href = `timer.html?m=${length}&label=${encodeURIComponent(item.title.slice(0, 60))}`;
        timer.removeAttribute('aria-disabled');
        timer.tabIndex = 0;
      } else {
        timer.removeAttribute('href');
        timer.setAttribute('aria-disabled', 'true');
        timer.tabIndex = -1;
      }
      node.querySelector('[data-act=start]').disabled = min === null;
      const timeInput = node.querySelector('.rd-time');
      if (item.time.trim() && min === null) timeInput.setAttribute('aria-invalid', 'true');
      else timeInput.removeAttribute('aria-invalid');
    });
    tick();
  }
  function addRow() {
    if (data.items.length >= 300) { ES.toast('行は300までです。'); return; }
    const valid = data.items.filter(item => minutesOf(item) !== null);
    let minutes;
    if (valid.length) minutes = Math.min(47 * 60 + 59, minutesOf(valid[valid.length - 1]) + 30);
    else {
      const now = new Date();
      minutes = Math.min(23 * 60 + 55, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 5) * 5);
    }
    const item = { id: ES.uid(), time: S.formatTime(minutes), title: '', owner: '', note: '' };
    data.items.push(item);
    sortItems();
    save();
    const node = buildRow(item);
    rowNodes.set(item.id, node);
    rows.appendChild(node);
    syncOrder();
    node.querySelector('.rd-title').focus();
  }
  async function removeRow(id) {
    const item = data.items.find(entry => entry.id === id);
    if (!item) return;
    if (item.title.trim() && !(await ES.confirm('この行を削除しますか？', `${item.time}　${item.title}`, '削除する'))) return;
    data.items = data.items.filter(entry => entry.id !== id);
    rowNodes.get(id)?.remove();
    rowNodes.delete(id);
    save();
    updateDerived();
  }
  function startNow(id) {
    const item = data.items.find(entry => entry.id === id);
    const min = item ? minutesOf(item) : null;
    if (min === null) return;
    const now = new Date();
    let diff = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - min * 60;
    if (diff < -43200) diff += 86400;
    else if (diff > 43200) diff -= 86400;
    data.offsetSec = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, diff));
    save();
    tick();
    ES.toast(`「${item.title || item.time}」をいま開始にしました（${S.offsetLabel(data.offsetSec)}）。`);
  }
  function shift(seconds) {
    data.offsetSec = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, data.offsetSec + seconds));
    save();
    tick();
  }
  function resetOffset() { data.offsetSec = 0; save(); tick(); }

  rows.addEventListener('input', event => {
    const input = event.target;
    const row = input.closest('.rd-row');
    const item = row && data.items.find(entry => entry.id === row.dataset.id);
    if (!item || !input.dataset.field) return;
    item[input.dataset.field] = input.value;
    save();
    if (input.dataset.field !== 'time') updateDerived();
  });
  let orderTimer = 0;
  rows.addEventListener('focusout', event => {
    const input = event.target;
    if (!input.classList?.contains('rd-time')) return;
    const row = input.closest('.rd-row');
    const item = row && data.items.find(entry => entry.id === row.dataset.id);
    if (!item) return;
    const minutes = S.parseTime(input.value);
    if (minutes !== null) item.time = input.value = S.formatTime(minutes);
    sortItems();
    save();
    /* Let a pending click on a button finish before any row moves under the pointer. */
    const next = event.relatedTarget;
    clearTimeout(orderTimer);
    orderTimer = setTimeout(syncOrder, next && (next.tagName === 'BUTTON' || next.tagName === 'A') ? 300 : 0);
  });
  rows.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') { event.preventDefault(); event.target.blur(); }
  });
  rows.addEventListener('click', event => {
    const control = event.target.closest('[data-act]');
    const row = control?.closest('.rd-row');
    if (!row) return;
    if (control.dataset.act === 'delete') void removeRow(row.dataset.id);
    else if (control.dataset.act === 'start') startNow(row.dataset.id);
  });
  $('addRow').addEventListener('click', addRow);
  $('addRowTop').addEventListener('click', addRow);
  document.querySelectorAll('[data-shift]').forEach(button => button.addEventListener('click', () => shift(Number(button.dataset.shift))));
  $('offsetReset').addEventListener('click', resetOffset);
  $('stageOffsetReset').addEventListener('click', resetOffset);

  $('sample').addEventListener('click', async () => {
    if (data.items.length && !(await ES.confirm('サンプルに置き換えますか？', 'いま入力されている進行表は消えます。', '置き換える'))) return;
    const now = new Date();
    const base = Math.max(0, Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) * 30 - 30);
    const plan = [
      [0, 'スタッフ集合・最終確認', '全員', 'インカムのチャンネル確認'],
      [30, '開場・受付開始', '受付', 'BGMスタート'],
      [60, '開演・オープニング', 'MC', '客電を落とす'],
      [70, '基調講演', '登壇者', 'タイマー40分'],
      [110, '休憩', '', 'スライドショーを流す'],
      [125, 'パネルトーク', '登壇者', ''],
      [165, '抽選会', 'MC', '抽選ツールを全画面で'],
      [180, 'クロージング', 'MC', ''],
      [195, '終演・退場案内', '全員', 'サイネージを切り替え'],
      [225, '撤収開始', '全員', '']
    ];
    data.items = plan.map(([offset, title, owner, note]) => ({ id: ES.uid(), time: S.formatTime(base + offset), title, owner, note }));
    data.offsetSec = 0;
    save();
    renderRows();
    ES.toast('サンプルを入れました。時刻はいまの時間に合わせてあります。');
  });

  /* ---------- Live view ---------- */
  const shifted = (item, offsetSec) => S.formatTime(((item.min + Math.round(offsetSec / 60)) % 2880 + 2880) % 2880);
  function timeLabel(item, offsetSec) {
    const planned = S.formatTime(item.min);
    return Math.round(offsetSec / 60) ? `${shifted(item, offsetSec)}（予定 ${planned}）` : planned;
  }
  const stageElement = $('stage');
  const stage = ES.createStage(stageElement, {
    onBlackout(on) { $('blackoutBtn').textContent = on ? '暗転解除' : '暗転'; },
    onExit() { $('blackoutBtn').textContent = '暗転'; $('openMonitor').focus(); },
    onKey(event) {
      if (event.key === 'ArrowUp') { event.preventDefault(); shift(60); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); shift(-60); }
      else if (event.key === '0') resetOffset();
    }
  });
  function countdownClass(seconds) {
    if (seconds === null) return '';
    return seconds <= 10 ? 'now' : (seconds <= 60 ? 'soon' : '');
  }
  function tick() {
    const now = new Date();
    const live = S.live(data, now);
    const clock = ES.format.clock(now);
    const offsetText = S.offsetLabel(live.offsetSec);
    const late = Math.round(live.offsetSec / 60) > 0;
    let nowText = '—';
    let nextText = '—';
    let nextLabel = 'つぎ';
    let countText = '';
    if (live.status === 'before') {
      nowText = '開始前';
    } else if (live.current) {
      nowText = live.current.title || '（内容未入力）';
    }
    if (live.next) {
      nextText = live.next.title || '（内容未入力）';
      nextLabel = `つぎ　${timeLabel(live.next, live.offsetSec)}`;
      countText = ES.format.duration(Math.ceil(live.untilNextSec));
    } else if (live.status === 'last') {
      nextText = '最後の予定です';
    }
    const cls = countdownClass(live.next ? live.untilNextSec : null);
    const progress = live.progress === null ? '0' : (live.progress * 100).toFixed(1) + '%';

    $('liveClock').textContent = clock;
    $('liveNow').textContent = nowText;
    $('liveNext').textContent = nextText;
    $('liveNextLabel').textContent = nextLabel;
    $('liveCountdown').textContent = countText ? `あと ${countText}` : '';
    $('liveCountdown').className = 'rd-count num ' + cls;
    $('liveBar').style.width = progress;
    $('offsetLabel').textContent = offsetText;
    $('offsetLabel').classList.toggle('late', late);
    $('offsetReset').disabled = live.offsetSec === 0;

    const currentId = live.current?.id;
    const nextId = live.next?.id;
    data.items.forEach(item => {
      const node = rowNodes.get(item.id);
      if (!node) return;
      const position = live.items.findIndex(entry => entry.id === item.id);
      node.classList.toggle('is-now', item.id === currentId);
      node.classList.toggle('is-next', item.id === nextId);
      node.classList.toggle('is-past', position >= 0 && live.index >= 0 && position < live.index);
    });

    if (stage.isActive()) {
      $('stageEvent').textContent = (ES.store.get('event', {}) || {}).name || '進行モニター';
      $('stageClock').textContent = clock;
      $('stageNowLabel').textContent = live.current ? `いま　${timeLabel(live.current, live.offsetSec)}〜` : 'いま';
      $('stageNow').textContent = live.status === 'empty' ? '進行表がまだありません' : nowText;
      $('stageBar').style.width = progress;
      $('stageNextLabel').textContent = nextLabel;
      $('stageNext').textContent = nextText;
      $('stageCount').textContent = countText;
      $('stageCountLabel').textContent = countText ? 'あと' : '';
      $('stageCountBox').className = 'rd-stage-count ' + cls;
      const later = live.items.slice(live.index + 2, live.index + 5).map(item => `${shifted(item, live.offsetSec)} ${item.title || '（内容未入力）'}`);
      $('stageLater').textContent = later.length ? 'このあと　' + later.join('　／　') : '';
      $('stageOffset').textContent = offsetText;
      $('stageOffset').classList.toggle('late', late);
      $('stageOffsetReset').disabled = live.offsetSec === 0;
    }
  }
  $('openMonitor').addEventListener('click', () => { stage.enter(); tick(); });
  $('blackoutBtn').addEventListener('click', () => stage.blackout());
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());

  /* ---------- Save / load / print ---------- */
  const ioStatus = (text, error = false) => { $('ioStatus').textContent = text; $('ioStatus').classList.toggle('error', error); };
  $('exportCsv').addEventListener('click', () => {
    if (!data.items.length) { ioStatus('保存する予定がまだありません。', true); return; }
    const table = [['時刻', '内容', '担当', 'メモ'], ...data.items.map(item => [item.time, item.title, item.owner, item.note])];
    ES.download(`rundown-${ES.format.stamp()}.csv`, ES.toCsv(table), 'text/csv;charset=utf-8');
    ioStatus(`${data.items.length}行をCSVで保存しました。`);
  });
  $('importCsv').addEventListener('click', () => { $('csvInput').value = ''; $('csvInput').click(); });
  $('csvInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { ioStatus('ファイルが大きすぎます（2MBまで）。', true); return; }
    let text;
    try {
      const buffer = await file.arrayBuffer();
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch (_) { text = new TextDecoder('shift_jis').decode(buffer); /* Excel の「CSV」保存 */ }
    } catch (_) { ioStatus('ファイルを読み込めませんでした。', true); return; }
    let table = ES.parseCsv(text);
    if (table.length && S.parseTime(table[0][0]) === null) table = table.slice(1);
    const items = table.filter(cells => S.parseTime(cells[0]) !== null).slice(0, 300).map(cells => ({
      id: ES.uid(),
      time: S.formatTime(S.parseTime(cells[0])),
      title: String(cells[1] ?? '').trim().slice(0, 80),
      owner: String(cells[2] ?? '').trim().slice(0, 40),
      note: String(cells[3] ?? '').trim().slice(0, 120)
    }));
    if (!items.length) { ioStatus('読み込める行がありませんでした。1列目に「18:30」のような時刻を入れてください。', true); return; }
    if (data.items.length && !(await ES.confirm('進行表を置き換えますか？', `いまの${data.items.length}行を消して、ファイルの${items.length}行に置き換えます。`, '置き換える'))) return;
    data.items = items;
    data.offsetSec = 0;
    sortItems();
    save();
    renderRows();
    ioStatus(`${items.length}行を読み込みました。`);
  });
  $('print').addEventListener('click', () => {
    const table = $('printTable');
    table.textContent = '';
    const caption = table.createCaption();
    const eventName = (ES.store.get('event', {}) || {}).name;
    caption.textContent = (eventName ? eventName + '　' : '') + '進行表';
    const head = table.createTHead().insertRow();
    ['時刻', '長さ', '内容', '担当', 'メモ'].forEach(text => { const th = document.createElement('th'); th.textContent = text; head.appendChild(th); });
    const body = table.createTBody();
    data.items.forEach((item, index) => {
      const row = body.insertRow();
      const min = minutesOf(item);
      const nextMin = index + 1 < data.items.length ? minutesOf(data.items[index + 1]) : null;
      const length = min !== null && nextMin !== null && nextMin > min ? `${nextMin - min}分` : '';
      [item.time, length, item.title, item.owner, item.note].forEach(text => { row.insertCell().textContent = text; });
    });
    window.print();
  });
  $('clearAll').addEventListener('click', async () => {
    if (!data.items.length) return;
    if (!(await ES.confirm('進行表をすべて削除しますか？', '元に戻せません。必要なら先にCSVで保存してください。', '削除する'))) return;
    data.items = [];
    data.offsetSec = 0;
    save();
    renderRows();
    ioStatus('進行表を削除しました。');
  });

  sortItems();
  renderRows();
  setInterval(tick, 250);
})();
