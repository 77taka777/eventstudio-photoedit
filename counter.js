/* Attendance counter. Every tap is logged as [unix seconds, delta] and saved at once,
   so a reload or a closed tab never loses the count. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);
  const MAX_EVENTS = 60000;
  const BUCKET = 30 * 60;

  const saved = ES.store.get('counter', {}) || {};
  const state = {
    capacity: Number.isFinite(saved.capacity) && saved.capacity > 0 ? Math.min(999999, Math.round(saved.capacity)) : 0,
    events: (Array.isArray(saved.events) ? saved.events : [])
      .filter(event => Array.isArray(event) && Number.isFinite(event[0]) && Number.isFinite(event[1]) && event[1] !== 0)
      .slice(-MAX_EVENTS)
      .map(event => [Math.round(event[0]), Math.round(event[1])])
  };
  const save = () => ES.store.set('counter', state);

  function totals() {
    let occupancy = 0;
    let totalIn = 0;
    let totalOut = 0;
    let peak = 0;
    for (const [, delta] of state.events) {
      occupancy += delta;
      if (delta > 0) totalIn += delta;
      else totalOut -= delta;
      if (occupancy > peak) peak = occupancy;
    }
    return { occupancy, totalIn, totalOut, peak };
  }
  function buckets() {
    const list = [];
    let occupancy = 0;
    let current = null;
    for (const [time, delta] of state.events) {
      /* Bucket on local wall-clock time. */
      const date = new Date(time * 1000);
      const key = Math.floor((time - date.getTimezoneOffset() * 60) / BUCKET);
      if (!current || current.key !== key) {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes() < 30 ? 0 : 30);
        current = { key, start, in: 0, out: 0, end: occupancy };
        list.push(current);
      }
      occupancy += delta;
      if (delta > 0) current.in += delta;
      else current.out -= delta;
      current.end = occupancy;
    }
    return list;
  }
  const bucketLabel = start => {
    const end = new Date(start.getTime() + BUCKET * 1000);
    return `${start.getMonth() + 1}/${start.getDate()} ${ES.format.clock(start, false)}〜${ES.format.clock(end, false)}`;
  };

  function render() {
    const total = totals();
    $('occupancy').textContent = total.occupancy.toLocaleString('ja');
    $('totalIn').textContent = total.totalIn.toLocaleString('ja');
    $('totalOut').textContent = total.totalOut.toLocaleString('ja');
    $('peak').textContent = total.peak.toLocaleString('ja');
    const main = $('main');
    main.classList.remove('level-busy', 'level-near', 'level-full');
    if (state.capacity > 0) {
      const rate = total.occupancy / state.capacity;
      $('meter').style.width = Math.min(100, rate * 100).toFixed(1) + '%';
      $('capRate').textContent = `${total.occupancy.toLocaleString('ja')} / ${state.capacity.toLocaleString('ja')}人（${Math.round(rate * 100)}%）`;
      let text = '余裕があります';
      if (rate >= 1) { text = total.occupancy > state.capacity ? `定員を${(total.occupancy - state.capacity).toLocaleString('ja')}人超えています` : '定員に達しました'; main.classList.add('level-full'); }
      else if (rate >= 0.9) { text = `まもなく定員（あと${(state.capacity - total.occupancy).toLocaleString('ja')}人）`; main.classList.add('level-near'); }
      else if (rate >= 0.7) { text = '混み合っています'; main.classList.add('level-busy'); }
      $('capState').textContent = text;
    } else {
      $('meter').style.width = '0';
      $('capRate').textContent = '';
      $('capState').textContent = '定員は未設定です';
    }
    $('out').disabled = total.occupancy <= 0;
    $('undo').disabled = state.events.length === 0;
    $('reset').disabled = $('exportSummary').disabled = $('exportLog').disabled = state.events.length === 0;

    const body = $('tableBody');
    body.textContent = '';
    const list = buckets();
    $('tableEmpty').hidden = list.length > 0;
    $('table').hidden = list.length === 0;
    for (const bucket of list.slice().reverse()) {
      const row = body.insertRow();
      row.insertCell().textContent = bucketLabel(bucket.start);
      row.insertCell().textContent = bucket.in.toLocaleString('ja');
      row.insertCell().textContent = bucket.out.toLocaleString('ja');
      row.insertCell().textContent = bucket.end.toLocaleString('ja');
    }
  }
  function add(delta) {
    const { occupancy } = totals();
    if (delta < 0 && occupancy + delta < 0) { ES.toast('会場にいる人数は0人です。'); return; }
    if (state.events.length >= MAX_EVENTS) { ES.toast('記録がいっぱいです。CSVで保存してから「0に戻して最初から」を押してください。'); return; }
    state.events.push([Math.floor(Date.now() / 1000), delta]);
    if (!save()) ES.toast('このブラウザに保存できませんでした。ページを閉じると数が消えます。');
    if (navigator.vibrate) navigator.vibrate(delta > 0 ? 12 : [8, 40, 8]);
    render();
  }
  function undo() {
    const last = state.events.pop();
    if (!last) return;
    save();
    render();
    ES.toast(`${last[1] > 0 ? '入場 +' + last[1] : '退場 ' + last[1]} を取り消しました。`);
  }

  $('in').addEventListener('click', () => add(1));
  $('out').addEventListener('click', () => add(-1));
  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => add(Number(button.dataset.add))));
  $('undo').addEventListener('click', undo);
  $('capacity').value = state.capacity || '';
  $('capacity').addEventListener('input', () => {
    const value = Math.round(Number($('capacity').value));
    state.capacity = Number.isFinite(value) && value > 0 ? Math.min(999999, value) : 0;
    save();
    render();
  });
  $('reset').addEventListener('click', async () => {
    const total = totals();
    if (!(await ES.confirm('カウントを0に戻しますか？', `入場の合計 ${total.totalIn}人、退場の合計 ${total.totalOut}人の記録が消えます。元に戻せないので、必要なら先にCSVで保存してください。`, '0に戻す'))) return;
    state.events = [];
    save();
    render();
  });
  $('exportSummary').addEventListener('click', () => {
    const table = [['時間帯', '入場', '退場', '終わりの在場'], ...buckets().map(bucket => [bucketLabel(bucket.start), bucket.in, bucket.out, bucket.end])];
    const total = totals();
    table.push(['合計', total.totalIn, total.totalOut, total.occupancy]);
    ES.download(`counter-summary-${ES.format.stamp()}.csv`, ES.toCsv(table), 'text/csv;charset=utf-8');
  });
  $('exportLog').addEventListener('click', () => {
    let occupancy = 0;
    const table = [['日時', '種別', '人数', '在場'], ...state.events.map(([time, delta]) => {
      occupancy += delta;
      return [new Date(time * 1000).toLocaleString('ja-JP'), delta > 0 ? '入場' : '退場', Math.abs(delta), occupancy];
    })];
    ES.download(`counter-log-${ES.format.stamp()}.csv`, ES.toCsv(table), 'text/csv;charset=utf-8');
  });
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    /* Arrow keys stay free for scrolling; only explicit keys count. */
    if (event.key === '+' || event.key === '=' || event.key === ';') { event.preventDefault(); add(1); }
    else if (event.key === '-') { event.preventDefault(); add(-1); }
    else if (event.key === 'Backspace') { event.preventDefault(); undo(); }
  });
  /* Another tab counting on the same device: keep both in step. */
  window.addEventListener('storage', event => {
    if (event.key !== 'eventstudio:v1:counter') return;
    const fresh = ES.store.get('counter', {}) || {};
    state.events = Array.isArray(fresh.events) ? fresh.events : [];
    state.capacity = Number(fresh.capacity) || 0;
    if (document.activeElement !== $('capacity')) $('capacity').value = state.capacity || '';
    render();
  });
  render();
})();
