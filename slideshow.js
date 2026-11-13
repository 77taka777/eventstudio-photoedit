'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const player = $('player');
 const layers = [...document.querySelectorAll('.slide')];
 const allowed = /\.(jpe?g|png|webp|avif|bmp|gif)$/i;
 const collator = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});
 let chosen = [], files = [], playlist = [], invalid = new Set();
 let isFolder = false, running = false, paused = false, busy = false;
 let generation = 0, index = -1, active = -1, timer = null, hideTimer = null;
 let previewURL = null, wake = null, failedCount = 0;
 let settings = {};
 const layerURLs = [null,null], animations = [null,null];
 const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

 function message(text, error=false) {
  $('status').textContent = text;
  $('status').classList.toggle('error',error);
 }
 function resetLayer(n) {
  if(animations[n]) { animations[n].cancel(); animations[n]=null; }
  layers[n].style.transition='none';
  layers[n].style.opacity='0';
  layers[n].querySelectorAll('img').forEach(img=>img.removeAttribute('src'));
  if(layerURLs[n]) { URL.revokeObjectURL(layerURLs[n]); layerURLs[n]=null; }
 }
 function filterSelection() {
  if(previewURL) { URL.revokeObjectURL(previewURL); previewURL=null; }
  $('thumb').hidden=true;
  const scoped = chosen.filter(file => !isFolder || $('subfolders').checked || (file.webkitRelativePath || file.name).split('/').length<=2);
  files = scoped.filter(file => allowed.test(file.name) && !file.name.startsWith('.'));
  files.sort((a,b)=>collator.compare(a.webkitRelativePath || a.name,b.webkitRelativePath || b.name));
  $('count').textContent = files.length ? `${files.length.toLocaleString('ja')}枚の写真を選択しました` : '上映できる写真が選ばれていません';
  const folderName = chosen[0]?.webkitRelativePath?.split('/')[0];
  $('source').textContent = isFolder ? `フォルダ：${folderName || '選択したフォルダ'}${$('subfolders').checked ? '（サブフォルダを含む）' : '（直下の写真のみ）'}` : '複数の写真を選択';
  $('start').disabled=!files.length;
   window.PhotoStudio?.setDirty(chosen.length>0);
  const excluded = scoped.length - files.length;
  const nested = chosen.length - scoped.length;
  message([excluded ? `画像以外・対象外の形式 ${excluded}件を除外。` : '', nested ? `サブフォルダ内 ${nested}件は含めていません。` : '', files.length ? '読み込めない画像は、上映時に自動でスキップします。' : 'JPG・PNG などを選んでください。'].filter(Boolean).join(' '));
  if(files.length) {
   previewURL=URL.createObjectURL(files[0]);
   $('thumb').onload=()=>{$('thumb').hidden=false;};
   $('thumb').onerror=()=>{$('thumb').hidden=true;};
   $('thumb').src=previewURL;
  }
 }
 $('chooseFolder').onclick=()=>{$('folderInput').value='';$('folderInput').click();};
 $('chooseFiles').onclick=()=>{$('filesInput').value='';$('filesInput').click();};
 $('folderInput').onchange=e=>{if(e.target.files.length){chosen=[...e.target.files];isFolder=true;filterSelection();}};
 $('filesInput').onchange=e=>{if(e.target.files.length){chosen=[...e.target.files];isFolder=false;filterSelection();}};
 $('subfolders').onchange=()=>{if(chosen.length) filterSelection();};

 function shuffle(array, avoid=null) {
  const result=[...array];
  for(let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  if(result.length>1 && result[0]===avoid) [result[0],result[1]]=[result[1],result[0]];
  return result;
 }
 function revealControls() {
  if(!running)return;
  player.classList.remove('hide-controls');
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>{
   if(running) {
    if($('controls').contains(document.activeElement)) document.activeElement.blur();
    player.classList.add('hide-controls');
   }
  },2600);
 }
 async function requestWake() {
  if(!running || document.visibilityState!=='visible' || !('wakeLock' in navigator)) return;
  try {if(!wake) {const lock=await navigator.wakeLock.request('screen');if(!running){await lock.release();return;}wake=lock;lock.addEventListener('release',()=>{if(wake===lock)wake=null;});}}
  catch(_) { /* Screen wake lock is best-effort. Set OS sleep manually. */ }
 }
 function setFullscreen() {
  if(!running || document.fullscreenElement) return;
  if(player.requestFullscreen) player.requestFullscreen().catch(()=>{ $('currentName').textContent='全画面にならない場合は F11 キーを押してください。';revealControls(); });
 }
 function preload(file) {
  return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file), image=new Image();
   let finished=false;
   const finish=(ok)=>{
    if(finished)return;finished=true;clearTimeout(timeout);image.onload=null;image.onerror=null;
    if(ok)resolve({url,image});else{image.src='';URL.revokeObjectURL(url);reject(new Error('Image unavailable'));}
   };
   const timeout=setTimeout(()=>finish(false),15000);
   image.onload=()=>finish(image.naturalWidth>0);
   image.onerror=()=>finish(false);
   image.src=url;
  });
 }
 function schedule(elapsed=0) {
  clearTimeout(timer);
  if(running && !paused && playlist.length>1) timer=setTimeout(()=>step(1), Math.max(500,settings.seconds*1000-elapsed));
 }
 function updateControls() {
  $('pause').textContent=paused?'再開':'一時停止';
  $('currentIndex').textContent=index<0?'読み込み中…':`${index+1} / ${playlist.length}${paused?'　停止中':''}${failedCount?`　読込不可 ${failedCount}枚`:''}`;
  $('prev').disabled=$('next').disabled=busy || playlist.length<2;
 }
 async function showAt(target) {
  if(!running || busy)return;
  busy=true;clearTimeout(timer);updateControls();
  const token=generation;
  let asset=null,found=-1;
  for(let attempt=0;attempt<playlist.length;attempt++) {
   const k=((target+attempt)%playlist.length+playlist.length)%playlist.length;
   const file=playlist[k];
   if(invalid.has(file))continue;
   try {asset=await preload(file);found=k;}
   catch(_) {if(token!==generation)return;invalid.add(file);failedCount=invalid.size;}
   if(token!==generation || !running) {if(asset)URL.revokeObjectURL(asset.url);return;}
   if(asset)break;
  }
  if(!asset) {stop();message('選択された画像を読み込めませんでした。画像がPC内に保存されているか確認し、JPG・PNG などを選び直してください。',true);return;}
  const incoming=active===0?1:0, outgoing=active;
  resetLayer(incoming);
  layerURLs[incoming]=asset.url;
  const layer=layers[incoming],photo=layer.querySelector('.photo');
  layer.querySelector('.background').src=asset.url;
  photo.src=asset.url;
  // Keep filenames out of the projected picture; show only in the temporary toolbar.
  photo.alt='';
  layer.style.zIndex='2';
  if(outgoing>=0) layers[outgoing].style.zIndex='1';
  layer.style.transition='none';layer.style.opacity='0';
  void layer.offsetWidth;
  const fade=outgoing<0?0:settings.fade;
  layer.style.transition=`opacity ${fade}ms linear`;
  layer.style.opacity='1';
  if(settings.motion) {
   animations[incoming]=photo.animate([{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:settings.seconds*1000+settings.fade,easing:'linear',fill:'forwards'});
   if(paused)animations[incoming].pause();
  }
  index=found;active=incoming;
  $('currentName').textContent=playlist[index].name;updateControls();
  if(fade)await sleep(fade);
  if(token!==generation || !running)return;
  if(outgoing>=0)resetLayer(outgoing);
  busy=false;updateControls();schedule(fade);revealControlsAfterLoad();
 }
 function revealControlsAfterLoad() {
  // Do not re-display controls each slide. Only arm hiding after the first image.
  if(!player.classList.contains('hide-controls'))revealControls();
 }
 function step(direction) {
  if(!running || busy || !playlist.length)return;
  let target=index+direction;
  if(target>=playlist.length && settings.order==='shuffle') {
   const previous=playlist[index];playlist=shuffle(playlist,previous);target=0;
  }
  void showAt((target+playlist.length)%playlist.length);
 }
 function togglePause() {
  if(!running)return;
  paused=!paused;
  if(paused)clearTimeout(timer);else if(!busy)schedule();
  animations.forEach(animation=>{if(animation) {if(paused)animation.pause();else animation.play();}});
  updateControls();revealControls();
 }
 function blackout() {
  player.classList.toggle('blacked');
  $('blackoutBtn').textContent=player.classList.contains('blacked')?'暗転解除':'暗転';
  if(player.classList.contains('blacked')) {clearTimeout(hideTimer);player.classList.add('hide-controls');}
  else revealControls();
 }
 function stop() {
  if(!running)return;
  running=false;generation++;clearTimeout(timer);clearTimeout(hideTimer);
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  if(wake){wake.release().catch(()=>{});wake=null;}
  player.hidden=true;player.classList.remove('hide-controls','blacked');
  $('blackoutBtn').textContent='暗転';
  layers.forEach((_,i)=>resetLayer(i));
  $('setup').hidden=false;busy=false;paused=false;active=-1;index=-1;
   document.body.classList.remove('is-presenting');
  if(failedCount)message(`${failedCount}枚の画像を読み込めずスキップしました。本番前に対象フォルダを確認してください。`,true);
  $('start').focus();
 }
 $('start').onclick=()=>{
  if(!files.length)return;
  settings={seconds:Number($('seconds').value),order:$('order').value,motion:$('motion').checked,fade:$('fade').checked?1000:0};
  playlist=settings.order==='shuffle'?shuffle(files):[...files];invalid=new Set();failedCount=0;
  running=true;paused=false;busy=false;generation++;index=-1;active=-1;
  $('setup').hidden=true;document.body.classList.add('is-presenting');player.hidden=false;player.classList.toggle('black',$('background').value==='black');
  $('currentName').textContent='';updateControls();revealControls();
  // Fullscreen must be requested directly from this user click, before awaiting images.
  setFullscreen();void requestWake();void showAt(0);
 };
 $('pause').onclick=togglePause;$('next').onclick=()=>step(1);$('prev').onclick=()=>step(-1);
 $('stop').onclick=stop;$('fullscreenBtn').onclick=setFullscreen;$('blackoutBtn').onclick=blackout;
 player.addEventListener('pointermove',revealControls);player.addEventListener('pointerdown',revealControls);
 $('controls').addEventListener('focusin',revealControls);
 document.addEventListener('fullscreenchange',()=>{if(running && !document.fullscreenElement)stop();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void requestWake();});
 document.addEventListener('keydown',event=>{
  if(!running)return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(event.code==='Space'){event.preventDefault();if(!event.repeat)togglePause();}
  else if(event.key==='ArrowRight'){event.preventDefault();step(1);}
  else if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
  else if(event.key==='Escape'){event.preventDefault();stop();}
  else if(event.key.toLowerCase()==='b'){if(!event.repeat)blackout();}
  else if(event.key.toLowerCase()==='f'){if(!event.repeat)setFullscreen();}
  else if(event.key==='Tab')revealControls();
 });
 window.addEventListener('pagehide',()=>{if(running)stop();if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}});
 window.addEventListener('pageshow',event=>{if(event.persisted&&chosen.length)filterSelection();});
})();
