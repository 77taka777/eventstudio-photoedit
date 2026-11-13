/* Shared shell for Event Studio.
   - Unsaved-work guard for the photo tools
   - Tool menu in the header (single list: TOOLS below)
   - On-device storage: this browser's localStorage only
   - Fullscreen "stage" helper used by every display tool
   No cookies, analytics, or network calls. */
'use strict';
(() => {
  const doc = document;

  /* ---------- Unsaved-work guard (slideshow / image batch) ---------- */
  let dirty = false;
  let leaving = false;
  let destination = '';
  const leaveDialog = doc.getElementById('siteLeaveDialog');
  const stay = doc.getElementById('siteStay');
  const leave = doc.getElementById('siteLeave');
  function setDirty(value) { dirty = Boolean(value); }
  doc.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-site-nav]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank' || !dirty) return;
    event.preventDefault();
    destination = link.href;
    if (leaveDialog && typeof leaveDialog.showModal === 'function') {
      if (!leaveDialog.open) leaveDialog.showModal();
    } else if (window.confirm('ページを移動すると選択した画像と変換結果は引き継がれません。保存してから移動してください。移動しますか？')) {
      leaving = true;
      window.location.assign(destination);
    }
  });
  stay?.addEventListener('click', () => leaveDialog.close());
  leave?.addEventListener('click', () => {
    if (!destination) return;
    leaving = true;
    leaveDialog.close();
    window.location.assign(destination);
  });
  window.addEventListener('beforeunload', event => {
    if (dirty && !leaving) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pageshow', () => { leaving = false; });

  /* ---------- On-device storage ---------- */
  const PREFIX = 'eventstudio:v1:';
  const KEYS = Object.freeze(['event', 'rundown', 'timer', 'lottery', 'counter', 'checklist', 'signage']);
  const memory = new Map();
  let persistent = false;
  try {
    window.localStorage.setItem(PREFIX + 'probe', '1');
    window.localStorage.removeItem(PREFIX + 'probe');
    persistent = true;
  } catch (_) { /* Private mode or blocked storage: keep data in memory for this page only. */ }
  const store = Object.freeze({
    keys: KEYS,
    isPersistent() { return persistent; },
    get(key, fallback = null) {
      try {
        const raw = persistent ? window.localStorage.getItem(PREFIX + key) : memory.get(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        if (persistent) window.localStorage.setItem(PREFIX + key, raw);
        else memory.set(key, raw);
        return true;
      } catch (_) {
        memory.set(key, raw);
        return false;
      }
    },
    remove(key) {
      memory.delete(key);
      try { if (persistent) window.localStorage.removeItem(PREFIX + key); } catch (_) { /* nothing to remove */ }
    },
    exportAll() {
      const data = {};
      for (const key of KEYS) {
        const value = store.get(key);
        if (value !== null) data[key] = value;
      }
      return data;
    },
    importAll(data) {
      let count = 0;
      for (const key of KEYS) {
        if (data && Object.prototype.hasOwnProperty.call(data, key) && data[key] !== null && typeof data[key] === 'object') {
          store.set(key, data[key]);
          count++;
        }
      }
      return count;
    },
    clearAll() { for (const key of KEYS) store.remove(key); }
  });

  /* ---------- Formatting ---------- */
  const pad = value => String(value).padStart(2, '0');
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const format = Object.freeze({
    pad,
    clock(date = new Date(), withSeconds = true) {
      return pad(date.getHours()) + ':' + pad(date.getMinutes()) + (withSeconds ? ':' + pad(date.getSeconds()) : '');
    },
    dateLabel(date = new Date()) {
      return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
    },
    /* Whole seconds -> "MM:SS" or "H:MM:SS". */
    duration(totalSeconds) {
      const seconds = Math.max(0, Math.floor(totalSeconds));
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    },
    stamp(date = new Date()) {
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
    }
  });

  /* ---------- Schedule maths shared by the home board and the rundown ---------- */
  const schedule = Object.freeze({
    /* "18:30", "1830", "930", "18時30分", "25:00" (after midnight) -> minutes, or null. */
    parseTime(input) {
      const text = String(input ?? '').normalize('NFKC').trim().replace(/\s+/g, '');
      if (!text) return null;
      let hours;
      let minutes;
      let match = text.match(/^(\d{1,2})[:.時](\d{1,2})?分?$/);
      if (match) {
        hours = Number(match[1]);
        minutes = match[2] ? Number(match[2]) : 0;
      } else if ((match = text.match(/^(\d{1,4})$/))) {
        const digits = match[1];
        if (digits.length <= 2) { hours = Number(digits); minutes = 0; }
        else { hours = Number(digits.slice(0, -2)); minutes = Number(digits.slice(-2)); }
      } else return null;
      if (hours > 47 || minutes > 59) return null;
      return hours * 60 + minutes;
    },
    formatTime(minutes) {
      return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
    },
    live(data, now = new Date()) {
      const offsetSec = Number(data?.offsetSec) || 0;
      const items = (Array.isArray(data?.items) ? data.items : [])
        .map(item => ({ ...item, min: schedule.parseTime(item.time) }))
        .filter(item => item.min !== null)
        .sort((a, b) => a.min - b.min);
      if (!items.length) return { status: 'empty', items, offsetSec, index: -1, current: null, next: null, untilNextSec: null, progress: null };
      let nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
      const first = items[0].min * 60 + offsetSec;
      const last = items[items.length - 1].min * 60 + offsetSec;
      /* After midnight, keep following a schedule written as 24:30, 25:00 ... */
      if (nowSec < first && nowSec + 86400 <= last + 3 * 3600) nowSec += 86400;
      let index = -1;
      for (let i = 0; i < items.length; i++) if (items[i].min * 60 + offsetSec <= nowSec) index = i;
      const current = index >= 0 ? items[index] : null;
      const next = items[index + 1] || null;
      const untilNextSec = next ? next.min * 60 + offsetSec - nowSec : null;
      let progress = null;
      if (current && next) {
        const start = current.min * 60 + offsetSec;
        const end = next.min * 60 + offsetSec;
        progress = end > start ? Math.min(1, Math.max(0, (nowSec - start) / (end - start))) : 1;
      }
      return { status: !current ? 'before' : (next ? 'running' : 'last'), items, index, current, next, untilNextSec, progress, offsetSec, nowSec };
    },
    offsetLabel(offsetSec) {
      const minutes = Math.round(Math.abs(offsetSec) / 60);
      if (!minutes) return '定刻';
      return offsetSec > 0 ? `${minutes}分押し` : `${minutes}分巻き`;
    }
  });

  /* ---------- Small utilities ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function download(filename, content, type = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function toCsv(rows) {
    const cell = value => {
      const text = String(value ?? '');
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    /* BOM so Excel opens Japanese text correctly. */
    return '﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text).replace(/^﻿/, '');
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"') {
          if (source[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',' || ch === '\t') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && source[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(cells => cells.some(value => value.trim() !== ''));
  }

  /* Largest font size (px) at which `inner` still fits inside `box`. */
  function fitText(box, inner, max, min = 12) {
    const fits = () => inner.scrollWidth <= box.clientWidth + 1 && inner.scrollHeight <= box.clientHeight + 1 && inner.offsetWidth <= box.clientWidth + 1 && inner.offsetHeight <= box.clientHeight + 1;
    let low = min;
    let high = Math.max(min, Math.floor(max));
    inner.style.fontSize = high + 'px';
    if (fits()) return high;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      inner.style.fontSize = middle + 'px';
      if (fits()) low = middle;
      else high = middle;
    }
    inner.style.fontSize = low + 'px';
    return low;
  }

  let toastTimer = 0;
  function toast(message) {
    let node = doc.getElementById('siteToast');
    if (!node) {
      node = doc.createElement('div');
      node.id = 'siteToast';
      node.className = 'site-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      doc.body.appendChild(node);
    }
    /* A toast raised from inside a fullscreen stage must live inside it to be visible. */
    const host = doc.fullscreenElement || doc.body;
    if (node.parentNode !== host) host.appendChild(node);
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  /* Promise<boolean>. Uses <dialog>; falls back to window.confirm. */
  function confirmDialog(title, message, okLabel = 'OK', cancelLabel = 'キャンセル') {
    return new Promise(resolve => {
      const dialog = doc.createElement('dialog');
      if (typeof dialog.showModal !== 'function') { resolve(window.confirm(title + '\n' + message)); return; }
      dialog.className = 'site-dialog';
      const heading = doc.createElement('h2');
      heading.textContent = title;
      const body = doc.createElement('p');
      body.textContent = message;
      const actions = doc.createElement('div');
      actions.className = 'site-dialog-actions';
      const cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.textContent = cancelLabel;
      const ok = doc.createElement('button');
      ok.type = 'button';
      ok.textContent = okLabel;
      actions.append(cancel, ok);
      dialog.append(heading, body, actions);
      let result = false;
      cancel.addEventListener('click', () => dialog.close());
      ok.addEventListener('click', () => { result = true; dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
      (doc.fullscreenElement || doc.body).appendChild(dialog);
      dialog.showModal();
      cancel.focus();
    });
  }

  /* ---------- Tool menu ---------- */
  const TOOLS = Object.freeze([
    { group: '映す', items: [
      { href: 'slideshow.html', name: 'スライドショー', note: '写真を全画面でループ上映' },
      { href: 'signage.html', name: 'サイネージ', note: '案内・告知を大きく表示' },
      { href: 'qr.html', name: 'QRコード', note: 'URL・Wi-FiをQRにして映す' }
    ] },
    { group: '進める', items: [
      { href: 'rundown.html', name: '進行表', note: 'いまと次、押し巻きを追う' },
      { href: 'timer.html', name: 'ステージタイマー', note: '持ち時間を登壇者に見せる' },
      { href: 'lottery.html', name: '抽選', note: '名前・番号から当選を引く' }
    ] },
    { group: '数える・確かめる', items: [
      { href: 'counter.html', name: '来場カウンター', note: '入退場と在場人数を数える' },
      { href: 'checklist.html', name: 'チェックリスト', note: '仕込みから撤収までの確認' }
    ] },
    { group: '仕込む', items: [
      { href: 'image-batch.html', name: '画像を整える', note: 'サイズを一括で統一' },
      { href: 'testpattern.html', name: '画面・音響チェック', note: 'テストパターンとテスト音' }
    ] }
  ]);
  const trigger = doc.querySelector('a[data-site-tools]');
  if (trigger) {
    const current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const panel = doc.createElement('div');
    panel.className = 'site-menu';
    panel.id = 'siteToolMenu';
    panel.hidden = true;
    for (const group of TOOLS) {
      const section = doc.createElement('div');
      section.className = 'site-menu-group';
      const title = doc.createElement('p');
      title.className = 'site-menu-title';
      title.textContent = group.group;
      const list = doc.createElement('ul');
      for (const item of group.items) {
        const entry = doc.createElement('li');
        const link = doc.createElement('a');
        link.href = item.href;
        link.setAttribute('data-site-nav', '');
        if (item.href === current) link.setAttribute('aria-current', 'page');
        const name = doc.createElement('strong');
        name.textContent = item.name;
        const note = doc.createElement('span');
        note.textContent = item.note;
        link.append(name, note);
        entry.appendChild(link);
        list.appendChild(entry);
      }
      section.append(title, list);
      panel.appendChild(section);
    }
    trigger.after(panel);
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panel.id);
    const setOpen = open => {
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setOpen(panel.hidden);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); setOpen(panel.hidden); }
    });
    doc.addEventListener('click', event => {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
    });
    doc.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) { setOpen(false); trigger.focus(); }
    });
  }

  /* ---------- Fullscreen stage ----------
     One window is both the control surface and the picture: start it on the venue
     screen, then drive it from the keyboard. Esc leaves fullscreen first; a second
     Esc (or the button) goes back to the settings. */
  function createStage(element, options = {}) {
    const controls = options.controls || element.querySelector('.stage-controls');
    const hideDelay = options.hideDelay ?? 2600;
    let active = false;
    let wake = null;
    let hideTimer = 0;
    let background = [];
    async function requestWake() {
      if (!active || wake || doc.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (!active) { lock.release().catch(() => {}); return; }
        wake = lock;
        lock.addEventListener('release', () => { if (wake === lock) wake = null; });
      } catch (_) { /* Best effort. The OS sleep setting still needs to be off. */ }
    }
    function reveal() {
      if (!active) return;
      element.classList.remove('hide-controls');
      clearTimeout(hideTimer);
      if (element.classList.contains('blacked')) { element.classList.add('hide-controls'); return; }
      hideTimer = setTimeout(() => {
        if (!active) return;
        if (controls && controls.contains(doc.activeElement)) doc.activeElement.blur();
        element.classList.add('hide-controls');
      }, hideDelay);
    }
    function fullscreen() {
      if (!active || doc.fullscreenElement || !element.requestFullscreen) return;
      element.requestFullscreen().catch(() => { toast('全画面にならない場合は F11 キーを押してください。'); });
    }
    function toggleFullscreen() {
      if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {});
      else fullscreen();
    }
    function blackout(force) {
      const on = element.classList.toggle('blacked', force);
      options.onBlackout?.(on);
      if (on) { clearTimeout(hideTimer); element.classList.add('hide-controls'); }
      else reveal();
      return on;
    }
    function enter(enterOptions = {}) {
      if (active) return;
      active = true;
      element.hidden = false;
      doc.body.classList.add('is-presenting');
      /* The settings stay in the page underneath: make them unreachable and move
         keyboard focus onto the stage, so Space and Enter drive the display. */
      background = [...doc.body.children].filter(node => node !== element && node.tagName !== 'DIALOG' && node.id !== 'siteToast' && !node.inert);
      background.forEach(node => { node.inert = true; });
      if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
      element.focus({ preventScroll: true });
      if (enterOptions.fullscreen !== false) fullscreen();
      void requestWake();
      reveal();
      options.onEnter?.();
    }
    function exit() {
      if (!active) return;
      active = false;
      clearTimeout(hideTimer);
      if (doc.fullscreenElement) doc.exitFullscreen().catch(() => {});
      if (wake) { wake.release().catch(() => {}); wake = null; }
      element.hidden = true;
      element.classList.remove('hide-controls', 'blacked');
      doc.body.classList.remove('is-presenting');
      background.forEach(node => { node.inert = false; });
      background = [];
      options.onExit?.();
    }
    element.addEventListener('pointermove', reveal);
    element.addEventListener('pointerdown', reveal);
    controls?.addEventListener('focusin', reveal);
    /* Mouse clicks should not leave focus on a button, or Space would press it again. */
    controls?.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button && event.detail > 0) button.blur();
    });
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') void requestWake(); });
    doc.addEventListener('keydown', event => {
      if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
      if (doc.querySelector('dialog[open]')) return;
      const tag = doc.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const key = event.key;
      if ((key === ' ' || key === 'Enter') && tag === 'BUTTON') return;
      if (key === 'Escape') { event.preventDefault(); exit(); return; }
      if (key === 'Tab') { reveal(); return; }
      const lower = key.toLowerCase();
      if (lower === 'f') { if (!event.repeat) toggleFullscreen(); return; }
      if (lower === 'b' && options.blackout !== false) { if (!event.repeat) blackout(); return; }
      options.onKey?.(event);
    });
    window.addEventListener('pagehide', () => { if (active) exit(); });
    return Object.freeze({ enter, exit, reveal, fullscreen, toggleFullscreen, blackout, isActive: () => active });
  }

  window.EventStudio = Object.freeze({ setDirty, store, format, schedule, uid, download, toCsv, parseCsv, fitText, toast, confirm: confirmDialog, createStage, tools: TOOLS });
  /* Name used by the two original photo tools. */
  window.PhotoStudio = Object.freeze({ setDirty });
})();
