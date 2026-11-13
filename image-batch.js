'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const MAX_EDGE=16000, MAX_PIXELS=80000000, MAX_INPUT_PIXELS=120000000, MAX_FILES=1000, MAX_BYTES=750*1024*1024;
 const allowed=/\.(jpe?g|png|webp|avif|bmp|gif)$/i;
 const collator=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
 const state={items:[],errors:[],busy:false,kind:'',cancel:false,nextId:1,selected:null,previewToken:0,visible:24};
 const tick=()=>new Promise(r=>setTimeout(r,0));
 const num=n=>n.toLocaleString('ja-JP');
 const dims=(w,h)=>`${num(w)} × ${num(h)}`;
 const bytes=n=>n>=1024**3?`${(n/1024**3).toFixed(2)} GB`:n>=1024**2?`${(n/1024**2).toFixed(1)} MB`:n>=1024?`${(n/1024).toFixed(1)} KB`:`${n} B`;
 const getMode=()=>document.querySelector('input[name=sizeMode]:checked').value;
 const largest=()=>state.items.reduce((max,x)=>!max||x.width*x.height>max.width*max.height?x:max,null);
 const setText=(id,text)=>{$(id).textContent=text;};
 const notify=(id,text,error=false)=>{setText(id,text);$(id).classList.toggle('error',error);};
 const outputTotal=()=>state.items.reduce((sum,x)=>sum+(x.output?.blob.size||0),0);
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 function getConfig(){
  const mode=getMode(), max=largest();let w,h,reason='';
  if(mode==='custom'){w=Number($('width').value);h=Number($('height').value);}
  else if(!max){return {error:'画像を選ぶと、出力サイズが決まります。'};}
  else if(mode==='largest'){w=max.width;h=max.height;reason=`基準：${max.name}`;}
  else {
   let rw,rh;
   if($('ratioPreset').value==='custom'){rw=Number($('ratioWidth').value);rh=Number($('ratioHeight').value);}
   else [rw,rh]=$('ratioPreset').value.split(',').map(Number);
   if(!Number.isInteger(rw)||!Number.isInteger(rh)||rw<1||rh<1||rw>1000||rh>1000)return {error:'比率は1〜1,000の整数で入力してください。'};
   const d=gcd(rw,rh);rw/=d;rh/=d;
   const k=Math.ceil(Math.sqrt(max.width*max.height/(rw*rh)));w=rw*k;h=rh*k;
   reason=`比率 ${rw}:${rh}・最大画像 ${(max.width*max.height/1e6).toFixed(2)} MP 以上`;
  }
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1)return {error:'横幅・高さは1以上の整数で入力してください。'};
  if(w>MAX_EDGE||h>MAX_EDGE||w*h>MAX_PIXELS)return {error:'出力は一辺16,000px・80MP以内で指定してください。最大画像が上限を超える場合は「指定サイズ」に切り替えてください。'};
  const fit=$('fit').value,bg=$('background').value,mime=$('format').value,quality=Number($('quality').value)/100;
  if(fit==='contain'&&bg==='transparent'&&mime==='image/jpeg')return {error:'透明背景にはPNGかWebPを選んでください。JPGで保存する場合は背景を黒・白・ぼかしに変更してください。'};
  const cfg={w,h,fit,bg,mime,quality,mode,reason};
  cfg.key=JSON.stringify([w,h,fit,fit==='contain'?bg:'',mime,mime==='image/png'?1:quality]);return cfg;
 }
 function setBusy(on,kind=''){
  state.busy=on;state.kind=kind;$('settings').disabled=on;
  ['chooseFiles','chooseFolder','folderInput','filesInput'].forEach(id=>$(id).disabled=on);
  $('clear').disabled=on||!state.items.length;
  $('cancel').hidden=!(on&&kind==='convert');$('cancel').disabled=false;if(on&&kind==='convert')setText('cancel','停止する');
  syncButtons();
  document.querySelectorAll('.image-actions button').forEach(b=>b.disabled=on||(b.dataset.action==='download'&&!state.items.find(i=>i.id===Number(b.dataset.id))?.output));
 }
 function syncButtons(){
  window.PhotoStudio?.setDirty(state.items.length>0);
  const cfg=getConfig(),done=state.items.filter(x=>x.output),pending=state.items.filter(x=>!x.output||x.output.key!==cfg.key);
  $('convert').disabled=state.busy||!state.items.length||!!cfg.error||pending.length===0;
  $('convert').textContent=!state.busy&&state.items.length&&pending.length===0?'現在の設定で変換済み':pending.length<state.items.length&&pending.length?'未変換・変更分を変換する':'すべての画像を変換する';
  if(state.busy&&state.kind==='convert')$('convert').textContent='画像を変換中…';
  $('downloadZip').disabled=state.busy||!done.length;
  $('clear').disabled=state.busy||(!state.items.length&&!state.errors.length);
  setText('runHint',!state.items.length?'まず画像を選択してください。':cfg.error?'設定を確認してください。':pending.length?`${num(pending.length)}枚を1枚ずつ処理します。元画像は変更しません。`:'下の保存ボタンからダウンロードできます。');
  const stale=done.filter(x=>x.output.key!==cfg.key).length;
  setText('resultsHint',`${num(done.length)} / ${num(state.items.length)} 枚 変換済み${done.length?` ・ 合計 ${bytes(outputTotal())}`:''}${stale?`　⚠ ${stale}枚は変更前の設定です。再変換してください。`:''}`);
  $('resultsHint').classList.toggle('warning',stale>0);
 }
 function updateSettings(){
  const mode=getMode();$('customPanel').hidden=mode!=='custom';$('largestPanel').hidden=mode!=='largest';$('ratioPanel').hidden=mode!=='ratio';
  $('ratioCustom').hidden=$('ratioPreset').value!=='custom';
  $('backgroundField').hidden=$('fit').value!=='contain';
  const png=$('format').value==='image/png';$('quality').disabled=png;setText('qualityValue',png?'—':`${$('quality').value}%`);setText('qualityHint',png?'PNGは固定':'JPG / WebP');
  const cfg=getConfig();
  if(cfg.error){setText('targetSize','—');setText('targetMP','');notify('validation',cfg.error,!!state.items.length||mode==='custom');setText('sizeNote','設定または画像の選択を確認してください。');}
  else {
   $('targetSize').replaceChildren(document.createTextNode(dims(cfg.w,cfg.h)+' '));const u=document.createElement('span');u.className='unit';u.textContent='px';$('targetSize').append(u);
   setText('targetMP',`${(cfg.w*cfg.h/1e6).toFixed(2)} MP`);
   setText('sizeNote',cfg.reason||'全画像をこの縦横ピクセル数に揃えます。');
   const warnings=[];if(cfg.w*cfg.h>32000000)warnings.push('大きな出力サイズです。メモリ不足の場合はサイズや枚数を減らしてください。');
   if(cfg.fit==='stretch')warnings.push('縦横比が変わり、人物・文字などが歪みます。');
   notify('validation',warnings.join(' '));$('validation').classList.toggle('warning',warnings.length>0);
  }
  syncButtons();renderGrid();schedulePreview();
 }
 function releaseOutput(item){if(item.output){URL.revokeObjectURL(item.output.url);URL.revokeObjectURL(item.output.thumbUrl);item.output=null;}}
 function releaseItem(item){URL.revokeObjectURL(item.thumbUrl);releaseOutput(item);}
 function clearAll(){if(state.busy)return;state.previewToken++;state.items.forEach(releaseItem);state.items=[];state.errors=[];state.selected=null;state.visible=24;notify('importStatus','');$('progressWrap').hidden=true;renderAll();}
 function newCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function context(c){const ctx=c.getContext('2d',{colorSpace:'srgb'});if(!ctx)throw new Error('描画用のメモリを確保できません。枚数や出力サイズを減らしてください。');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';return ctx;}
 function blobOf(canvas,mime='image/jpeg',quality=.9){return new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b&&b.size?resolve(b):reject(new Error('画像の書き出しに失敗しました。出力サイズを小さくしてください。')),mime,quality);}catch(e){reject(e);}});}
 async function decode(file){
  if(typeof createImageBitmap==='function'){
   try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});if(bitmap.width&&bitmap.height)return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()};bitmap.close();}catch(_){/* Try HTMLImageElement below. */}
  }
  return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);let done=false;
   const timer=setTimeout(()=>finish(false),30000);
   function finish(ok){if(done)return;done=true;clearTimeout(timer);image.onload=null;image.onerror=null;
    if(ok)resolve({image,width:image.naturalWidth,height:image.naturalHeight,close:()=>{image.src='';URL.revokeObjectURL(url);}});
    else{image.src='';URL.revokeObjectURL(url);reject(new Error('画像を読み込めません。破損や形式を確認してください。'));}}
   image.onload=()=>finish(image.naturalWidth>0);image.onerror=()=>finish(false);image.src=url;
  });
 }
 async function thumbnail(image,w,h){const scale=Math.min(1,720/w,720/h),c=newCanvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));try{context(c).drawImage(image,0,0,c.width,c.height);return await blobOf(c,'image/png');}finally{c.width=c.height=1;}}
 function makeDrawRect(sw,sh,w,h,fit){if(fit==='stretch')return {x:0,y:0,w,h,scale:Math.max(w/sw,h/sh)};const s=fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);return {x:(w-sw*s)/2,y:(h-sh*s)/2,w:sw*s,h:sh*s,scale:s};}
 function paint(canvas,image,sw,sh,cfg){
  const ctx=context(canvas),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(cfg.fit==='contain'){
   if(cfg.bg==='blur'){
    ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    // Blur a small backing canvas instead of filtering an 80MP bitmap.
    const scale=Math.min(1,400/Math.max(w,h)),bw=Math.max(1,Math.ceil(w*scale)),bh=Math.max(1,Math.ceil(h*scale)),b=newCanvas(bw,bh),bc=context(b);
    const r=makeDrawRect(sw,sh,bw,bh,'cover');bc.filter=`blur(${Math.max(3,Math.max(bw,bh)*.034)}px)`;
    const pad=Math.max(bw,bh)*.13;bc.drawImage(image,r.x-pad,r.y-pad,r.w+2*pad,r.h+2*pad);bc.filter='none';ctx.drawImage(b,0,0,w,h);ctx.fillStyle='rgba(0,0,0,.40)';ctx.fillRect(0,0,w,h);b.width=b.height=1;
   }else if(cfg.bg!=='transparent'){ctx.fillStyle=cfg.bg==='white'?'#fff':'#000';ctx.fillRect(0,0,w,h);}
  }else if(cfg.mime==='image/jpeg'){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);}
  const r=makeDrawRect(sw,sh,w,h,cfg.fit);ctx.drawImage(image,r.x,r.y,r.w,r.h);
 }
 let previewTimer=null;
 function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,80);}
 async function renderPreview(){
  const token=++state.previewToken,item=state.items.find(x=>x.id===state.selected)||state.items[0],cfg=getConfig();
  if(!item||cfg.error){$('previewCanvas').hidden=true;$('previewPlaceholder').hidden=false;return;}
  state.selected=item.id;$('previewSelect').value=String(item.id);
  const image=new Image();image.src=item.thumbUrl;try{await image.decode();}catch(_){return;}if(token!==state.previewToken)return;
  const c=$('previewCanvas'),s=Math.min(1,1100/cfg.w,660/cfg.h);c.width=Math.max(1,Math.round(cfg.w*s));c.height=Math.max(1,Math.round(cfg.h*s));
  paint(c,image,image.naturalWidth,image.naturalHeight,cfg);c.hidden=false;$('previewPlaceholder').hidden=true;
  const r=makeDrawRect(item.width,item.height,cfg.w,cfg.h,cfg.fit);$('previewMeta').replaceChildren();const base=document.createElement('strong');base.textContent=`元：${dims(item.width,item.height)} → 出力：${dims(cfg.w,cfg.h)} px`;$('previewMeta').append(base,document.createElement('br'));
  const scaleText=cfg.fit==='stretch'?`横 ${(cfg.w/item.width).toFixed(2)}倍 / 縦 ${(cfg.h/item.height).toFixed(2)}倍（伸縮）`:r.scale>1.005?`写真部分を ${r.scale.toFixed(2)} 倍に拡大`:r.scale<.995?`写真部分を ${r.scale.toFixed(2)} 倍に縮小`:'写真部分はほぼ等倍';
  const span=document.createElement('span');span.textContent=scaleText;if(r.scale>=2)span.className='warning';$('previewMeta').append(span);
 }
 function renderStats(){const max=largest();setText('count',`${num(state.items.length)} 枚`);setText('countNote',state.items.length?'追加選択・個別削除ができます':'何度でも追加できます');setText('largestSize',max?`${dims(max.width,max.height)} px`:'—');setText('largestName',max?`${max.name} ・ ${(max.width*max.height/1e6).toFixed(2)} MP`:'画像を選ぶと、自動で判定します');$('largestName').title=max?max.path:'';setText('totalSize',state.items.length?bytes(state.items.reduce((sum,x)=>sum+x.file.size,0)):'—');
  $('previewSelect').replaceChildren();if(!state.items.length){const o=new Option('画像未選択','');$('previewSelect').append(o);}else state.items.forEach(x=>$('previewSelect').add(new Option(x.name,String(x.id))));
  if(!state.items.some(x=>x.id===state.selected))state.selected=state.items[0]?.id||null;
  if(state.selected)$('previewSelect').value=String(state.selected);
  $('previewSelect').disabled=!state.items.length;$('previewPrev').disabled=$('previewNext').disabled=state.items.length<2;
 }
 function renderErrors(){const errors=state.errors;$('importErrors').hidden=!errors.length;setText('errorSummary',`${errors.length}件を読み込めませんでした / 対象外でした`);$('errorList').replaceChildren();errors.slice(-100).forEach(e=>{const p=document.createElement('p');p.textContent=`${e.name}：${e.message}`;$('errorList').append(p);});if(errors.length>100){const p=document.createElement('p');p.textContent='直近100件を表示しています。';$('errorList').prepend(p);}}
 function renderGrid(){
  const grid=$('imageGrid'),cfg=getConfig();grid.replaceChildren();$('emptyResults').hidden=state.items.length>0;
  for(const item of state.items.slice(0,state.visible)){
   const out=item.output,stale=!!out&&out.key!==cfg.key,card=document.createElement('article');card.className='image-card'+(item.id===state.selected?' selected':'');
   const picture=document.createElement('button');picture.type='button';picture.className='picture';picture.dataset.action='preview';picture.dataset.id=item.id;picture.setAttribute('aria-label',`${item.name}をプレビュー`);
   const img=document.createElement('img');img.src=out?.thumbUrl||item.thumbUrl;img.alt=item.name;img.loading='lazy';img.decoding='async';picture.append(img);
   const badge=document.createElement('span');badge.className='badge'+(out?(stale?' old':' done'):'');badge.textContent=item.processing?'変換中…':item.convertError?'変換エラー':out?(stale?'設定変更あり':'変換済み'):'元画像';picture.append(badge);
   const body=document.createElement('div');body.className='image-body';const name=document.createElement('div');name.className='image-name';name.textContent=item.name;name.title=item.path;body.append(name);
   const meta=document.createElement('div');meta.className='image-meta';meta.append(document.createTextNode(`元 ${dims(item.width,item.height)} px`),document.createElement('br'));
   const after=document.createElement('span');after.className=item.convertError?'error':'after';after.textContent=item.convertError?item.convertError:out?`→ ${dims(out.w,out.h)} px ・ ${bytes(out.blob.size)}`:'設定後に「変換する」を押してください';meta.append(after);body.append(meta);
   const actions=document.createElement('div');actions.className='image-actions';const dl=document.createElement('button');dl.className='small'+(out?' primary':'');dl.type='button';dl.textContent=out?`${out.ext.toUpperCase()} を保存`:'未変換';dl.dataset.action='download';dl.dataset.id=item.id;dl.disabled=!out||state.busy;actions.append(dl);
   const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='削除';remove.title='この一覧から削除（元ファイルは残ります）';remove.dataset.action='remove';remove.dataset.id=item.id;remove.disabled=state.busy;actions.append(remove);body.append(actions);card.append(picture,body);grid.append(card);
  }
  $('showMore').hidden=state.visible>=state.items.length;setText('showMore',`さらに表示（残り ${Math.max(0,state.items.length-state.visible)} 枚）`);
 }
 function renderAll(){renderStats();renderErrors();updateSettings();}
 async function addFiles(entries){
  if(state.busy||!entries.length)return;setBusy(true,'import');notify('importStatus','画像のサイズを確認しています…');$('importStatus').classList.add('busy-dot');
  const keys=new Set(state.items.map(x=>x.key));let added=0,duplicate=0,excluded=0;
  try{
   for(let n=0;n<entries.length;n++){
    const entry=entries[n],file=entry.file||entry,path=entry.path||file.webkitRelativePath||file.name;
    if(!file||!file.name)continue;
    if(path.split('/').some(x=>x.startsWith('.'))){excluded++;continue;}
    if(!allowed.test(file.name)){excluded++;if(/\.(heic|heif|raw|tiff?|cr2|cr3|arw|nef|dng|svg)$/i.test(file.name))state.errors.push({name:path,message:'対象外の形式です。JPGまたはPNGに変換してから読み込んでください。'});continue;}
    const key=[path,file.size,file.lastModified].join('|');if(keys.has(key)){duplicate++;continue;}
    if(state.items.length>=MAX_FILES){state.errors.push({name:path,message:'最大1,000枚です。少ない枚数に分けてください。'});break;}
    notify('importStatus',`${n+1} / ${entries.length} 件を確認中：${file.name}`);await tick();let decoded;
    try{decoded=await decode(file);if(decoded.width*decoded.height>MAX_INPUT_PIXELS)throw new Error('120MPを超える元画像は対象外です。先にサイズを小さくしてください。');const thumb=await thumbnail(decoded.image,decoded.width,decoded.height);
     state.items.push({id:state.nextId++,file,path,name:file.name,key,width:decoded.width,height:decoded.height,thumbUrl:URL.createObjectURL(thumb),output:null,processing:false,convertError:''});keys.add(key);added++;
    }catch(e){state.errors.push({name:path,message:e.message||'画像を読み込めませんでした。'});}finally{decoded?.close();}
   }
   state.items.sort((a,b)=>collator.compare(a.path,b.path));
   notify('importStatus',`${added}枚を追加しました。${duplicate?` 重複 ${duplicate}件をスキップ。`:''}${excluded?` 対象外・画像以外 ${excluded}件を除外。`:''} ファイルは外部に送信されていません。`);
  }catch(e){notify('importStatus',`読み込み中にエラー：${e.message}`,true);}finally{$('importStatus').classList.remove('busy-dot');setBusy(false);renderAll();}
 }
 function progress(done,total,text){$('progressWrap').hidden=false;const p=total?Math.round(done/total*100):0;$('progressFill').style.width=`${p}%`;$('progressTrack').setAttribute('aria-valuenow',String(p));notify('runStatus',text);}
 function safeStem(name){let stem=name.replace(/\.[^.]*$/,'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,100);if(!stem)stem='image';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;return stem;}
 function uniqueName(item,cfg,ext){const used=new Set(state.items.filter(x=>x.id!==item.id&&x.output).map(x=>x.output.name.toLowerCase())),base=`${safeStem(item.name)}_${cfg.w}x${cfg.h}`;let name=`${base}.${ext}`,i=2;while(used.has(name.toLowerCase()))name=`${base}_${i++}.${ext}`;return name;}
 async function convertAll(){
  if(state.busy)return;const cfg=getConfig();if(cfg.error||!state.items.length)return;const jobs=state.items.filter(x=>!x.output||x.output.key!==cfg.key);if(!jobs.length)return;
  state.cancel=false;setBusy(true,'convert');let complete=0,failed=0,halted='';$('runStatus').classList.add('busy-dot');
  try{
   for(let n=0;n<jobs.length;n++){
    if(state.cancel)break;const item=jobs[n];item.processing=true;item.convertError='';renderGrid();progress(n,jobs.length,`${n+1} / ${jobs.length} 枚を変換中：${item.name}`);await tick();let decoded,canvas;
    try{
     decoded=await decode(item.file);canvas=newCanvas(cfg.w,cfg.h);paint(canvas,decoded.image,decoded.width,decoded.height,cfg);
     decoded.close();decoded=null;await tick();const blob=await blobOf(canvas,cfg.mime,cfg.quality);
     if(outputTotal()-(item.output?.blob.size||0)+blob.size>MAX_BYTES){halted='変換済みデータが750MiBを超えるため停止しました。下の保存ボタンで保存してから、少ない枚数に分けてください。';break;}
     const thumb=await thumbnail(canvas,cfg.w,cfg.h),ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
     const name=uniqueName(item,cfg,ext);releaseOutput(item);
     item.output={blob,url:URL.createObjectURL(blob),thumbUrl:URL.createObjectURL(thumb),ext,name,key:cfg.key,w:cfg.w,h:cfg.h,mime:blob.type};
     if(blob.type!==cfg.mime)item.convertError='指定形式が非対応のためPNGで保存';complete++;
    }catch(e){item.convertError=e.message||'変換できませんでした。';failed++;}
    finally{decoded?.close();if(canvas)canvas.width=canvas.height=1;item.processing=false;}
    progress(n+1,jobs.length,`${n+1} / ${jobs.length} 枚を処理しました。`);renderGrid();syncButtons();await tick();
   }
  }catch(e){halted=`処理を停止しました：${e.message}`;}
  finally{
   state.items.forEach(x=>x.processing=false);setBusy(false);$('runStatus').classList.remove('busy-dot');
   const stop=halted||state.cancel;const text=halted||(state.cancel?`停止しました。完了した${complete}枚は保存できます。`:`${complete}枚の変換が完了しました。${failed?` ${failed}枚にエラーがあります。`:''} 個別またはZIPで保存してください。`);
   if(!stop)progress(jobs.length,jobs.length,text);else notify('runStatus',text,!!halted);
   renderGrid();syncButtons();
  }
 }
 function saveURL(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
 // ZIP "store" writer, no external dependency. UTF-8 names, CRC-32, no ZIP64.
 const crcTable=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let v=i;for(let j=0;j<8;j++)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);t[i]=v>>>0;}return t;})();
 async function crcOf(blob){let crc=0xffffffff;const reader=blob.stream().getReader();try{while(true){const {done,value}=await reader.read();if(done)break;for(let i=0;i<value.length;i++)crc=crcTable[(crc^value[i])&255]^(crc>>>8);await tick();}}finally{reader.releaseLock();}return (crc^0xffffffff)>>>0;}
 function zipLocal(name,size,crc,time,date){const b=new Uint8Array(30+name.length),v=new DataView(b.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,0,true);v.setUint16(10,time,true);v.setUint16(12,date,true);v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);b.set(name,30);return b;}
 function zipCentral(name,size,crc,time,date,offset){const b=new Uint8Array(46+name.length),v=new DataView(b.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(10,0,true);v.setUint16(12,time,true);v.setUint16(14,date,true);v.setUint32(16,crc,true);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);b.set(name,46);return b;}
 async function downloadZip(){
  if(state.busy)return;const outputs=state.items.filter(x=>x.output).map(x=>x.output);if(!outputs.length)return;setBusy(true,'zip');$('runStatus').classList.add('busy-dot');
  try{
   const parts=[],central=[],encoder=new TextEncoder();let offset=0,centralSize=0;const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=((Math.max(1980,Math.min(2107,now.getFullYear()))-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
   for(let i=0;i<outputs.length;i++){const o=outputs[i];progress(i,outputs.length,`ZIPを作成中 ${i+1} / ${outputs.length}：${o.name}`);const name=encoder.encode(o.name),crc=await crcOf(o.blob),local=zipLocal(name,o.blob.size,crc,time,date),head=zipCentral(name,o.blob.size,crc,time,date,offset);parts.push(local,o.blob);central.push(head);offset+=local.length+o.blob.size;centralSize+=head.length;await tick();}
   if(offset+centralSize+22>0xffffffff)throw new Error('ZIPが大きすぎます。枚数を減らしてください。');
   const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,outputs.length,true);view.setUint16(10,outputs.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
   const zip=new Blob([...parts,...central,end],{type:'application/zip'}),url=URL.createObjectURL(zip),pad=n=>String(n).padStart(2,'0');
   saveURL(url,`images_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.zip`);setTimeout(()=>URL.revokeObjectURL(url),120000);
   progress(outputs.length,outputs.length,`${outputs.length}枚をZIPにまとめました。ブラウザのダウンロード先を確認してください。`);
  }catch(e){notify('runStatus',`ZIPの作成に失敗しました：${e.message} 個別保存も利用できます。`,true);}finally{$('runStatus').classList.remove('busy-dot');setBusy(false);renderGrid();}
 }
 async function readEntry(entry,prefix=''){
  if(entry.isFile)return new Promise((resolve,reject)=>entry.file(file=>resolve([{file,path:prefix+file.name}]),reject));
  if(!entry.isDirectory)return [];const reader=entry.createReader(),result=[];
  while(true){const children=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!children.length)break;for(const child of children)result.push(...await readEntry(child,prefix+entry.name+'/'));}return result;
 }
 $('chooseFolder').onclick=()=>{$('folderInput').value='';$('folderInput').click();};$('chooseFiles').onclick=()=>{$('filesInput').value='';$('filesInput').click();};
 $('folderInput').onchange=e=>addFiles([...e.target.files]);$('filesInput').onchange=e=>addFiles([...e.target.files]);$('clear').onclick=clearAll;
 let dragDepth=0;
 window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
 $('dropzone').addEventListener('dragenter',e=>{e.preventDefault();if(!state.busy){dragDepth++;$('dropzone').classList.add('over');}});
 $('dropzone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropzone').classList.remove('over');});
 $('dropzone').addEventListener('drop',async e=>{
  e.preventDefault();dragDepth=0;$('dropzone').classList.remove('over');if(state.busy)return;
  const fallback=[...e.dataTransfer.files],entries=[...e.dataTransfer.items].filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
  try{if(entries.length){setBusy(true,'scan');notify('importStatus','ドロップしたフォルダを確認しています…');const files=[];for(const entry of entries)files.push(...await readEntry(entry));setBusy(false);await addFiles(files);}else await addFiles(fallback);}catch(err){setBusy(false);notify('importStatus',`フォルダを読み込めません。「フォルダを選択」からお試しください。${err.message||''}`,true);}
 });
 $('preset').onchange=()=>{if($('preset').value!=='custom'){const [w,h]=$('preset').value.split(',');$('width').value=w;$('height').value=h;}updateSettings();};
 ['width','height'].forEach(id=>$(id).addEventListener('input',()=>{$('preset').value='custom';updateSettings();}));
 ['fit','background','format','ratioPreset'].forEach(id=>$(id).addEventListener('change',updateSettings));
 ['ratioWidth','ratioHeight','quality'].forEach(id=>$(id).addEventListener('input',updateSettings));
 document.querySelectorAll('input[name=sizeMode]').forEach(el=>el.addEventListener('change',updateSettings));
 $('previewSelect').onchange=()=>{state.selected=Number($('previewSelect').value);renderGrid();schedulePreview();};
 function changePreview(delta){if(!state.items.length)return;const idx=state.items.findIndex(x=>x.id===state.selected);state.selected=state.items[(idx+delta+state.items.length)%state.items.length].id;$('previewSelect').value=String(state.selected);renderGrid();schedulePreview();}
 $('previewPrev').onclick=()=>changePreview(-1);$('previewNext').onclick=()=>changePreview(1);
 $('convert').onclick=convertAll;$('cancel').onclick=()=>{state.cancel=true;$('cancel').disabled=true;setText('cancel','現在の1枚のあとで停止');};$('downloadZip').onclick=downloadZip;
 $('showMore').onclick=()=>{state.visible+=24;renderGrid();};
 $('imageGrid').onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;const item=state.items.find(x=>x.id===Number(b.dataset.id));if(!item)return;
  if(b.dataset.action==='preview'){state.selected=item.id;$('previewSelect').value=String(item.id);renderGrid();schedulePreview();$('settingsHeading').scrollIntoView({behavior:'smooth',block:'start'});}
  if(state.busy)return;
  if(b.dataset.action==='download'&&item.output)saveURL(item.output.url,item.output.name);
  if(b.dataset.action==='remove'){releaseItem(item);state.items=state.items.filter(x=>x.id!==item.id);renderAll();}
 };
 // The shared navigation guard warns before losing selected/converted images.
 renderAll();
})();
