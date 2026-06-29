/* ====== MagicHome v2 ====== */
const STORE = "magichome_v2";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect rx="28" width="120" height="120" fill="#0f1422"/><circle cx="92" cy="25" r="9" fill="#fff8a6"/><circle cx="104" cy="41" r="5" fill="#fff"/><text x="20" y="84" font-size="64">🪄</text></svg>`;
const FALLBACK_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(ICON_SVG)}`;

const ENGINES = {
  google:  { label:"Google",  url:q=>`https://www.google.com/search?q=${encodeURIComponent(q)}` },
  naver:   { label:"Naver",   url:q=>`https://search.naver.com/search.naver?query=${encodeURIComponent(q)}` },
  daum:    { label:"Daum",    url:q=>`https://search.daum.net/search?w=tot&q=${encodeURIComponent(q)}` },
  youtube: { label:"YouTube", url:q=>`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  nate:    { label:"Nate",    url:q=>`https://search.nate.com/search/all.html?q=${encodeURIComponent(q)}` },
};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const uid=(p="i")=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

/* ====== STATE ====== */
let S = load();
let editId = null, openFolderId = null, curvePtr = null;
let dragState = null, toastTm = null, threeCtx = null;
let ignoreClick = 0;

document.addEventListener("DOMContentLoaded", boot);

function boot(){
  fillEngineOpts();
  bindAll();
  syncSettingsUI();
  initThree();
  renderAll();
  startClock();
  doIntro();
}

/* ====== DEFAULT DATA ====== */
function defaults(){
  return {
    cfg:{
      layout:"curve", engine:"google",
      showClock:true, showWeather:false,
      skipIntro:false, mouseEffect:true,
      welcome:"반가워요. 오늘도 매직하게 시작해볼까요?",
      bgType:"three", bgImage:"", bgFit:"cover",
    },
    items: defaultApps(),
    notes:[], ci:0, gp:0, wc:null,
  };
}

function defaultApps(){
  return [
    app("Google","https://www.google.com",false),
    app("Naver","https://www.naver.com",false),
    app("YouTube","https://www.youtube.com",true),
    app("GitHub","https://github.com",true),
    app("Daum","https://www.daum.net",true),
    {id:uid("f"),kind:"folder",name:"즐겨찾기",emoji:"⭐",items:[
      app("Nate","https://www.nate.com",true),
      app("YouTube Music","https://music.youtube.com",true),
    ]},
  ];
}
function app(name,url,lg){return{id:uid("a"),kind:"app",name,url,iconMode:"auto",icon:"",launchGroup:lg}}

/* ====== PERSIST ====== */
function load(){
  const d=defaults();
  try{
    const r=localStorage.getItem(STORE);
    if(!r)return d;
    const s=JSON.parse(r);
    return {...d,...s,cfg:{...d.cfg,...(s.cfg||{})},items:norm(s.items||d.items),notes:Array.isArray(s.notes)?s.notes:[]};
  }catch{return d}
}
function save(){try{localStorage.setItem(STORE,JSON.stringify(S))}catch{toast("저장 공간 부족")}}
function norm(arr){
  if(!Array.isArray(arr))return defaultApps();
  return arr.map(x=>x.kind==="folder"?{...x,emoji:x.emoji||"🪄",items:Array.isArray(x.items)?x.items.map(c=>({...c,kind:"app",iconMode:c.iconMode||"auto",icon:c.icon||"",launchGroup:!!c.launchGroup})):[]}:{...x,kind:"app",iconMode:x.iconMode||"auto",icon:x.icon||"",launchGroup:!!x.launchGroup});
}

/* ====== ENGINE OPTS ====== */
function fillEngineOpts(){
  const h=Object.entries(ENGINES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("");
  $("#eng").innerHTML=h;
  $("#sEng").innerHTML=h;
}

/* ====== BIND ====== */
function bindAll(){
  /* 상단 버튼 */
  $("#btnSet").onclick=()=>showOv($("#setPanel"));
  $("#btnAdd").onclick=()=>openAppModal();
  $("#btnNote").onclick=createNote;
  $("#btnCollection").onclick=launchAll;
  $("#backdrop").onclick=closeAll;

  /* 닫기 위임 */
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-close]")){const w=e.target.closest(".panel,.modal");if(w)closeOv(w)}
    if(!e.target.closest(".qmenu")&&!e.target.closest(".tmore"))hideQM();
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAll()});

  /* 검색 */
  $("#sbtn").onclick=doSearch;
  $("#sinput").onkeydown=e=>{if(e.key==="Enter")doSearch()};
  $("#eng").onchange=e=>{S.cfg.engine=e.target.value;$("#sEng").value=e.target.value;save()};
  $("#sEng").onchange=e=>{S.cfg.engine=e.target.value;$("#eng").value=e.target.value;save()};

  /* 설정 토글 */
  $("#sLayout").onchange=e=>{S.cfg.layout=e.target.value;save();switchLayout()};
  $("#sWelcome").oninput=e=>{S.cfg.welcome=e.target.value.trim();save()};
  $("#tClock").onchange=e=>{S.cfg.showClock=e.target.checked;save();renderWidgets()};
  $("#tWeather").onchange=e=>{S.cfg.showWeather=e.target.checked;save();renderWidgets();if(e.target.checked)fetchWeather(true)};
  $("#tSkipIntro").onchange=e=>{S.cfg.skipIntro=e.target.checked;save()};
  $("#tMouse3d").onchange=e=>{S.cfg.mouseEffect=e.target.checked;save()};

  /* 배경 */
  $("#sBgType").onchange=e=>{S.cfg.bgType=e.target.value;save();applyBg()};
  $("#sBgFit").onchange=e=>{S.cfg.bgFit=e.target.value;save();applyBg()};
  $("#applyBg").onclick=()=>{
    const u=$("#sBgUrl").value.trim();
    if(u){S.cfg.bgImage=u;S.cfg.bgType="image"}
    S.cfg.bgFit=$("#sBgFit").value;S.cfg.bgType=$("#sBgType").value;
    save();syncSettingsUI();applyBg();toast("배경 적용 완료");
  };
  $("#sBgFile").onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{S.cfg.bgImage=await shrink(f,1600,1000,false);S.cfg.bgType="image";save();syncSettingsUI();applyBg();toast("배경 저장됨")}
    catch{toast("이미지 읽기 실패")}e.target.value="";
  };
  $("#resetAll").onclick=()=>{if(!confirm("전체 초기화할까요?"))return;localStorage.removeItem(STORE);location.reload()};

  /* 앱폼 */
  $("#fType").onchange=toggleTypeFields;
  $("#fIconMode").onchange=updateIconUI;
  $("#appForm").onsubmit=submitApp;

  /* 폴더 모달 */
  $("#fmOpenAll").onclick=()=>openFolderUrls(openFolderId);
  $("#fmAddApp").onclick=()=>openAppModal(null,openFolderId||"");

  /* 커브 */
  $("#cVP").addEventListener("wheel",e=>{e.preventDefault();spin(e.deltaY>0?1:-1)},{passive:false});
  $("#cVP").onmousemove=e=>{const r=$("#cVP").getBoundingClientRect();curvePtr=e.clientX-r.left;posCurve()};
  $("#cVP").onmouseleave=()=>{curvePtr=null;posCurve()};
  holdBtn($("#cL"),-1);holdBtn($("#cR"),1);

  /* 그리드 */
  $("#gL").onclick=()=>gridPage(-1);
  $("#gR").onclick=()=>gridPage(1);
  swipe($("#gVP"),d=>gridPage(d==="left"?1:-1));
  swipe($("#cVP"),d=>spin(d==="left"?1:-1),true);

  /* 날씨 클릭 */
  $("#weather").onclick=()=>fetchWeather(true);

  /* 리사이즈 */
  let rt;window.onresize=()=>{clearTimeout(rt);rt=setTimeout(()=>{if(threeCtx)resizeThree();renderCurve();renderGrid();if(openFolderId)renderFolderContent()},80)};
}

/* ====== INTRO ====== */
function doIntro(){
  if(S.cfg.skipIntro){
    $("#intro").classList.add("bye");
    setTimeout(()=>$("#intro").style.display="none",500);
    tryFocus();return;
  }
  $("#introMsg").textContent=S.cfg.welcome||"반가워요";
  const skip=()=>{$("#intro").classList.add("bye");setTimeout(()=>$("#intro").style.display="none",500);tryFocus()};
  $("#intro").onclick=skip;
  setTimeout(skip,1200);
}
function tryFocus(){try{$("#sinput").focus({preventScroll:true})}catch{}}

/* ====== SETTINGS UI ====== */
function syncSettingsUI(){
  $("#sLayout").value=S.cfg.layout;
  $("#eng").value=S.cfg.engine;
  $("#sEng").value=S.cfg.engine;
  $("#sWelcome").value=S.cfg.welcome||"";
  $("#tClock").checked=!!S.cfg.showClock;
  $("#tWeather").checked=!!S.cfg.showWeather;
  $("#tSkipIntro").checked=!!S.cfg.skipIntro;
  $("#tMouse3d").checked=S.cfg.mouseEffect!==false;
  $("#sBgType").value=S.cfg.bgType;
  $("#sBgUrl").value=S.cfg.bgImage&&!S.cfg.bgImage.startsWith("data:")?S.cfg.bgImage:"";
  $("#sBgFit").value=S.cfg.bgFit;
}

/* ====== RENDER ALL ====== */
function renderAll(){S.items=norm(S.items);renderWidgets();applyBg();switchLayout();renderCurve();renderGrid();renderNotes();if(openFolderId)renderFolderContent()}
function renderWidgets(){
  $("#clock").classList.toggle("hidden",!S.cfg.showClock);
  $("#weather").classList.toggle("hidden",!S.cfg.showWeather);
  updateClock();if(S.cfg.showWeather)fetchWeather();
}
function switchLayout(){
  const c=S.cfg.layout==="curve";
  $("#curveWrap").classList.toggle("hidden",!c);
  $("#gridWrap").classList.toggle("hidden",c);
}

/* ====== SEARCH ====== */
function doSearch(){
  const v=$("#sinput").value.trim();if(!v)return;
  window.location.href=isUrl(v)?normUrl(v):ENGINES[S.cfg.engine].url(v);
}
function isUrl(t){if(!t||t.includes(" "))return false;if(/^[a-zA-Z][\w+\-.]*:/.test(t))return true;return/^(localhost|[\w.-]+\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(t)}
function normUrl(s){if(!s)return"";if(/^(javascript|data):/i.test(s))return"";if(/^[a-zA-Z][\w+\-.]*:/.test(s))return s;if(s.startsWith("//"))return`https:${s}`;return`https://${s}`}

/* ====== BACKGROUND ====== */
function applyBg(){
  const useImg=S.cfg.bgType==="image"&&!!S.cfg.bgImage;
  const el=$("#bgImg");
  if(useImg){
    el.style.backgroundImage=`url("${S.cfg.bgImage}")`;el.style.opacity="1";
    el.style.backgroundSize=S.cfg.bgFit==="contain"?"contain":S.cfg.bgFit==="stretch"?"100% 100%":"cover";
  }else{el.style.backgroundImage="none";el.style.opacity="0"}
  $("#threeBg").style.opacity=useImg?"0":"1";
}

/* ====== THREE.JS ====== */
function initThree(){
  const box=$("#threeBg");
  const scene=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,1000);
  cam.position.z=120;
  const ren=new THREE.WebGLRenderer({alpha:true,antialias:true});
  ren.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
  ren.setSize(innerWidth,innerHeight);
  box.appendChild(ren.domElement);

  const geo=new THREE.BufferGeometry();
  const N=800,pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*260;pos[i*3+1]=(Math.random()-.5)*160;pos[i*3+2]=(Math.random()-.5)*180}
  geo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffffff,size:1.6,transparent:true,opacity:.68}));
  scene.add(pts);

  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(34,.28,12,120),
    new THREE.MeshBasicMaterial({color:0x8d7cff,transparent:true,opacity:.1})
  );
  ring.rotation.x=1.2;scene.add(ring);

  /* 마우스 추적 */
  let mx=0,my=0;
  window.addEventListener("mousemove",e=>{
    mx=(e.clientX/innerWidth-.5)*2;
    my=(e.clientY/innerHeight-.5)*2;
  });

  threeCtx={scene,cam,ren,pts,ring,mx:()=>mx,my:()=>my};

  (function anim(){
    if(!threeCtx)return;
    pts.rotation.y+=.0009;pts.rotation.x+=.00025;ring.rotation.z+=.002;
    if(S.cfg.mouseEffect!==false){
      cam.position.x+=(mx*18-cam.position.x)*.035;
      cam.position.y+=(-my*12-cam.position.y)*.035;
      cam.lookAt(0,0,0);
      ring.rotation.x=1.2+my*.06;
      ring.rotation.y=mx*.04;
    }else{
      cam.position.x+=(0-cam.position.x)*.05;
      cam.position.y+=(0-cam.position.y)*.05;
      cam.lookAt(0,0,0);
    }
    ren.render(scene,cam);requestAnimationFrame(anim);
  })();
}
function resizeThree(){if(!threeCtx)return;threeCtx.ren.setSize(innerWidth,innerHeight);threeCtx.cam.aspect=innerWidth/innerHeight;threeCtx.cam.updateProjectionMatrix()}

/* ====== CURVE ====== */
function renderCurve(){
  const t=$("#cTrack");t.innerHTML="";
  if(!S.items.length){t.innerHTML=`<div class="empty-s" style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%)">앱을 추가해보세요</div>`;return}
  S.ci=((S.ci%S.items.length)+S.items.length)%S.items.length;
  S.items.forEach(it=>t.appendChild(mkTile(it,"","curve")));
  requestAnimationFrame(posCurve);
}

function circOff(i,c,n){let d=i-c;if(d>n/2)d-=n;if(d<-n/2)d+=n;return d}

function posCurve(){
  const vp=$("#cVP"),tiles=$$("#cTrack .ctile");if(!tiles.length)return;
  const n=tiles.length,w=vp.clientWidth,h=vp.clientHeight;
  const cx=w/2,by=Math.min(120,h*.36),sp=Math.min(148,w*.17);
  tiles.forEach((el,i)=>{
    const off=circOff(i,S.ci,n);
    const x=cx+off*sp, y=by+Math.pow(Math.abs(off),1.5)*16;
    let sc=Math.max(.55,1-Math.abs(off)*.09);
    if(curvePtr!==null){const d=Math.abs(curvePtr-x);sc+=Math.max(0,.17-d/(w*2.4))}
    const rot=off*-3.5, op=Math.max(.22,1-Math.abs(off)*.17);
    el.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) rotate(${rot}deg) scale(${sc})`;
    el.style.opacity=op;el.style.zIndex=String(100-Math.abs(Math.round(off)));
  });
}
function spin(d){if(S.items.length<2)return;S.ci=(S.ci+d+S.items.length)%S.items.length;save();posCurve()}

/* ====== GRID ====== */
function renderGrid(){
  const t=$("#gTrack");t.innerHTML="";
  const ps=innerWidth<720?6:8, tot=S.items.length, pc=Math.max(1,Math.ceil(Math.max(tot,1)/ps));
  S.gp=clamp(S.gp,0,pc-1);
  for(let p=0;p<pc;p++){
    const pg=document.createElement("div");pg.className="gpage";
    const sl=S.items.slice(p*ps,(p+1)*ps);
    if(!sl.length){pg.innerHTML=`<div class="empty-s">앱을 추가해보세요</div>`}
    else sl.forEach(it=>pg.appendChild(mkTile(it,"","grid")));
    t.appendChild(pg);
  }
  t.style.transform=`translateX(calc(-100% * ${S.gp} / ${pc}))`;
  $("#gLabel").textContent=`${S.gp+1} / ${pc}`;
}
function gridPage(d){
  const ps=innerWidth<720?6:8,pc=Math.max(1,Math.ceil(Math.max(S.items.length,1)/ps));
  S.gp=clamp(S.gp+d,0,pc-1);save();renderGrid();
}

/* ====== TILE ====== */
function mkTile(item,pid="",mode="grid"){
  const el=document.createElement("div");
  el.className=`tile ${mode==="curve"?"ctile":"ltile"}`;
  el.dataset.id=item.id;el.dataset.pid=pid;el.dataset.kind=item.kind;

  const ic=document.createElement("div");ic.className="ticon";
  if(item.kind==="folder") ic.appendChild(folderPrev(item));
  else{const img=document.createElement("img");img.src=resolveIcon(item);img.alt=item.name;img.onerror=()=>img.src=FALLBACK_ICON;ic.appendChild(img)}

  const nm=document.createElement("div");nm.className="tname";nm.textContent=item.name;
  const mr=document.createElement("button");mr.className="tmore";mr.type="button";mr.textContent="⋮";
  const bd=document.createElement("div");bd.className="lbadge";bd.textContent="✨";bd.style.display=item.kind==="app"&&item.launchGroup?"inline-flex":"none";

  el.append(ic,nm,mr,bd);

  el.addEventListener("click",e=>{
    if(Date.now()<ignoreClick)return;if(e.target.closest(".tmore"))return;
    item.kind==="folder"?openFolder(item.id):openApp(item.url);
  });
  mr.addEventListener("click",e=>{e.stopPropagation();showQM(item.id,e.clientX,e.clientY)});
  attachDrag(el,item.id);
  return el;
}

function folderPrev(f){
  const w=document.createElement("div"),sl=(f.items||[]).slice(0,4);
  if(!sl.length){w.className="fprev femoji";w.textContent=f.emoji||"🪄";return w}
  w.className="fprev";
  sl.forEach(c=>{const s=document.createElement("span");s.className="micon";const i=document.createElement("img");i.src=resolveIcon(c);i.onerror=()=>i.src=FALLBACK_ICON;s.appendChild(i);w.appendChild(s)});
  for(let i=sl.length;i<4;i++){const s=document.createElement("span");s.className="micon empty";w.appendChild(s)}
  return w;
}

function resolveIcon(it){
  if(!it||it.kind!=="app")return FALLBACK_ICON;
  if((it.iconMode==="link"||it.iconMode==="upload")&&it.icon)return it.icon;
  if(it.icon)return it.icon;
  try{const u=new URL(normUrl(it.url));if(!/^https?:$/.test(u.protocol))return FALLBACK_ICON;return`https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`}catch{return FALLBACK_ICON}
}

function openApp(raw){const u=normUrl(raw||"");if(!u){toast("열 수 없는 URL");return}window.location.href=u}

/* ====== LAUNCH ALL (모음) ====== */
function launchAll(){
  const urls=collectLaunch(S.items,[]);
  if(!urls.length){toast("모음에 포함된 앱이 없어요");return}
  openMulti(urls);
}
function collectLaunch(items,out){
  items.forEach(it=>{
    if(it.kind==="app"&&it.launchGroup){const u=normUrl(it.url);if(u)out.push(u)}
    if(it.kind==="folder"&&it.items?.length)collectLaunch(it.items,out);
  });return out;
}
function openMulti(urls){
  let blocked=0;
  urls.forEach(u=>{const w=window.open(u,"_blank","noopener");if(!w)blocked++});
  if(blocked)toast(`${urls.length-blocked}개 열림, ${blocked}개 차단됨 — 팝업 허용 필요`);
  else toast(`${urls.length}개 앱 열림`);
}

/* ====== QUICK MENU ====== */
function showQM(id,x,y){
  const f=findItem(id);if(!f)return;const it=f.item;
  const m=$("#qmenu");m.innerHTML="";
  const add=(l,fn,d)=>{const b=document.createElement("button");b.type="button";b.textContent=l;if(d)b.classList.add("danger");b.onclick=()=>{hideQM();fn()};m.appendChild(b)};
  if(it.kind==="app"){
    add("열기",()=>openApp(it.url));
    add("수정",()=>openAppModal(it.id));
    add(it.launchGroup?"모음에서 제외":"모음에 포함",()=>{it.launchGroup=!it.launchGroup;save();renderAll()});
    add("삭제",()=>delItem(it.id),true);
  }else{
    add("폴더 열기",()=>openFolder(it.id));
    add("폴더 수정",()=>openAppModal(it.id));
    add("앱 추가",()=>openAppModal(null,it.id));
    add("전체 열기",()=>openFolderUrls(it.id));
    add("삭제",()=>delItem(it.id),true);
  }
  m.classList.remove("hidden");
  requestAnimationFrame(()=>{const r=m.getBoundingClientRect();m.style.left=`${clamp(x,10,innerWidth-r.width-10)}px`;m.style.top=`${clamp(y,10,innerHeight-r.height-10)}px`});
}
function hideQM(){$("#qmenu").classList.add("hidden")}

/* ====== OVERLAY ====== */
function showOv(el){if(!el)return;el.classList.remove("hidden");requestAnimationFrame(()=>{el.classList.add("open");refreshBD()})}
function closeOv(el){if(!el||el.classList.contains("hidden"))return;el.classList.remove("open");setTimeout(()=>{el.classList.add("hidden");if(el.id==="appModal")editId=null;if(el.id==="folderModal")openFolderId=null;refreshBD()},180);refreshBD()}
function refreshBD(){const on=[$("#setPanel"),$("#appModal"),$("#folderModal")].some(e=>!e.classList.contains("hidden"));$("#backdrop").classList.toggle("hidden",!on);requestAnimationFrame(()=>$("#backdrop").classList.toggle("show",on))}
function closeAll(){hideQM();closeOv($("#setPanel"));closeOv($("#appModal"));closeOv($("#folderModal"))}

/* ====== APP MODAL ====== */
function fillParent(sel=""){
  const s=$("#fParent");s.innerHTML=`<option value="">메인 홈</option>`;
  S.items.filter(x=>x.kind==="folder").forEach(f=>{const o=document.createElement("option");o.value=f.id;o.textContent=`📁 ${f.name}`;s.appendChild(o)});
  s.value=sel||"";
}
function openAppModal(id=null,pHint=""){
  editId=id;const f=id?findItem(id):null;const it=f?.item||null;
  $("#amTitle").textContent=it?"항목 수정":"앱 / 폴더 추가";
  fillParent(f?.parentId||pHint||"");
  $("#fType").value=it?.kind||"app";$("#fType").disabled=!!it;
  $("#fName").value=it?.name||"";
  $("#fUrl").value=it?.url||"";
  $("#fIconMode").value=it?.iconMode||"auto";
  $("#fIconUrl").value=it?.iconMode==="link"?it.icon||"":"";
  $("#fIconFile").value="";
  $("#fLaunch").checked=!!it?.launchGroup;
  $("#fEmoji").value=it?.emoji||"🪄";
  toggleTypeFields();updateIconUI();showOv($("#appModal"));
}
function toggleTypeFields(){const a=$("#fType").value==="app";$("#appFields").classList.toggle("hidden",!a);$("#folderFields").classList.toggle("hidden",a);$("#fUrl").required=a}
function updateIconUI(){const m=$("#fIconMode").value;$("#fIconUrl").disabled=m!=="link";$("#fIconFile").disabled=m!=="upload"}

async function submitApp(e){
  e.preventDefault();
  const tp=$("#fType").value, nm=$("#fName").value.trim()||(tp==="folder"?"새 폴더":"새 앱");
  if(tp==="folder"){
    if(editId){const f=findItem(editId);if(f&&f.item.kind==="folder"){f.item.name=nm;f.item.emoji=$("#fEmoji").value.trim()||"🪄"}}
    else S.items.push({id:uid("f"),kind:"folder",name:nm,emoji:$("#fEmoji").value.trim()||"🪄",items:[]});
    save();renderAll();closeOv($("#appModal"));return;
  }
  const url=$("#fUrl").value.trim();if(!url){toast("URL을 입력하세요");return}
  const im=$("#fIconMode").value;const f=editId?findItem(editId):null;let icon="";
  if(im==="link")icon=$("#fIconUrl").value.trim()||(f?.item.iconMode==="link"?f.item.icon:"");
  else if(im==="upload"){const file=$("#fIconFile").files?.[0];icon=file?await shrink(file,256,256,true):(f?.item.iconMode==="upload"?f.item.icon:"")}
  const obj={id:f?.item.id||uid("a"),kind:"app",name:nm,url,iconMode:im,icon,launchGroup:!!$("#fLaunch").checked};
  const tp2=$("#fParent").value||"";
  if(f){if(f.parentId===tp2)f.parent.splice(f.index,1,obj);else{f.parent.splice(f.index,1);putIn(tp2,obj)}}
  else putIn(tp2,obj);
  save();renderAll();if(openFolderId)renderFolderContent();closeOv($("#appModal"));
}
function putIn(pid,obj){if(!pid){S.items.push(obj);return}const f=getFolder(pid);f?f.items.push(obj):S.items.push(obj)}

/* ====== DATA HELPERS ====== */
function getFolder(id){return S.items.find(x=>x.kind==="folder"&&x.id===id)||null}
function findItem(id){
  for(let i=0;i<S.items.length;i++){
    if(S.items[i].id===id)return{item:S.items[i],parent:S.items,parentId:"",index:i};
    if(S.items[i].kind==="folder"){const a=S.items[i].items||[];const j=a.findIndex(c=>c.id===id);if(j>-1)return{item:a[j],parent:a,parentId:S.items[i].id,index:j}}
  }return null;
}
function delItem(id){
  const f=findItem(id);if(!f)return;
  let msg="삭제할까요?";if(f.item.kind==="folder"&&f.item.items?.length)msg=`폴더와 내부 앱 ${f.item.items.length}개 삭제?`;
  if(!confirm(msg))return;
  f.parent.splice(f.index,1);save();renderAll();
  if(openFolderId&&!getFolder(openFolderId))closeOv($("#folderModal"));
}

/* ====== FOLDER ====== */
function openFolder(id){openFolderId=id;renderFolderContent();showOv($("#folderModal"))}
function renderFolderContent(){
  const f=getFolder(openFolderId);if(!f){closeOv($("#folderModal"));return}
  $("#fmTitle").textContent=f.name;const box=$("#fmApps");box.innerHTML="";
  if(!f.items?.length){box.innerHTML=`<div class="empty-s">비어 있어요</div>`}
  else f.items.forEach(it=>box.appendChild(mkTile(it,f.id,"folder")));
  $("#fmOpenAll").disabled=!f.items?.length;
}
function openFolderUrls(fid){
  const f=getFolder(fid);if(!f||!f.items?.length){toast("비어 있어요");return}
  const urls=f.items.filter(x=>x.kind==="app").map(x=>normUrl(x.url)).filter(Boolean);
  if(!urls.length){toast("열 수 있는 앱 없음");return}
  openMulti(urls);
}

/* ====== DRAG ====== */
function attachDrag(el,id){
  el.addEventListener("pointerdown",e=>{
    if(e.button&&e.button!==0)return;if(e.target.closest(".tmore"))return;
    const sx=e.clientX,sy=e.clientY;let tm;
    const mv=ev=>{if(Math.hypot(ev.clientX-sx,ev.clientY-sy)>8){clearTimeout(tm);cl()}};
    const cl=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",up)};
    const up=()=>{clearTimeout(tm);cl()};
    tm=setTimeout(()=>{cl();startDrag(id,el,sx,sy)},350);
    window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up,{once:true});window.addEventListener("pointercancel",up,{once:true});
  });
}
function startDrag(id,el,x,y){
  const f=findItem(id);if(!f)return;ignoreClick=Date.now()+600;
  const r=el.getBoundingClientRect(),gh=el.cloneNode(true);
  gh.classList.add("drag-ghost");gh.style.width=r.width+"px";gh.style.height=r.height+"px";
  document.body.appendChild(gh);el.classList.add("drag-src");document.body.classList.add("dragging");
  dragState={id,src:el,gh,hov:null};movGh(x,y);
  window.addEventListener("pointermove",onDragMv);
  window.addEventListener("pointerup",endDrag,{once:true});
  window.addEventListener("pointercancel",endDrag,{once:true});
  toast("길게 눌러 이동 중...");
}
function movGh(x,y){if(dragState?.gh){dragState.gh.style.left=x+"px";dragState.gh.style.top=y+"px"}}
function clrHL(){$$(".drop-t,.combine-t").forEach(e=>e.classList.remove("drop-t","combine-t"))}
function nearCenter(r,x,y){return Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2))<Math.min(r.width,r.height)*.24}

function onDragMv(e){
  if(!dragState)return;movGh(e.clientX,e.clientY);clrHL();
  const te=document.elementFromPoint(e.clientX,e.clientY)?.closest(".tile");
  if(!te||te.dataset.id===dragState.id){dragState.hov=null;return}
  const src=findItem(dragState.id),tgt=findItem(te.dataset.id);
  if(!src||!tgt){dragState.hov=null;return}
  let mode=null;
  if(tgt.item.kind==="folder"&&src.item.kind==="app"&&src.parentId!==tgt.item.id)mode="into";
  else if(src.parent===tgt.parent){
    if(!src.parentId&&src.item.kind==="app"&&tgt.item.kind==="app"&&nearCenter(te.getBoundingClientRect(),e.clientX,e.clientY))mode="merge";
    else mode="reorder";
  }
  if(!mode){dragState.hov=null;return}
  dragState.hov={tid:tgt.item.id,mode};
  te.classList.add(mode==="reorder"?"drop-t":"combine-t");
}

function endDrag(){
  if(!dragState)return;window.removeEventListener("pointermove",onDragMv);clrHL();
  document.body.classList.remove("dragging");dragState.src?.classList.remove("drag-src");dragState.gh?.remove();
  const h=dragState.hov,sid=dragState.id;dragState=null;
  if(!h){renderAll();return}
  let ok=false;
  if(h.mode==="reorder")ok=reorder(sid,h.tid);
  else if(h.mode==="into")ok=moveToFolder(sid,h.tid);
  else if(h.mode==="merge")ok=mergeFolder(sid,h.tid);
  if(ok){save();renderAll();if(openFolderId)renderFolderContent()}
}
function reorder(a,b){
  const fa=findItem(a),fb=findItem(b);if(!fa||!fb||fa.parent!==fb.parent)return false;
  const arr=fa.parent,[mv]=arr.splice(fa.index,1);let ti=fb.index;if(fa.index<fb.index)ti--;arr.splice(ti,0,mv);return true;
}
function moveToFolder(aid,fid){
  const s=findItem(aid),f=getFolder(fid);if(!s||!f||s.item.kind!=="app")return false;
  const[mv]=s.parent.splice(s.index,1);f.items.push(mv);return true;
}
function mergeFolder(a,b){
  const fa=findItem(a),fb=findItem(b);if(!fa||!fb||fa.parent!==fb.parent||fa.parentId||fb.parentId)return false;
  if(fa.item.kind!=="app"||fb.item.kind!=="app")return false;
  const arr=fa.parent,ids=new Set([a,b]),idx=Math.min(fa.index,fb.index);
  const picked=arr.filter(x=>ids.has(x.id));
  for(let i=arr.length-1;i>=0;i--)if(ids.has(arr[i].id))arr.splice(i,1);
  arr.splice(idx,0,{id:uid("f"),kind:"folder",name:"새 폴더",emoji:"🪄",items:picked});return true;
}

/* ====== NOTES ====== */
function createNote(){
  const cs=["#ffe78d","#ffd4ea","#d6ffb3","#cae8ff","#f0d2ff"];
  S.notes.push({id:uid("n"),text:"새 메모",x:clamp(40+(S.notes.length*24)%240,12,innerWidth-230),y:clamp(120+(S.notes.length*18)%180,80,innerHeight-210),color:cs[S.notes.length%cs.length]});
  save();renderNotes();
}
function renderNotes(){
  const lay=$("#notes");lay.innerHTML="";
  S.notes.forEach(n=>{
    const el=document.createElement("div");el.className="note";el.style.left=n.x+"px";el.style.top=n.y+"px";el.style.background=n.color;
    const bar=document.createElement("div");bar.className="note-bar";bar.innerHTML="<span>메모</span>";
    const del=document.createElement("button");del.type="button";del.textContent="✕";del.onclick=()=>{S.notes=S.notes.filter(z=>z.id!==n.id);save();renderNotes()};bar.appendChild(del);
    const body=document.createElement("div");body.className="note-body";body.contentEditable="true";body.spellcheck=false;body.innerText=n.text||"";
    body.oninput=()=>{n.text=body.innerText;save()};
    bar.addEventListener("pointerdown",e=>{
      const r=el.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;
      const mv=ev=>{n.x=clamp(ev.clientX-ox,6,innerWidth-r.width-6);n.y=clamp(ev.clientY-oy,6,innerHeight-r.height-6);el.style.left=n.x+"px";el.style.top=n.y+"px"};
      const up=()=>{window.removeEventListener("pointermove",mv);save()};
      window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up,{once:true});
    });
    el.append(bar,body);lay.appendChild(el);
  });
}

/* ====== CLOCK ====== */
function startClock(){updateClock();setInterval(updateClock,1000)}
function updateClock(){
  if(!S.cfg.showClock)return;
  const d=new Date();
  $("#clock").textContent=`${d.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} · ${d.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"})}`;
}

/* ====== WEATHER ====== */
async function fetchWeather(force=false){
  if(!S.cfg.showWeather)return;const b=$("#weather");
  const c=S.wc;if(!force&&c&&Date.now()-c.t<18e5&&c.tmp!==undefined){b.textContent=`${c.tmp}° ${c.tx}`;return}
  if(!navigator.geolocation){b.textContent="위치 미지원";return}
  b.textContent="날씨 로드 중…";
  navigator.geolocation.getCurrentPosition(async p=>{
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=temperature_2m,weather_code&timezone=auto`);
      const d=await r.json(),cur=d.current;
      const w={t:Date.now(),tmp:Math.round(cur.temperature_2m),tx:wcTx(cur.weather_code)};
      S.wc=w;save();b.textContent=`${w.tmp}° ${w.tx}`;
    }catch{b.textContent="날씨 실패"}
  },()=>{b.textContent="위치 권한 필요"},{enableHighAccuracy:false,timeout:8000,maximumAge:6e5});
}
function wcTx(c){return{0:"맑음",1:"대체로맑음",2:"구름조금",3:"흐림",45:"안개",48:"짙은안개",51:"이슬비",53:"이슬비",55:"강한이슬비",61:"비",63:"비",65:"폭우",71:"눈",73:"눈",75:"폭설",80:"소나기",81:"소나기",82:"강한소나기",95:"뇌우",96:"뇌우/우박",99:"강한뇌우"}[c]||"날씨"}

/* ====== UTIL ====== */
function holdBtn(btn,d){
  let tm;const stop=()=>{clearInterval(tm);tm=null};
  const go=e=>{e.preventDefault();stop();spin(d);tm=setInterval(()=>spin(d),110)};
  btn.addEventListener("mousedown",go);btn.addEventListener("touchstart",go,{passive:false});
  ["mouseup","mouseleave","touchend","touchcancel"].forEach(ev=>btn.addEventListener(ev,stop));
  document.addEventListener("mouseup",stop);document.addEventListener("touchend",stop);
}
function swipe(el,cb,ignoreTile=false){
  let sx,sy;
  el.addEventListener("pointerdown",e=>{if(ignoreTile&&e.target.closest(".tile"))return;sx=e.clientX;sy=e.clientY});
  el.addEventListener("pointerup",e=>{if(sx===null)return;const dx=e.clientX-sx;if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(e.clientY-sy))cb(dx<0?"left":"right");sx=null});
  el.addEventListener("pointercancel",()=>sx=null);
}
async function shrink(file,mw,mh,png){
  return new Promise((ok,ng)=>{
    const rd=new FileReader();rd.onerror=ng;
    rd.onload=()=>{const img=new Image();img.onerror=ng;img.onload=()=>{
      const r=Math.min(mw/img.width,mh/img.height,1);const w=Math.round(img.width*r),h=Math.round(img.height*r);
      const cv=document.createElement("canvas");cv.width=w;cv.height=h;cv.getContext("2d").drawImage(img,0,0,w,h);
      ok(cv.toDataURL(png?"image/png":"image/jpeg",.86));
    };img.src=rd.result};rd.readAsDataURL(file);
  });
}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTm);toastTm=setTimeout(()=>el.classList.remove("show"),2400)}
