const STORAGE_KEY = "magichome_v1";

const MAGIC_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0%" stop-color="#9d7cff"/>
      <stop offset="100%" stop-color="#59b7ff"/>
    </linearGradient>
  </defs>
  <rect rx="28" width="120" height="120" fill="#0f1422"/>
  <circle cx="92" cy="25" r="9" fill="#fff8a6"/>
  <circle cx="104" cy="41" r="5" fill="#fff"/>
  <text x="20" y="84" font-size="64">🪄</text>
</svg>
`;
const MAGIC_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MAGIC_ICON_SVG)}`;

const ENGINES = {
  google: {
    label: "Google",
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  naver: {
    label: "Naver",
    build: (q) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`,
  },
  daum: {
    label: "Daum",
    build: (q) => `https://search.daum.net/search?w=tot&q=${encodeURIComponent(q)}`,
  },
  youtube: {
    label: "YouTube",
    build: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  },
  nate: {
    label: "Nate",
    build: (q) => `https://search.nate.com/search/all.html?q=${encodeURIComponent(q)}`,
  },
};

const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

let state = loadState();
let currentEditId = null;
let folderOpenId = null;
let curvePointerX = null;
let ignoreNextClickUntil = 0;
let dragInfo = null;
let toastTimer = null;
let threeCtx = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.querySelector('link[rel="icon"]')?.setAttribute("href", MAGIC_ICON);

  setEngineOptions();
  bindUI();
  applySettingsToUI();
  initThreeBackground();
  renderAll();
  startClock();
  showIntro();

  document.body.addEventListener("dragstart", (e) => e.preventDefault());
}

function uid(prefix = "id") {
  if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildDefaultApps() {
  return [
    {
      id: uid("app"),
      kind: "app",
      name: "Google",
      url: "https://www.google.com",
      iconMode: "auto",
      icon: "",
      launchGroup: false,
    },
    {
      id: uid("app"),
      kind: "app",
      name: "Naver",
      url: "https://www.naver.com",
      iconMode: "auto",
      icon: "",
      launchGroup: false,
    },
    {
      id: uid("app"),
      kind: "app",
      name: "YouTube",
      url: "https://www.youtube.com",
      iconMode: "auto",
      icon: "",
      launchGroup: true,
    },
    {
      id: uid("app"),
      kind: "app",
      name: "GitHub",
      url: "https://github.com",
      iconMode: "auto",
      icon: "",
      launchGroup: true,
    },
    {
      id: uid("app"),
      kind: "app",
      name: "Daum",
      url: "https://www.daum.net",
      iconMode: "auto",
      icon: "",
      launchGroup: false,
    },
    {
      id: uid("folder"),
      kind: "folder",
      name: "자주 쓰는 폴더",
      emoji: "🪄",
      items: [
        {
          id: uid("app"),
          kind: "app",
          name: "Nate",
          url: "https://www.nate.com",
          iconMode: "auto",
          icon: "",
          launchGroup: false,
        },
        {
          id: uid("app"),
          kind: "app",
          name: "YouTube Music",
          url: "https://music.youtube.com",
          iconMode: "auto",
          icon: "",
          launchGroup: false,
        },
      ],
    },
  ];
}

function buildDefaultState() {
  return {
    settings: {
      layout: "curve",
      searchEngine: "google",
      showClock: true,
      showWeather: false,
      welcomeMessage: "반가워요. 오늘도 매직하게 시작해볼까요?",
      bgType: "three",
      bgImage: "",
      bgFit: "cover",
    },
    items: buildDefaultApps(),
    notes: [],
    carouselIndex: 0,
    gridPage: 0,
    weatherCache: null,
  };
}

function loadState() {
  const fallback = buildDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);

    return {
      ...fallback,
      ...saved,
      settings: {
        ...fallback.settings,
        ...(saved.settings || {}),
      },
      items: normalizeItems(saved.items || fallback.items),
      notes: Array.isArray(saved.notes) ? saved.notes : [],
      carouselIndex: Number.isFinite(saved.carouselIndex) ? saved.carouselIndex : fallback.carouselIndex,
      gridPage: Number.isFinite(saved.gridPage) ? saved.gridPage : fallback.gridPage,
      weatherCache: saved.weatherCache || null,
    };
  } catch {
    return fallback;
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return buildDefaultApps();
  return items.map((item) => {
    if (item.kind === "folder") {
      return {
        ...item,
        kind: "folder",
        emoji: item.emoji || "🪄",
        items: Array.isArray(item.items)
          ? item.items.map((child) => ({
              ...child,
              kind: "app",
              iconMode: child.iconMode || "auto",
              icon: child.icon || "",
              launchGroup: !!child.launchGroup,
            }))
          : [],
      };
    }
    return {
      ...item,
      kind: "app",
      iconMode: item.iconMode || "auto",
      icon: item.icon || "",
      launchGroup: !!item.launchGroup,
    };
  });
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    toast("저장 공간이 부족해요. 업로드 이미지를 더 작게 해주세요.");
    console.error(err);
  }
}

function setEngineOptions() {
  const html = Object.entries(ENGINES)
    .map(([key, val]) => `<option value="${key}">${val.label}</option>`)
    .join("");

  $("#engineSelect").innerHTML = html;
  $("#settingsEngineSelect").innerHTML = html;
}

function bindUI() {
  $("#settingsBtn").addEventListener("click", () => showLayer($("#settingsPanel")));
  $("#addAppBtn").addEventListener("click", () => openAppModal());
  $("#addNoteBtn").addEventListener("click", createNote);
  $("#openAllBtn").addEventListener("click", openLaunchGroup);
  $("#modalBackdrop").addEventListener("click", closeAllOverlays);

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) {
      const wrap = e.target.closest(".panel, .modal");
      if (wrap) closeLayer(wrap);
    }
    if (!e.target.closest(".quickMenu") && !e.target.closest(".tile-more")) {
      hideQuickMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllOverlays();
  });

  $("#engineSelect").addEventListener("change", (e) => {
    state.settings.searchEngine = e.target.value;
    $("#settingsEngineSelect").value = e.target.value;
    saveState();
  });

  $("#settingsEngineSelect").addEventListener("change", (e) => {
    state.settings.searchEngine = e.target.value;
    $("#engineSelect").value = e.target.value;
    saveState();
  });

  $("#searchBtn").addEventListener("click", handleSearch);
  $("#searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });

  $("#layoutSelect").addEventListener("change", (e) => {
    state.settings.layout = e.target.value;
    saveState();
    renderLayout();
  });

  $("#welcomeInput").addEventListener("input", (e) => {
    state.settings.welcomeMessage = e.target.value.trim();
    saveState();
  });

  $("#showClockToggle").addEventListener("change", (e) => {
    state.settings.showClock = e.target.checked;
    saveState();
    renderInfoWidgets();
  });

  $("#showWeatherToggle").addEventListener("change", (e) => {
    state.settings.showWeather = e.target.checked;
    saveState();
    renderInfoWidgets();
    if (e.target.checked) updateWeather(true);
  });

  $("#bgTypeSelect").addEventListener("change", (e) => {
    state.settings.bgType = e.target.value;
    saveState();
    applyBackground();
  });

  $("#bgFitSelect").addEventListener("change", (e) => {
    state.settings.bgFit = e.target.value;
    saveState();
    applyBackground();
  });

  $("#applyBgBtn").addEventListener("click", () => {
    const url = $("#bgImageUrl").value.trim();
    if (url) {
      state.settings.bgImage = url;
      state.settings.bgType = "image";
    }
    state.settings.bgFit = $("#bgFitSelect").value;
    state.settings.bgType = $("#bgTypeSelect").value;
    saveState();
    applySettingsToUI();
    applyBackground();
    toast("배경이 적용되었어요.");
  });

  $("#bgImageUpload").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file, { maxW: 1600, maxH: 1000, preferPng: false });
      state.settings.bgImage = dataUrl;
      state.settings.bgType = "image";
      saveState();
      applySettingsToUI();
      applyBackground();
      toast("배경 이미지가 저장되었어요.");
    } catch (err) {
      console.error(err);
      toast("배경 이미지를 읽지 못했어요.");
    }
    e.target.value = "";
  });

  $("#resetDataBtn").addEventListener("click", () => {
    const ok = confirm("앱, 메모, 배경, 설정을 전부 초기화할까요?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  $("#entryType").addEventListener("change", toggleEntryTypeFields);
  $("#iconModeSelect").addEventListener("change", updateIconModeUI);
  $("#appForm").addEventListener("submit", handleAppFormSubmit);

  $("#folderOpenAllBtn").addEventListener("click", () => openFolderAll(folderOpenId));
  $("#folderAddAppBtn").addEventListener("click", () => openAppModal(null, folderOpenId || ""));

  $("#curveViewport").addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      rotateCurve(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );

  $("#curveViewport").addEventListener("mousemove", (e) => {
    const rect = $("#curveViewport").getBoundingClientRect();
    curvePointerX = e.clientX - rect.left;
    positionCurveTiles();
  });

  $("#curveViewport").addEventListener("mouseleave", () => {
    curvePointerX = null;
    positionCurveTiles();
  });

  bindHoldRotate($("#curveLeft"), -1);
  bindHoldRotate($("#curveRight"), 1);

  $("#gridLeft").addEventListener("click", () => changeGridPage(-1));
  $("#gridRight").addEventListener("click", () => changeGridPage(1));

  bindSimpleSwipe($("#gridViewport"), (dir) => changeGridPage(dir === "left" ? 1 : -1));
  bindSimpleSwipe($("#curveViewport"), (dir) => rotateCurve(dir === "left" ? 1 : -1), true);

  $("#weatherBox").addEventListener("click", () => updateWeather(true));

  window.addEventListener("resize", () => {
    clearTimeout(bindUI.resizeTimer);
    bindUI.resizeTimer = setTimeout(() => {
      if (threeCtx) resizeThree();
      renderCurve();
      renderGrid();
      if (folderOpenId) renderFolder();
    }, 70);
  });
}

function bindSimpleSwipe(el, callback, ignoreTiles = false) {
  let startX = null;
  let startY = null;

  el.addEventListener("pointerdown", (e) => {
    if (ignoreTiles && e.target.closest(".app-tile")) return;
    startX = e.clientX;
    startY = e.clientY;
  });

  el.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      callback(dx < 0 ? "left" : "right");
    }
    startX = null;
    startY = null;
  });

  el.addEventListener("pointercancel", () => {
    startX = null;
    startY = null;
  });
}

function bindHoldRotate(btn, delta) {
  let timer = null;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const start = (e) => {
    e.preventDefault();
    stop();
    rotateCurve(delta);
    timer = setInterval(() => rotateCurve(delta), 120);
  };

  btn.addEventListener("mousedown", start);
  btn.addEventListener("touchstart", start, { passive: false });
  btn.addEventListener("mouseup", stop);
  btn.addEventListener("mouseleave", stop);
  btn.addEventListener("touchend", stop);
  btn.addEventListener("touchcancel", stop);
  document.addEventListener("mouseup", stop);
  document.addEventListener("touchend", stop);
}

function showIntro() {
  $("#introMessage").textContent =
    state.settings.welcomeMessage?.trim() || "반가워요. 오늘도 매직하게 시작해볼까요?";

  setTimeout(() => $("#intro").classList.add("hide"), 2000);
  setTimeout(() => {
    try {
      $("#searchInput").focus({ preventScroll: true });
    } catch (_) {}
  }, 2200);
}

function applySettingsToUI() {
  $("#layoutSelect").value = state.settings.layout;
  $("#engineSelect").value = state.settings.searchEngine;
  $("#settingsEngineSelect").value = state.settings.searchEngine;
  $("#welcomeInput").value = state.settings.welcomeMessage || "";
  $("#showClockToggle").checked = !!state.settings.showClock;
  $("#showWeatherToggle").checked = !!state.settings.showWeather;
  $("#bgTypeSelect").value = state.settings.bgType;
  $("#bgImageUrl").value =
    state.settings.bgImage && !state.settings.bgImage.startsWith("data:")
      ? state.settings.bgImage
      : "";
  $("#bgFitSelect").value = state.settings.bgFit;
}

function renderAll() {
  state.items = normalizeItems(state.items);
  renderInfoWidgets();
  applyBackground();
  renderLayout();
  renderCurve();
  renderGrid();
  renderNotes();
  if (folderOpenId) renderFolder();
}

function renderInfoWidgets() {
  $("#clockBox").classList.toggle("hidden", !state.settings.showClock);
  $("#weatherBox").classList.toggle("hidden", !state.settings.showWeather);
  updateClock();
  if (state.settings.showWeather) updateWeather();
}

function renderLayout() {
  const isCurve = state.settings.layout === "curve";
  $("#curveSection").classList.toggle("hidden", !isCurve);
  $("#gridSection").classList.toggle("hidden", isCurve);
}

function handleSearch() {
  const raw = $("#searchInput").value.trim();
  if (!raw) return;

  let url = "";
  if (isProbableUrl(raw)) {
    url = normalizeNavUrl(raw);
  } else {
    url = ENGINES[state.settings.searchEngine].build(raw);
  }

  if (!url) {
    toast("열 수 없는 URL 형식입니다.");
    return;
  }

  window.location.href = url;
}

function isProbableUrl(text) {
  const s = text.trim();
  if (!s || s.includes(" ")) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s)) return true;
  return /^(localhost|[\w.-]+\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(s);
}

function normalizeNavUrl(raw) {
  const s = raw.trim();
  if (!s) return "";
  if (/^(javascript|data):/i.test(s)) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}

function applyBackground() {
  const useImage = state.settings.bgType === "image" && !!state.settings.bgImage;
  const layer = $("#bgImageLayer");

  if (useImage) {
    layer.style.backgroundImage = `url("${state.settings.bgImage}")`;
    layer.style.opacity = "1";

    if (state.settings.bgFit === "contain") {
      layer.style.backgroundSize = "contain";
    } else if (state.settings.bgFit === "stretch") {
      layer.style.backgroundSize = "100% 100%";
    } else {
      layer.style.backgroundSize = "cover";
    }
  } else {
    layer.style.backgroundImage = "none";
    layer.style.opacity = "0";
  }

  $("#threeBg").style.opacity = useImage ? "0" : "1";
}

function initThreeBackground() {
  const container = $("#threeBg");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 120;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BufferGeometry();
  const count = 900;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 260;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 160;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 180;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.7,
    transparent: true,
    opacity: 0.72,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const ringGeom = new THREE.TorusGeometry(34, 0.28, 12, 120);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x8d7cff,
    transparent: true,
    opacity: 0.12,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = 1.2;
  scene.add(ring);

  threeCtx = { scene, camera, renderer, points, ring };

  function animate() {
    if (!threeCtx) return;
    points.rotation.y += 0.0009;
    points.rotation.x += 0.00025;
    ring.rotation.z += 0.002;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

function resizeThree() {
  if (!threeCtx) return;
  const { renderer, camera } = threeCtx;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function renderCurve() {
  const track = $("#curveTrack");
  track.innerHTML = "";

  if (!state.items.length) {
    const empty = document.createElement("div");
    empty.className = "emptyState";
    empty.style.position = "absolute";
    empty.style.left = "50%";
    empty.style.top = "46%";
    empty.style.transform = "translate(-50%, -50%)";
    empty.textContent = "앱을 추가해보세요.";
    track.appendChild(empty);
    return;
  }

  state.carouselIndex =
    ((state.carouselIndex % state.items.length) + state.items.length) % state.items.length;

  state.items.forEach((item) => {
    track.appendChild(createTile(item, "", "curve"));
  });

  requestAnimationFrame(positionCurveTiles);
}

function circularOffset(index, center, total) {
  let diff = index - center;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

function positionCurveTiles() {
  const viewport = $("#curveViewport");
  const tiles = $$(".curve-tile", $("#curveTrack"));
  if (!tiles.length) return;

  const total = tiles.length;
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  const centerX = width / 2;
  const baseY = Math.min(126, height * 0.38);
  const spacing = Math.min(154, width * 0.18);

  tiles.forEach((tile, index) => {
    const offset = circularOffset(index, state.carouselIndex, total);
    const x = centerX + offset * spacing;
    const y = baseY + Math.pow(Math.abs(offset), 1.55) * 17;
    const baseScale = Math.max(0.58, 1 - Math.abs(offset) * 0.09);
    const rotate = offset * -3.6;
    const opacity = Math.max(0.24, 1 - Math.abs(offset) * 0.18);

    let hoverBoost = 0;
    if (curvePointerX !== null) {
      const dist = Math.abs(curvePointerX - x);
      hoverBoost = Math.max(0, 0.18 - dist / (width * 2.5));
    }

    const scale = baseScale + hoverBoost;
    tile.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;
    tile.style.opacity = opacity;
    tile.style.zIndex = String(100 - Math.abs(Math.round(offset)));
  });
}

function rotateCurve(delta) {
  if (state.items.length < 2) return;
  state.carouselIndex = (state.carouselIndex + delta + state.items.length) % state.items.length;
  saveState();
  positionCurveTiles();
}

function renderGrid() {
  const track = $("#gridTrack");
  track.innerHTML = "";

  const pageSize = window.innerWidth < 720 ? 6 : 8;
  const total = state.items.length;
  const pageCount = Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
  state.gridPage = clamp(state.gridPage, 0, pageCount - 1);

  for (let p = 0; p < pageCount; p++) {
    const page = document.createElement("div");
    page.className = "grid-page";

    const slice = state.items.slice(p * pageSize, (p + 1) * pageSize);
    if (!slice.length) {
      const empty = document.createElement("div");
      empty.className = "emptyState";
      empty.textContent = "앱을 추가해보세요.";
      page.appendChild(empty);
    } else {
      slice.forEach((item) => page.appendChild(createTile(item, "", "grid")));
    }

    track.appendChild(page);
  }

  track.style.transform = `translateX(calc(-100% * ${state.gridPage} / ${pageCount}))`;
  $("#gridPageLabel").textContent = `${state.gridPage + 1} / ${pageCount}`;
}

function changeGridPage(delta) {
  const pageSize = window.innerWidth < 720 ? 6 : 8;
  const pageCount = Math.max(1, Math.ceil(Math.max(state.items.length, 1) / pageSize));
  state.gridPage = clamp(state.gridPage + delta, 0, pageCount - 1);
  saveState();
  renderGrid();
}

function createTile(item, parentId = "", mode = "grid") {
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
    img.src = resolveIcon(item);
    img.alt = item.name;
    img.onerror = () => (img.src = MAGIC_ICON);
    iconBox.appendChild(img);
  }

  const name = document.createElement("div");
  name.className = "tile-name";
  name.textContent = item.name;

  const more = document.createElement("button");
  more.className = "tile-more";
  more.type = "button";
  more.textContent = "⋮";

  const badge = document.createElement("div");
  badge.className = "launch-badge";
  badge.textContent = "✨";
  badge.style.display = item.kind === "app" && item.launchGroup ? "inline-flex" : "none";

  tile.append(iconBox, name, more, badge);

  tile.addEventListener("click", (e) => {
    if (Date.now() < ignoreNextClickUntil) return;
    if (e.target.closest(".tile-more")) return;
    if (item.kind === "folder") {
      openFolder(item.id);
    } else {
      openApp(item.url);
    }
  });

  more.addEventListener("click", (e) => {
    e.stopPropagation();
    showQuickMenu(item.id, e.clientX, e.clientY);
  });

  attachLongPressDrag(tile, item.id);

  return tile;
}

function buildFolderPreview(folder) {
  const wrap = document.createElement("div");
  const items = (folder.items || []).slice(0, 4);

  if (!items.length) {
    wrap.className = "folder-preview folder-emoji";
    wrap.textContent = folder.emoji || "🪄";
    return wrap;
  }

  wrap.className = "folder-preview";

  items.forEach((child) => {
    const slot = document.createElement("span");
    slot.className = "mini-icon";

    const img = document.createElement("img");
    img.src = resolveIcon(child);
    img.alt = child.name;
    img.onerror = () => (img.src = MAGIC_ICON);

    slot.appendChild(img);
    wrap.appendChild(slot);
  });

  for (let i = items.length; i < 4; i++) {
    const slot = document.createElement("span");
    slot.className = "mini-icon empty";
    wrap.appendChild(slot);
  }

  return wrap;
}

function resolveIcon(item) {
  if (!item || item.kind !== "app") return MAGIC_ICON;
  if ((item.iconMode === "link" || item.iconMode === "upload") && item.icon) return item.icon;
  if (item.icon) return item.icon;

  try {
    const u = new URL(normalizeNavUrl(item.url));
    if (!/^https?:$/.test(u.protocol)) return MAGIC_ICON;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return MAGIC_ICON;
  }
}

function openApp(rawUrl) {
  const url = normalizeNavUrl(rawUrl || "");
  if (!url) {
    toast("열 수 없는 URL입니다.");
    return;
  }
  window.location.href = url;
}

function showQuickMenu(itemId, x, y) {
  const found = findItemAndParent(itemId);
  if (!found) return;
  const item = found.item;

  const menu = $("#quickMenu");
  menu.innerHTML = "";

  const addAction = (label, fn, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (danger) btn.classList.add("danger");
    btn.addEventListener("click", () => {
      hideQuickMenu();
      fn();
    });
    menu.appendChild(btn);
  };

  if (item.kind === "app") {
    addAction("열기", () => openApp(item.url));
    addAction("수정", () => openAppModal(item.id));
    addAction(item.launchGroup ? "모음에서 제외" : "모음에 포함", () => {
      item.launchGroup = !item.launchGroup;
      saveState();
      renderAll();
    });
    addAction("삭제", () => deleteItem(item.id), true);
  } else {
    addAction("폴더 열기", () => openFolder(item.id));
    addAction("폴더 수정", () => openAppModal(item.id));
    addAction("폴더에 앱 추가", () => openAppModal(null, item.id));
    addAction("폴더 전체 열기", () => openFolderAll(item.id));
    addAction("삭제", () => deleteItem(item.id), true);
  }

  menu.classList.remove("hidden");
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - rect.width - 12, x))}px`;
    menu.style.top = `${Math.max(12, Math.min(window.innerHeight - rect.height - 12, y))}px`;
  });
}

function hideQuickMenu() {
  $("#quickMenu").classList.add("hidden");
}

function showLayer(el) {
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.classList.add("open");
    refreshBackdrop();
  });
}

function closeLayer(el) {
  if (!el || el.classList.contains("hidden")) return;
  el.classList.remove("open");
  setTimeout(() => {
    el.classList.add("hidden");
    if (el.id === "appModal") currentEditId = null;
    if (el.id === "folderModal") folderOpenId = null;
    refreshBackdrop();
  }, 180);
  refreshBackdrop();
}

function refreshBackdrop() {
  const active = [$("#settingsPanel"), $("#appModal"), $("#folderModal")].some(
    (el) => !el.classList.contains("hidden")
  );

  $("#modalBackdrop").classList.toggle("hidden", !active);

  requestAnimationFrame(() => {
    $("#modalBackdrop").classList.toggle("show", active);
  });
}

function closeAllOverlays() {
  hideQuickMenu();
  closeLayer($("#settingsPanel"));
  closeLayer($("#appModal"));
  closeLayer($("#folderModal"));
}

function populateParentSelect(selected = "") {
  const select = $("#parentSelect");
  const folders = state.items.filter((item) => item.kind === "folder");
  select.innerHTML = `<option value="">메인 홈</option>`;

  folders.forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = `폴더: ${folder.name}`;
    select.appendChild(opt);
  });

  select.value = selected || "";
}

function openAppModal(itemId = null, parentHint = "") {
  currentEditId = itemId;

  const found = itemId ? findItemAndParent(itemId) : null;
  const item = found?.item || null;

  $("#appModalTitle").textContent = item ? "항목 수정" : "앱 / 폴더 추가";

  populateParentSelect(found?.parentId || parentHint || "");
  $("#entryType").value = item?.kind || "app";
  $("#entryType").disabled = !!item;

  $("#appName").value = item?.name || "";
  $("#appUrl").value = item?.url || "";
  $("#iconModeSelect").value = item?.iconMode || "auto";
  $("#appIconUrl").value = item?.iconMode === "link" ? item.icon || "" : "";
  $("#appIconUpload").value = "";
  $("#launchGroupToggle").checked = !!item?.launchGroup;
  $("#folderEmoji").value = item?.emoji || "🪄";

  toggleEntryTypeFields();
  updateIconModeUI();
  showLayer($("#appModal"));
}

function toggleEntryTypeFields() {
  const isApp = $("#entryType").value === "app";
  $("#appOnlyFields").classList.toggle("hidden", !isApp);
  $("#folderOnlyFields").classList.toggle("hidden", isApp);
  $("#appUrl").required = isApp;
}

function updateIconModeUI() {
  const mode = $("#iconModeSelect").value;
  $("#appIconUrl").disabled = mode !== "link";
  $("#appIconUpload").disabled = mode !== "upload";
}

async function handleAppFormSubmit(e) {
  e.preventDefault();

  const type = $("#entryType").value;
  const name = $("#appName").value.trim() || (type === "folder" ? "새 폴더" : "새 앱");

  if (type === "folder") {
    if (currentEditId) {
      const found = findItemAndParent(currentEditId);
      if (!found || found.item.kind !== "folder") return;
      found.item.name = name;
      found.item.emoji = $("#folderEmoji").value.trim() || "🪄";
    } else {
      state.items.push({
        id: uid("folder"),
        kind: "folder",
        name,
        emoji: $("#folderEmoji").value.trim() || "🪄",
        items: [],
      });
    }

    saveState();
    renderAll();
    closeLayer($("#appModal"));
    return;
  }

  const url = $("#appUrl").value.trim();
  if (!url) {
    toast("앱 URL 또는 프로토콜을 입력해주세요.");
    return;
  }

  const iconMode = $("#iconModeSelect").value;
  const found = currentEditId ? findItemAndParent(currentEditId) : null;
  let icon = "";

  if (iconMode === "auto") {
    icon = "";
  } else if (iconMode === "link") {
    icon = $("#appIconUrl").value.trim() || (found?.item.iconMode === "link" ? found.item.icon : "");
  } else if (iconMode === "upload") {
    const file = $("#appIconUpload").files?.[0];
    if (file) {
      icon = await fileToDataURL(file, { maxW: 256, maxH: 256, preferPng: true });
    } else {
      icon = found?.item.iconMode === "upload" ? found.item.icon : "";
    }
  }

  const appObj = {
    id: found?.item.id || uid("app"),
    kind: "app",
    name,
    url,
    iconMode,
    icon,
    launchGroup: !!$("#launchGroupToggle").checked,
  };

  const targetParentId = $("#parentSelect").value || "";

  if (found) {
    if (found.parentId === targetParentId) {
      found.parent.splice(found.index, 1, appObj);
    } else {
      found.parent.splice(found.index, 1);
      insertIntoParent(targetParentId, appObj);
    }
  } else {
    insertIntoParent(targetParentId, appObj);
  }

  saveState();
  renderAll();
  if (folderOpenId) renderFolder();
  closeLayer($("#appModal"));
}

function insertIntoParent(parentId, item) {
  if (!parentId) {
    state.items.push(item);
    return;
  }

  const folder = getFolderById(parentId);
  if (!folder) {
    state.items.push(item);
    return;
  }

  folder.items.push(item);
}

function getFolderById(id) {
  return state.items.find((item) => item.kind === "folder" && item.id === id) || null;
}

function findItemAndParent(id) {
  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (item.id === id) {
      return { item, parent: state.items, parentId: "", index: i };
    }
    if (item.kind === "folder") {
      const arr = item.items || [];
      const idx = arr.findIndex((child) => child.id === id);
      if (idx > -1) {
        return { item: arr[idx], parent: arr, parentId: item.id, index: idx };
      }
    }
  }
  return null;
}

function deleteItem(id) {
  const found = findItemAndParent(id);
  if (!found) return;

  let msg = "이 항목을 삭제할까요?";
  if (found.item.kind === "folder" && found.item.items?.length) {
    msg = `폴더와 내부 앱 ${found.item.items.length}개를 함께 삭제할까요?`;
  }

  if (!confirm(msg)) return;

  found.parent.splice(found.index, 1);
  saveState();
  renderAll();

  if (folderOpenId && !getFolderById(folderOpenId)) {
    closeLayer($("#folderModal"));
  }
}

function openFolder(id) {
  folderOpenId = id;
  renderFolder();
  showLayer($("#folderModal"));
}

function renderFolder() {
  const folder = getFolderById(folderOpenId);
  if (!folder) {
    closeLayer($("#folderModal"));
    return;
  }

  $("#folderTitle").textContent = folder.name;
  const box = $("#folderApps");
  box.innerHTML = "";

  if (!folder.items?.length) {
    const empty = document.createElement("div");
    empty.className = "emptyState";
    empty.textContent = "폴더가 비어 있어요. 앱을 추가하거나 드래그해서 넣어보세요.";
    box.appendChild(empty);
  } else {
    folder.items.forEach((item) => box.appendChild(createTile(item, folder.id, "folder")));
  }

  $("#folderOpenAllBtn").disabled = !folder.items?.length;
}

function openFolderAll(folderId) {
  const folder = getFolderById(folderId);
  if (!folder || !folder.items?.length) {
    toast("폴더가 비어 있어요.");
    return;
  }

  const urls = folder.items
    .filter((item) => item.kind === "app")
    .map((item) => normalizeNavUrl(item.url))
    .filter(Boolean);

  if (!urls.length) {
    toast("열 수 있는 앱 URL이 없어요.");
    return;
  }

  urls.forEach((url, i) => {
    setTimeout(() => window.open(url, "_blank", "noopener"), i * 120);
  });

  toast("팝업 차단이 켜져 있으면 브라우저에서 허용해주세요.");
}

function collectLaunchGroup(items, out = []) {
  items.forEach((item) => {
    if (item.kind === "app" && item.launchGroup) {
      const url = normalizeNavUrl(item.url);
      if (url) out.push(url);
    }
    if (item.kind === "folder" && item.items?.length) {
      collectLaunchGroup(item.items, out);
    }
  });
  return out;
}

function openLaunchGroup() {
  const urls = collectLaunchGroup(state.items, []);
  if (!urls.length) {
    toast("모음에 포함된 앱이 없어요. 앱 수정에서 체크해주세요.");
    return;
  }

  urls.forEach((url, i) => {
    setTimeout(() => window.open(url, "_blank", "noopener"), i * 120);
  });

  toast("팝업 차단이 켜져 있으면 브라우저에서 허용해주세요.");
}

function attachLongPressDrag(tile, itemId) {
  tile.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest(".tile-more")) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let timer = null;

    const cancelIfMoved = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        clearTimeout(timer);
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", cancelIfMoved);
      window.removeEventListener("pointerup", clearAndStop);
      window.removeEventListener("pointercancel", clearAndStop);
    };

    const clearAndStop = () => {
      clearTimeout(timer);
      cleanup();
    };

    timer = setTimeout(() => {
      cleanup();
      startDrag(itemId, tile, startX, startY);
    }, 360);

    window.addEventListener("pointermove", cancelIfMoved);
    window.addEventListener("pointerup", clearAndStop, { once: true });
    window.addEventListener("pointercancel", clearAndStop, { once: true });
  });
}

function startDrag(itemId, tile, x, y) {
  const found = findItemAndParent(itemId);
  if (!found) return;

  ignoreNextClickUntil = Date.now() + 650;

  const rect = tile.getBoundingClientRect();
  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;

  document.body.appendChild(ghost);
  tile.classList.add("drag-source");
  document.body.classList.add("dragging");

  dragInfo = {
    id: itemId,
    sourceEl: tile,
    ghost,
    hover: null,
  };

  moveGhost(x, y);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", endDrag, { once: true });
  window.addEventListener("pointercancel", endDrag, { once: true });

  toast("길게 눌러 이동 중... 앱 위에 놓으면 폴더 생성/추가");
}

function moveGhost(x, y) {
  if (!dragInfo?.ghost) return;
  dragInfo.ghost.style.left = `${x}px`;
  dragInfo.ghost.style.top = `${y}px`;
}

function clearDropHighlights() {
  $$(".drop-target, .combine-target").forEach((el) => {
    el.classList.remove("drop-target", "combine-target");
  });
}

function pointNearCenter(rect, x, y) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.hypot(x - cx, y - cy) < Math.min(rect.width, rect.height) * 0.24;
}

function onDragMove(e) {
  if (!dragInfo) return;
  moveGhost(e.clientX, e.clientY);
  clearDropHighlights();

  const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest(".app-tile");
  if (!targetEl || targetEl.dataset.id === dragInfo.id) {
    dragInfo.hover = null;
    return;
  }

  const source = findItemAndParent(dragInfo.id);
  const target = findItemAndParent(targetEl.dataset.id);
  if (!source || !target) {
    dragInfo.hover = null;
    return;
  }

  let mode = null;

  if (target.item.kind === "folder" && source.item.kind === "app") {
    if (source.parentId !== target.item.id) mode = "into-folder";
  } else if (source.parent === target.parent) {
    if (
      !source.parentId &&
      source.item.kind === "app" &&
      target.item.kind === "app" &&
      pointNearCenter(targetEl.getBoundingClientRect(), e.clientX, e.clientY)
    ) {
      mode = "make-folder";
    } else {
      mode = "reorder";
    }
  }

  if (!mode) {
    dragInfo.hover = null;
    return;
  }

  dragInfo.hover = {
    targetId: target.item.id,
    mode,
  };

  targetEl.classList.add(mode === "reorder" ? "drop-target" : "combine-target");
}

function endDrag() {
  if (!dragInfo) return;

  window.removeEventListener("pointermove", onDragMove);
  clearDropHighlights();
  document.body.classList.remove("dragging");

  dragInfo.sourceEl?.classList.remove("drag-source");
  dragInfo.ghost?.remove();

  const hover = dragInfo.hover;
  const sourceId = dragInfo.id;
  dragInfo = null;

  if (!hover) {
    renderAll();
    return;
  }

  let changed = false;

  if (hover.mode === "reorder") {
    changed = reorderByIds(sourceId, hover.targetId);
  } else if (hover.mode === "into-folder") {
    changed = addAppToFolder(sourceId, hover.targetId);
  } else if (hover.mode === "make-folder") {
    changed = createFolderFromApps(sourceId, hover.targetId);
  }

  if (changed) {
    saveState();
    renderAll();
    if (folderOpenId) renderFolder();
  }
}

function reorderByIds(sourceId, targetId) {
  const source = findItemAndParent(sourceId);
  const target = findItemAndParent(targetId);
  if (!source || !target) return false;
  if (source.parent !== target.parent) return false;
  if (source.index === target.index) return false;

  const arr = source.parent;
  const [moved] = arr.splice(source.index, 1);
  let toIndex = target.index;
  if (source.index < target.index) toIndex -= 1;
  arr.splice(toIndex, 0, moved);
  return true;
}

function addAppToFolder(appId, folderId) {
  const source = findItemAndParent(appId);
  const folder = getFolderById(folderId);
  if (!source || !folder) return false;
  if (source.item.kind !== "app") return false;
  if (source.parentId === folderId) return false;

  const [moved] = source.parent.splice(source.index, 1);
  folder.items.push(moved);
  return true;
}

function createFolderFromApps(aId, bId) {
  const a = findItemAndParent(aId);
  const b = findItemAndParent(bId);
  if (!a || !b) return false;
  if (a.parent !== b.parent) return false;
  if (a.parentId || b.parentId) return false;
  if (a.item.kind !== "app" || b.item.kind !== "app") return false;

  const arr = a.parent;
  const ids = new Set([aId, bId]);
  const folderIndex = Math.min(a.index, b.index);
  const picked = arr.filter((item) => ids.has(item.id));

  for (let i = arr.length - 1; i >= 0; i--) {
    if (ids.has(arr[i].id)) arr.splice(i, 1);
  }

  arr.splice(folderIndex, 0, {
    id: uid("folder"),
    kind: "folder",
    name: "새 폴더",
    emoji: "🪄",
    items: picked,
  });

  return true;
}

function createNote() {
  const colors = ["#ffe78d", "#ffd4ea", "#d6ffb3", "#cae8ff", "#f0d2ff"];
  const note = {
    id: uid("note"),
    text: "새 메모",
    x: clamp(40 + (state.notes.length * 24) % 240, 14, window.innerWidth - 230),
    y: clamp(120 + (state.notes.length * 18) % 180, 90, window.innerHeight - 220),
    color: colors[state.notes.length % colors.length],
  };

  state.notes.push(note);
  saveState();
  renderNotes();
}

function renderNotes() {
  const layer = $("#notesLayer");
  layer.innerHTML = "";

  state.notes.forEach((note) => {
    const el = document.createElement("div");
    el.className = "note";
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    el.style.background = note.color;

    const bar = document.createElement("div");
    bar.className = "note-bar";
    bar.innerHTML = `<span>메모</span>`;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.notes = state.notes.filter((n) => n.id !== note.id);
      saveState();
      renderNotes();
    });

    bar.appendChild(del);

    const body = document.createElement("div");
    body.className = "note-body";
    body.contentEditable = "true";
    body.spellcheck = false;
    body.innerText = note.text || "";

    body.addEventListener("input", () => {
      note.text = body.innerText;
      saveState();
    });

    bar.addEventListener("pointerdown", (e) => {
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      const onMove = (ev) => {
        note.x = clamp(ev.clientX - offsetX, 8, window.innerWidth - rect.width - 8);
        note.y = clamp(ev.clientY - offsetY, 8, window.innerHeight - rect.height - 8);
        el.style.left = `${note.x}px`;
        el.style.top = `${note.y}px`;
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        saveState();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });

    el.append(bar, body);
    layer.appendChild(el);
  });
}

function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  if (!state.settings.showClock) return;
  const now = new Date();
  const time = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  $("#clockBox").textContent = `${time} · ${date}`;
}

async function updateWeather(force = false) {
  if (!state.settings.showWeather) return;
  const box = $("#weatherBox");

  const cache = state.weatherCache;
  if (
    !force &&
    cache &&
    Date.now() - cache.time < 30 * 60 * 1000 &&
    typeof cache.temp !== "undefined"
  ) {
    box.textContent = `${cache.temp}° · ${cache.text}`;
    return;
  }

  if (!navigator.geolocation) {
    box.textContent = "날씨 미지원";
    return;
  }

  box.textContent = "날씨 불러오는 중...";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,weather_code&timezone=auto`;

        const res = await fetch(url);
        const data = await res.json();
        const cur = data.current;

        const weather = {
          time: Date.now(),
          temp: Math.round(cur.temperature_2m),
          text: weatherCodeToText(cur.weather_code),
        };

        state.weatherCache = weather;
        saveState();
        box.textContent = `${weather.temp}° · ${weather.text}`;
      } catch (err) {
        console.error(err);
        box.textContent = "날씨 실패";
      }
    },
    () => {
      box.textContent = "위치 권한 필요";
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 600000,
    }
  );
}

function weatherCodeToText(code) {
  const map = {
    0: "맑음",
    1: "대체로 맑음",
    2: "구름 조금",
    3: "흐림",
    45: "안개",
    48: "짙은 안개",
    51: "이슬비",
    53: "이슬비",
    55: "강한 이슬비",
    56: "어는 이슬비",
    57: "강한 어는 이슬비",
    61: "비",
    63: "비",
    65: "강한 비",
    66: "어는 비",
    67: "강한 어는 비",
    71: "눈",
    73: "눈",
    75: "강한 눈",
    77: "싸락눈",
    80: "소나기",
    81: "소나기",
    82: "강한 소나기",
    85: "눈 소나기",
    86: "강한 눈 소나기",
    95: "뇌우",
    96: "뇌우/우박",
    99: "강한 뇌우",
  };
  return map[code] || "날씨";
}

async function fileToDataURL(file, { maxW = 1600, maxH = 1000, preferPng = false } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const ratio = Math.min(maxW / width, maxH / height, 1);

        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const mime = preferPng || /png|webp|svg/i.test(file.type) ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, 0.88));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
