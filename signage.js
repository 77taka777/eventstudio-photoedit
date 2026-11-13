/* Signage: full-screen notices with optional arrow, clock, or countdown.
   The same painter draws the small preview and the stage (sizes use container units). */
'use strict';
(() => {
  const ES = window.EventStudio;
  const S = ES.schedule;
  const $ = id => document.getElementById(id);
  const THEMES = ['navy', 'white', 'blue', 'green', 'amber', 'red'];
  const ARROWS = ['none', 'left', 'right', 'up', 'down'];
  const WIDGETS = ['none', 'clock', 'countdown'];
  const THEME_COLORS = { navy: '#0e1420', white: '#f7f8fa', blue: '#1b4ac9', green: '#0e6249', amber: '#f4c430', red: '#b3141f' };
  const MAX_SLIDES = 30;
  const TEMPLATES = [
    { name: '開場前（カウントダウン）', title: 'まもなく開場します', body: '開場までしばらくお待ちください', theme: 'navy', widget: 'countdown' },
    { name: '開演前（カウントダウン）', title: '開演まで', body: 'お席についてお待ちください', theme: 'navy', widget: 'countdown' },
    { name: '休憩中（カウントダウン）', title: 'ただいま休憩中です', body: '再開までしばらくお待ちください', theme: 'blue', widget: 'countdown' },
    { name: '受付の案内（矢印）', title: '受付はこちら', theme: 'white', arrow: 'right' },
    { name: '会場の案内（矢印）', title: '会場はこの先です', theme: 'green', arrow: 'up' },
    { name: '撮影についてのお願い', title: '撮影・録音は\nご遠慮ください', body: 'ご協力をお願いします', theme: 'amber' },
    { name: 'Wi-Fiの案内', title: '会場 Wi-Fi', body: 'ネットワーク名：\nパスワード：', theme: 'navy' },
    { name: '満員のお知らせ', title: 'ただいま満員です', body: '入場までお待ちいただく場合があります', theme: 'red' },
    { name: '終演', title: '本日はありがとうございました', body: 'お忘れ物にご注意ください', theme: 'navy' },
    { name: '時計だけ', theme: 'navy', widget: 'clock' },
    { name: '白紙から書く', theme: 'navy' }
  ];
  /* A countdown needs a time to count to: default to the next half hour that is at least 15 minutes away. */
  function defaultTarget() {
    const now = new Date();
    const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes() + 15) / 30) * 30;
    return S.formatTime(minutes);
  }
  const makeSlide = source => ({
    id: ES.uid(),
    title: String(source.title ?? '').slice(0, 120),
    body: String(source.body ?? '').slice(0, 300),
    theme: THEMES.includes(source.theme) ? source.theme : 'navy',
    arrow: ARROWS.includes(source.arrow) ? source.arrow : 'none',
    widget: WIDGETS.includes(source.widget) ? source.widget : 'none',
    target: String(source.target ?? (source.widget === 'countdown' ? defaultTarget() : '')).slice(0, 8)
  });

  const saved = ES.store.get('signage', null);
  let slides = saved && Array.isArray(saved.slides)
    ? saved.slides.filter(slide => slide && typeof slide === 'object').slice(0, MAX_SLIDES).map(makeSlide)
    : [makeSlide(TEMPLATES[0]), makeSlide(TEMPLATES[3])];
  const config = { interval: saved && [0, 5, 8, 10, 15, 20, 30, 60].includes(saved.interval) ? saved.interval : 10 };
  let selected = 0;
  const save = () => ES.store.set('signage', { slides, interval: config.interval });
  let saveTimer = 0;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); save(); });

  /* ---------- Painter ---------- */
  const SVG = 'http://www.w3.org/2000/svg';
  function arrowNode(direction) {
    const holder = document.createElement('div');
    holder.className = 'sg-arrow';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M10 50h76M56 18l32 32-32 32');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '12');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('transform', `rotate(${{ right: 0, down: 90, left: 180, up: 270 }[direction]} 50 50)`);
    svg.appendChild(path);
    holder.appendChild(svg);
    return holder;
  }
  function targetTimestamp(text) {
    const minutes = S.parseTime(text);
    if (minutes === null) return null;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes, 0, 0).getTime();
    return now.getTime() - target > 12 * 3600 * 1000 ? target + 24 * 3600 * 1000 : target;
  }
  function widgetText(kind, target) {
    if (kind === 'clock') return ES.format.clock(new Date(), false);
    const timestamp = targetTimestamp(target);
    if (timestamp === null) return '--:--';
    return ES.format.duration(Math.ceil(Math.max(0, timestamp - Date.now()) / 1000));
  }
  function fitFrame(frame) {
    const inner = frame.firstElementChild;
    if (!inner || !frame.clientWidth) return;
    let fit = 1;
    frame.style.setProperty('--fit', '1');
    const overflows = () => inner.offsetHeight > frame.clientHeight + 1 || inner.offsetWidth > frame.clientWidth + 1 || inner.scrollWidth > inner.clientWidth + 1;
    for (let guard = 0; guard < 40 && fit > 0.2 && overflows(); guard++) {
      fit *= 0.93;
      frame.style.setProperty('--fit', fit.toFixed(3));
    }
  }
  function updateWidgets(frame) {
    const node = frame.querySelector('.sg-widget');
    if (!node) return;
    const text = widgetText(node.dataset.kind, node.dataset.target);
    if (node.textContent === text) return;
    const lengthChanged = node.textContent.length !== text.length;
    node.textContent = text;
    if (lengthChanged) fitFrame(frame);
  }
  function paint(frame, slide, animate) {
    const stageClass = frame.id === 'stageFrame';
    frame.className = 'sg-frame theme-' + (slide ? slide.theme : 'navy');
    frame.textContent = '';
    if (!slide) return;
    const inner = document.createElement('div');
    inner.className = 'sg-inner' + (slide.arrow !== 'none' ? ' arrow-' + slide.arrow : '');
    if (slide.arrow !== 'none') inner.appendChild(arrowNode(slide.arrow));
    const text = document.createElement('div');
    text.className = 'sg-text';
    if (slide.title.trim()) {
      const title = document.createElement('div');
      title.className = 'sg-title';
      title.textContent = slide.title;
      text.appendChild(title);
    }
    if (slide.body.trim()) {
      const body = document.createElement('div');
      body.className = 'sg-body';
      body.textContent = slide.body;
      text.appendChild(body);
    }
    if (slide.widget !== 'none') {
      const widget = document.createElement('div');
      widget.className = 'sg-widget';
      widget.dataset.kind = slide.widget;
      widget.dataset.target = slide.target;
      widget.textContent = widgetText(slide.widget, slide.target);
      text.appendChild(widget);
    }
    if (text.childElementCount) inner.appendChild(text);
    frame.appendChild(inner);
    fitFrame(frame);
    if (animate && stageClass) {
      frame.classList.remove('swap');
      void frame.offsetWidth;
      frame.classList.add('swap');
    }
  }
  const slideLabel = slide => {
    const text = (slide.title.trim() || slide.body.trim()).split('\n')[0];
    if (text) return text;
    if (slide.widget === 'clock') return '時計';
    if (slide.widget === 'countdown') return 'カウントダウン';
    return slide.arrow !== 'none' ? '矢印' : '（まだ何も書かれていません）';
  };

  /* ---------- Setup ---------- */
  const preview = $('preview');
  function miniButton(act, text, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini';
    button.dataset.act = act;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    return button;
  }
  function renderList() {
    const list = $('slides');
    list.textContent = '';
    slides.forEach((slide, index) => {
      const item = document.createElement('li');
      item.dataset.index = String(index);
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'pick';
      pick.dataset.act = 'pick';
      pick.setAttribute('aria-pressed', String(index === selected));
      const swatch = document.createElement('i');
      swatch.style.background = THEME_COLORS[slide.theme];
      const label = document.createElement('span');
      label.textContent = `${index + 1}　${slideLabel(slide)}`;
      pick.append(swatch, label);
      item.append(pick, miniButton('up', '↑', '前へ移動'), miniButton('down', '↓', '後ろへ移動'), miniButton('delete', '✕', 'この画面を削除'));
      list.appendChild(item);
    });
    $('open').disabled = slides.length === 0;
  }
  function loadEditor() {
    const slide = slides[selected];
    for (const id of ['title', 'body', 'theme', 'arrow', 'widget', 'target']) $(id).disabled = !slide;
    $('title').value = slide ? slide.title : '';
    $('body').value = slide ? slide.body : '';
    $('theme').value = slide ? slide.theme : 'navy';
    $('arrow').value = slide ? slide.arrow : 'none';
    $('widget').value = slide ? slide.widget : 'none';
    $('target').value = slide ? slide.target : '';
    refreshEditorState();
  }
  function refreshEditorState() {
    const slide = slides[selected];
    const countdown = Boolean(slide) && slide.widget === 'countdown';
    $('targetField').hidden = !countdown;
    const status = $('editStatus');
    const invalid = countdown && S.parseTime(slide.target) === null;
    status.textContent = !slide ? '下の「この画面を追加」から、表示する画面を作ってください。' : (invalid ? 'カウントダウンする時刻を「19:00」の形で入力してください。' : '');
    status.classList.toggle('error', invalid);
    if (invalid && slide.target.trim()) $('target').setAttribute('aria-invalid', 'true');
    else $('target').removeAttribute('aria-invalid');
    $('previewInfo').textContent = slides.length ? `${selected + 1} / ${slides.length}` : '';
  }
  function refresh() {
    renderList();
    loadEditor();
    paint(preview, slides[selected], false);
  }
  function bind(id, key, eventName = 'input') {
    $(id).addEventListener(eventName, () => {
      const slide = slides[selected];
      if (!slide) return;
      slide[key] = $(id).value;
      saveSoon();
      refreshEditorState();
      paint(preview, slide, false);
      const pick = $('slides').querySelector(`li[data-index="${selected}"] .pick`);
      if (pick) {
        pick.querySelector('span').textContent = `${selected + 1}　${slideLabel(slide)}`;
        pick.querySelector('i').style.background = THEME_COLORS[slide.theme];
      }
    });
  }
  bind('title', 'title');
  bind('body', 'body');
  bind('theme', 'theme', 'change');
  bind('arrow', 'arrow', 'change');
  bind('widget', 'widget', 'change');
  bind('target', 'target');
  $('target').addEventListener('change', () => {
    const slide = slides[selected];
    const minutes = S.parseTime($('target').value);
    if (!slide || minutes === null) return;
    slide.target = $('target').value = S.formatTime(minutes);
    save();
    refreshEditorState();
    paint(preview, slide, false);
  });
  $('slides').addEventListener('click', event => {
    const control = event.target.closest('button[data-act]');
    if (!control) return;
    const index = Number(control.closest('li').dataset.index);
    const act = control.dataset.act;
    if (act === 'pick') selected = index;
    else if (act === 'delete') {
      slides.splice(index, 1);
      if (selected >= slides.length) selected = Math.max(0, slides.length - 1);
      else if (index < selected) selected--;
    } else {
      const target = act === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= slides.length) return;
      [slides[index], slides[target]] = [slides[target], slides[index]];
      if (selected === index) selected = target;
      else if (selected === target) selected = index;
    }
    save();
    refresh();
    $('slides').querySelector(`li[data-index="${act === 'pick' || act === 'delete' ? selected : (act === 'up' ? index - 1 : index + 1)}"] [data-act="${act === 'delete' ? 'pick' : act}"]`)?.focus();
  });
  TEMPLATES.forEach((template, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = template.name;
    $('template').appendChild(option);
  });
  $('add').addEventListener('click', () => {
    if (slides.length >= MAX_SLIDES) { ES.toast(`画面は${MAX_SLIDES}枚までです。`); return; }
    slides.push(makeSlide(TEMPLATES[Number($('template').value)] || {}));
    selected = slides.length - 1;
    save();
    refresh();
    $('title').focus();
  });
  $('interval').value = String(config.interval);
  $('interval').addEventListener('change', () => { config.interval = Number($('interval').value); save(); });

  /* ---------- Stage ---------- */
  const stageFrame = $('stageFrame');
  let current = 0;
  let paused = false;
  let rotateTimer = 0;
  function schedule() {
    clearTimeout(rotateTimer);
    const canRotate = config.interval > 0 && slides.length > 1;
    $('pause').disabled = !canRotate;
    $('pause').textContent = paused ? '切り替えを再開' : '切り替えを止める';
    $('prev').disabled = $('next').disabled = slides.length < 2;
    if (stage.isActive() && canRotate && !paused) rotateTimer = setTimeout(() => show(current + 1), config.interval * 1000);
  }
  function show(index) {
    if (!slides.length) return;
    current = ((index % slides.length) + slides.length) % slides.length;
    paint(stageFrame, slides[current], true);
    $('stageInfo').textContent = `${current + 1} / ${slides.length}　${slideLabel(slides[current])}`;
    schedule();
  }
  function togglePause() {
    if (config.interval <= 0 || slides.length < 2) return;
    paused = !paused;
    schedule();
    stage.reveal();
  }
  const stage = ES.createStage($('stage'), {
    onBlackout(on) { $('blackoutBtn').textContent = on ? '暗転解除' : '暗転'; },
    onExit() { clearTimeout(rotateTimer); $('blackoutBtn').textContent = '暗転'; selected = Math.min(current, Math.max(0, slides.length - 1)); refresh(); $('open').focus(); },
    onKey(event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
      else if (event.key === ' ') { event.preventDefault(); if (!event.repeat) togglePause(); }
    }
  });
  $('open').addEventListener('click', () => {
    if (!slides.length) return;
    paused = false;
    stage.enter();
    show(selected);
  });
  $('prev').addEventListener('click', () => show(current - 1));
  $('next').addEventListener('click', () => show(current + 1));
  $('pause').addEventListener('click', togglePause);
  $('blackoutBtn').addEventListener('click', () => stage.blackout());
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());

  const refit = () => { fitFrame(preview); if (stage.isActive()) fitFrame(stageFrame); };
  window.addEventListener('resize', refit);
  document.addEventListener('fullscreenchange', () => setTimeout(refit, 60));
  setInterval(() => { updateWidgets(preview); if (stage.isActive()) updateWidgets(stageFrame); }, 500);

  refresh();
})();
