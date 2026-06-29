/* ======================================================================
   MagicHome - 완전 통합 최종본 (드래그앤드롭 + 폴더생성 + 메모)
   ====================================================================== */

const SK = "magichome_v9";

const ENGINES = {
  google:  { label: "🔍 Google",  q: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  naver:   { label: "🟢 Naver",   q: q => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}` },
  daum:    { label: "🔵 Daum",    q: q => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(q)}` },
  youtube: { label: "🔴 YouTube", q: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  nate:    { label: "🔵 Nate",    q: q => `https://search.nate.com/search/all.html?q=${encodeURIComponent(q)}` },
};

const MAGIC_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="82">🪄</text></svg>')}`;

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

let state = loadState();
let threeCtx = null;
let dragInfo = null;
let folderOpenId = null;
let curEditId = null;
let pointerX = null;
let toastTimer = null;
let clockInterval = null;

function buildDefaultState() {
  return {
    settings: {
      layout: "curve", searchEngine: "google", showClock: true, showWeather: false,
      showIntro: true, welcomeMsg: "반가워요. 오늘도 매직하게 시작해볼까요?",
      autoPinNotes: false, faviconType: "emoji", faviconData: "",
      bgType: "three", threeSceneType: "stars", threeMouseFx: true,
      bgSolidColor: "#121016", bgGrad1: "#1f1a3a", bgGrad2: "#0d0a12", bgGradAngle: 135,
      bgImage: "", bgFit: "cover", bgEmojis: "✨🎈🪄🍀🌸🔥",
    },
    items: [
      { id: uid("app"), kind: "app", name: "Google", url: "https://www.google.com", iconMode: "auto", icon: "", launchGroup: false },
      { id: uid("app"), kind: "app", name: "Naver", url: "https://www.naver.com", iconMode: "auto", icon: "", launchGroup: false },
      { id: uid("app"), kind: "app", name: "YouTube", url: "https://www.youtube.com", iconMode: "auto", icon: "", launchGroup: true },
      { id: uid("app"), kind: "app", name: "GitHub", url: "https://github.com", iconMode: "auto", icon: "", launchGroup: true },
      { id: uid("app"), kind: "app", name: "Daum", url: "https://www.daum.net", iconMode: "auto", icon: "", launchGroup: false },
      { id: uid("folder"), kind: "folder", name: "즐겨찾기", emoji: "🪄", items: [
        { id: uid("app"), kind: "app", name: "Nate", url: "https://www.nate.com", iconMode: "auto", icon: "", launchGroup: false },
      ]}
    ],
    notes: [], carouselIdx: 0, gridPage: 0, weatherCache: null,
  };
}

function loadState() {
  const fb = buildDefaultState();
  try {
    const raw = localStorage.getItem(SK);
    if (!raw) return fb;
    const s = JSON.parse(raw);
    return {
      ...fb, ...s,
      settings: { ...fb.settings, ...(s.settings || {}) },
      items: Array.isArray(s.items) ? s.items : fb.items,
      notes: Array.isArray(s.notes) ? s.notes : [],
    };
  } catch { return fb; }
}

function saveState() {
  try {
    const dump = { ...state, notes: state.notes.filter(n => n.pinned) };
    localStorage.setItem(SK, JSON.stringify(dump));
  } catch {
    toast("스토리지 한도 초과. 이미지를 줄여주세요.");
  }
}

// === 시작 ===
document.addEventListener("DOMContentLoaded", () => {
  setEngineLists();
  bindAllEvents();
  syncUIFromState();
  renderAll();
  initThreeBG();
  startClock();
  applyBG();
  applyFavicon();

  if (!state.settings.showIntro) {
    $("#intro").classList.add("hide");
    focusSearch();
  } else {
    $("#introMessage").textContent = state.settings.welcomeMsg;
    setTimeout(() => { $("#intro").classList.add("hide"); focusSearch(); }, 2000);
  }
});

function focusSearch() { setTimeout(() => { try { $("#searchInput").focus({ preventScroll: true }); } catch {} }, 300); }

function setEngineLists() {
  const h = Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("#engineSelect").innerHTML = h;
  $("#settingsEngineSelect").innerHTML = h;
}

// === URL/아이콘 처리 ===
function normURL(raw) {
  let s = (raw || "").trim();
  if (!s) return "";
  if (/^(javascript|data):/i.test(s)) return "";
  if (/^[a-zA-Z][\w+\-.]*:/.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}

function getIcon(item) {
  if (!item || item.kind !== "app") return MAGIC_ICON;
  if ((item.iconMode === "link" || item.iconMode === "upload") && item.icon) return item.icon;
  try {
    const u = new URL(normURL(item.url));
    if (!/^https?:$/.test(u.protocol)) return MAGIC_ICON;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch { return MAGIC_ICON; }
}

// === 아이템 검색 ===
function findItem(id) {
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (it.id === id) return { item: it, parent: state.items, parentId: "", index: i };
    if (it.kind === "folder") {
      const arr = it.items || [];
      const idx = arr.findIndex(c => c.id === id);
      if (idx > -1) return { item: arr[idx], parent: arr, parentId: it.id, index: idx };
    }
  }
  return null;
}

function getFolderById(id) {
  return state.items.find(it => it.kind === "folder" && it.id === id);
}

// === 렌더링 ===
function renderAll() {
  renderCurve();
  renderGrid();
  renderNotes();
  if (folderOpenId) renderFolder();
}

function syncUIFromState() {
  const s = state.settings;
  $("#layoutSelect").value = s.layout;
  $("#engineSelect").value = s.searchEngine;
  $("#settingsEngineSelect").value = s.searchEngine;
  $("#welcomeInput").value = s.welcomeMsg || "";
  $("#showIntroToggle").checked = !!s.showIntro;
  $("#showClockToggle").checked = !!s.showClock;
  $("#showWeatherToggle").checked = !!s.showWeather;
  $("#autoPinToggle").checked = !!s.autoPinNotes;
  $("#bgTypeSelect").value = s.bgType;
  $("#threeSceneSelect").value = s.threeSceneType;
  $("#threeMouseToggle").checked = !!s.threeMouseFx;
  $("#bgSolidColor").value = s.bgSolidColor;
  $("#bgGrad1").value = s.bgGrad1;
  $("#bgGrad2").value = s.bgGrad2;
  $("#bgGradAngle").value = s.bgGradAngle;
  $("#bgFitSelect").value = s.bgFit;
  $("#bgEmojiInput").value = s.bgEmojis;
  $("#bgImageUrl").value = (s.bgImage && !s.bgImage.startsWith("data:")) ? s.bgImage : "";
  setSeg("favModeSeg", "favModeVal", s.faviconType);
  $("#favIconUrl").value = s.faviconType === "link" ? s.faviconData : "";

  toggleBgFields(s.bgType);
  toggleLayout();
  syncWidgets();
}

function toggleLayout() {
  const isCurve = state.settings.layout === "curve";
  $("#curveSection").classList.toggle("hidden", !isCurve);
  $("#gridSection").classList.toggle("hidden", isCurve);
}

function syncWidgets() {
  $("#clockBox").classList.toggle("hidden", !state.settings.showClock);
  $("#weatherBox").classList.toggle("hidden", !state.settings.showWeather);
  if (state.settings.showWeather) fetchWeather();
}

function toggleBgFields(type) {
  $$(".bgSubFields").forEach(el => el.classList.add("hidden"));
  const m = { three: "bgThreeOptions", solid: "bgSolidOptions", gradient: "bgGradientOptions", image: "bgImageOptions", emoji: "bgEmojiOptions" };
  if (m[type]) $(`#${m[type]}`).classList.remove("hidden");
}

// === 타일 만들기 ===
function makeTile(item, parentId = "", mode = "grid") {
  const tile = document.createElement("div");
  tile.className = `app-tile ${mode === "curve" ? "curve-tile" : "list-tile"}`;
  tile.dataset.id = item.id;
  tile.dataset.parentId = parentId;
  tile.dataset.kind = item.kind;

  const iconBox = document.createElement("div");
  iconBox.className = "tile-icon";
  
  if (item.kind === "folder") {
    iconBox.appendChild(buildFolderPreview(item));
  } else {
    const img = document.createElement("img");
    img.src = getIcon(item);
    img.alt = item.name;
    img.onerror = () => { img.src = MAGIC_ICON; };
    img.loading = "lazy";
    iconBox.appendChild(img);
  }

  const nm = document.createElement("div");
  nm.className = "tile-name";
  nm.textContent = item.name;

  const more = document.createElement("button");
  more.className = "tile-more";
  more.textContent = "⋮";
  more.type = "button";

  const badge = document.createElement("div");
  badge.className = "launch-badge";
  badge.textContent = "✨";
  badge.style.display = (item.kind === "app" && item.launchGroup) ? "grid" : "none";

  tile.append(iconBox, nm, more, badge);

  more.onclick = e => {
    e.stopPropagation();
    showQuickMenu(item.id, e.clientX, e.clientY);
  };

  attachDragLogic(tile, item);
  return tile;
}

function buildFolderPreview(folder) {
  const wrap = document.createElement("div");
  const items = (folder.items || []).slice(0, 4);
  
  if (!items.length) {
    wrap.className = "folder-preview solo";
    wrap.textContent = folder.emoji || "🪄";
    return wrap;
  }
  
  wrap.className = "folder-preview";
  items.forEach(ch => {
    const s = document.createElement("span");
    s.className = "mini-icon";
    const img = document.createElement("img");
    img.src = getIcon(ch);
    img.onerror = () => { img.src = MAGIC_ICON; };
    s.appendChild(img);
    wrap.appendChild(s);
  });
  for (let i = items.length; i < 4; i++) {
    const s = document.createElement("span");
    s.className = "mini-icon empty";
    wrap.appendChild(s);
  }
  return wrap;
}

// === 핵심: 드래그 앤 드롭 ===
function attachDragLogic(tile, item) {
  tile.onpointerdown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest(".tile-more")) return;

    const sx = e.clientX, sy = e.clientY;
    let dragging = false;

    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          dragging = true;
          startTileDrag(item, tile, ev.clientX, ev.clientY);
        }
      } else {
        moveTileDrag(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (!dragging) {
        // 클릭으로 처리
        if (item.kind === "folder") openFolderModal(item.id);
        else if (item.kind === "app") window.location.href = normURL(item.url);
      } else {
        endTileDrag(ev.clientX, ev.clientY);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
}

function startTileDrag(item, tile, x, y) {
  const rect = tile.getBoundingClientRect();
  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = rect.width + "px";
  ghost.style.height = rect.height + "px";
  ghost.style.left = x + "px";
  ghost.style.top = y + "px";
  document.body.appendChild(ghost);
  
  tile.classList.add("drag-source");
  document.body.classList.add("dragging");
  
  dragInfo = {
    item: item,
    sourceTile: tile,
    ghost: ghost,
    targetMode: null,
    targetId: null
  };
}

function moveTileDrag(x, y) {
  if (!dragInfo) return;
  dragInfo.ghost.style.left = x + "px";
  dragInfo.ghost.style.top = y + "px";

  // 기존 하이라이트 제거
  $$(".drop-target, .combine-target").forEach(el => {
    el.classList.remove("drop-target", "combine-target");
  });

  // 마우스 아래 타일 찾기
  dragInfo.ghost.style.display = "none";
  const elBelow = document.elementFromPoint(x, y);
  dragInfo.ghost.style.display = "";
  
  if (!elBelow) {
    dragInfo.targetMode = null;
    return;
  }

  const targetTile = elBelow.closest(".app-tile");
  if (!targetTile || targetTile.dataset.id === dragInfo.item.id) {
    dragInfo.targetMode = null;
    return;
  }

  const targetFind = findItem(targetTile.dataset.id);
  if (!targetFind) {
    dragInfo.targetMode = null;
    return;
  }

  // 폴더에 드롭 → 폴더 안에 넣기
  if (targetFind.item.kind === "folder" && dragInfo.item.kind === "app") {
    targetTile.classList.add("drop-target");
    dragInfo.targetMode = "into-folder";
    dragInfo.targetId = targetFind.item.id;
    return;
  }

  // 앱 위에 드롭 → 폴더 생성 or 순서 변경
  if (targetFind.item.kind === "app" && dragInfo.item.kind === "app") {
    const rect = targetTile.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    
    if (dist < Math.min(rect.width, rect.height) * 0.35) {
      // 중앙 근처 → 폴더 만들기
      targetTile.classList.add("combine-target");
      dragInfo.targetMode = "make-folder";
      dragInfo.targetId = targetFind.item.id;
    } else {
      // 가장자리 → 순서 변경
      targetTile.classList.add("drop-target");
      dragInfo.targetMode = "reorder";
      dragInfo.targetId = targetFind.item.id;
    }
    return;
  }

  // 폴더끼리 → 순서 변경
  if (targetFind.item.kind === "folder" && dragInfo.item.kind === "folder") {
    targetTile.classList.add("drop-target");
    dragInfo.targetMode = "reorder";
    dragInfo.targetId = targetFind.item.id;
    return;
  }

  dragInfo.targetMode = null;
}

function endTileDrag(x, y) {
  if (!dragInfo) return;

  // 정리
  dragInfo.sourceTile.classList.remove("drag-source");
  dragInfo.ghost.remove();
  document.body.classList.remove("dragging");
  $$(".drop-target, .combine-target").forEach(el => {
    el.classList.remove("drop-target", "combine-target");
  });

  const { item, targetMode, targetId } = dragInfo;
  dragInfo = null;

  if (!targetMode || !targetId) return;

  const src = findItem(item.id);
  const tgt = findItem(targetId);
  if (!src || !tgt) return;

  if (targetMode === "into-folder") {
    // 폴더 안에 넣기
    const folder = tgt.item;
    src.parent.splice(src.index, 1);
    folder.items = folder.items || [];
    folder.items.push(src.item);
    toast(`"${src.item.name}"을(를) "${folder.name}"에 넣었습니다`);
    saveState();
    renderAll();
  } else if (targetMode === "make-folder") {
    // 새 폴더 생성
    if (src.parent !== tgt.parent) return;
    const arr = src.parent;
    const a = src.item, b = tgt.item;
    const idsToRemove = new Set([a.id, b.id]);
    const pivotIdx = Math.min(src.index, tgt.index);
    
    for (let i = arr.length - 1; i >= 0; i--) {
      if (idsToRemove.has(arr[i].id)) arr.splice(i, 1);
    }
    
    arr.splice(pivotIdx, 0, {
      id: uid("folder"),
      kind: "folder",
      name: "새 폴더",
      emoji: "🪄",
      items: [b, a]
    });
    toast("새 폴더가 만들어졌습니다");
    saveState();
    renderAll();
  } else if (targetMode === "reorder") {
    // 순서 변경
    if (src.parent !== tgt.parent) return;
    const arr = src.parent;
    const [moved] = arr.splice(src.index, 1);
    let newIdx = arr.findIndex(it => it.id === tgt.item.id);
    if (newIdx === -1) newIdx = tgt.index;
    arr.splice(newIdx, 0, moved);
    saveState();
    renderAll();
  }
}

// === 커브 레이아웃 ===
function renderCurve() {
  const track = $("#curveTrack");
  track.innerHTML = "";

  if (!state.items.length) {
    const e = document.createElement("div");
    e.className = "emptyState";
    e.style.cssText = "position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);";
    e.textContent = "상단의 + 버튼으로 앱을 추가하세요.";
    track.appendChild(e);
    return;
  }

  const n = state.items.length;
  state.carouselIdx = ((state.carouselIdx % n) + n) % n;
  state.items.forEach(it => track.appendChild(makeTile(it, "", "curve")));
  requestAnimationFrame(positionCurveTiles);
}

function circOff(idx, center, total) {
  let d = idx - center;
  if (d > total / 2) d -= total;
  if (d < -total / 2) d += total;
  return d;
}

function positionCurveTiles() {
  const vp = $("#curveViewport");
  const tiles = $$(".curve-tile", $("#curveTrack"));
  if (!tiles.length) return;

  const total = tiles.length;
  const W = vp.clientWidth;
  const H = vp.clientHeight;
  const cx = W / 2;
  const baseY = Math.min(116, H * 0.35);
  const spacing = Math.min(144, W * 0.16);

  tiles.forEach((tile, i) => {
    const off = circOff(i, state.carouselIdx, total);
    const x = cx + off * spacing;
    const y = baseY + Math.pow(Math.abs(off), 1.62) * 16.5;
    const scale = Math.max(0.55, 1 - Math.abs(off) * 0.08);
    const rot = off * -3.5;
    const op = Math.max(0.15, 1 - Math.abs(off) * 0.16);

    let boost = 0;
    if (pointerX !== null) {
      const d = Math.abs(pointerX - x);
      boost = Math.max(0, 0.18 - d / (W * 2.5));
    }

    tile.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale + boost})`;
    tile.style.opacity = op;
    tile.style.zIndex = String(100 - Math.abs(Math.round(off)));
  });
}

function rotateCurve(dir) {
  if (state.items.length < 2) return;
  state.carouselIdx = (state.carouselIdx + dir + state.items.length) % state.items.length;
  saveState();
  positionCurveTiles();
}

// === 그리드 레이아웃 ===
function renderGrid() {
  const track = $("#gridTrack");
  track.innerHTML = "";

  const limit = window.innerWidth < 720 ? 6 : 8;
  const total = state.items.length;
  const pages = Math.max(1, Math.ceil(Math.max(total, 1) / limit));
  state.gridPage = clamp(state.gridPage, 0, pages - 1);

  for (let p = 0; p < pages; p++) {
    const page = document.createElement("div");
    page.className = "grid-page";
    const slice = state.items.slice(p * limit, (p + 1) * limit);
    if (!slice.length) {
      page.innerHTML = `<div class="emptyState" style="grid-column:1/-1">앱을 추가하세요.</div>`;
    } else {
      slice.forEach(it => page.appendChild(makeTile(it, "", "grid")));
    }
    track.appendChild(page);
  }

  track.style.transform = `translateX(calc(-100% * ${state.gridPage} / ${pages}))`;
  $("#gridPageLabel").textContent = `${state.gridPage + 1} / ${pages}`;
}

function changeGridPage(dir) {
  const limit = window.innerWidth < 720 ? 6 : 8;
  const pages = Math.max(1, Math.ceil(state.items.length / limit));
  state.gridPage = clamp(state.gridPage + dir, 0, pages - 1);
  saveState();
  renderGrid();
}

// === 폴더 모달 ===
function openFolderModal(id) {
  folderOpenId = id;
  renderFolder();
  showPanel($("#folderModal"));
}

function renderFolder() {
  const f = getFolderById(folderOpenId);
  if (!f) { closePanel($("#folderModal")); return; }
  $("#folderTitle").textContent = f.name;
  const box = $("#folderApps");
  box.innerHTML = "";
  if (!f.items?.length) {
    box.innerHTML = `<div class="emptyState" style="grid-column:1/-1">폴더가 비어 있습니다.</div>`;
  } else {
    f.items.forEach(it => box.appendChild(makeTile(it, f.id, "folder")));
  }
}

// === 메모 시스템 ===
function makeNewNote() {
  const colors = ["#ffe78d", "#ffd4ea", "#d6ffb3", "#cae8ff", "#f0d2ff"];
  const n = state.notes.length;
  const pinned = !!state.settings.autoPinNotes;
  
  state.notes.push({
    id: uid("note"),
    text: "새 메모\n여기에 입력하세요.",
    pinned: pinned,
    minimized: false,
    x: clamp(40 + (n * 28) % 280, 14, window.innerWidth - 260),
    y: clamp(120 + (n * 22) % 220, 90, window.innerHeight - 240),
    w: 240, h: 200,
    color: colors[n % colors.length]
  });
  saveState();
  renderNotes();
  toast(pinned ? "📌 핀 고정됨 (영구 저장)" : "📝 메모 추가 (핀 눌러야 저장됨)");
}

function noteTitle(text) {
  if (!text || !text.trim()) return "(빈 메모)";
  const first = text.split("\n")[0].trim();
  return first || "(빈 메모)";
}

function renderNotes() {
  const layer = $("#notesLayer");
  layer.innerHTML = "";
  state.notes.forEach(note => layer.appendChild(buildNote(note)));
}

function buildNote(note) {
  const el = document.createElement("div");
  el.className = "note";
  if (note.pinned) el.classList.add("pinned-state");
  if (note.minimized) el.classList.add("minimized");
  el.style.left = note.x + "px";
  el.style.top = note.y + "px";
  el.style.width = note.w + "px";
  if (!note.minimized) el.style.height = note.h + "px";
  el.style.background = note.color;

  const bar = document.createElement("div");
  bar.className = "note-bar";
  
  const title = document.createElement("span");
  title.className = "note-title";
  title.textContent = noteTitle(note.text);

  const ctrls = document.createElement("div");
  ctrls.className = "note-controls";

  const pinBtn = document.createElement("button");
  pinBtn.className = "note-btn note-pin-btn" + (note.pinned ? " active" : "");
  pinBtn.innerHTML = note.pinned ? "📌" : "📍";
  pinBtn.title = note.pinned ? "고정 해제" : "핀 고정 (영구 저장)";

  const minBtn = document.createElement("button");
  minBtn.className = "note-btn";
  minBtn.innerHTML = note.minimized ? "▢" : "▬";
  minBtn.title = note.minimized ? "펼치기" : "최소화";

  const delBtn = document.createElement("button");
  delBtn.className = "note-btn";
  delBtn.innerHTML = "✕";
  delBtn.title = "삭제";

  ctrls.append(pinBtn, minBtn, delBtn);
  bar.append(title, ctrls);

  const body = document.createElement("div");
  body.className = "note-body";
  body.contentEditable = "true";
  body.spellcheck = false;
  body.innerText = note.text;

  const resizer = document.createElement("div");
  resizer.className = "note-resizer";

  // 핀
  pinBtn.onpointerdown = e => e.stopPropagation();
  pinBtn.onclick = e => {
    e.stopPropagation();
    note.pinned = !note.pinned;
    pinBtn.classList.toggle("active", note.pinned);
    pinBtn.innerHTML = note.pinned ? "📌" : "📍";
    el.classList.toggle("pinned-state", note.pinned);
    saveState();
    toast(note.pinned ? "📌 핀 고정 (영구 저장됨)" : "📍 핀 해제됨");
  };

  // 최소화
  minBtn.onpointerdown = e => e.stopPropagation();
  minBtn.onclick = e => {
    e.stopPropagation();
    note.minimized = !note.minimized;
    el.classList.toggle("minimized", note.minimized);
    minBtn.innerHTML = note.minimized ? "▢" : "▬";
    if (!note.minimized) el.style.height = note.h + "px";
    else el.style.height = "";
    saveState();
  };

  // 삭제
  delBtn.onpointerdown = e => e.stopPropagation();
  delBtn.onclick = e => {
    e.stopPropagation();
    state.notes = state.notes.filter(n => n.id !== note.id);
    saveState();
    renderNotes();
  };

  // 본문 편집
  body.onpointerdown = e => e.stopPropagation();
  body.oninput = () => {
    note.text = body.innerText;
    title.textContent = noteTitle(note.text);
    saveState();
  };

  // 메모 이동
  bar.onpointerdown = e => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = note.x, oy = note.y;
    const onMove = ev => {
      note.x = clamp(ox + ev.clientX - sx, 8, window.innerWidth - el.offsetWidth - 8);
      note.y = clamp(oy + ev.clientY - sy, 8, window.innerHeight - el.offsetHeight - 8);
      el.style.left = note.x + "px";
      el.style.top = note.y + "px";
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveState();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // 리사이즈
  resizer.onpointerdown = e => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const sw = note.w, sh = note.h;
    const onMove = ev => {
      note.w = clamp(sw + ev.clientX - sx, 180, 800);
      note.h = clamp(sh + ev.clientY - sy, 100, 800);
      el.style.width = note.w + "px";
      el.style.height = note.h + "px";
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveState();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  el.append(bar, body, resizer);
  return el;
}

// === 모달/패널 ===
function showPanel(el) {
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.classList.add("open");
    updateBackdrop();
  });
}

function closePanel(el) {
  if (!el) return;
  el.classList.remove("open");
  setTimeout(() => {
    el.classList.add("hidden");
    if (el.id === "appModal") curEditId = null;
    if (el.id === "folderModal") folderOpenId = null;
    updateBackdrop();
  }, 200);
  updateBackdrop();
}

function closeAllModals() {
  hideQuickMenu();
  closePanel($("#settingsPanel"));
  closePanel($("#appModal"));
  closePanel($("#folderModal"));
}

function updateBackdrop() {
  const open = [$("#settingsPanel"), $("#appModal"), $("#folderModal")].some(el => !el.classList.contains("hidden"));
  $("#modalBackdrop").classList.toggle("hidden", !open);
  requestAnimationFrame(() => $("#modalBackdrop").classList.toggle("show", open));
}

// === 앱 모달 ===
function openAppModal(itemId = null, parentHint = "") {
  curEditId = itemId;
  const find = itemId ? findItem(itemId) : null;
  const target = find?.item || null;

  $("#appModalTitle").textContent = target ? "항목 편집" : "새 앱/폴더 추가";

  const type = target?.kind || "app";
  setSeg("entryTypeSeg", "entryType", type);
  toggleEntryFields(type);

  $("#appName").value = target?.name || "";
  $("#appUrl").value = target?.url || "";
  $("#appIconUrl").value = target?.iconMode === "link" ? target.icon : "";
  $("#iconFileName").textContent = "파일 없음";
  const mode = target?.iconMode || "auto";
  setSeg("iconModeSeg", "iconModeVal", mode);
  toggleIconFields(mode);
  $("#launchGroupToggle").checked = !!target?.launchGroup;

  $("#folderName").value = target?.name || "";
  $("#folderEmoji").value = target?.emoji || "🪄";

  buildParentSel(find?.parentId || parentHint || "");
  showPanel($("#appModal"));
}

function toggleEntryFields(val) {
  const isApp = val === "app";
  $("#appOnlyFields").classList.toggle("hidden", !isApp);
  $("#folderOnlyFields").classList.toggle("hidden", isApp);
}

function toggleIconFields(val) {
  $("#iconLinkField").style.display = val === "link" ? "" : "none";
  $("#iconUploadField").style.display = val === "upload" ? "" : "none";
}

function buildParentSel(selected = "") {
  const el = $("#parentSelect");
  const folders = state.items.filter(it => it.kind === "folder");
  el.innerHTML = `<option value="">📱 메인 화면</option>`;
  folders.forEach(f => {
    const o = document.createElement("option");
    o.value = f.id;
    o.textContent = `📁 ${f.name}`;
    el.appendChild(o);
  });
  el.value = selected || "";
}

async function handleAppSubmit(e) {
  e.preventDefault();
  const type = $("#entryType").value;

  if (type === "folder") {
    const name = $("#folderName").value.trim() || "새 폴더";
    const emoji = $("#folderEmoji").value.trim() || "🪄";
    if (curEditId) {
      const find = findItem(curEditId);
      if (find && find.item.kind === "folder") {
        find.item.name = name;
        find.item.emoji = emoji;
      }
    } else {
      state.items.push({ id: uid("folder"), kind: "folder", name, emoji, items: [] });
    }
    saveState();
    renderAll();
    closePanel($("#appModal"));
    return;
  }

  const name = $("#appName").value.trim() || "새 앱";
  const url = $("#appUrl").value.trim();
  if (!url) { toast("URL을 입력하세요."); return; }

  const iconMode = $("#iconModeVal").value;
  const find = curEditId ? findItem(curEditId) : null;
  let icon = "";

  if (iconMode === "link") {
    icon = $("#appIconUrl").value.trim() || (find?.item.iconMode === "link" ? find.item.icon : "");
  } else if (iconMode === "upload") {
    const f = $("#appIconUpload").files?.[0];
    icon = f ? await fileToDataURL(f, 256, 256) : (find?.item.iconMode === "upload" ? find.item.icon : "");
  }

  const obj = {
    id: find?.item.id || uid("app"),
    kind: "app", name, url, iconMode, icon,
    launchGroup: !!$("#launchGroupToggle").checked
  };

  const targetParent = $("#parentSelect").value || "";
  if (find) {
    if (find.parentId === targetParent) {
      find.parent.splice(find.index, 1, obj);
    } else {
      find.parent.splice(find.index, 1);
      insertInto(targetParent, obj);
    }
  } else {
    insertInto(targetParent, obj);
  }

  saveState();
  renderAll();
  if (folderOpenId) renderFolder();
  closePanel($("#appModal"));
}

function insertInto(parentId, item) {
  if (!parentId) { state.items.push(item); return; }
  const f = getFolderById(parentId);
  if (f) f.items.push(item);
  else state.items.push(item);
}

// === 퀵 메뉴 ===
function showQuickMenu(itemId, x, y) {
  const find = findItem(itemId);
  if (!find) return;
  const { item } = find;
  const qm = $("#quickMenu");
  qm.innerHTML = "";

  const add = (label, handler, danger = false) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    if (danger) btn.className = "danger";
    btn.onclick = () => { hideQuickMenu(); handler(); };
    qm.appendChild(btn);
  };

  const sep = () => {
    const d = document.createElement("div");
    d.className = "qm-sep";
    qm.appendChild(d);
  };

  if (item.kind === "app") {
    add("🌐 열기", () => window.location.href = normURL(item.url));
    add("✏️ 수정", () => openAppModal(item.id));
    sep();
    add(item.launchGroup ? "✨ 모음에서 빼기" : "✨ 모음에 추가", () => {
      item.launchGroup = !item.launchGroup;
      saveState();
      renderAll();
    });
    sep();
    add("🗑 삭제", () => deleteItem(item.id), true);
  } else {
    add("📂 폴더 열기", () => openFolderModal(item.id));
    add("✏️ 폴더 수정", () => openAppModal(item.id));
    add("➕ 앱 추가", () => openAppModal(null, item.id));
    add("🚀 전체 실행", () => launchFolderAll(item.id));
    sep();
    add("🗑 폴더 삭제", () => deleteItem(item.id), true);
  }

  qm.classList.remove("hidden");
  requestAnimationFrame(() => {
    const r = qm.getBoundingClientRect();
    qm.style.left = clamp(x, 12, window.innerWidth - r.width - 12) + "px";
    qm.style.top = clamp(y, 12, window.innerHeight - r.height - 12) + "px";
  });
}

function hideQuickMenu() {
  $("#quickMenu").classList.add("hidden");
}

function deleteItem(id) {
  const find = findItem(id);
  if (!find) return;
  const msg = find.item.kind === "folder" && find.item.items?.length
    ? `폴더와 내부 앱 ${find.item.items.length}개를 모두 삭제하시겠습니까?`
    : "이 항목을 삭제하시겠습니까?";
  if (!confirm(msg)) return;
  find.parent.splice(find.index, 1);
  saveState();
  renderAll();
  if (folderOpenId && !getFolderById(folderOpenId)) closePanel($("#folderModal"));
}

// === 모음 실행 ===
function collectLaunchURLs(items, out = []) {
  items.forEach(it => {
    if (it.kind === "app" && it.launchGroup) {
      const u = normURL(it.url);
      if (u) out.push(u);
    }
    if (it.kind === "folder" && it.items?.length) collectLaunchURLs(it.items, out);
  });
  return out;
}

function openLaunchGroup() {
  const urls = collectLaunchURLs(state.items);
  if (!urls.length) { toast("모음에 추가된 앱이 없습니다."); return; }
  launchURLs(urls);
}

function launchFolderAll(folderId) {
  const f = getFolderById(folderId);
  if (!f?.items?.length) { toast("폴더가 비어 있습니다."); return; }
  const urls = f.items.filter(it => it.kind === "app").map(it => normURL(it.url)).filter(Boolean);
  launchURLs(urls);
}

function launchURLs(urls) {
  urls.forEach((url, i) => {
    if (i === 0) window.location.href = url;
    else {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 400);
    }
  });
}

// === 검색 ===
function doSearch() {
  const v = $("#searchInput").value.trim();
  if (!v) return;
  const isURL = /^[a-zA-Z][\w+\-.]*:/.test(v) || /^[\w.-]+\.[a-z]{2,}/i.test(v);
  window.location.href = isURL ? normURL(v) : ENGINES[state.settings.searchEngine].q(v);
}

// === 배경 ===
function applyBG() {
  const s = state.settings;
  const sol = $("#bgSolidLayer");
  const img = $("#bgImageLayer");
  const three = $("#threeBg");
  
  sol.style.background = "none";
  img.style.backgroundImage = "none";
  img.style.opacity = "0";
  three.style.opacity = "0";
  destroyEmojiBG();

  if (s.bgType === "solid") {
    sol.style.background = s.bgSolidColor;
  } else if (s.bgType === "gradient") {
    sol.style.background = `linear-gradient(${s.bgGradAngle}deg, ${s.bgGrad1}, ${s.bgGrad2})`;
  } else if (s.bgType === "image" && s.bgImage) {
    img.style.backgroundImage = `url("${s.bgImage}")`;
    img.style.backgroundSize = s.bgFit === "contain" ? "contain" : s.bgFit === "stretch" ? "100% 100%" : "cover";
    img.style.opacity = "1";
  } else if (s.bgType === "emoji") {
    sol.style.background = "#0c0a10";
    initEmojiBG();
  } else {
    three.style.opacity = "1";
  }
}

function initEmojiBG() {
  destroyEmojiBG();
  const c = $("#bgEmojiLayer");
  const emojis = Array.from(state.settings.bgEmojis || "✨");
  if (!emojis.length) return;
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("div");
    el.className = "floating-emoji";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = (Math.random() * 96) + "%";
    el.style.animationDelay = (Math.random() * 12) + "s";
    el.style.fontSize = (20 + Math.random() * 24) + "px";
    c.appendChild(el);
  }
}

function destroyEmojiBG() { $("#bgEmojiLayer").innerHTML = ""; }

function applyFavicon() {
  const link = $("#favicon");
  if (link) link.setAttribute("href", state.settings.faviconData || MAGIC_ICON);
}

// === Three.js 배경 ===
function initThreeBG() {
  if (typeof THREE === "undefined") return;
  const canvas = $("#threeBg");
  const W = window.innerWidth, H = window.innerHeight;
  
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 1, 1000);
  camera.position.z = 100;

  threeCtx = { renderer, scene, camera, mesh: null, sceneType: "" };
  resetThreeScene();

  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener("mousemove", e => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  const clock = new THREE.Clock();

  (function animate() {
    requestAnimationFrame(animate);
    if (!threeCtx || !threeCtx.mesh) return;
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (threeCtx.sceneType === "stars") {
      threeCtx.mesh.rotation.z += 0.05 * delta;
      const pos = threeCtx.mesh.geometry.attributes.position.array;
      for (let i = 0; i < pos.length / 3; i++) {
        if (state.settings.threeMouseFx) {
          const dx = pos[i * 3] - mx * 80;
          const dy = pos[i * 3 + 1] - (-my * 50);
          const d = Math.hypot(dx, dy);
          if (d < 40) {
            pos[i * 3] += (dx / d) * delta * 12;
            pos[i * 3 + 1] += (dy / d) * delta * 12;
          }
        }
      }
      threeCtx.mesh.geometry.attributes.position.needsUpdate = true;
    } else if (threeCtx.sceneType === "matrix") {
      threeCtx.mesh.children.forEach((m, i) => {
        m.position.y -= 0.15 + (i % 5) * 0.05;
        m.rotation.y += 0.01;
        if (m.position.y < -120) {
          m.position.y = 120;
          m.position.x = (Math.random() - 0.5) * 260;
        }
        if (state.settings.threeMouseFx) {
          const dx = m.position.x - mx * 100;
          const dy = m.position.y - (-my * 80);
          const d = Math.hypot(dx, dy);
          if (d < 50) m.scale.setScalar(2.2 - d / 50);
          else m.scale.setScalar(1.0);
        }
      });
    } else if (threeCtx.sceneType === "waves") {
      const pos = threeCtx.mesh.geometry.attributes.position.array;
      for (let i = 0; i < pos.length / 3; i++) {
        const x = pos[i * 3], z = pos[i * 3 + 2];
        let y = Math.sin(x * 0.08 + time * 1.5) * Math.cos(z * 0.08 + time * 1.5) * 6;
        y += Math.sin(x * 0.2 + time * 3.0) * 1.2;
        if (state.settings.threeMouseFx) {
          const mxw = mx * 130, mzw = -my * 100;
          const d = Math.hypot(x - mxw, z - mzw);
          if (d < 45) y -= (45 - d) * 0.45;
        }
        pos[i * 3 + 1] = y;
      }
      threeCtx.mesh.geometry.attributes.position.needsUpdate = true;
    }

    if (state.settings.threeMouseFx) {
      tx += (mx - tx) * 0.04;
      ty += (my - ty) * 0.04;
      camera.position.x += (tx * 15 - camera.position.x) * 0.05;
      camera.position.y += (-ty * 12 - camera.position.y) * 0.05;
    } else {
      camera.position.x *= 0.96;
      camera.position.y *= 0.96;
    }
    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  })();
}

function resetThreeScene() {
  if (!threeCtx) return;
  const type = state.settings.threeSceneType;
  if (threeCtx.sceneType === type && threeCtx.mesh) return;
  if (threeCtx.mesh) threeCtx.scene.remove(threeCtx.mesh);

  if (type === "stars") {
    const cnt = 1400;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(cnt * 3);
    const cols = new Float32Array(cnt * 3);
    const c1 = new THREE.Color("#d0bcff");
    const c2 = new THREE.Color("#4f378b");
    for (let i = 0; i < cnt; i++) {
      const r = Math.pow(Math.random(), 2.5) * 160;
      const spin = r * 0.05;
      const a = (i % 3) * (Math.PI * 2 / 3) + spin;
      pos[i * 3] = Math.cos(a) * r + (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.sin(a) * r + (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      const mixed = c1.clone().lerp(c2, r / 160);
      cols[i * 3] = mixed.r;
      cols[i * 3 + 1] = mixed.g;
      cols[i * 3 + 2] = mixed.b;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    threeCtx.mesh = new THREE.Points(geom, new THREE.PointsMaterial({
      size: 1.8, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending
    }));
  } else if (type === "matrix") {
    const grp = new THREE.Group();
    for (let i = 0; i < 90; i++) {
      const g = new THREE.BoxGeometry(2, 2, 2);
      const w = new THREE.WireframeGeometry(g);
      const line = new THREE.LineSegments(w);
      line.position.x = (Math.random() - 0.5) * 260;
      line.position.y = (Math.random() - 0.5) * 220;
      line.position.z = (Math.random() - 0.5) * 160;
      line.material.color.setHex(0x4ddb9e);
      line.material.transparent = true;
      line.material.opacity = 0.45;
      grp.add(line);
    }
    threeCtx.mesh = grp;
  } else if (type === "waves") {
    const gx = 75, gz = 75;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(gx * gz * 3);
    const cols = new Float32Array(gx * gz * 3);
    const c1 = new THREE.Color("#4f378b");
    const c2 = new THREE.Color("#d0bcff");
    let idx = 0;
    for (let x = 0; x < gx; x++) {
      for (let z = 0; z < gz; z++) {
        pos[idx * 3] = (x - gx / 2) * 4.2;
        pos[idx * 3 + 1] = 0;
        pos[idx * 3 + 2] = (z - gz / 2) * 4.2;
        const mixed = c1.clone().lerp(c2, x / gx);
        cols[idx * 3] = mixed.r;
        cols[idx * 3 + 1] = mixed.g;
        cols[idx * 3 + 2] = mixed.b;
        idx++;
      }
    }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    threeCtx.mesh = new THREE.Points(geom, new THREE.PointsMaterial({
      size: 1.6, vertexColors: true, transparent: true, opacity: 0.8
    }));
  }
  threeCtx.scene.add(threeCtx.mesh);
  threeCtx.sceneType = type;
}

function resizeThree() {
  if (!threeCtx) return;
  threeCtx.renderer.setSize(window.innerWidth, window.innerHeight);
  threeCtx.camera.aspect = window.innerWidth / window.innerHeight;
  threeCtx.camera.updateProjectionMatrix();
}

// === 시간/날씨 ===
function startClock() {
  clearInterval(clockInterval);
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
  if (!state.settings.showClock) return;
  const n = new Date();
  const t = n.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const d = n.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  $("#clockBox").textContent = `${t} · ${d}`;
}

async function fetchWeather(force = false) {
  if (!state.settings.showWeather) return;
  const box = $("#weatherBox");
  const c = state.weatherCache;
  if (!force && c && Date.now() - c.time < 30 * 60 * 1000) {
    box.textContent = `${c.temp}° ${c.icon} ${c.text}`;
    return;
  }
  if (!navigator.geolocation) { box.textContent = "위치 미지원"; return; }
  box.textContent = "🌤 로딩...";
  navigator.geolocation.getCurrentPosition(async p => {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=temperature_2m,weather_code`);
      const d = await r.json();
      const code = d.current.weather_code;
      const w = {
        time: Date.now(),
        temp: Math.round(d.current.temperature_2m),
        text: wText(code),
        icon: wIcon(code)
      };
      state.weatherCache = w;
      saveState();
      box.textContent = `${w.temp}° ${w.icon} ${w.text}`;
    } catch { box.textContent = "날씨 실패"; }
  }, () => { box.textContent = "위치 필요"; }, { timeout: 8000 });
}

function wIcon(c) {
  if (c === 0) return "☀️"; if (c <= 3) return "⛅"; if (c <= 48) return "🌫";
  if (c <= 67) return "🌧"; if (c <= 77) return "❄️"; if (c <= 82) return "🌦"; return "⛈";
}

function wText(c) {
  const m = { 0:"맑음",1:"대체로 맑음",2:"구름 조금",3:"흐림",45:"안개",48:"안개",51:"이슬비",53:"이슬비",55:"강한 이슬비",61:"비",63:"비",65:"강한 비",71:"눈",73:"눈",75:"강한 눈",80:"소나기",81:"소나기",82:"강한 소나기",95:"뇌우",96:"뇌우/우박",99:"강한 뇌우" };
  return m[c] || "날씨";
}

// === 유틸 ===
function setSeg(groupId, hiddenId, val) {
  const el = $(`#${groupId}`);
  if (!el) return;
  $$(".seg-btn", el).forEach(b => b.classList.toggle("active", b.dataset.val === val));
  $(`#${hiddenId}`).value = val;
}

function bindSeg(groupId, hiddenId, cb) {
  const el = $(`#${groupId}`);
  if (!el) return;
  el.onclick = e => {
    const b = e.target.closest(".seg-btn");
    if (!b) return;
    $$(".seg-btn", el).forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $(`#${hiddenId}`).value = b.dataset.val;
    if (cb) cb(b.dataset.val);
  };
}

function fileToDataURL(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const c = Object.assign(document.createElement("canvas"), { width: w, height: h });
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        const mime = /png|webp|svg/i.test(file.type) ? "image/png" : "image/jpeg";
        resolve(c.toDataURL(mime, 0.88));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

// === 이벤트 바인딩 ===
function bindAllEvents() {
  $("#introSkipBtn").onclick = () => { $("#intro").classList.add("hide"); focusSearch(); };
  $("#settingsBtn").onclick = () => showPanel($("#settingsPanel"));
  $("#addAppBtn").onclick = () => openAppModal();
  $("#addNoteBtn").onclick = makeNewNote;
  $("#openAllBtn").onclick = openLaunchGroup;
  $("#modalBackdrop").onclick = closeAllModals;

  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAllModals(); });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      const p = e.target.closest(".panel, .modal");
      if (p) closePanel(p);
    }
    if (!e.target.closest(".quickMenu") && !e.target.closest(".tile-more")) hideQuickMenu();
  });

  $("#engineSelect").onchange = e => { state.settings.searchEngine = e.target.value; $("#settingsEngineSelect").value = e.target.value; saveState(); };
  $("#settingsEngineSelect").onchange = e => { state.settings.searchEngine = e.target.value; $("#engineSelect").value = e.target.value; saveState(); };
  $("#searchBtn").onclick = doSearch;
  $("#searchInput").onkeydown = e => { if (e.key === "Enter") doSearch(); };

  $("#layoutSelect").onchange = e => { state.settings.layout = e.target.value; saveState(); toggleLayout(); };
  $("#welcomeInput").onchange = e => { state.settings.welcomeMsg = e.target.value.trim(); saveState(); };
  $("#showIntroToggle").onchange = e => { state.settings.showIntro = e.target.checked; saveState(); };
  $("#showClockToggle").onchange = e => { state.settings.showClock = e.target.checked; saveState(); syncWidgets(); };
  $("#showWeatherToggle").onchange = e => { state.settings.showWeather = e.target.checked; saveState(); syncWidgets(); if (e.target.checked) fetchWeather(true); };
  $("#autoPinToggle").onchange = e => { state.settings.autoPinNotes = e.target.checked; saveState(); };

  $("#bgTypeSelect").onchange = e => { state.settings.bgType = e.target.value; saveState(); applyBG(); toggleBgFields(e.target.value); };
  $("#threeSceneSelect").onchange = e => { state.settings.threeSceneType = e.target.value; saveState(); resetThreeScene(); };
  $("#threeMouseToggle").onchange = e => { state.settings.threeMouseFx = e.target.checked; saveState(); };

  $("#bgImageUpload").onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    $("#bgFileName").textContent = f.name;
    try {
      state.settings.bgImage = await fileToDataURL(f, 1600, 1000);
      state.settings.bgType = "image";
      saveState();
      syncUIFromState();
      applyBG();
      toast("배경 적용됨");
    } catch { toast("이미지 변환 실패"); }
    e.target.value = "";
  };

  bindSeg("favModeSeg", "favModeVal", val => {
    $("#favLinkField").style.display = val === "link" ? "" : "none";
    $("#favUploadField").style.display = val === "upload" ? "" : "none";
  });

  $("#favIconUpload").onchange = e => {
    $("#favFileName").textContent = e.target.files?.[0]?.name || "파일 없음";
  };

  $("#applyFavBtn").onclick = async () => {
    const mode = $("#favModeVal").value;
    state.settings.faviconType = mode;
    if (mode === "emoji") state.settings.faviconData = MAGIC_ICON;
    else if (mode === "link") state.settings.faviconData = $("#favIconUrl").value.trim();
    else if (mode === "upload") {
      const f = $("#favIconUpload").files?.[0];
      if (f) state.settings.faviconData = await fileToDataURL(f, 128, 128);
    }
    saveState();
    applyFavicon();
    toast("탭 아이콘 적용됨");
  };

  $("#applyBgBtn").onclick = () => {
    state.settings.bgSolidColor = $("#bgSolidColor").value;
    state.settings.bgGrad1 = $("#bgGrad1").value;
    state.settings.bgGrad2 = $("#bgGrad2").value;
    state.settings.bgGradAngle = parseInt($("#bgGradAngle").value) || 135;
    state.settings.bgEmojis = $("#bgEmojiInput").value.trim() || "✨";
    const url = $("#bgImageUrl").value.trim();
    if (url) { state.settings.bgImage = url; state.settings.bgType = "image"; }
    state.settings.bgType = $("#bgTypeSelect").value;
    state.settings.bgFit = $("#bgFitSelect").value;
    saveState();
    syncUIFromState();
    applyBG();
    toast("배경 저장됨");
  };

  $("#resetDataBtn").onclick = () => {
    if (!confirm("모든 데이터를 초기화할까요?")) return;
    localStorage.removeItem(SK);
    location.reload();
  };

  bindSeg("entryTypeSeg", "entryType", toggleEntryFields);
  bindSeg("iconModeSeg", "iconModeVal", toggleIconFields);

  $("#appIconUpload").onchange = e => {
    $("#iconFileName").textContent = e.target.files?.[0]?.name || "파일 없음";
  };

  $("#appForm").onsubmit = handleAppSubmit;
  $("#folderOpenAllBtn").onclick = () => launchFolderAll(folderOpenId);
  $("#folderAddAppBtn").onclick = () => openAppModal(null, folderOpenId);

  $("#curveViewport").onmousemove = e => {
    const r = $("#curveViewport").getBoundingClientRect();
    pointerX = e.clientX - r.left;
    positionCurveTiles();
  };
  $("#curveViewport").onmouseleave = () => { pointerX = null; positionCurveTiles(); };
  $("#curveViewport").onwheel = e => { e.preventDefault(); rotateCurve(e.deltaY > 0 ? 1 : -1); };

  bindHold($("#curveLeft"), -1);
  bindHold($("#curveRight"), 1);
  $("#gridLeft").onclick = () => changeGridPage(-1);
  $("#gridRight").onclick = () => changeGridPage(1);

  $("#weatherBox").onclick = () => fetchWeather(true);

  let rtm;
  window.addEventListener("resize", () => {
    clearTimeout(rtm);
    rtm = setTimeout(() => {
      if (threeCtx) resizeThree();
      renderCurve();
      renderGrid();
      if (folderOpenId) renderFolder();
    }, 80);
  });
}

function bindHold(btn, dir) {
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  const start = e => {
    e.preventDefault();
    stop();
    rotateCurve(dir);
    timer = setInterval(() => rotateCurve(dir), 120);
  };
  btn.addEventListener("mousedown", start);
  btn.addEventListener("touchstart", start, { passive: false });
  btn.addEventListener("mouseup", stop);
  btn.addEventListener("mouseleave", stop);
  btn.addEventListener("touchend", stop);
  document.addEventListener("mouseup", stop);
  document.addEventListener("touchend", stop);
}
