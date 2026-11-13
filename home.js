/* Home: the live board (clock, rundown, headcount, checklist) and data backup. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);

  /* ---------- Event name ---------- */
  const readEvent = () => {
    const event = ES.store.get('event', {}) || {};
    return typeof event.name === 'string' ? event.name : '';
  };
  $('eventName').value = readEvent();
  $('eventName').addEventListener('input', () => ES.store.set('event', { name: $('eventName').value.slice(0, 60) }));

  /* ---------- Cached tool data (re-read on change, not on every tick) ---------- */
  let rundown = null;
  let counter = null;
  let checklist = null;
  function reload() {
    rundown = ES.store.get('rundown', null);
    counter = ES.store.get('counter', null);
    checklist = ES.store.get('checklist', null);
    if (document.activeElement !== $('eventName')) $('eventName').value = readEvent();
    renderCounter();
    renderChecklist();
    tick();
  }
  function number(text, unit) {
    const fragment = document.createDocumentFragment();
    const value = document.createElement('span');
    value.className = 'num';
    value.textContent = text;
    fragment.appendChild(value);
    if (unit) {
      const suffix = document.createElement('span');
      suffix.className = 'unit';
      suffix.textContent = unit;
      fragment.appendChild(suffix);
    }
    return fragment;
  }
  function renderCounter() {
    const events = counter && Array.isArray(counter.events) ? counter.events : [];
    const tile = $('tileCounter');
    const meter = $('tileCounterMeter');
    if (!events.length) {
      tile.classList.add('is-empty');
      $('tileCounterMain').textContent = '数えはじめる';
      $('tileCounterSub').textContent = 'いま会場にいる人数がここに出ます';
      meter.hidden = true;
      return;
    }
    let occupancy = 0;
    let totalIn = 0;
    for (const event of events) {
      const delta = Number(event[1]) || 0;
      occupancy += delta;
      if (delta > 0) totalIn += delta;
    }
    tile.classList.remove('is-empty');
    $('tileCounterMain').replaceChildren(number(occupancy.toLocaleString('ja'), '人が会場に'));
    const capacity = Number(counter.capacity) || 0;
    if (capacity > 0) {
      const rate = occupancy / capacity;
      $('tileCounterSub').textContent = `定員 ${capacity.toLocaleString('ja')}人の ${Math.round(rate * 100)}%`;
      meter.hidden = false;
      meter.className = 'board-meter' + (rate >= 0.9 ? ' alert' : (rate >= 0.7 ? ' warn' : ''));
      meter.firstElementChild.style.width = Math.min(100, rate * 100).toFixed(1) + '%';
    } else {
      $('tileCounterSub').textContent = `入場の合計 ${totalIn.toLocaleString('ja')}人`;
      meter.hidden = true;
    }
  }
  function renderChecklist() {
    const tile = $('tileChecklist');
    const meter = $('tileChecklistMeter');
    const lists = checklist && Array.isArray(checklist.lists) ? checklist.lists : null;
    if (!lists) {
      tile.classList.add('is-empty');
      $('tileChecklistMain').textContent = '確認をはじめる';
      $('tileChecklistSub').textContent = '準備から撤収までの項目を用意しています';
      meter.hidden = true;
      return;
    }
    let done = 0;
    let all = 0;
    for (const list of lists) {
      for (const item of (Array.isArray(list.items) ? list.items : [])) {
        all++;
        if (item.done) done++;
      }
    }
    tile.classList.remove('is-empty');
    $('tileChecklistMain').replaceChildren(number(`${done} / ${all}`, '完了'));
    $('tileChecklistSub').textContent = all === 0 ? '項目がまだありません' : (done === all ? 'すべて確認できました' : `あと ${all - done}項目`);
    meter.hidden = all === 0;
    meter.firstElementChild.style.width = all ? (done / all * 100).toFixed(1) + '%' : '0';
  }

  /* ---------- Clock and rundown (every tick) ---------- */
  function tick() {
    const now = new Date();
    $('boardDate').textContent = ES.format.dateLabel(now);
    $('boardClock').textContent = ES.format.clock(now, false);
    $('boardSeconds').textContent = ':' + ES.format.pad(now.getSeconds());

    const live = ES.schedule.live(rundown || {}, now);
    const tile = $('tileRundown');
    const offset = $('tileOffset');
    if (live.status === 'empty') {
      tile.classList.add('is-empty');
      $('tileRundownMain').textContent = '進行表をつくる';
      $('tileRundownSub').textContent = 'いまの演目と、次までの残り時間がここに出ます';
      offset.hidden = true;
      return;
    }
    tile.classList.remove('is-empty');
    const minutes = Math.round(live.offsetSec / 60);
    offset.hidden = minutes === 0;
    offset.textContent = ES.schedule.offsetLabel(live.offsetSec);
    offset.classList.toggle('early', minutes < 0);
    $('tileRundownMain').textContent = live.current ? (live.current.title || '（内容未入力）') : '開始前';
    const sub = $('tileRundownSub');
    if (live.next) {
      const start = ES.schedule.formatTime(((live.next.min + minutes) % 2880 + 2880) % 2880);
      const countdown = document.createElement('span');
      countdown.className = 'num';
      countdown.textContent = ES.format.duration(Math.ceil(live.untilNextSec));
      sub.replaceChildren(`つぎ ${start}　${live.next.title || '（内容未入力）'}　あと `, countdown);
    } else sub.textContent = '最後の予定です';
  }

  /* ---------- Backup ---------- */
  const status = (text, error = false) => { $('dataStatus').textContent = text; $('dataStatus').classList.toggle('error', error); };
  $('exportData').addEventListener('click', () => {
    const data = ES.store.exportAll();
    if (!Object.keys(data).length) { status('保存されているデータはまだありません。'); return; }
    const file = { app: 'event-studio', version: 1, exportedAt: new Date().toISOString(), data };
    ES.download(`event-studio-data-${ES.format.stamp()}.json`, JSON.stringify(file, null, 2), 'application/json');
    status('書き出しました。抽選の名前リストなど、入力した内容がそのまま入っています。取り扱いに注意してください。');
  });
  $('importData').addEventListener('click', () => { $('importInput').value = ''; $('importInput').click(); });
  $('importInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { status('ファイルが大きすぎます（8MBまで）。', true); return; }
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch (_) { status('読み込めませんでした。このサイトで書き出したファイルを選んでください。', true); return; }
    if (!parsed || parsed.app !== 'event-studio' || !parsed.data || typeof parsed.data !== 'object') {
      status('このサイトで書き出したファイルではないようです。', true);
      return;
    }
    const names = { event: 'イベント名', rundown: '進行表', timer: 'タイマーの設定', lottery: '抽選', counter: '来場の記録', checklist: 'チェックリスト', signage: 'サイネージ' };
    const found = ES.store.keys.filter(key => parsed.data[key] && typeof parsed.data[key] === 'object');
    if (!found.length) { status('読み込める内容がありませんでした。', true); return; }
    const message = `このファイルの内容（${found.map(key => names[key]).join('、')}）で、いまこの端末にある同じ項目を上書きします。`;
    if (!(await ES.confirm('ファイルから読み込みますか？', message, '読み込む'))) return;
    ES.store.importAll(parsed.data);
    reload();
    status(`${found.length}種類のデータを読み込みました。`);
  });
  $('clearData').addEventListener('click', async () => {
    if (!Object.keys(ES.store.exportAll()).length) { status('保存されているデータはまだありません。'); return; }
    if (!(await ES.confirm('この端末のデータをすべて削除しますか？', '進行表、チェックリスト、来場の記録、抽選、サイネージ、タイマーの設定、イベント名が消えます。元に戻せないので、必要なら先に「まとめて書き出す」で保存してください。', 'すべて削除する'))) return;
    ES.store.clearAll();
    $('eventName').value = '';
    reload();
    status('この端末のデータを削除しました。');
  });
  if (!ES.store.isPersistent()) status('このブラウザでは保存が使えません（プライベートモードなど）。ページを閉じると入力した内容は消えます。', true);

  window.addEventListener('storage', reload);
  window.addEventListener('pageshow', reload);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reload(); });
  reload();
  setInterval(tick, 250);
  setInterval(reload, 15000);
})();
