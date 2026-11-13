/* Lottery. Winners are chosen with the browser's cryptographic random source,
   before the reveal animation starts; the animation is decoration only. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);
  const MAX_RANGE = 100000;
  const MAX_NAMES = 20000;
  const int = (value, min, max, fallback) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && value !== '' && value !== null && value !== undefined ? Math.min(max, Math.max(min, number)) : fallback;
  };

  const saved = ES.store.get('lottery', {}) || {};
  const config = {
    source: saved.source === 'numbers' ? 'numbers' : 'names',
    names: typeof saved.names === 'string' ? saved.names.slice(0, 600000) : '',
    from: int(saved.from, 0, 999999, 1),
    to: int(saved.to, 0, 999999, 100),
    prize: typeof saved.prize === 'string' ? saved.prize.slice(0, 40) : '',
    count: int(saved.count, 1, 50, 1),
    spin: [0, 2, 4, 6].includes(saved.spin) ? saved.spin : 4,
    unique: saved.unique !== false
  };
  let history = (Array.isArray(saved.history) ? saved.history : [])
    .filter(record => record && Array.isArray(record.winners))
    .map(record => ({
      id: typeof record.id === 'string' ? record.id : ES.uid(),
      prize: String(record.prize ?? ''),
      winners: record.winners.map(String),
      at: Number(record.at) || Date.now(),
      source: record.source === 'numbers' ? 'numbers' : 'names'
    }));
  const save = () => ES.store.set('lottery', { ...config, history });
  let saveTimer = 0;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); save(); });

  /* ---------- Pool ---------- */
  function entries() {
    if (config.source === 'numbers') {
      if (config.to < config.from || config.to - config.from + 1 > MAX_RANGE) return [];
      const list = new Array(config.to - config.from + 1);
      for (let i = 0; i < list.length; i++) list[i] = String(config.from + i);
      return list;
    }
    return config.names.split(/\r?\n/).map(line => line.replace(/\t+/g, ' ').trim()).filter(Boolean).slice(0, MAX_NAMES);
  }
  function pool() {
    const all = entries();
    if (!config.unique) return all;
    const used = new Map();
    for (const record of history) {
      if (record.source !== config.source) continue;
      for (const winner of record.winners) used.set(winner, (used.get(winner) || 0) + 1);
    }
    if (!used.size) return all;
    const remaining = [];
    for (const entry of all) {
      const left = used.get(entry);
      if (left) used.set(entry, left - 1);
      else remaining.push(entry);
    }
    return remaining;
  }
  /* Unbiased integer in [0, max). */
  function secureInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buffer = new Uint32Array(1);
    do { window.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % max;
  }
  function pick(candidates, count) {
    const list = candidates.slice();
    for (let i = 0; i < count; i++) {
      const j = i + secureInt(list.length - i);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.slice(0, count);
  }

  /* ---------- Setup view ---------- */
  function sourceProblem() {
    if (config.source === 'numbers') {
      if (config.to < config.from) return 'おわりの番号を、はじめの番号以上にしてください。';
      if (config.to - config.from + 1 > MAX_RANGE) return '一度に扱える番号は10万件までです。範囲を狭めてください。';
      return '';
    }
    return entries().length ? '' : '抽選する名前を1件以上入力してください。';
  }
  function updateInfo() {
    const all = entries();
    const remaining = pool();
    const lines = config.names.split(/\r?\n/).filter(line => line.trim()).length;
    $('namesCount').textContent = lines > MAX_NAMES ? `${MAX_NAMES.toLocaleString('ja')}件（上限。これより後ろの行は使いません）` : `${lines.toLocaleString('ja')}件`;
    const problem = sourceProblem();
    $('sourceStatus').textContent = config.source === 'numbers' || config.names.trim() ? problem : '';
    $('sourceStatus').classList.toggle('error', Boolean(problem));
    $('poolInfo').textContent = all.length
      ? (config.unique ? `残り ${remaining.length.toLocaleString('ja')}件 / 全 ${all.length.toLocaleString('ja')}件` : `全 ${all.length.toLocaleString('ja')}件（当選後も対象に残します）`)
      : '';
    $('stageFoot').textContent = config.unique ? `残り ${remaining.length.toLocaleString('ja')}件` : `全 ${all.length.toLocaleString('ja')}件から抽選`;
    $('undo').disabled = $('stageUndo').disabled = $('clear').disabled = $('exportCsv').disabled = history.length === 0;
  }
  function renderHistory() {
    const list = $('history');
    list.textContent = '';
    $('historyEmpty').hidden = history.length > 0;
    history.forEach((record, index) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'n';
      number.textContent = `${index + 1}回目`;
      const prize = document.createElement('span');
      prize.className = 'prize';
      prize.textContent = record.prize || '—';
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = record.winners.join('、');
      const time = document.createElement('time');
      time.textContent = ES.format.clock(new Date(record.at), false);
      item.append(number, prize, who, time);
      list.appendChild(item);
    });
  }
  function syncPanels() {
    $('namesPanel').hidden = config.source !== 'names';
    $('numbersPanel').hidden = config.source !== 'numbers';
  }

  /* ---------- Stage ---------- */
  const stageElement = $('stage');
  const box = $('box');
  const reel = $('reel');
  let spinning = false;
  let spinToken = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function fit() {
    if (!stage.isActive()) return;
    const isList = Boolean(reel.querySelector('ul'));
    const idle = reel.classList.contains('is-idle');
    ES.fitText(box, reel, box.clientHeight * (idle ? 0.16 : (isList ? 0.34 : 0.74)), 14);
  }
  function showIdle() {
    reel.className = 'lot-reel single is-idle';
    reel.textContent = pool().length ? 'Space キーで抽選' : '対象が残っていません';
    fit();
  }
  function showWinners(winners) {
    reel.textContent = '';
    if (winners.length === 1) {
      reel.className = 'lot-reel is-win' + (winners[0].length <= 16 ? ' single' : '');
      reel.textContent = winners[0];
    } else {
      reel.className = 'lot-reel is-win';
      const list = document.createElement('ul');
      /* Even columns read better on a big screen than a ragged wrap. */
      const columns = winners.length <= 3 ? 1 : (winners.length <= 10 ? 2 : (winners.length <= 24 ? 3 : 4));
      list.style.gridTemplateColumns = `repeat(${columns}, auto)`;
      for (const winner of winners) {
        const item = document.createElement('li');
        item.textContent = winner;
        list.appendChild(item);
      }
      reel.appendChild(list);
    }
    fit();
  }
  function spinAnimation(candidates, total, token) {
    return new Promise(resolve => {
      /* Size the type once for the longest entry so it does not jump while spinning. */
      const longest = candidates.reduce((a, b) => (b.length > a.length ? b : a), '');
      reel.className = 'lot-reel single is-spinning';
      reel.textContent = longest;
      ES.fitText(box, reel, box.clientHeight * 0.6, 14);
      const start = performance.now();
      let last = -1;
      const step = () => {
        if (token !== spinToken) { resolve(); return; }
        const elapsed = performance.now() - start;
        if (elapsed >= total) { resolve(); return; }
        let index = Math.floor(Math.random() * candidates.length);
        if (index === last) index = (index + 1) % candidates.length;
        last = index;
        reel.textContent = candidates[index];
        setTimeout(step, 55 + 260 * (elapsed / total) ** 3);
      };
      step();
    });
  }
  async function draw() {
    if (spinning || !stage.isActive()) return;
    const candidates = pool();
    const count = Math.min(config.count, candidates.length);
    if (!count) { ES.toast('引ける対象が残っていません。'); return; }
    const winners = pick(candidates, count);
    spinning = true;
    const token = ++spinToken;
    $('draw').disabled = true;
    const seconds = reducedMotion.matches ? 0 : config.spin;
    if (seconds > 0 && candidates.length > 1) await spinAnimation(candidates, seconds * 1000, token);
    if (token !== spinToken) return;
    history.push({ id: ES.uid(), prize: config.prize.trim(), winners, at: Date.now(), source: config.source });
    save();
    spinning = false;
    $('draw').disabled = false;
    showWinners(winners);
    renderHistory();
    updateInfo();
    if (count < config.count) ES.toast(`残りが${count}件だったため、${count}件だけ引きました。`);
  }
  async function undo() {
    if (!history.length || spinning) return;
    const last = history[history.length - 1];
    if (!(await ES.confirm('直前の抽選を取り消しますか？', `${last.prize ? last.prize + '：' : ''}${last.winners.join('、')}\n取り消すと、この当選は記録から消え、抽選の対象に戻ります。`, '取り消す'))) return;
    history.pop();
    save();
    renderHistory();
    updateInfo();
    if (stage.isActive()) showIdle();
  }
  const stage = ES.createStage(stageElement, {
    onBlackout(on) { $('blackoutBtn').textContent = on ? '暗転解除' : '暗転'; },
    onExit() {
      spinToken++;
      spinning = false;
      $('draw').disabled = false;
      $('blackoutBtn').textContent = '暗転';
      $('open').focus();
    },
    onKey(event) {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) void draw(); }
    }
  });
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));

  /* ---------- Form ---------- */
  document.querySelectorAll('input[name=source]').forEach(radio => {
    radio.checked = radio.value === config.source;
    radio.addEventListener('change', () => { if (radio.checked) { config.source = radio.value; syncPanels(); save(); updateInfo(); } });
  });
  $('names').value = config.names;
  $('from').value = config.from;
  $('to').value = config.to;
  $('prize').value = config.prize;
  $('count').value = config.count;
  $('spin').value = String(config.spin);
  $('unique').checked = config.unique;
  $('names').addEventListener('input', () => { config.names = $('names').value; saveSoon(); updateInfo(); });
  $('from').addEventListener('input', () => { config.from = int($('from').value, 0, 999999, 0); save(); updateInfo(); });
  $('to').addEventListener('input', () => { config.to = int($('to').value, 0, 999999, 0); save(); updateInfo(); });
  $('prize').addEventListener('input', () => { config.prize = $('prize').value; saveSoon(); $('stagePrize').textContent = config.prize.trim() || '抽選'; });
  $('count').addEventListener('input', () => { config.count = int($('count').value, 1, 50, 1); save(); });
  $('spin').addEventListener('change', () => { config.spin = Number($('spin').value); save(); });
  $('unique').addEventListener('change', () => { config.unique = $('unique').checked; save(); updateInfo(); });

  $('open').addEventListener('click', () => {
    const problem = sourceProblem();
    if (problem) {
      $('sourceStatus').textContent = problem;
      $('sourceStatus').classList.add('error');
      (config.source === 'names' ? $('names') : $('to')).focus();
      return;
    }
    $('stagePrize').textContent = config.prize.trim() || '抽選';
    updateInfo();
    stage.enter();
    showIdle();
  });
  $('draw').addEventListener('click', () => void draw());
  $('undo').addEventListener('click', () => void undo());
  $('stageUndo').addEventListener('click', () => void undo());
  $('blackoutBtn').addEventListener('click', () => stage.blackout());
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());
  $('clear').addEventListener('click', async () => {
    if (!history.length) return;
    if (!(await ES.confirm('当選の記録をすべて消しますか？', '当選した人も抽選の対象に戻ります。元に戻せないので、必要なら先にCSVで保存してください。', '記録を消す'))) return;
    history = [];
    save();
    renderHistory();
    updateInfo();
  });
  $('exportCsv').addEventListener('click', () => {
    const table = [['回', '賞', '当選', '時刻'], ...history.map((record, index) => [index + 1, record.prize, record.winners.join(' / '), new Date(record.at).toLocaleString('ja-JP')])];
    ES.download(`lottery-${ES.format.stamp()}.csv`, ES.toCsv(table), 'text/csv;charset=utf-8');
  });

  syncPanels();
  renderHistory();
  updateInfo();
})();
