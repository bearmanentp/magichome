/* ================================================
   MagicHome — app.js
   ================================================ */

const SK = "magichome_v2";

// ── 검색 엔진 ──────────────────────────────────────
const ENGINES = {
  google:  { label: "🔍 Google",  q: q => `https://www.google.com/search?q=${enc(q)}` },
  naver:   { label: "🟢 Naver",   q: q => `https://search.naver.com/search.naver?query=${enc(q)}` },
  daum:    { label: "🟠 Daum",    q: q => `https://search.daum.net/search?w=tot&q=${enc(q)}` },
  youtube: { label: "▶ YouTube",  q: q => `https://www.youtube.com/results?search_query=${enc(q)}` },
  nate:    { label: "🌀 Nate",    q: q => `https://search.nate.com/search/all.html?q=${enc(q)}` },
};
const enc = encodeURIComponent;

// ── 매직 이모지 기본 아이콘 ─────────────────────────
const MAGIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0%" stop-color="#9d7cff"/><stop offset="100%" stop-color="#59b7ff"/></linearGradient></defs>
  <rect rx="28" width="120" height="120" fill="#0f1422"/>
  <text x="18" y="84" font-size="66">🪄</text>
</svg>`;
const MAGIC_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MAGIC_SVG)}`;

// ── 유틸 ───────────────────────────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function uid(p = "id") {
  if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`;
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

// ── 상태 ───────────────────────────────────────────
let state = loadState();
let threeCtx      = null;
let dragInfo      = null;
let folderOpenId  = null;
let curEditId     = null;
let ignoreClickTil = 0;
let pointerX = null, pointerY = null;
let toastTmr = null;

// ── 기본 상태 ──────────────────────────────────────
function defaultItems() {
  return [
    app("Google",       "https://www.google.com",   false),
    app("Naver",        "https://www.naver.com",    false),
    app("YouTube",      "https://www.youtube.com",  true),
    app("GitHub",       "https://github.com",       true),
    app("Daum",         "https://www.daum.net",     false),
    folder("즐겨찾기", "🪄", [
      app("Nate",         "https://www.nate.com",     false),
      app("YouTube Music","https://music.youtube.com",false),
    ]),
  ];
}
function app(name, url, lg = false, id) {
  return { id: id || uid("app"), kind:"app", name, url, iconMode:"auto", icon:"", launchGroup: lg };
}
function folder(name, emoji, items = [], id) {
  return { id: id || uid("fld"), kind:"folder", name, emoji, items };
}

function defaultState() {
  return {
    settings: {
      layout:       "curve",
      searchEngine: "google",
      showClock:    true,
      showWeather:  false,
      showIntro:    true,
      threeMouseFx: true,
      welcomeMsg:   "반가워요. 오늘도 매직하게 시작해볼까요?",
      bgType:       "three",
      bgImage:      "",
      bgFit:        "cover",
    },
    items:          defaultItems(),
    notes:          [],
    carouselIdx:    0,
    gridPage:       0,
    weatherCache:   null,
  };
}

function loadState() {
  const fb = defaultState();
  try {
    const raw = localStorage.getItem(SK);
    if (!raw) return fb;
    const s = JSON.parse(raw);
    return {
      ...fb, ...s,
      settings: { ...fb.settings, ...(s.settings || {}) },
      items:    normItems(s.items || fb.items),
      notes:    Array.isArray(s.notes) ? s.notes : [],
      carouselIdx: Number.isFinite(s.carouselIdx) ? s.carouselIdx : 0,
      gridPage:    Number.isFinite(s.gridPage)    ? s.gridPage    : 0,
      weatherCache: s.weatherCache || null,
    };
  } catch { return fb; }
}
function normItems(arr) {
  if (!Array.isArray(arr)) return defaultItems();
  return arr.map(it => {
    if (it.kind === "folder")
      return { ...it, kind:"folder", emoji: it.emoji||"🪄",
               items: Array.isArray(it.items)
                 ? it.items.map(c=>({...c,kind:"app",iconMode:c.iconMode||"auto",icon:c.icon||"",launchGroup:!!c.launchGroup}))
                 : [] };
    return { ...it, kind:"app", iconMode:it.iconMode||"auto", icon:it.icon||"", launchGroup:!!it.launchGroup };
  });
}
function save() {
  try { localStorage.setItem(SK, JSON.stringify(state)); }
  catch { toast("저장 공간 부족 — 이미지를 줄여주세요."); }
}

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  populateEngineSelects();
  bindAll();
  applyUI();
  renderAll();
  initThreeBg();       // <— Three.js 마지막으로 (빠른 첫 렌더)
  startClock();
  handleIntro();
  applyBg();
});

// ── 인트로 ─────────────────────────────────────────
function handleIntro() {
  if (!state.settings.showIntro) {
    $("#intro").classList.add("hide");
    focusSearch();
    return;
  }
  $("#introMessage").textContent = state.settings.welcomeMsg || "반가워요.";
  setTimeout(hideIntro, 2000);
}
function hideIntro() {
  const el = $("#intro");
  if (!el || el.classList.contains("hide")) return;
  el.classList.add("hide");
  focusSearch();
}
function focusSearch() {
  setTimeout(() => {
    try { $("#searchInput").focus({ preventScroll: true }); } catch {}
  }, 320);
}

// ═══════════════════════════════════════════════════
//  검색 엔진 셀렉트
// ═══════════════════════════════════════════════════
function populateEngineSelects() {
  const html = Object.entries(ENGINES)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join("");
  $("#engineSelect").innerHTML = html;
  $("#settingsEngineSelect").innerHTML = html;
}

// ═══════════════════════════════════════════════════
//  UI 상태 반영
// ═══════════════════════════════════════════════════
function applyUI() {
  const s = state.settings;
  $("#layoutSelect").value          = s.layout;
  $("#engineSelect").value          = s.searchEngine;
  $("#settingsEngineSelect").value  = s.searchEngine;
  $("#welcomeInput").value          = s.welcomeMsg || "";
  $("#showIntroToggle").checked     = !!s.showIntro;
  $("#showClockToggle").checked     = !!s.showClock;
  $("#showWeatherToggle").checked   = !!s.showWeather;
  $("#bgTypeSelect").value          = s.bgType;
  $("#bgFitSelect").value           = s.bgFit;
  $("#threeMouseToggle").checked    = !!s.threeMouseFx;
  $("#bgImageUrl").value = (s.bgImage && !s.bgImage.startsWith("data:")) ? s.bgImage : "";
}

function renderAll() {
  state.items = normItems(state.items);
  syncWidgets();
  renderLayout();
  renderCurve();
  renderGrid();
  renderNotes();
}

// ═══════════════════════════════════════════════════
//  이벤트 바인딩
// ═══════════════════════════════════════════════════
function bindAll() {
  // 인트로 건너뛰기
  $("#introSkipBtn").addEventListener("click", hideIntro);

  // 상단 버튼
  $("#settingsBtn").addEventListener("click", () => openPanel($("#settingsPanel")));
  $("#addAppBtn"  ).addEventListener("click", () => openAppModal());
  $("#addNoteBtn" ).addEventListener("click", addNote);
  $("#openAllBtn" ).addEventListener("click", openLaunchGroup);

  // 백드롭
  $("#modalBackdrop").addEventListener("click", closeAll);

  // ESC
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

  // [data-close] 속성 버튼
  document.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      const wrap = e.target.closest(".panel, .modal");
      if (wrap) closeLayer(wrap);
    }
    if (!e.target.closest(".quickMenu") && !e.target.closest(".tile-more")) hideQM();
  });

  // 검색 엔진 동기화
  const syncEngine = val => {
    state.settings.searchEngine = val; save();
    $("#engineSelect").value = val;
    $("#settingsEngineSelect").value = val;
  };
  $("#engineSelect"        ).addEventListener("change", e => syncEngine(e.target.value));
  $("#settingsEngineSelect").addEventListener("change", e => syncEngine(e.target.value));

  // 검색
  $("#searchBtn").addEventListener("click", doSearch);
  $("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

  // 설정 토글/셀렉트
  const onSetting = (id, key, transform = v => v) => {
    $(id).addEventListener("change", e => {
      state.settings[key] = transform(e.target.type === "checkbox" ? e.target.checked : e.target.value);
      save();
      renderAll();
    });
  };
  onSetting("#layoutSelect",        "layout");
  onSetting("#welcomeInput",        "welcomeMsg", v => v.trim());
  onSetting("#showIntroToggle",     "showIntro");
  onSetting("#showClockToggle",     "showClock");
  onSetting("#showWeatherToggle",   "showWeather");
  onSetting("#threeMouseToggle",    "threeMouseFx");
  onSetting("#bgTypeSelect",        "bgType",  v => { applyBg(); return v; });
  onSetting("#bgFitSelect",         "bgFit",   v => { applyBg(); return v; });

  // 날씨 켜지면 즉시 조회
  $("#showWeatherToggle").addEventListener("change", e => {
    if (e.target.checked) fetchWeather(true);
  });
  $("#weatherBox").addEventListener("click", () => fetchWeather(true));

  // 배경 적용
  $("#applyBgBtn").addEventListener("click", () => {
    const url = $("#bgImageUrl").value.trim();
    if (url) { state.settings.bgImage = url; state.settings.bgType = "image"; }
    state.settings.bgType = $("#bgTypeSelect").value;
    state.settings.bgFit  = $("#bgFitSelect").value;
    save(); applyUI(); applyBg();
    toast("배경이 적용되었어요.");
  });

  // 배경 이미지 업로드
  $("#bgImageUpload").addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return;
    $("#bgFileName").textContent = f.name;
    try {
      state.settings.bgImage = await toDataURL(f, 1600, 1000);
      state.settings.bgType  = "image";
      save(); applyUI(); applyBg();
      toast("배경이 저장되었어요.");
    } catch { toast("이미지를 읽지 못했어요."); }
    e.target.value = "";
  });

  // 초기화
  $("#resetDataBtn").addEventListener("click", () => {
    if (!confirm("모든 설정, 앱, 메모를 초기화할까요?")) return;
    localStorage.removeItem(SK); location.reload();
  });

  // 앱 모달 — 세그먼트 컨트롤
  bindSeg("entryTypeSeg",  "entryType",   onEntryTypeChange);
  bindSeg("iconModeSeg",   "iconModeVal", onIconModeChange);

  // 아이콘 업로드 파일명 표시
  $("#appIconUpload").addEventListener("change", e => {
    $("#iconFileName").textContent = e.target.files?.[0]?.name || "선택된 파일 없음";
  });

  // 앱 폼 제출
  $("#appForm").addEventListener("submit", handleAppSubmit);

  // 폴더 모달 버튼
  $("#folderOpenAllBtn").addEventListener("click", () => openFolderAll(folderOpenId));
  $("#folderAddAppBtn" ).addEventListener("click", () => openAppModal(null, folderOpenId || ""));

  // 커브 휠/버튼/스와이프
  $("#curveViewport").addEventListener("wheel", e => { e.preventDefault(); rotateCurve(e.deltaY > 0 ? 1 : -1); }, { passive:false });
  bindHold($("#curveLeft"),  -1);
  bindHold($("#curveRight"),  1);
  bindSwipe($("#curveViewport"), dir => rotateCurve(dir === "l" ? 1 : -1), true);

  // 커브 마우스 위치 (확대 효과)
  $("#curveViewport").addEventListener("mousemove", e => {
    const r = $("#curveViewport").getBoundingClientRect();
    pointerX = e.clientX - r.left; pointerY = e.clientY - r.top;
    positionTiles();
  });
  $("#curveViewport").addEventListener("mouseleave", () => { pointerX = null; positionTiles(); });

  // 그리드 페이지
  $("#gridLeft" ).addEventListener("click", () => changePage(-1));
  $("#gridRight").addEventListener("click", () => changePage( 1));
  bindSwipe($("#gridViewport"), dir => changePage(dir === "l" ? 1 : -1));

  // 리사이즈
  let rsTimer;
  window.addEventListener("resize", () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(() => {
      if (threeCtx) resizeThree();
      renderCurve(); renderGrid();
      if (folderOpenId) renderFolder();
    }, 80);
  });
}

// ── 세그먼트 컨트롤 ────────────────────────────────
function bindSeg(groupId, hiddenId, onChange) {
  const wrap = $(`#${groupId}`);
  if (!wrap) return;
  wrap.addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn"); if (!btn) return;
    $$(".seg-btn", wrap).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $(`#${hiddenId}`).value = btn.dataset.val;
    if (onChange) onChange(btn.dataset.val);
  });
}
function segSet(groupId, hiddenId, val) {
  const wrap = $(`#${groupId}`); if (!wrap) return;
  $$(".seg-btn", wrap).forEach(b => {
    b.classList.toggle("active", b.dataset.val === val);
  });
  $(`#${hiddenId}`).value = val;
}

// ── 앱 모달 폼 변화 ────────────────────────────────
function onEntryTypeChange(val) {
  const isApp = val === "app";
  $("#appOnlyFields").classList.toggle("hidden", !isApp);
  $("#folderOnlyFields").classList.toggle("hidden", isApp);
}
function onIconModeChange(val) {
  $("#iconLinkField").style.display   = val === "link"   ? "" : "none";
  $("#iconUploadField").style.display = val === "upload" ? "" : "none";
}

// ── 스와이프 ───────────────────────────────────────
function bindSwipe(el, cb, skipTiles = false) {
  let sx = null, sy = null;
  el.addEventListener("pointerdown", e => {
    if (skipTiles && e.target.closest(".app-tile")) return;
    sx = e.clientX; sy = e.clientY;
  });
  el.addEventListener("pointerup", e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) cb(dx < 0 ? "l" : "r");
    sx = sy = null;
  });
  el.addEventListener("pointercancel", () => { sx = sy = null; });
}

// ── 길게 누르고 회전 ───────────────────────────────
function bindHold(btn, d) {
  let t = null;
  const stop  = () => { clearInterval(t); t = null; };
  const start = e => { e.preventDefault(); stop(); rotateCurve(d); t = setInterval(() => rotateCurve(d), 110); };
  btn.addEventListener("mousedown",  start);
  btn.addEventListener("touchstart", start, { passive:false });
  btn.addEventListener("mouseup",   stop); btn.addEventListener("mouseleave", stop);
  btn.addEventListener("touchend",  stop); btn.addEventListener("touchcancel", stop);
  document.addEventListener("mouseup", stop); document.addEventListener("touchend", stop);
}

// ═══════════════════════════════════════════════════
//  검색
// ═══════════════════════════════════════════════════
function doSearch() {
  const raw = $("#searchInput").value.trim(); if (!raw) return;
  const url = isURL(raw) ? normalizeURL(raw) : ENGINES[state.settings.searchEngine].q(raw);
  if (!url) { toast("열 수 없는 주소입니다."); return; }
  window.location.href = url;
}
function isURL(t) {
  if (!t || t.includes(" ")) return false;
  if (/^[a-zA-Z][\w+\-.]*:/.test(t)) return true;
  return /^(localhost|[\w.-]+\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(t);
}
function normalizeURL(raw) {
  const s = raw.trim(); if (!s) return "";
  if (/^(javascript|data):/i.test(s)) return "";
  if (/^[a-zA-Z][\w+\-.]*:/.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}

// ═══════════════════════════════════════════════════
//  배경
// ═══════════════════════════════════════════════════
function applyBg() {
  const s   = state.settings;
  const useImg = s.bgType === "image" && !!s.bgImage;
  const lay = $("#bgImageLayer");
  if (useImg) {
    lay.style.backgroundImage = `url("${s.bgImage}")`;
    lay.style.backgroundSize  = s.bgFit === "contain" ? "contain" : s.bgFit === "stretch" ? "100% 100%" : "cover";
    lay.style.opacity = "1";
  } else {
    lay.style.backgroundImage = "none";
    lay.style.opacity = "0";
  }
  const three = $("#threeBg");
  if (three) three.style.opacity = useImg ? "0" : "1";
}

// ═══════════════════════════════════════════════════
//  Three.js 배경
// ═══════════════════════════════════════════════════
function initThreeBg() {
  const canvas = $("#threeBg");
  const W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true, powerPreference:"low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(W, H);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W/H, 1, 1000);
  camera.position.z = 120;

  // 별 파티클
  const cnt = 700;
  const pos = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    pos[i*3]   = (Math.random()-.5)*260;
    pos[i*3+1] = (Math.random()-.5)*160;
    pos[i*3+2] = (Math.random()-.5)*180;
  }
  const geo  = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat  = new THREE.PointsMaterial({ color:0xffffff, size:1.5, transparent:true, opacity:.7 });
  const pts  = new THREE.Points(geo, mat);
  scene.add(pts);

  // 링
  const ringGeo = new THREE.TorusGeometry(32, .24, 10, 100);
  const ringMat = new THREE.MeshBasicMaterial({ color:0x9d7cff, transparent:true, opacity:.1 });
  const ring    = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = 1.1;
  scene.add(ring);

  // 마우스 타겟
  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener("mousemove", e => {
    mx = (e.clientX / window.innerWidth  - .5) * 2;
    my = (e.clientY / window.innerHeight - .5) * 2;
  });

  threeCtx = { renderer, scene, camera, pts, ring };

  (function animate() {
    requestAnimationFrame(animate);
    pts.rotation.y  += .0008;
    pts.rotation.x  += .00022;
    ring.rotation.z += .0018;

    if (state.settings.threeMouseFx) {
      tx += (mx - tx) * .04;
      ty += (my - ty) * .04;
      camera.position.x += (tx * 10 - camera.position.x) * .06;
      camera.position.y += (-ty * 8  - camera.position.y) * .06;
    } else {
      camera.position.x += (-camera.position.x) * .04;
      camera.position.y += (-camera.position.y) * .04;
    }
    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  })();
}
function resizeThree() {
  const { renderer, camera } = threeCtx;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ═══════════════════════════════════════════════════
//  레이아웃 전환
// ═══════════════════════════════════════════════════
function renderLayout() {
  const curve = state.settings.layout === "curve";
  $("#curveSection").classList.toggle("hidden",  !curve);
  $("#gridSection" ).classList.toggle("hidden",   curve);
}

// ═══════════════════════════════════════════════════
//  커브 다이얼
// ═══════════════════════════════════════════════════
function renderCurve() {
  const track = $("#curveTrack");
  track.innerHTML = "";
  if (!state.items.length) {
    const e = Object.assign(document.createElement("div"),
      { className:"emptyState", textContent:"앱을 추가해보세요." });
    Object.assign(e.style, { position:"absolute", left:"50%", top:"42%", transform:"translate(-50%,-50%)" });
    track.appendChild(e); return;
  }
  const n = state.items.length;
  state.carouselIdx = ((state.carouselIdx % n) + n) % n;
  state.items.forEach(it => track.appendChild(makeTile(it, "", "curve")));
  requestAnimationFrame(positionTiles);
}

function circOff(idx, center, total) {
  let d = idx - center;
  if (d >  total/2) d -= total;
  if (d < -total/2) d += total;
  return d;
}

function positionTiles() {
  const vp    = $("#curveViewport");
  const tiles = $$(".curve-tile", vp);
  if (!tiles.length) return;

  const total   = tiles.length;
  const W       = vp.clientWidth;
  const H       = vp.clientHeight;
  const cx      = W / 2;
  const baseY   = Math.min(120, H * .36);
  const spacing = Math.min(148, W * .17);

  tiles.forEach((tile, i) => {
    const off    = circOff(i, state.carouselIdx, total);
    const x      = cx + off * spacing;
    const y      = baseY + Math.pow(Math.abs(off), 1.5) * 16;
    const base   = Math.max(.56, 1 - Math.abs(off) * .088);
    const rot    = off * -3.8;
    const alpha  = Math.max(.22, 1 - Math.abs(off) * .17);

    let boost = 0;
    if (pointerX !== null) {
      const dist = Math.abs(pointerX - x);
      boost = Math.max(0, .17 - dist / (W * 2.6));
    }

    tile.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) rotate(${rot}deg) scale(${base + boost})`;
    tile.style.opacity   = String(alpha);
    tile.style.zIndex    = String(100 - Math.abs(Math.round(off)));
  });
}

function rotateCurve(d) {
  if (state.items.length < 2) return;
  state.carouselIdx = (state.carouselIdx + d + state.items.length) % state.items.length;
  save(); positionTiles();
}

// ═══════════════════════════════════════════════════
//  그리드
// ═══════════════════════════════════════════════════
const PG_SIZE = () => window.innerWidth < 720 ? 6 : 8;

function renderGrid() {
  const track = $("#gridTrack");
  track.innerHTML = "";
  const pg    = PG_SIZE();
  const total = state.items.length;
  const pages = Math.max(1, Math.ceil(Math.max(total, 1) / pg));
  state.gridPage = clamp(state.gridPage, 0, pages - 1);

  for (let p = 0; p < pages; p++) {
    const page  = document.createElement("div");
    page.className = "grid-page";
    const slice = state.items.slice(p * pg, (p+1) * pg);
    if (!slice.length) {
      page.innerHTML = `<div class="emptyState">앱을 추가해보세요.</div>`;
    } else {
      slice.forEach(it => page.appendChild(makeTile(it, "", "grid")));
    }
    track.appendChild(page);
  }

  track.style.transform = `translateX(calc(-100% * ${state.gridPage} / ${pages}))`;
  $("#gridPageLabel").textContent = `${state.gridPage+1} / ${pages}`;
}

function changePage(d) {
  const pg    = PG_SIZE();
  const pages = Math.max(1, Math.ceil(Math.max(state.items.length, 1) / pg));
  state.gridPage = clamp(state.gridPage + d, 0, pages - 1);
  save(); renderGrid();
}

// ═══════════════════════════════════════════════════
//  타일 생성
// ═══════════════════════════════════════════════════
function makeTile(item, parentId = "", mode = "grid") {
  const tile = document.createElement("div");
  tile.className = `app-tile ${mode === "curve" ? "curve-tile" : "list-tile"}`;
  tile.dataset.id = item.id;
  tile.dataset.parentId = parentId;
  tile.dataset.kind = item.kind;

  // 아이콘
  const iconBox = document.createElement("div");
  iconBox.className = "tile-icon";
  if (item.kind === "folder") {
    iconBox.appendChild(buildFolderPreview(item));
  } else {
    const img = document.createElement("img");
    img.src = resolveIcon(item); img.alt = item.name;
    img.loading = "lazy";
    img.onerror = () => { img.src = MAGIC_ICON; };
    iconBox.appendChild(img);
  }

  // 이름
  const nm = document.createElement("div");
  nm.className = "tile-name"; nm.textContent = item.name;

  // 더보기
  const more = document.createElement("button");
  more.className = "tile-more"; more.type = "button"; more.textContent = "⋮";

  // 모음 뱃지
  const badge = document.createElement("div");
  badge.className = "launch-badge"; badge.textContent = "✨";
  badge.style.display = (item.kind === "app" && item.launchGroup) ? "grid" : "none";

  tile.append(iconBox, nm, more, badge);

  tile.addEventListener("click", e => {
    if (Date.now() < ignoreClickTil) return;
    if (e.target.closest(".tile-more")) return;
    if (item.kind === "folder") openFolder(item.id);
    else openApp(item.url);
  });
  more.addEventListener("click", e => { e.stopPropagation(); showQM(item.id, e.clientX, e.clientY); });
  attachDrag(tile, item.id);

  return tile;
}

function buildFolderPreview(folder) {
  const wrap  = document.createElement("div");
  const items = (folder.items || []).slice(0, 4);
  if (!items.length) {
    wrap.className = "folder-preview solo";
    wrap.textContent = folder.emoji || "🪄"; return wrap;
  }
  wrap.className = "folder-preview";
  items.forEach(ch => {
    const s = document.createElement("span"); s.className = "mini-icon";
    const img = document.createElement("img"); img.src = resolveIcon(ch); img.alt = ch.name;
    img.onerror = () => { img.src = MAGIC_ICON; };
    s.appendChild(img); wrap.appendChild(s);
  });
  for (let i = items.length; i < 4; i++) {
    const s = document.createElement("span"); s.className = "mini-icon empty"; wrap.appendChild(s);
  }
  return wrap;
}

function resolveIcon(item) {
  if (!item || item.kind !== "app") return MAGIC_ICON;
  if ((item.iconMode === "link" || item.iconMode === "upload") && item.icon) return item.icon;
  if (item.icon) return item.icon;
  try {
    const u = new URL(normalizeURL(item.url));
    if (!/^https?:/.test(u.protocol)) return MAGIC_ICON;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch { return MAGIC_ICON; }
}

// ═══════════════════════════════════════════════════
//  앱 열기
// ═══════════════════════════════════════════════════
function openApp(rawUrl) {
  const url = normalizeURL(rawUrl || "");
  if (!url) { toast("열 수 없는 URL입니다."); return; }
  window.location.href = url;
}

// ═══════════════════════════════════════════════════
//  모음 열기 (수정된 핵심 부분)
// ═══════════════════════════════════════════════════
function collectGroup(items, out = []) {
  items.forEach(it => {
    if (it.kind === "app" && it.launchGroup) {
      const url = normalizeURL(it.url);
      if (url) out.push(url);
    }
    if (it.kind === "folder" && it.items?.length) collectGroup(it.items, out);
  });
  return out;
}

function openLaunchGroup() {
  const urls = collectGroup(state.items);
  if (!urls.length) { toast("모음에 포함된 앱이 없어요. 앱 수정 → ✨ 모음에 포함 체크!"); return; }

  // 첫 번째: 현재 탭에서 이동
  // 나머지: <a> 태그 클릭 방식 → 팝업 차단 우회
  urls.forEach((url, i) => {
    if (i === 0) {
      window.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
    }
  });
}

function openFolderAll(folderId) {
  const folder = getFolderById(folderId);
  if (!folder?.items?.length) { toast("폴더가 비어 있어요."); return; }
  const urls = folder.items
    .filter(it => it.kind === "app")
    .map(it => normalizeURL(it.url))
    .filter(Boolean);
  if (!urls.length) { toast("열 수 있는 앱 URL이 없어요."); return; }

  urls.forEach((url, i) => {
    if (i === 0) {
      window.location.href = url;
    } else {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 500);
    }
  });
}

// ═══════════════════════════════════════════════════
//  퀵 메뉴
// ═══════════════════════════════════════════════════
function showQM(itemId, x, y) {
  const found = findItem(itemId); if (!found) return;
  const { item } = found;
  const qm = $("#quickMenu");
  qm.innerHTML = "";

  const add = (label, fn, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = label;
    if (danger) btn.classList.add("danger");
    btn.addEventListener("click", () => { hideQM(); fn(); });
    qm.appendChild(btn);
  };
  const sep = () => { const d = document.createElement("div"); d.className = "qm-sep"; qm.appendChild(d); };

  if (item.kind === "app") {
    add("🔗 열기", () => openApp(item.url));
    add("✏️ 수정", () => openAppModal(item.id));
    sep();
    add(item.launchGroup ? "✨ 모음에서 제외" : "✨ 모음에 추가", () => {
      item.launchGroup = !item.launchGroup; save(); renderAll();
    });
    sep();
    add("🗑 삭제", () => deleteItem(item.id), true);
  } else {
    add("📂 폴더 열기",    () => openFolder(item.id));
    add("✏️ 폴더 수정",    () => openAppModal(item.id));
    add("➕ 앱 추가",       () => openAppModal(null, item.id));
    add("🚀 전체 열기",    () => openFolderAll(item.id));
    sep();
    add("🗑 폴더 삭제",    () => deleteItem(item.id), true);
  }

  qm.classList.remove("hidden");
  requestAnimationFrame(() => {
    const r = qm.getBoundingClientRect();
    qm.style.left = `${clamp(x, 12, window.innerWidth  - r.width  - 12)}px`;
    qm.style.top  = `${clamp(y, 12, window.innerHeight - r.height - 12)}px`;
  });
}
function hideQM() { $("#quickMenu").classList.add("hidden"); }

// ═══════════════════════════════════════════════════
//  패널/모달 열고닫기
// ═══════════════════════════════════════════════════
function openPanel(el) {
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => { el.classList.add("open"); refreshBackdrop(); });
}
function closeLayer(el) {
  if (!el || el.classList.contains("hidden")) return;
  el.classList.remove("open");
  setTimeout(() => {
    el.classList.add("hidden");
    if (el.id === "appModal")    curEditId    = null;
    if (el.id === "folderModal") folderOpenId = null;
    refreshBackdrop();
  }, 180);
  refreshBackdrop();
}
function closeAll() {
  hideQM();
  closeLayer($("#settingsPanel"));
  closeLayer($("#appModal"));
  closeLayer($("#folderModal"));
}
function refreshBackdrop() {
  const open = [$("#settingsPanel"), $("#appModal"), $("#folderModal")]
    .some(el => !el.classList.contains("hidden"));
  $("#modalBackdrop").classList.toggle("hidden", !open);
  requestAnimationFrame(() => $("#modalBackdrop").classList.toggle("show", open));
}

// ═══════════════════════════════════════════════════
//  앱 모달
// ═══════════════════════════════════════════════════
function openAppModal(itemId = null, parentHint = "") {
  curEditId = itemId;
  const found = itemId ? findItem(itemId) : null;
  const it    = found?.item || null;

  $("#appModalTitle").textContent = it ? "항목 수정" : "앱 / 폴더 추가";

  // 세그먼트 초기화
  const type = it?.kind || "app";
  segSet("entryTypeSeg", "entryType", type);
  onEntryTypeChange(type);

  // 앱 필드
  $("#appName" ).value = it?.name  || "";
  $("#appUrl"  ).value = it?.url   || "";
  $("#appIconUrl").value = it?.iconMode === "link" ? it.icon || "" : "";
  $("#iconFileName").textContent = "선택된 파일 없음";
  const im = it?.iconMode || "auto";
  segSet("iconModeSeg", "iconModeVal", im);
  onIconModeChange(im);
  $("#launchGroupToggle").checked = !!it?.launchGroup;

  // 폴더 필드
  $("#folderName" ).value = it?.name  || "";
  $("#folderEmoji").value = it?.emoji || "🪄";

  // 위치 선택
  populateParentSel(found?.parentId || parentHint || "");

  openPanel($("#appModal"));
}

function populateParentSel(selected = "") {
  const sel = $("#parentSelect");
  const flds = state.items.filter(it => it.kind === "folder");
  sel.innerHTML = `<option value="">📱 메인 홈</option>`;
  flds.forEach(f => {
    const o = document.createElement("option");
    o.value = f.id; o.textContent = `📁 ${f.name}`;
    sel.appendChild(o);
  });
  sel.value = selected || "";
}

async function handleAppSubmit(e) {
  e.preventDefault();
  const type = $("#entryType").value;

  if (type === "folder") {
    const name  = $("#folderName").value.trim()  || "새 폴더";
    const emoji = $("#folderEmoji").value.trim() || "🪄";
    if (curEditId) {
      const found = findItem(curEditId);
      if (found && found.item.kind === "folder") { found.item.name = name; found.item.emoji = emoji; }
    } else {
      state.items.push({ id:uid("fld"), kind:"folder", name, emoji, items:[] });
    }
    save(); renderAll(); closeLayer($("#appModal")); return;
  }

  // 앱
  const name = $("#appName").value.trim() || "새 앱";
  const url  = $("#appUrl" ).value.trim();
  if (!url) { toast("URL을 입력해주세요."); return; }

  const iconMode = $("#iconModeVal").value;
  const found    = curEditId ? findItem(curEditId) : null;
  let icon = "";

  if (iconMode === "auto")   icon = "";
  else if (iconMode === "link")   icon = $("#appIconUrl").value.trim() || (found?.item.iconMode==="link" ? found.item.icon : "");
  else if (iconMode === "upload") {
    const f = $("#appIconUpload").files?.[0];
    icon = f ? await toDataURL(f, 256, 256) : (found?.item.iconMode==="upload" ? found.item.icon : "");
  }

  const obj = {
    id: found?.item.id || uid("app"),
    kind:"app", name, url, iconMode, icon,
    launchGroup: !!$("#launchGroupToggle").checked,
  };

  const targetParent = $("#parentSelect").value || "";

  if (found) {
    if (found.parentId === targetParent) found.parent.splice(found.index, 1, obj);
    else { found.parent.splice(found.index, 1); insertApp(targetParent, obj); }
  } else {
    insertApp(targetParent, obj);
  }

  save(); renderAll();
  if (folderOpenId) renderFolder();
  closeLayer($("#appModal"));
}

function insertApp(parentId, item) {
  if (!parentId) { state.items.push(item); return; }
  const f = getFolderById(parentId);
  if (f) f.items.push(item); else state.items.push(item);
}

// ═══════════════════════════════════════════════════
//  폴더
// ═══════════════════════════════════════════════════
function openFolder(id) {
  folderOpenId = id; renderFolder(); openPanel($("#folderModal"));
}
function renderFolder() {
  const f = getFolderById(folderOpenId);
  if (!f) { closeLayer($("#folderModal")); return; }
  $("#folderTitle").textContent = f.name;
  const box = $("#folderApps"); box.innerHTML = "";
  if (!f.items?.length) {
    box.innerHTML = `<div class="emptyState" style="grid-column:1/-1">폴더가 비어 있어요.</div>`;
  } else {
    f.items.forEach(it => box.appendChild(makeTile(it, f.id, "folder")));
  }
  $("#folderOpenAllBtn").disabled = !f.items?.length;
}
function getFolderById(id) {
  return state.items.find(it => it.kind === "folder" && it.id === id) || null;
}

// ═══════════════════════════════════════════════════
//  아이템 검색/삭제
// ═══════════════════════════════════════════════════
function findItem(id) {
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (it.id === id) return { item:it, parent:state.items, parentId:"", index:i };
    if (it.kind === "folder") {
      const arr = it.items || [];
      const idx = arr.findIndex(c => c.id === id);
      if (idx > -1) return { item:arr[idx], parent:arr, parentId:it.id, index:idx };
    }
  }
  return null;
}
function deleteItem(id) {
  const f = findItem(id); if (!f) return;
  const msg = f.item.kind === "folder" && f.item.items?.length
    ? `폴더와 내부 앱 ${f.item.items.length}개를 함께 삭제할까요?`
    : "이 항목을 삭제할까요?";
  if (!confirm(msg)) return;
  f.parent.splice(f.index, 1);
  save(); renderAll();
  if (folderOpenId && !getFolderById(folderOpenId)) closeLayer($("#folderModal"));
}

// ═══════════════════════════════════════════════════
//  드래그 & 드롭
// ═══════════════════════════════════════════════════
function attachDrag(tile, itemId) {
  tile.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (e.target.closest(".tile-more")) return;
    const sx = e.clientX, sy = e.clientY;
    let timer = null;
    const abort = () => { clearTimeout(timer); rm(); };
    const move  = ev => { if (Math.hypot(ev.clientX-sx, ev.clientY-sy)>9) abort(); };
    const rm    = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup",   abort);
      window.removeEventListener("pointercancel",abort);
    };
    timer = setTimeout(() => { rm(); startDrag(itemId, tile, sx, sy); }, 350);
    window.addEventListener("pointermove",  move);
    window.addEventListener("pointerup",    abort, { once:true });
    window.addEventListener("pointercancel",abort, { once:true });
  });
}

function startDrag(id, tile, x, y) {
  ignoreClickTil = Date.now() + 600;
  const r = tile.getBoundingClientRect();
  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${r.width}px`; ghost.style.height = `${r.height}px`;
  document.body.appendChild(ghost);
  tile.classList.add("drag-source");
  document.body.classList.add("dragging");
  dragInfo = { id, el:tile, ghost, hover:null };
  moveGhost(x, y);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup",   endDrag, { once:true });
  window.addEventListener("pointercancel",endDrag,{ once:true });
  toast("길게 눌러 이동 중… 앱 위에 놓으면 폴더로 합칩니다.");
}
function moveGhost(x, y) {
  if (!dragInfo?.ghost) return;
  dragInfo.ghost.style.left = `${x}px`; dragInfo.ghost.style.top = `${y}px`;
}
function clearHighlights() { $$(".drop-target,.combine-target").forEach(el => el.classList.remove("drop-target","combine-target")); }

function onDragMove(e) {
  if (!dragInfo) return;
  moveGhost(e.clientX, e.clientY);
  clearHighlights();
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".app-tile");
  if (!target || target.dataset.id === dragInfo.id) { dragInfo.hover = null; return; }
  const src = findItem(dragInfo.id), tgt = findItem(target.dataset.id);
  if (!src || !tgt) { dragInfo.hover = null; return; }

  let mode = null;
  if (tgt.item.kind==="folder" && src.item.kind==="app" && src.parentId !== tgt.item.id) {
    mode = "into-folder";
  } else if (src.parent === tgt.parent) {
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const near = Math.hypot(e.clientX-cx, e.clientY-cy) < Math.min(r.width,r.height)*.24;
    if (!src.parentId && src.item.kind==="app" && tgt.item.kind==="app" && near)
      mode = "make-folder";
    else mode = "reorder";
  }

  if (!mode) { dragInfo.hover = null; return; }
  dragInfo.hover = { targetId: tgt.item.id, mode };
  target.classList.add(mode==="reorder" ? "drop-target" : "combine-target");
}

function endDrag() {
  if (!dragInfo) return;
  window.removeEventListener("pointermove", onDragMove);
  clearHighlights();
  document.body.classList.remove("dragging");
  dragInfo.el?.classList.remove("drag-source");
  dragInfo.ghost?.remove();
  const { hover, id } = dragInfo; dragInfo = null;

  if (!hover) { renderAll(); return; }
  let ok = false;
  if (hover.mode==="reorder")     ok = reorder(id, hover.targetId);
  if (hover.mode==="into-folder") ok = intoFolder(id, hover.targetId);
  if (hover.mode==="make-folder") ok = makeFolder(id, hover.targetId);
  if (ok) { save(); renderAll(); if (folderOpenId) renderFolder(); }
}

function reorder(srcId, tgtId) {
  const s = findItem(srcId), t = findItem(tgtId);
  if (!s||!t||s.parent!==t.parent||s.index===t.index) return false;
  const [m] = s.parent.splice(s.index, 1);
  let ti = t.index; if (s.index < t.index) ti--;
  s.parent.splice(ti, 0, m); return true;
}
function intoFolder(appId, fldId) {
  const s = findItem(appId), f = getFolderById(fldId);
  if (!s||!f||s.item.kind!=="app"||s.parentId===fldId) return false;
  const [m] = s.parent.splice(s.index, 1); f.items.push(m); return true;
}
function makeFolder(aId, bId) {
  const a = findItem(aId), b = findItem(bId);
  if (!a||!b||a.parent!==b.parent||a.parentId||b.parentId) return false;
  if (a.item.kind!=="app"||b.item.kind!=="app") return false;
  const arr = a.parent, ids = new Set([aId, bId]);
  const fi  = Math.min(a.index, b.index);
  const picked = arr.filter(it => ids.has(it.id));
  for (let i = arr.length-1; i >= 0; i--) if (ids.has(arr[i].id)) arr.splice(i,1);
  arr.splice(fi, 0, { id:uid("fld"), kind:"folder", name:"새 폴더", emoji:"🪄", items:picked });
  return true;
}

// ═══════════════════════════════════════════════════
//  메모
// ═══════════════════════════════════════════════════
function addNote() {
  const colors = ["#ffe78d","#ffd4ea","#d6ffb3","#cae8ff","#f0d2ff","#ffd9b3"];
  const n = state.notes.length;
  state.notes.push({
    id: uid("note"), text: "새 메모",
    x: clamp(44 + (n*22)%220, 14, window.innerWidth  - 230),
    y: clamp(120+ (n*18)%180, 90, window.innerHeight - 220),
    color: colors[n % colors.length],
  });
  save(); renderNotes();
}
function renderNotes() {
  const layer = $("#notesLayer"); layer.innerHTML = "";
  state.notes.forEach(note => {
    const el = document.createElement("div");
    el.className = "note"; el.style.left = `${note.x}px`; el.style.top = `${note.y}px`;
    el.style.background = note.color;

    const bar = document.createElement("div"); bar.className = "note-bar";
    bar.innerHTML = "<span>📝</span>";
    const del = document.createElement("button"); del.type="button"; del.textContent="✕";
    del.addEventListener("click", () => { state.notes = state.notes.filter(n=>n.id!==note.id); save(); renderNotes(); });
    bar.appendChild(del);

    const body = document.createElement("div");
    body.className = "note-body"; body.contentEditable = "true"; body.spellcheck = false;
    body.innerText = note.text || "";
    body.addEventListener("input", () => { note.text = body.innerText; save(); });

    bar.addEventListener("pointerdown", e => {
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = ev => {
        note.x = clamp(ev.clientX-ox, 8, window.innerWidth -r.width -8);
        note.y = clamp(ev.clientY-oy, 8, window.innerHeight-r.height-8);
        el.style.left = `${note.x}px`; el.style.top = `${note.y}px`;
      };
      const up = () => { window.removeEventListener("pointermove",move); save(); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once:true });
    });

    el.append(bar, body); layer.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════
//  시계 / 날씨
// ═══════════════════════════════════════════════════
function syncWidgets() {
  const s = state.settings;
  $("#clockBox"  ).classList.toggle("hidden", !s.showClock);
  $("#weatherBox").classList.toggle("hidden", !s.showWeather);
  if (s.showWeather) fetchWeather();
}
function startClock() { updateClock(); setInterval(updateClock, 1000); }
function updateClock() {
  if (!state.settings.showClock) return;
  const now = new Date();
  const t = now.toLocaleTimeString("ko-KR",{ hour:"2-digit", minute:"2-digit" });
  const d = now.toLocaleDateString("ko-KR",{ month:"long", day:"numeric", weekday:"short" });
  $("#clockBox").textContent = `${t} · ${d}`;
}
async function fetchWeather(force=false) {
  if (!state.settings.showWeather) return;
  const box = $("#weatherBox");
  const cache = state.weatherCache;
  if (!force && cache && Date.now()-cache.time < 30*60*1000 && cache.temp !== undefined) {
    box.textContent = `${cache.temp}° ${cache.icon} ${cache.text}`; return;
  }
  if (!navigator.geolocation) { box.textContent = "날씨 미지원"; return; }
  box.textContent = "🌤 불러오는 중…";
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude:lat, longitude:lon } = pos.coords;
      const r  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
      const d  = await r.json();
      const wc = d.current.weather_code;
      const w  = { time:Date.now(), temp:Math.round(d.current.temperature_2m), text:wcText(wc), icon:wcIcon(wc) };
      state.weatherCache = w; save();
      box.textContent = `${w.temp}° ${w.icon} ${w.text}`;
    } catch { box.textContent = "날씨 실패"; }
  }, () => { box.textContent = "위치 권한 필요"; }, { timeout:8000, maximumAge:600000 });
}
function wcIcon(c) {
  if (c === 0) return "☀️"; if (c <= 3) return "⛅"; if (c <= 48) return "🌫";
  if (c <= 67) return "🌧"; if (c <= 77) return "❄️"; if (c <= 82) return "🌦";
  return "⛈";
}
function wcText(c) {
  const m = { 0:"맑음",1:"대체로 맑음",2:"구름 조금",3:"흐림",45:"안개",48:"짙은 안개",
    51:"이슬비",53:"이슬비",55:"강한 이슬비",61:"비",63:"비",65:"강한 비",
    71:"눈",73:"눈",75:"강한 눈",77:"싸락눈",80:"소나기",81:"소나기",82:"강한 소나기",
    85:"눈 소나기",86:"강한 눈 소나기",95:"뇌우",96:"뇌우/우박",99:"강한 뇌우" };
  return m[c] || "날씨";
}

// ═══════════════════════════════════════════════════
//  파일 → DataURL (리사이즈 포함)
// ═══════════════════════════════════════════════════
function toDataURL(file, maxW, maxH) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW/img.width, maxH/img.height, 1);
        const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
        const c = Object.assign(document.createElement("canvas"), { width:w, height:h });
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const mime = /png|webp|svg/i.test(file.type) ? "image/png" : "image/jpeg";
        ok(c.toDataURL(mime, .88));
      };
      img.onerror = fail; img.src = r.result;
    };
    r.onerror = fail; r.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════
//  토스트
// ═══════════════════════════════════════════════════
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => el.classList.remove("show"), 2400);
}
