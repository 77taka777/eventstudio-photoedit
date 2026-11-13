/* QR code tool. Everything is generated in the page; nothing typed here is stored. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const QR = window.EventStudioQR;
  const $ = id => document.getElementById(id);
  const QUIET = 4; /* Light margin required around a QR code, in modules. */
  let kind = 'text';
  let code = null;

  const wifiEscape = value => value.replace(/([\\;,:"])/g, '\\$1');
  function payload() {
    if (kind === 'wifi') {
      const ssid = $('ssid').value;
      if (!ssid) return '';
      const security = $('security').value;
      let text = `WIFI:T:${security};S:${wifiEscape(ssid)};`;
      if (security !== 'nopass') text += `P:${wifiEscape($('password').value)};`;
      if ($('hidden').checked) text += 'H:true;';
      return text + ';';
    }
    return $('text').value.trim();
  }
  function draw(canvas, target) {
    const context = canvas.getContext('2d');
    if (!code) {
      canvas.width = canvas.height = 330;
      context.fillStyle = '#eef1f5';
      context.fillRect(0, 0, 330, 330);
      context.fillStyle = '#8a95a8';
      context.font = '600 15px "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
      context.textAlign = 'center';
      context.fillText('内容を入力すると、ここに表示されます', 165, 170);
      return;
    }
    const count = code.size + QUIET * 2;
    const scale = Math.max(1, Math.floor(target / count));
    canvas.width = canvas.height = count * scale;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (code.get(x, y)) context.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
      }
    }
  }
  function toSvg() {
    const count = code.size + QUIET * 2;
    let path = '';
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (!code.get(x, y)) continue;
        const start = x;
        while (code.get(x + 1, y)) x++;
        const length = x - start + 1;
        path += `M${start + QUIET} ${y + QUIET}h${length}v1h-${length}z`;
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} ${count}" width="${count * 8}" height="${count * 8}" shape-rendering="crispEdges"><rect width="${count}" height="${count}" fill="#fff"/><path d="${path}" fill="#000"/></svg>\n`;
  }
  function update() {
    const text = payload();
    const status = $('status');
    status.textContent = '';
    status.classList.remove('error');
    code = null;
    if (text) {
      try { code = QR.encode(text, $('level').value); }
      catch (_) {
        status.textContent = `内容が長すぎてQRコードにできません（この強さでは最大 ${QR.maxBytes($('level').value).toLocaleString('ja')} バイト）。短くするか、「汚れ・欠けへの強さ」を下げてください。`;
        status.classList.add('error');
      }
    }
    draw($('canvas'), 660);
    $('previewHead').textContent = $('heading').value.trim();
    $('previewCap').textContent = $('caption').value.trim();
    $('open').disabled = $('savePng').disabled = $('saveSvg').disabled = !code;
    $('meta').textContent = code ? `${code.size} × ${code.size} マス（バージョン ${code.version}）／ ${code.bytes.toLocaleString('ja')} バイト` : '';
    if (!code || status.textContent) return;
    if (kind === 'wifi' && $('security').value === 'WPA' && $('password').value.length < 8) {
      status.textContent = 'WPAのパスワードは8文字以上です。入力を確かめてください。';
      status.classList.add('error');
    } else if (kind === 'text' && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) {
      status.textContent = '先頭に「https://」を付けると、読み取ったスマホがそのままページを開きます。';
    } else if (code.version > 14) {
      status.textContent = 'マス目が細かいQRコードです。遠くから読み取る場合は、内容を短くするか、できるだけ大きく映してください。';
    }
  }
  function syncPanels() {
    $('textPanel').hidden = kind !== 'text';
    $('wifiPanel').hidden = kind !== 'wifi';
  }

  document.querySelectorAll('input[name=kind]').forEach(radio => {
    radio.addEventListener('change', () => { if (radio.checked) { kind = radio.value; syncPanels(); update(); } });
  });
  for (const id of ['text', 'ssid', 'password', 'heading', 'caption']) $(id).addEventListener('input', update);
  for (const id of ['security', 'hidden', 'level']) $(id).addEventListener('change', update);
  $('security').addEventListener('change', () => { $('password').disabled = $('security').value === 'nopass'; });
  $('togglePassword').addEventListener('click', () => {
    const show = $('password').type === 'password';
    $('password').type = show ? 'text' : 'password';
    $('togglePassword').textContent = show ? '隠す' : '表示する';
    $('togglePassword').setAttribute('aria-pressed', String(show));
  });

  $('savePng').addEventListener('click', () => {
    if (!code) return;
    const canvas = document.createElement('canvas');
    draw(canvas, Number($('pixels').value));
    canvas.toBlob(blob => {
      if (!blob) { ES.toast('画像を作れませんでした。'); return; }
      ES.download(`qr-${ES.format.stamp()}.png`, blob, 'image/png');
      ES.toast(`${canvas.width} × ${canvas.height}px のPNGを保存しました。`);
    }, 'image/png');
  });
  $('saveSvg').addEventListener('click', () => {
    if (!code) return;
    ES.download(`qr-${ES.format.stamp()}.svg`, toSvg(), 'image/svg+xml');
  });

  const stage = ES.createStage($('stage'), {
    onBlackout(on) { $('blackoutBtn').textContent = on ? '暗転解除' : '暗転'; },
    onExit() { $('blackoutBtn').textContent = '暗転'; $('open').focus(); }
  });
  $('open').addEventListener('click', () => {
    if (!code) return;
    $('stageHead').textContent = $('heading').value.trim();
    $('stageCap').textContent = $('caption').value.trim();
    draw($('stageCanvas'), 1600);
    stage.enter();
  });
  $('blackoutBtn').addEventListener('click', () => stage.blackout());
  $('fullscreenBtn').addEventListener('click', () => stage.toggleFullscreen());
  $('back').addEventListener('click', () => stage.exit());

  syncPanels();
  update();
})();
