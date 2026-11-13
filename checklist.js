/* Checklists for the day of the event. Saved in this browser only. */
'use strict';
(() => {
  const ES = window.EventStudio;
  const $ = id => document.getElementById(id);
  const container = $('lists');
  const MAX_LISTS = 30;
  const MAX_ITEMS = 200;
  const TEMPLATE = [
    ['前日まで', [
      '進行表の最終版をスタッフ全員に共有した',
      '上映する写真・資料を会場PCに保存した（ネットなしで開けるか確認）',
      'このサイトのオフライン版を保存して、解凍しておいた',
      'PCの充電器と映像の変換アダプター（HDMI / USB-C）を用意した',
      '受付リスト・名札・筆記用具を用意した',
      '搬入時間と搬入口、駐車場所を会場に確認した'
    ]],
    ['設営', [
      '電源タップと延長コードを配置し、足元のケーブルを養生した',
      'プロジェクター / モニターをつなぎ、解像度と表示範囲を確かめた',
      'PCのスリープ・通知・自動アップデートをオフにした',
      'マイクとスピーカーの音出しをした',
      '受付テーブルと案内サインを設置した',
      '非常口と避難経路を確認した'
    ]],
    ['リハーサル', [
      'スライドショーを最初から最後まで一周流した',
      'ステージタイマーが登壇位置から読めるか確かめた',
      'マイクとBGMの音量バランスを客席で聞いた',
      '進行表を読み合わせ、きっかけを全員で確認した',
      '抽選とサイネージを本番の画面に映してみた'
    ]],
    ['本番直前', [
      '全画面表示と暗転の操作をもう一度試した',
      '来場カウンターを0に戻した',
      'スタッフの配置と連絡手段を確認した',
      '予備のPC・ケーブルの置き場所を共有した',
      '開場のアナウンス文を確認した'
    ]],
    ['撤収', [
      '借りた機材の点数を数えて返却した',
      '忘れ物・落とし物がないか会場を見回った',
      '共有PCに保存した写真やZIPを削除した',
      '来場の記録と抽選の記録をCSVで保存した',
      'ゴミを分別し、会場を元の状態に戻した'
    ]]
  ];
  const fresh = () => TEMPLATE.map(([name, items]) => ({ id: ES.uid(), name, items: items.map(text => ({ id: ES.uid(), text, done: false })) }));

  const saved = ES.store.get('checklist', null);
  let lists = saved && Array.isArray(saved.lists)
    ? saved.lists.filter(list => list && Array.isArray(list.items)).slice(0, MAX_LISTS).map(list => ({
      id: typeof list.id === 'string' && list.id ? list.id : ES.uid(),
      name: String(list.name ?? '').slice(0, 40),
      items: list.items.filter(item => item && typeof item.text === 'string').slice(0, MAX_ITEMS).map(item => ({
        id: typeof item.id === 'string' && item.id ? item.id : ES.uid(),
        text: item.text.slice(0, 120),
        done: item.done === true
      }))
    }))
    : fresh();
  const save = () => ES.store.set('checklist', { lists });
  const findList = id => lists.find(list => list.id === id);

  function button(act, text, label, className = '') {
    const node = document.createElement('button');
    node.type = 'button';
    node.dataset.act = act;
    node.textContent = text;
    if (label) node.setAttribute('aria-label', label);
    if (className) node.className = className;
    return node;
  }
  function buildItem(item) {
    const row = document.createElement('li');
    row.className = 'chk-item' + (item.done ? ' is-done' : '');
    row.dataset.id = item.id;
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    const text = document.createElement('span');
    text.className = 'chk-text';
    text.textContent = item.text;
    label.append(box, text);
    const tools = document.createElement('div');
    tools.className = 'chk-tools';
    tools.append(button('edit', '編集', `「${item.text}」を編集`), button('up', '↑', '上へ移動'), button('down', '↓', '下へ移動'), button('delete', '✕', `「${item.text}」を削除`));
    row.append(label, tools);
    return row;
  }
  function buildList(list) {
    const section = document.createElement('section');
    section.className = 'card chk-list';
    section.dataset.id = list.id;
    const head = document.createElement('div');
    head.className = 'card-head';
    const title = document.createElement('h2');
    title.className = 'card-title';
    title.style.flex = '1';
    title.style.minWidth = '0';
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'chk-name';
    name.value = list.name;
    name.maxLength = 40;
    name.placeholder = 'リスト名';
    name.setAttribute('aria-label', 'リスト名');
    title.appendChild(name);
    const count = document.createElement('span');
    count.className = 'chk-count';
    head.append(title, count, button('remove-list', 'リストを削除', '', 'small ghost'));
    head.lastChild.classList.add('no-print');
    const items = document.createElement('ul');
    items.className = 'chk-items';
    for (const item of list.items) items.appendChild(buildItem(item));
    const add = document.createElement('div');
    add.className = 'chk-add';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 120;
    input.placeholder = '確認することを追加';
    input.setAttribute('aria-label', `${list.name || 'このリスト'}に追加する項目`);
    add.append(input, button('add', '追加'));
    section.append(head, items, add);
    return section;
  }
  function updateCounts() {
    let done = 0;
    let all = 0;
    for (const list of lists) {
      const listDone = list.items.filter(item => item.done).length;
      done += listDone;
      all += list.items.length;
      const node = container.querySelector(`.chk-list[data-id="${list.id}"] .chk-count`);
      if (node) {
        node.textContent = list.items.length ? `${listDone} / ${list.items.length}` : '項目なし';
        node.classList.toggle('done', list.items.length > 0 && listDone === list.items.length);
      }
    }
    $('doneCount').textContent = String(done);
    $('allCount').textContent = String(all);
    $('meter').style.width = all ? (done / all * 100).toFixed(1) + '%' : '0';
    $('uncheck').disabled = done === 0;
  }
  function render() {
    container.textContent = '';
    for (const list of lists) container.appendChild(buildList(list));
    updateCounts();
  }
  function rerenderList(list) {
    const old = container.querySelector(`.chk-list[data-id="${list.id}"]`);
    const node = buildList(list);
    if (old) old.replaceWith(node);
    updateCounts();
    return node;
  }
  function addItem(section) {
    const list = findList(section.dataset.id);
    const input = section.querySelector('.chk-add input');
    const text = input.value.trim();
    if (!list || !text) { input.focus(); return; }
    if (list.items.length >= MAX_ITEMS) { ES.toast(`1つのリストに入れられるのは${MAX_ITEMS}項目までです。`); return; }
    const item = { id: ES.uid(), text: text.slice(0, 120), done: false };
    list.items.push(item);
    save();
    section.querySelector('.chk-items').appendChild(buildItem(item));
    input.value = '';
    input.focus();
    updateCounts();
  }
  function editItem(row, item) {
    const label = row.querySelector('label');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chk-edit';
    input.maxLength = 120;
    input.value = item.text;
    input.setAttribute('aria-label', '項目の内容');
    label.hidden = true;
    row.insertBefore(input, label);
    input.focus();
    input.select();
    let finished = false;
    const finish = commit => {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (commit && text) { item.text = text; save(); }
      input.remove();
      label.hidden = false;
      row.querySelector('.chk-text').textContent = item.text;
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); row.querySelector('[data-act=edit]').focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(false); row.querySelector('[data-act=edit]').focus(); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  container.addEventListener('change', event => {
    if (event.target.type !== 'checkbox') return;
    const row = event.target.closest('.chk-item');
    const list = findList(row.closest('.chk-list').dataset.id);
    const item = list?.items.find(entry => entry.id === row.dataset.id);
    if (!item) return;
    item.done = event.target.checked;
    row.classList.toggle('is-done', item.done);
    save();
    updateCounts();
  });
  container.addEventListener('input', event => {
    if (!event.target.classList.contains('chk-name')) return;
    const list = findList(event.target.closest('.chk-list').dataset.id);
    if (!list) return;
    list.name = event.target.value;
    save();
  });
  container.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    if (event.target.closest('.chk-add')) { event.preventDefault(); addItem(event.target.closest('.chk-list')); }
    else if (event.target.classList.contains('chk-name')) { event.preventDefault(); event.target.blur(); }
  });
  container.addEventListener('click', async event => {
    const control = event.target.closest('button[data-act]');
    if (!control) return;
    const section = control.closest('.chk-list');
    const list = findList(section.dataset.id);
    if (!list) return;
    const act = control.dataset.act;
    if (act === 'add') { addItem(section); return; }
    if (act === 'remove-list') {
      if (list.items.length && !(await ES.confirm(`「${list.name || '名前のないリスト'}」を削除しますか？`, `${list.items.length}項目がまとめて消えます。元に戻せません。`, '削除する'))) return;
      lists = lists.filter(entry => entry.id !== list.id);
      save();
      section.remove();
      updateCounts();
      return;
    }
    const row = control.closest('.chk-item');
    const index = list.items.findIndex(entry => entry.id === row.dataset.id);
    if (index < 0) return;
    if (act === 'edit') editItem(row, list.items[index]);
    else if (act === 'delete') {
      list.items.splice(index, 1);
      save();
      row.remove();
      updateCounts();
    } else if (act === 'up' || act === 'down') {
      const target = act === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= list.items.length) return;
      const id = list.items[index].id;
      [list.items[index], list.items[target]] = [list.items[target], list.items[index]];
      save();
      rerenderList(list).querySelector(`.chk-item[data-id="${id}"] [data-act="${act}"]`)?.focus();
    }
  });

  $('addList').addEventListener('click', () => {
    if (lists.length >= MAX_LISTS) { ES.toast(`リストは${MAX_LISTS}個までです。`); return; }
    const list = { id: ES.uid(), name: '', items: [] };
    lists.push(list);
    save();
    const node = buildList(list);
    container.appendChild(node);
    updateCounts();
    node.querySelector('.chk-name').focus();
  });
  $('uncheck').addEventListener('click', async () => {
    if (!(await ES.confirm('チェックをすべて外しますか？', '項目はそのまま残り、チェックだけが外れます。', 'すべて外す'))) return;
    for (const list of lists) for (const item of list.items) item.done = false;
    save();
    render();
  });
  $('restore').addEventListener('click', async () => {
    if (!(await ES.confirm('最初の項目に戻しますか？', '自分で追加・編集した項目とチェックはすべて消えます。元に戻せません。', '最初に戻す'))) return;
    lists = fresh();
    save();
    render();
  });
  $('print').addEventListener('click', () => window.print());
  $('exportText').addEventListener('click', () => {
    const eventName = (ES.store.get('event', {}) || {}).name;
    const lines = [`${eventName ? eventName + ' ' : ''}チェックリスト（${new Date().toLocaleString('ja-JP')}）`, ''];
    for (const list of lists) {
      lines.push(`■ ${list.name || '名前のないリスト'}（${list.items.filter(item => item.done).length}/${list.items.length}）`);
      for (const item of list.items) lines.push(`${item.done ? '[x]' : '[ ]'} ${item.text}`);
      lines.push('');
    }
    ES.download(`checklist-${ES.format.stamp()}.txt`, '﻿' + lines.join('\r\n'), 'text/plain;charset=utf-8');
  });

  render();
})();
