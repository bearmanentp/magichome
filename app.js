/* ======================================================================
   MagicHome - app.js (완벽 수정 버전)
   ====================================================================== */

const SYSTEM_KEY = "magichome_v3_state";

// ── 검색 엔진 ──────────────────────────────────────
const ENGINES = {
  google:  { label: "🔍 Google",  q: q => `https://www.google.com/search?q=${enc(q)}` },
  naver:   { label: "🟢 Naver",   q: q => `https://search.naver.com/search.naver?query=${enc(q)}` },
  daum:    { label: "🔵 Daum",    q: q => `https://search.daum.net/search?w=tot&q=${enc(q)}` },
  youtube: { label: "🔴 YouTube", q: q => `https://www.youtube.com/results?search_query=${enc(q)}` },
  nate:    { label: "🔵 Nate",    q: q => `https://search.nate.com/search/all.html?q=${enc(q)}` },
};
const enc = encodeURIComponent;

// ── 기본 제공 매직이모지 favicon 데이터 URL ──────────
const MAGIC_SVG_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="82">🪄</text></svg>`;
const MAGIC_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MAGIC_SVG_FAVICON)}`;

// ── 셀렉터 유틸리티 ─────────────────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── 메모리 상태 관리 ────────────────────────────────
let state = loadState();
let threeCtx = null;
let dragInfo = null;
let folderOpenId = null;
let curEditId = null;
let ignoreClickUntil = 0;
let pointerX = null, pointerY = null;
let toastTimer = null;
let clockInterval = null;

function buildDefaultItems() {
  return [
    appItem("Google", "https://www.google.com", false),
    appItem("Naver", "https://www.naver.com", false),
    appItem("YouTube", "https://www.youtube.com", true),
    appItem("GitHub", "https://github.com", true),
    appItem("Daum", "https://www.daum.net", false),
    folderItem("소셜 미디어", "🪄", [
      appItem("Nate", "https://www.nate.com", false),
      appItem("YouTube Music", "https://music.youtube.com", false),
    ]),
  ];
}

function appItem(name, url, isLaunchGroup = false) {
  return { id: uid("app"), kind: "app", name, url, iconMode: "auto", icon: "", launchGroup: isLaunchGroup };
}

function folderItem(name, emoji, items = []) {
  return { id: uid("folder"), kind: "folder", name, emoji, items };
}

function buildDefaultState() {
  return {
    settings: {
      layout: "curve",
      searchEngine: "google",
      showClock: true,
      showWeather: false,
      showIntro: true,
      welcomeMsg: "반가워요. 오늘도 매직하게 시작해볼까요?",
      // 탭 아이콘 (Favicon) 커스텀 데이터
      faviconType: "emoji", // "emoji", "link", "upload"
      faviconData: "",
      // 고도화된 배경 옵션들
      bgType: "three", // "three", "solid", "gradient", "image", "emoji"
      threeSceneType: "stars", // "stars", "matrix", "waves"
      threeMouseFx: true,
      bgSolidColor: "#121016",
      bgGrad1: "#1f1a3a",
      bgGrad2: "#0d0a12",
      bgGradAngle: 135,
      bgImage: "",
      bgFit: "cover",
      bgEmojis: "✨🎈🪄🍀🌸🔥",
    },
    items: buildDefaultItems(),
    notes: [],
    carouselIdx: 0,
    gridPage: 0,
    weatherCache: null,
  };
}

function loadState() {
  const fb = buildDefaultState();
  try {
    const raw = localStorage.getItem(SYSTEM_KEY);
    if (!raw) return fb;
    const s = JSON.parse(raw);
    return {
      ...fb, ...s,
      settings: { ...fb.settings, ...(s.settings || {}) },
      items: normalizeDataItems(s.items || fb.items),
      notes: Array.isArray(s.notes) ? s.notes : [],
    };
  } catch {
    return fb;
  }
}

function normalizeDataItems(arr) {
  if (!Array.isArray(arr)) return buildDefaultItems();
  return arr.map(it => {
    if (it.kind === "folder") {
      return {
        ...it, kind: "folder", emoji: it.emoji || "🪄",
        items: Array.isArray(it.items)
          ? it.items.map(c => ({ ...c, kind: "app", iconMode: c.iconMode || "auto", icon: c.icon || "", launchGroup: !!c.launchGroup }))
          : []
      };
    }
    return { ...it, kind: "app", iconMode: it.iconMode || "auto", icon: it.icon || "", launchGroup: !!it.launchGroup };
  });
}

function saveState() {
  try {
    localStorage.setItem(SYSTEM_KEY, JSON.stringify(state));
  } catch {
    toast("브라우저 로컬 스토리지 한도를 초과하여 이미지 데이터 최적화가 필요합니다.");
  }
}

// ═══════════════════════════════════════════════════
//  코어 초기화 시스템 (DOM 완벽 구성 보장)
// ═══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  setEngineLists();
  bindMainEvents();
  syncAllStateToUI();
  renderAllComponents();
  initThreeBackground(); // Three.js 오류 시 스킵되도록 안전화 처리됨
  startSystemClock();
  applyBackgroundTheme();
  applyFaviconTheme();
  handleIntroView();
});

// ── 인트로 부팅 제어 ───────────────────────────────
function handleIntroView() {
  if (!state.settings.showIntro) {
    $("#intro").classList.add("hide");
    focusSearchBox();
    return;
  }
  $("#introMessage").textContent = state.settings.welcomeMsg || "반가워요. 오늘도 매직하게 시작해볼까요?";
  setTimeout(triggerIntroHide, 2000);
}

function triggerIntroHide() {
  const el = $("#intro");
  if (!el || el.classList.contains("hide")) return;
  el.classList.add("hide");
  focusSearchBox();
}

function focusSearchBox() {
  setTimeout(() => {
    try { $("#searchInput").focus({ preventScroll: true }); } catch {}
  }, 350);
}

// ── 검색엔진 셀렉트 리스트 주입 ─────────────────────────
function setEngineLists() {
  const h = Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("#engineSelect").innerHTML = h;
  $("#settingsEngineSelect").innerHTML = h;
}

// ── 세그먼트 커스텀 탭 버튼 바인딩 ─────────────────────
function bindSegmentCtrl(groupId, hiddenId, onChg) {
  const el = $(`#${groupId}`);
  if (!el) return;
  el.addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $$(".seg-btn", el).forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $(`#${hiddenId}`).value = btn.dataset.val;
    if (onChg) onChg(btn.dataset.val);
  });
}

function setSegmentActive(groupId, hiddenId, val) {
  const el = $(`#${groupId}`);
  if (!el) return;
  $$(".seg-btn", el).forEach(b => b.classList.toggle("active", b.dataset.val === val));
  $(`#${hiddenId}`).value = val;
}

// ═══════════════════════════════════════════════════
//  이벤트 전체 바인딩 (안전 장치 추가)
// ═══════════════════════════════════════════════════
function bindMainEvents() {
  $("#introSkipBtn").addEventListener("click", triggerIntroHide);

  // 상단바 제어판 트리거
  $("#settingsBtn").addEventListener("click", () => openOverlayPanel($("#settingsPanel")));
  $("#addAppBtn").addEventListener("click", () => openAppInputModal());
  $("#addNoteBtn").addEventListener("click", makeNewStickyNote);
  $("#openAllBtn").addEventListener("click", handleBatchLaunch);

  // 모달 영역 바깥 클릭 해제
  $("#modalBackdrop").addEventListener("click", closeAllOverlays);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllOverlays();
  });

  // 버튼 속성 기준 일괄 닫기 이벤트 리스너
  document.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      const parent = e.target.closest(".panel, .modal");
      if (parent) closeOverlayPanel(parent);
    }
    if (!e.target.closest(".quickMenu") && !e.target.closest(".tile-more")) {
      hideQuickMenu();
    }
  });

  // 검색엔진 상호 연동 연쇄 작용
  $("#engineSelect").addEventListener("change", e => syncSearchEngine(e.target.value));
  $("#settingsEngineSelect").addEventListener("change", e => syncSearchEngine(e.target.value));

  // 검색 연산
  $("#searchBtn").addEventListener("click", execQuerySearch);
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") execQuerySearch();
  });

  // 옵션 실시간 저장 바인딩 세트
  const bindSave = (sel, key, trans = v => v) => {
    $(sel).addEventListener("change", e => {
      state.settings[key] = trans(e.target.type === "checkbox" ? e.target.checked : e.target.value);
      saveState();
      renderAllComponents();
    });
  };
  bindSave("#layoutSelect", "layout", v => { toggleActiveLayout(); return v; });
  bindSave("#welcomeInput", "welcomeMsg", v => v.trim());
  bindSave("#showIntroToggle", "showIntro");
  bindSave("#showClockToggle", "showClock", v => { triggerWidgetSync(); return v; });
  bindSave("#showWeatherToggle", "showWeather", v => { triggerWidgetSync(); if(v) fetchRealtimeWeather(true); return v; });
  bindSave("#bgTypeSelect", "bgType", v => { applyBackgroundTheme(); toggleSubBgFields(v); return v; });
  bindSave("#threeSceneSelect", "threeSceneType", v => { resetThreeScene(); return v; });
  bindSave("#threeMouseToggle", "threeMouseFx");

  // 배경 이미지 업로드 변환
  $("#bgImageUpload").addEventListener("change", async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    $("#bgFileName").textContent = f.name;
    try {
      state.settings.bgImage = await convertFileToUrl(f, 1600, 1000);
      state.settings.bgType = "image";
      saveState();
      syncAllStateToUI();
      applyBackgroundTheme();
      toast("배경 이미지 업로드 및 최적화가 완료되었습니다.");
    } catch {
      toast("해당 파일을 이미지 포맷으로 처리할 수 없습니다.");
    }
    e.target.value = "";
  });

  // 탭 아이콘 (Favicon) 세그먼트 및 업로드 바인딩
  bindSegmentCtrl("favModeSeg", "favModeVal", val => {
    $("#favLinkField").style.display = val === "link" ? "" : "none";
    $("#favUploadField").style.display = val === "upload" ? "" : "none";
  });

  $("#favIconUpload").addEventListener("change", e => {
    $("#favFileName").textContent = e.target.files?.[0]?.name || "파일 없음";
  });

  $("#applyFavBtn").addEventListener("click", async () => {
    const mode = $("#favModeVal").value;
    state.settings.faviconType = mode;

    if (mode === "emoji") {
      state.settings.faviconData = MAGIC_ICON;
    } else if (mode === "link") {
      state.settings.faviconData = $("#favIconUrl").value.trim();
    } else if (mode === "upload") {
      const f = $("#favIconUpload").files?.[0];
      if (f) {
        state.settings.faviconData = await convertFileToUrl(f, 128, 128);
      }
    }
    saveState();
    applyFaviconTheme();
    toast("브라우저 탭 아이콘 변경이 반영되었습니다.");
  });

  // 통합 수정사항 영구 반영 버튼
  $("#applyBgBtn").addEventListener("click", () => {
    state.settings.bgSolidColor = $("#bgSolidColor").value;
    state.settings.bgGrad1 = $("#bgGrad1").value;
    state.settings.bgGrad2 = $("#bgGrad2").value;
    state.settings.bgGradAngle = parseInt($("#bgGradAngle").value) || 135;
    state.settings.bgEmojis = $("#bgEmojiInput").value.trim() || "✨";
    
    const url = $("#bgImageUrl").value.trim();
    if (url) {
      state.settings.bgImage = url;
      state.settings.bgType = "image";
    }

    state.settings.bgType = $("#bgTypeSelect").value;
    state.settings.bgFit = $("#bgFitSelect").value;
    saveState();
    syncAllStateToUI();
    applyBackgroundTheme();
    toast("테마 환경 설정이 업데이트되었습니다.");
  });

  // 리셋 버튼
  $("#resetDataBtn").addEventListener("click", () => {
    if (!confirm("모든 앱 레이아웃 배치 데이터와 메모리가 완전히 초기화됩니다. 계속 진행할까요?")) return;
    localStorage.removeItem(SYSTEM_KEY);
    window.location.reload();
  });

  // 날씨 새로고침 트리거
  $("#weatherBox").addEventListener("click", () => fetchRealtimeWeather(true));

  // 앱 생성/수정 라벨 제어 세그먼트 버튼 연동
  bindSegmentCtrl("entryTypeSeg", "entryType", onEntryFormToggle);
  bindSegmentCtrl("iconModeSeg", "iconModeVal", onIconFormToggle);

  // 아이콘 이미지 파일명 변경 캐치
  $("#appIconUpload").addEventListener("change", e => {
    $("#iconFileName").textContent = e.target.files?.[0]?.name || "선택된 파일 없음";
  });

  $("#appForm").addEventListener("submit", handleAppFormSave);

  // 안드로이드 폴더 기능 제어
  $("#folderOpenAllBtn").addEventListener("click", () => triggerFolderLaunchAll(folderOpenId));
  $("#folderAddAppBtn").addEventListener("click", () => openAppInputModal(null, folderOpenId));

  // 마우스 커브 다이얼 위치 센서 기록
  $("#curveViewport").addEventListener("mousemove", e => {
    const rect = $("#curveViewport").getBoundingClientRect();
    pointerX = e.clientX - rect.left;
    pointerY = e.clientY - rect.top;
    triggerDialReposition();
  });

  $("#curveViewport").addEventListener("mouseleave", () => {
    pointerX = null;
    pointerY = null;
    triggerDialReposition();
  });

  // 터치 스와이프 리스너 배치
  bindSwipeDetection($("#curveViewport"), dir => rotateCurveDial(dir === "left" ? 1 : -1), true);
  bindSwipeDetection($("#gridViewport"), dir => changeGridPage(dir === "left" ? 1 : -1));

  // 물리 휠 이동 제어
  $("#curveViewport").addEventListener("wheel", e => {
    e.preventDefault();
    rotateCurveDial(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // 좌우 회전 버튼 지연 홀딩 루프
  bindHoldWheel($("#curveLeft"), -1);
  bindHoldWheel($("#curveRight"), 1);

  // 그리드 좌우 화살표 제어
  $("#gridLeft").addEventListener("click", () => changeGridPage(-1));
  $("#gridRight").addEventListener("click", () => changeGridPage(1));

  // 윈도우 스펙 변경 리사이즈 반응형 설계
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (threeCtx) resizeThreeCanvas();
      renderCurveLayout();
      renderGridPageLayout();
      if (folderOpenId) renderFolderPopup();
    }, 70);
  });
}

function syncSearchEngine(val) {
  state.settings.searchEngine = val;
  saveState();
  $("#engineSelect").value = val;
  $("#settingsEngineSelect").value = val;
}

// ── 세그먼트 전용 토글 라벨 변경 ──────────────────────
function onEntryFormToggle(val) {
  const isApp = val === "app";
  $("#appOnlyFields").classList.toggle("hidden", !isApp);
  $("#folderOnlyFields").classList.toggle("hidden", isApp);
}

function onIconFormToggle(val) {
  $("#iconLinkField").style.display = val === "link" ? "" : "none";
  $("#iconUploadField").style.display = val === "upload" ? "" : "none";
}

function toggleSubBgFields(type) {
  $$(".bgSubFields").forEach(el => el.classList.add("hidden"));
  if (type === "three") $("#bgThreeOptions").classList.remove("hidden");
  else if (type === "solid") $("#bgSolidOptions").classList.remove("hidden");
  else if (type === "gradient") $("#bgGradientOptions").classList.remove("hidden");
  else if (type === "image") $("#bgImageOptions").classList.remove("hidden");
  else if (type === "emoji") $("#bgEmojiOptions").classList.remove("hidden");
}

// ═══════════════════════════════════════════════════
//  배경 테마 제어 엔진 (단색/그라데이션/이모지/Three.js)
// ═══════════════════════════════════════════════════
function applyBackgroundTheme() {
  const s = state.settings;
  const solid = $("#bgSolidLayer");
  const img = $("#bgImageLayer");
  const three = $("#threeBg");

  // 레이어 전체 디폴트 가림
  solid.style.background = "none";
  img.style.backgroundImage = "none";
  img.style.opacity = "0";
  three.style.opacity = "0";
  destroyEmojiBackground();

  if (s.bgType === "solid") {
    solid.style.background = s.bgSolidColor || "#121016";
  } else if (s.bgType === "gradient") {
    solid.style.background = `linear-gradient(${s.bgGradAngle}deg, ${s.bgGrad1}, ${s.bgGrad2})`;
  } else if (s.bgType === "image" && s.bgImage) {
    img.style.backgroundImage = `url("${s.bgImage}")`;
    img.style.backgroundSize = s.bgFit === "contain" ? "contain" : s.bgFit === "stretch" ? "100% 100%" : "cover";
    img.style.opacity = "1";
  } else if (s.bgType === "emoji") {
    solid.style.background = "#141218";
    initEmojiBackground();
  } else if (s.bgType === "three") {
    three.style.opacity = "1";
  }
}

// ── 날아다니는 이모지 생성 및 수거 ───────────────────
function initEmojiBackground() {
  destroyEmojiBackground();
  const container = $("#bgEmojiLayer");
  const emojis = Array.from(state.settings.bgEmojis || "✨🎈🪄");
  if (!emojis.length) return;

  const count = 18;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "floating-emoji";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.left = `${Math.random() * 96}%`;
    el.style.animationDelay = `${Math.random() * 12}s`;
    el.style.fontSize = `${20 + Math.random() * 24}px`;
    container.appendChild(el);
  }
}

function destroyEmojiBackground() {
  $("#bgEmojiLayer").innerHTML = "";
}

// ── 브라우저 상단 탭 아이콘 (Favicon) 동적 적용 ───────
function applyFaviconTheme() {
  const f = state.settings.faviconData || MAGIC_ICON;
  const link = $("#favicon");
  if (link) {
    link.setAttribute("href", f);
  }
}

// ═══════════════════════════════════════════════════
//  UI 바인딩 및 렌더링 동기화
// ═══════════════════════════════════════════════════
function syncAllStateToUI() {
  const s = state.settings;
  $("#layoutSelect").value = s.layout;
  $("#engineSelect").value = s.searchEngine;
  $("#settingsEngineSelect").value = s.searchEngine;
  $("#welcomeInput").value = s.welcomeMsg || "";
  $("#showIntroToggle").checked = !!s.showIntro;
  $("#showClockToggle").checked = !!s.showClock;
  $("#showWeatherToggle").checked = !!s.showWeather;
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

  setSegmentActive("favModeSeg", "favModeVal", s.faviconType);
  $("#favIconUrl").value = s.faviconType === "link" ? s.faviconData : "";

  toggleSubBgFields(s.bgType);
  toggleActiveLayout();
  triggerWidgetSync();
}

function toggleActiveLayout() {
  const isCurve = state.settings.layout === "curve";
  $("#curveSection").classList.toggle("hidden", !isCurve);
  $("#gridSection").classList.toggle("hidden", isCurve);
}

function triggerWidgetSync() {
  $("#clockBox").classList.toggle("hidden", !state.settings.showClock);
  $("#weatherBox").classList.toggle("hidden", !state.settings.showWeather);
  if (state.settings.showWeather) fetchRealtimeWeather();
}

function renderAllComponents() {
  state.items = normalizeDataItems(state.items);
  renderCurveLayout();
  renderGridPageLayout();
  renderNotes();
  if (folderOpenId) renderFolderPopup();
}

// ═══════════════════════════════════════════════════
//  Three.js 코어 3D 공간 연산 (안전장치 추가)
// ═══════════════════════════════════════════════════
function initThreeBackground() {
  if (typeof THREE === "undefined") {
    console.warn("Three.js 라이브러리를 로드하지 못했습니다.");
    return;
  }
  const canvas = $("#threeBg");
  const W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W / H, 1, 1000);
  camera.position.z = 110;

  threeCtx = { renderer, scene, camera, meshObj: null, sceneType: "" };

  resetThreeScene();

  let targetX = 0, targetY = 0;
  let mouseX = 0, mouseY = 0;

  document.addEventListener("mousemove", e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  (function animationTick() {
    requestAnimationFrame(animationTick);
    if (!threeCtx || !threeCtx.meshObj) return;

    // 회전값 부여
    threeCtx.meshObj.rotation.y += 0.0007;
    threeCtx.meshObj.rotation.x += 0.0002;

    if (state.settings.threeMouseFx) {
      targetX += (mouseX - targetX) * 0.04;
      targetY += (mouseY - targetY) * 0.04;
      camera.position.x += (targetX * 12 - camera.position.x) * 0.05;
      camera.position.y += (-targetY * 10 - camera.position.y) * 0.05;
    } else {
      camera.position.x += (0 - camera.position.x) * 0.04;
      camera.position.y += (0 - camera.position.y) * 0.04;
    }
    camera.lookAt(scene.position);
    renderer.render(scene, camera);
  })();
}

function resetThreeScene() {
  if (!threeCtx) return;
  const { scene, sceneType } = threeCtx;
  const type = state.settings.threeSceneType;

  if (sceneType === type && threeCtx.meshObj) return;

  // 기존 구조 소각
  if (threeCtx.meshObj) scene.remove(threeCtx.meshObj);

  const group = new THREE.Group();

  if (type === "stars") {
    const starCount = 800;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 280;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 180;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xd0bcff, size: 1.6, transparent: true, opacity: 0.8 });
    group.add(new THREE.Points(geom, mat));
  } else if (type === "matrix") {
    // 매트릭스 스타일의 세로 구조 큐브형 기둥들
    const rainCount = 400;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 240;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 260; // 세로로 길게
      pos[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x4ddb9e, size: 2.0, transparent: true, opacity: 0.65 });
    group.add(new THREE.Points(geom, mat));
  } else {
    // 링구조 겹치기 파도 효과
    const ringGeom = new THREE.TorusGeometry(32, 0.3, 8, 80);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd0bcff, transparent: true, opacity: 0.15, wireframe: true });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = 1.2;
    group.add(ringMesh);
  }

  scene.add(group);
  threeCtx.meshObj = group;
  threeCtx.sceneType = type;
}

function resizeThreeCanvas() {
  if (!threeCtx) return;
  const { renderer, camera } = threeCtx;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

// ═══════════════════════════════════════════════════
//  [A] 가로 직선 나열 & 끝자락 곡선 다운 다이얼 시스템
// ═══════════════════════════════════════════════════
function renderCurveLayout() {
  const track = $("#curveTrack");
  track.innerHTML = "";

  if (!state.items.length) {
    const el = document.createElement("div");
    el.className = "emptyState";
    el.style.position = "absolute";
    el.style.left = "50%"; el.style.top = "42%";
    el.style.transform = "translate(-50%, -50%)";
    el.textContent = "가운데 위 + 버튼을 클릭해 사이트를 추가해 보세요.";
    track.appendChild(el);
    return;
  }

  const n = state.items.length;
  state.carouselIdx = ((state.carouselIdx % n) + n) % n;

  state.items.forEach(it => {
    track.appendChild(buildTileComponent(it, "", "curve"));
  });

  requestAnimationFrame(triggerDialReposition);
}

function getCircularDistanceOffset(index, center, total) {
  let diff = index - center;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

function triggerDialReposition() {
  const vp = $("#curveViewport");
  const tiles = $$(".curve-tile", $("#curveTrack"));
  if (!tiles.length) return;

  const total = tiles.length;
  const W = vp.clientWidth;
  const H = vp.clientHeight;
  const centerX = W / 2;
  const baseY = Math.min(116, H * 0.35); // 중앙 배치 Y
  const spacing = Math.min(144, W * 0.16); // 가로 간격

  tiles.forEach((tile, index) => {
    const off = getCircularDistanceOffset(index, state.carouselIdx, total);
    
    // 직선 가로 정렬 & 양끝은 포물선 수식으로 살짝 아래로(Y증가) 꺾이도록 제어
    const x = centerX + off * spacing;
    const y = baseY + Math.pow(Math.abs(off), 1.6) * 16; 
    
    const baseScale = Math.max(0.55, 1 - Math.abs(off) * 0.08);
    const rotation = off * -3.5;
    const opacity = Math.max(0.2, 1 - Math.abs(off) * 0.16);

    // 마우스 접근 시 확대 효과 (피드백 향상)
    let zoomBoost = 0;
    if (pointerX !== null) {
      const dist = Math.abs(pointerX - x);
      zoomBoost = Math.max(0, 0.18 - dist / (W * 2.5));
    }

    tile.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${baseScale + zoomBoost})`;
    tile.style.opacity = opacity;
    tile.style.zIndex = String(100 - Math.abs(Math.round(off)));
  });
}

function rotateCurveDial(dir) {
  if (state.items.length < 2) return;
  state.carouselIdx = (state.carouselIdx + dir + state.items.length) % state.items.length;
  saveState();
  triggerDialReposition();
}

// ═══════════════════════════════════════════════════
//  [B] 일반 앱 배열 그리드 시스템
// ═══════════════════════════════════════════════════
const getGridLimit = () => (window.innerWidth < 720 ? 6 : 8);

function renderGridPageLayout() {
  const track = $("#gridTrack");
  track.innerHTML = "";

  const limit = getGridLimit();
  const total = state.items.length;
  const pageCount = Math.max(1, Math.ceil(Math.max(total, 1) / limit));
  state.gridPage = clamp(state.gridPage, 0, pageCount - 1);

  for (let p = 0; p < pageCount; p++) {
    const page = document.createElement("div");
    page.className = "grid-page";
    const slice = state.items.slice(p * limit, (p + 1) * limit);

    if (!slice.length) {
      page.innerHTML = `<div class="emptyState">앱을 추가하세요.</div>`;
    } else {
      slice.forEach(it => page.appendChild(buildTileComponent(it, "", "grid")));
    }
    track.appendChild(page);
  }

  track.style.transform = `translateX(calc(-100% * ${state.gridPage} / ${pageCount}))`;
  $("#gridPageLabel").textContent = `${state.gridPage + 1} / ${pageCount}`;
}

function changeGridPage(dir) {
  const limit = getGridLimit();
  const pageCount = Math.max(1, Math.ceil(Math.max(state.items.length, 1) / limit));
  state.gridPage = clamp(state.gridPage + dir, 0, pageCount - 1);
  saveState();
  renderGridPageLayout();
}

// ═══════════════════════════════════════════════════
//  안드로이드 스쿼클 컴포넌트 렌더러
// ═══════════════════════════════════════════════════
function buildTileComponent(item, parentId = "", mode = "grid") {
  const tile = document.createElement("div");
  tile.className = `app-tile ${mode === "curve" ? "curve-tile" : "list-tile"}`;
  tile.dataset.id = item.id;
  tile.dataset.parentId = parentId;
  tile.dataset.kind = item.kind;

  // 아이콘 영역 조립
  const iconBox = document.createElement("div");
  iconBox.className = "tile-icon";

  if (item.kind === "folder") {
    iconBox.appendChild(renderFolderIconsPreview(item));
  } else {
    const img = document.createElement("img");
    img.src = getAppIconSrc(item);
    img.alt = item.name;
    img.onerror = () => { img.src = MAGIC_ICON; };
    img.loading = "lazy";
    iconBox.appendChild(img);
  }

  const nameLabel = document.createElement("div");
  nameLabel.className = "tile-name";
  nameLabel.textContent = item.name;

  const moreBtn = document.createElement("button");
  moreBtn.className = "tile-more";
  moreBtn.textContent = "⋮";
  moreBtn.type = "button";

  const badge = document.createElement("div");
  badge.className = "launch-badge";
  badge.textContent = "✨";
  badge.style.display = (item.kind === "app" && item.launchGroup) ? "grid" : "none";

  tile.append(iconBox, nameLabel, moreBtn, badge);

  // 이벤트 바인딩
  tile.addEventListener("click", e => {
    if (Date.now() < ignoreClickUntil) return;
    if (e.target.closest(".tile-more")) return;
    if (item.kind === "folder") {
      triggerFolderPopupView(item.id);
    } else {
      routeAppTarget(item.url);
    }
  });

  moreBtn.addEventListener("click", e => {
    e.stopPropagation();
    triggerQuickMenu(item.id, e.clientX, e.clientY);
  });

  attachAndroidDrag(tile, item.id);

  return tile;
}

function renderFolderIconsPreview(folder) {
  const box = document.createElement("div");
  const children = (folder.items || []).slice(0, 4);

  if (!children.length) {
    box.className = "folder-preview solo";
    box.textContent = folder.emoji || "🪄";
    return box;
  }

  box.className = "folder-preview";
  children.forEach(ch => {
    const s = document.createElement("span");
    s.className = "mini-icon";
    const img = document.createElement("img");
    img.src = getAppIconSrc(ch);
    img.onerror = () => { img.src = MAGIC_ICON; };
    s.appendChild(img);
    box.appendChild(s);
  });

  for (let i = children.length; i < 4; i++) {
    const s = document.createElement("span");
    s.className = "mini-icon empty";
    box.appendChild(s);
  }

  return box;
}

function getAppIconSrc(item) {
  if (!item || item.kind !== "app") return MAGIC_ICON;
  if ((item.iconMode === "link" || item.iconMode === "upload") && item.icon) return item.icon;
  if (item.icon) return item.icon;

  try {
    const u = new URL(normalizeAppUrl(item.url));
    if (!/^https?:$/.test(u.protocol)) return MAGIC_ICON;
    // 고해상도 구글 파비콘 API 주입 (지구본 방지)
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return MAGIC_ICON;
  }
}

function normalizeAppUrl(url) {
  const s = url.trim();
  if (!s) return "";
  if (/^(javascript|data):/i.test(s)) return "";
  if (/^[a-zA-Z][\w+\-.]*:/.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}

function routeAppTarget(url) {
  const target = normalizeAppUrl(url);
  if (!target) {
    toast("연결할 수 없는 규격 외 주소입니다.");
    return;
  }
  window.location.href = target;
}

// ═══════════════════════════════════════════════════
//  구글 위젯 검색 연산 및 라우팅
// ═══════════════════════════════════════════════════
function execQuerySearch() {
  const val = $("#searchInput").value.trim();
  if (!val) return;
  const target = isURLFormat(val) ? normalizeAppUrl(val) : ENGINES[state.settings.searchEngine].q(val);
  window.location.href = target;
}

function isURLFormat(str) {
  if (!str || str.includes(" ")) return false;
  if (/^[a-zA-Z][\w+\-.]*:/.test(str)) return true;
  return /^(localhost|[\w.-]+\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(str);
}

// ═══════════════════════════════════════════════════
//  모음 전체 일괄 실행 로직 (팝업 우회 대응)
// ═══════════════════════════════════════════════════
function retrieveBatchList(items, collect = []) {
  items.forEach(it => {
    if (it.kind === "app" && it.launchGroup) {
      const u = normalizeAppUrl(it.url);
      if (u) collect.push(u);
    }
    if (it.kind === "folder" && it.items?.length) {
      retrieveBatchList(it.items, collect);
    }
  });
  return collect;
}

function handleBatchLaunch() {
  const list = retrieveBatchList(state.items);
  if (!list.length) {
    toast("모음 그룹에 등록된 앱이 없습니다. 앱 연동 설정을 편집해 보세요.");
    return;
  }
  executePopupLaunchAll(list);
}

function triggerFolderLaunchAll(folderId) {
  const folder = getFolderById(folderId);
  if (!folder?.items?.length) {
    toast("폴더가 비어 있습니다.");
    return;
  }
  const list = folder.items.map(it => normalizeAppUrl(it.url)).filter(Boolean);
  executePopupLaunchAll(list);
}

function executePopupLaunchAll(urls) {
  urls.forEach((url, i) => {
    if (i === 0) {
      window.location.href = url; // 첫 번째 링크는 바로 이동
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => anchor.remove(), 400);
    }
  });
}

// ═══════════════════════════════════════════════════
//  컨텍스트 퀵 메뉴 조립기
// ═══════════════════════════════════════════════════
function triggerQuickMenu(itemId, x, y) {
  const find = findSystemItem(itemId);
  if (!find) return;
  const { item } = find;
  const qm = $("#quickMenu");
  qm.innerHTML = "";

  const add = (label, handler, isDanger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (isDanger) btn.className = "danger";
    btn.addEventListener("click", () => {
      hideQuickMenu();
      handler();
    });
    qm.appendChild(btn);
  };

  const drawSep = () => {
    const el = document.createElement("div");
    el.className = "qm-sep";
    qm.appendChild(el);
  };

  if (item.kind === "app") {
    add("🌐 즉시 연결", () => routeAppTarget(item.url));
    add("✏️ 배치 수정", () => openAppInputModal(item.id));
    drawSep();
    add(item.launchGroup ? "✨ 모음 그룹 탈퇴" : "✨ 모음 그룹 합류", () => {
      item.launchGroup = !item.launchGroup;
      saveState();
      renderAllComponents();
    });
    drawSep();
    add("🗑 앱 삭제", () => deleteSelectedElement(item.id), true);
  } else {
    add("📂 폴더 전개", () => triggerFolderPopupView(item.id));
    add("✏️ 폴더명 수정", () => openAppInputModal(item.id));
    add("➕ 앱 등록", () => openAppInputModal(null, item.id));
    add("🚀 내부 앱 일괄 실행", () => triggerFolderLaunchAll(item.id));
    drawSep();
    add("🗑 폴더 폭파", () => deleteSelectedElement(item.id), true);
  }

  qm.classList.remove("hidden");
  requestAnimationFrame(() => {
    const r = qm.getBoundingClientRect();
    qm.style.left = `${clamp(x, 12, window.innerWidth - r.width - 12)}px`;
    qm.style.top = `${clamp(y, 12, window.innerHeight - r.height - 12)}px`;
  });
}

function hideQuickMenu() {
  $("#quickMenu").classList.add("hidden");
}

// ═══════════════════════════════════════════════════
//  모달 오버레이 제어 및 백드롭 연동
// ═══════════════════════════════════════════════════
function openOverlayPanel(el) {
  if (!el) return;
  el.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.classList.add("open");
    syncBackdropState();
  });
}

function closeOverlayPanel(el) {
  if (!el || el.classList.contains("hidden")) return;
  el.classList.remove("open");
  setTimeout(() => {
    el.classList.add("hidden");
    if (el.id === "appModal") curEditId = null;
    if (el.id === "folderModal") folderOpenId = null;
    syncBackdropState();
  }, 180);
  syncBackdropState();
}

function closeAllOverlays() {
  hideQuickMenu();
  closeOverlayPanel($("#settingsPanel"));
  closeOverlayPanel($("#appModal"));
  closeOverlayPanel($("#folderModal"));
}

function syncBackdropState() {
  const visible = [$("#settingsPanel"), $("#appModal"), $("#folderModal")].some(el => !el.classList.contains("hidden"));
  $("#modalBackdrop").classList.toggle("hidden", !visible);
  requestAnimationFrame(() => $("#modalBackdrop").classList.toggle("show", visible));
}

// ═══════════════════════════════════════════════════
//  앱 정보 모달 조작 및 구조 삽입
// ═══════════════════════════════════════════════════
function openAppInputModal(itemId = null, parentHint = "") {
  curEditId = itemId;
  const find = itemId ? findSystemItem(itemId) : null;
  const target = find?.item || null;

  $("#appModalTitle").textContent = target ? "디바이스 속성 편집" : "새 어플리케이션 주입";

  const type = target?.kind || "app";
  setSegmentActive("entryTypeSeg", "entryType", type);
  onEntryFormToggle(type);

  // 데이터 리커버리 채우기
  $("#appName").value = target?.name || "";
  $("#appUrl").value = target?.url || "";
  $("#appIconUrl").value = target?.iconMode === "link" ? target.icon : "";
  $("#iconFileName").textContent = "선택된 파일 없음";

  const mode = target?.iconMode || "auto";
  setSegmentActive("iconModeSeg", "iconModeVal", mode);
  onIconFormToggle(mode);
  $("#launchGroupToggle").checked = !!target?.launchGroup;

  $("#folderName").value = target?.name || "";
  $("#folderEmoji").value = target?.emoji || "🪄";

  buildParentDropdown(find?.parentId || parentHint || "");

  openOverlayPanel($("#appModal"));
}

function buildParentDropdown(selectId = "") {
  const el = $("#parentSelect");
  const folders = state.items.filter(it => it.kind === "folder");
  el.innerHTML = `<option value="">📱 안드로이드 메인 화면</option>`;
  folders.forEach(f => {
    const o = document.createElement("option");
    o.value = f.id;
    o.textContent = `📁 ${f.name}`;
    el.appendChild(o);
  });
  el.value = selectId || "";
}

async function handleAppFormSave(e) {
  e.preventDefault();
  const entryType = $("#entryType").value;

  if (entryType === "folder") {
    const name = $("#folderName").value.trim() || "새 폴더";
    const emoji = $("#folderEmoji").value.trim() || "🪄";
    if (curEditId) {
      const find = findSystemItem(curEditId);
      if (find && find.item.kind === "folder") {
        find.item.name = name;
        find.item.emoji = emoji;
      }
    } else {
      state.items.push({ id: uid("folder"), kind: "folder", name, emoji, items: [] });
    }
    saveState();
    renderAllComponents();
    closeOverlayPanel($("#appModal"));
    return;
  }

  // 앱 형식 처리
  const name = $("#appName").value.trim() || "이름 없는 앱";
  const url = $("#appUrl").value.trim();
  if (!url) {
    toast("접속할 목적지 URL 주소를 입력해 주십시오.");
    return;
  }

  const iconMode = $("#iconModeVal").value;
  const find = curEditId ? findSystemItem(curEditId) : null;
  let iconData = "";

  if (iconMode === "auto") {
    iconData = "";
  } else if (iconMode === "link") {
    iconData = $("#appIconUrl").value.trim() || (find?.item.iconMode === "link" ? find.item.icon : "");
  } else if (iconMode === "upload") {
    const file = $("#appIconUpload").files?.[0];
    iconData = file ? await convertFileToUrl(file, 256, 256) : (find?.item.iconMode === "upload" ? find.item.icon : "");
  }

  const appObj = {
    id: find?.item.id || uid("app"),
    kind: "app", name, url, iconMode, icon: iconData,
    launchGroup: !!$("#launchGroupToggle").checked,
  };

  const targetParent = $("#parentSelect").value || "";

  if (find) {
    if (find.parentId === targetParent) {
      find.parent.splice(find.index, 1, appObj);
    } else {
      find.parent.splice(find.index, 1);
      insertTargetIntoParent(targetParent, appObj);
    }
  } else {
    insertTargetIntoParent(targetParent, appObj);
  }

  saveState();
  renderAllComponents();
  if (folderOpenId) renderFolderPopup();
  closeOverlayPanel($("#appModal"));
}

function insertTargetIntoParent(parentId, item) {
  if (!parentId) {
    state.items.push(item);
    return;
  }
  const folder = getFolderById(parentId);
  if (folder) folder.items.push(item);
  else state.items.push(item);
}

// ── 안드로이드 폴더 드로워 팝업 전개 ──────────────────
function triggerFolderPopupView(id) {
  folderOpenId = id;
  renderFolderPopup();
  openOverlayPanel($("#folderModal"));
}

function renderFolderPopup() {
  const f = getFolderById(folderOpenId);
  if (!f) {
    closeOverlayPanel($("#folderModal"));
    return;
  }
  $("#folderTitle").textContent = f.name;
  const box = $("#folderApps");
  box.innerHTML = "";

  if (!f.items?.length) {
    box.innerHTML = `<div class="emptyState" style="grid-column:1/-1">폴더 내부가 비어 있습니다. 앱을 이곳으로 끌어서 놓아보세요.</div>`;
  } else {
    f.items.forEach(it => box.appendChild(buildTileComponent(it, f.id, "folder")));
  }
  $("#folderOpenAllBtn").disabled = !f.items?.length;
}

function getFolderById(id) {
  return state.items.find(it => it.kind === "folder" && it.id === id) || null;
}

// ── 구조체 검색 및 파괴 ─────────────────────────────
function findSystemItem(id) {
  for (let i = 0; i < state.items.length; i++) {
    const it = state.items[i];
    if (it.id === id) return { item: it, parent: state.items, parentId: "", index: i };
    if (it.kind === "folder") {
      const childs = it.items || [];
      const idx = childs.findIndex(c => c.id === id);
      if (idx > -1) {
        return { item: childs[idx], parent: childs, parentId: it.id, index: idx };
      }
    }
  }
  return null;
}

function deleteSelectedElement(id) {
  const find = findSystemItem(id);
  if (!find) return;

  const msg = find.item.kind === "folder" && find.item.items?.length
    ? `폴더 내부의 하위 앱 ${find.item.items.length}개가 영구 소멸됩니다. 정말로 진행할까요?`
    : "이 항목을 홈 화면에서 제거하시겠습니까?";

  if (!confirm(msg)) return;

  find.parent.splice(find.index, 1);
  saveState();
  renderAllComponents();

  if (folderOpenId && !getFolderById(folderOpenId)) {
    closeOverlayPanel($("#folderModal"));
  }
}

// ═══════════════════════════════════════════════════
//  안드로이드 런처 스무스 드래그 앤 스왑
// ═══════════════════════════════════════════════════
function attachAndroidDrag(tile, itemId) {
  tile.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (e.target.closest(".tile-more")) return;

    const sx = e.clientX, sy = e.clientY;
    let timer = null;

    const kill = () => { clearTimeout(timer); clearDragMoveListeners(); };
    const move = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) kill(); };
    const clearDragMoveListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", kill);
      window.removeEventListener("pointercancel", kill);
    };

    timer = setTimeout(() => {
      clearDragMoveListeners();
      initDragContext(itemId, tile, sx, sy);
    }, 360);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", kill, { once: true });
    window.addEventListener("pointercancel", kill, { once: true });
  });
}

function initDragContext(id, tile, x, y) {
  ignoreClickUntil = Date.now() + 650;
  const r = tile.getBoundingClientRect();
  const ghost = tile.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;

  document.body.appendChild(ghost);
  tile.classList.add("drag-source");
  document.body.classList.add("dragging");

  dragInfo = { id, sourceEl: tile, ghost, hover: null };
  updateGhostPosition(x, y);

  window.addEventListener("pointermove", onPointerDragTracking);
  window.addEventListener("pointerup", onPointerDragEnd, { once: true });
  window.addEventListener("pointercancel", onPointerDragEnd, { once: true });

  toast("이동 상태 돌입 - 다른 앱 아이콘에 겹쳐서 폴더를 만드세요.");
}

function updateGhostPosition(x, y) {
  if (!dragInfo?.ghost) return;
  dragInfo.ghost.style.left = `${x}px`;
  dragInfo.ghost.style.top = `${y}px`;
}

function clearDragHighlights() {
  $$(".drop-target, .combine-target").forEach(el => el.classList.remove("drop-target", "combine-target"));
}

function onPointerDragTracking(e) {
  if (!dragInfo) return;
  updateGhostPosition(e.clientX, e.clientY);
  clearDragHighlights();

  const element = document.elementFromPoint(e.clientX, e.clientY);
  const targetTile = element?.closest(".app-tile");
  if (!targetTile || targetTile.dataset.id === dragInfo.id) {
    dragInfo.hover = null;
    return;
  }

  const src = findSystemItem(dragInfo.id);
  const tgt = findSystemItem(targetTile.dataset.id);
  if (!src || !tgt) {
    dragInfo.hover = null;
    return;
  }

  let mode = null;

  if (tgt.item.kind === "folder" && src.item.kind === "app" && src.parentId !== tgt.item.id) {
    mode = "into-folder";
  } else if (src.parent === tgt.parent) {
    // 겹치기 감지
    const r = targetTile.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const overlaps = Math.hypot(e.clientX - cx, e.clientY - cy) < Math.min(r.width, r.height) * 0.25;

    if (!src.parentId && src.item.kind === "app" && tgt.item.kind === "app" && overlaps) {
      mode = "make-folder";
    } else {
      mode = "reorder";
    }
  }

  if (!mode) {
    dragInfo.hover = null;
    return;
  }

  dragInfo.hover = { targetId: tgt.item.id, mode };
  targetTile.classList.add(mode === "reorder" ? "drop-target" : "combine-target");
}

function onPointerDragEnd() {
  if (!dragInfo) return;
  window.removeEventListener("pointermove", onPointerDragTracking);
  clearDragHighlights();
  document.body.classList.remove("dragging");

  dragInfo.sourceEl?.classList.remove("drag-source");
  dragInfo.ghost?.remove();

  const { hover, id } = dragInfo;
  dragInfo = null;

  if (!hover) {
    renderAllComponents();
    return;
  }

  let modified = false;
  if (hover.mode === "reorder") {
    modified = execLocalReorder(id, hover.targetId);
  } else if (hover.mode === "into-folder") {
    modified = execFolderInjection(id, hover.targetId);
  } else if (hover.mode === "make-folder") {
    modified = execMergeToNewFolder(id, hover.targetId);
  }

  if (modified) {
    saveState();
    renderAllComponents();
    if (folderOpenId) renderFolderPopup();
  }
}

function execLocalReorder(srcId, tgtId) {
  const s = findSystemItem(srcId), t = findSystemItem(tgtId);
  if (!s || !t || s.parent !== t.parent || s.index === t.index) return false;
  const [moved] = s.parent.splice(s.index, 1);
  let targetIndex = t.index;
  if (s.index < t.index) targetIndex--;
  s.parent.splice(targetIndex, 0, moved);
  return true;
}

function execFolderInjection(appId, folderId) {
  const s = findSystemItem(appId), f = getFolderById(folderId);
  if (!s || !f || s.item.kind !== "app" || s.parentId === folderId) return false;
  const [moved] = s.parent.splice(s.index, 1);
  f.items.push(moved);
  return true;
}

function execMergeToNewFolder(aId, bId) {
  const a = findSystemItem(aId), b = findSystemItem(bId);
  if (!a || !b || a.parent !== b.parent || a.parentId || b.parentId) return false;
  if (a.item.kind !== "app" || b.item.kind !== "app") return false;

  const arr = a.parent, set = new Set([aId, bId]);
  const pivotIdx = Math.min(a.index, b.index);
  const picked = arr.filter(it => set.has(it.id));

  for (let i = arr.length - 1; i >= 0; i--) {
    if (set.has(arr[i].id)) arr.splice(i, 1);
  }

  arr.splice(pivotIdx, 0, { id: uid("folder"), kind: "folder", name: "새 폴더", emoji: "🪄", items: picked });
  return true;
}

// ═══════════════════════════════════════════════════
//  포스트잇 메모 컨트롤러
// ═══════════════════════════════════════════════════
function makeNewStickyNote() {
  const palette = ["#ffe78d", "#ffd4ea", "#d6ffb3", "#cae8ff", "#f0d2ff"];
  const n = state.notes.length;
  state.notes.push({
    id: uid("note"),
    text: "새 메모",
    x: clamp(40 + (n * 24) % 240, 14, window.innerWidth - 230),
    y: clamp(120 + (n * 18) % 180, 90, window.innerHeight - 220),
    color: palette[n % palette.length],
  });
  saveState();
  renderNotes();
}

function renderNotes() {
  const layer = $("#notesLayer");
  layer.innerHTML = "";
  state.notes.forEach(note => {
    const el = document.createElement("div");
    el.className = "note";
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    el.style.background = note.color;

    const bar = document.createElement("div");
    bar.className = "note-bar";
    bar.innerHTML = `<span>📌</span>`;

    const del = document.createElement("button");
    del.type = "button"; del.textContent = "✕";
    del.addEventListener("click", () => {
      state.notes = state.notes.filter(n => n.id !== note.id);
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

    bar.addEventListener("pointerdown", e => {
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = ev => {
        note.x = clamp(ev.clientX - ox, 8, window.innerWidth - r.width - 8);
        note.y = clamp(ev.clientY - oy, 8, window.innerHeight - r.height - 8);
        el.style.left = `${note.x}px`;
        el.style.top = `${note.y}px`;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        saveState();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up, { once: true });
    });

    el.append(bar, body);
    layer.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════
//  시간 / 날씨 시스템 모듈
// ═══════════════════════════════════════════════════
function startSystemClock() {
  clearInterval(clockInterval);
  updateWidgetClock();
  clockInterval = setInterval(updateWidgetClock, 1000);
}

function updateWidgetClock() {
  if (!state.settings.showClock) return;
  const now = new Date();
  const t = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const d = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  $("#clockBox").textContent = `${t} · ${d}`;
}

async function fetchRealtimeWeather(force = false) {
  if (!state.settings.showWeather) return;
  const box = $("#weatherBox");
  const cache = state.weatherCache;

  if (!force && cache && Date.now() - cache.time < 30 * 60 * 1000 && cache.temp !== undefined) {
    box.textContent = `${cache.temp}° ${cache.icon} ${cache.text}`;
    return;
  }

  if (!navigator.geolocation) {
    box.textContent = "날씨 미지원";
    return;
  }

  box.textContent = "🌤 기상 정보 분석 중…";
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude: lat, longitude: lon } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
      const d = await res.json();
      const code = d.current.weather_code;
      const weather = {
        time: Date.now(),
        temp: Math.round(d.current.temperature_2m),
        text: getWeatherCodeDesc(code),
        icon: getWeatherCodeIcon(code)
      };
      state.weatherCache = weather;
      saveState();
      box.textContent = `${weather.temp}° ${weather.icon} ${weather.text}`;
    } catch {
      box.textContent = "날씨 갱신 실패";
    }
  }, () => {
    box.textContent = "GPS 신호 수신 필요";
  }, { timeout: 8000, maximumAge: 600000 });
}

function getWeatherCodeIcon(c) {
  if (c === 0) return "☀️";
  if (c <= 3) return "⛅";
  if (c <= 48) return "🌫️";
  if (c <= 67) return "🌧️";
  if (c <= 77) return "❄️";
  if (c <= 82) return "🌦️";
  return "⛈️";
}

function getWeatherCodeDesc(c) {
  const map = {
    0: "맑음", 1: "구름 한 점 없음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개 서리",
    51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비", 61: "약한 비", 63: "보통 비", 65: "폭우",
    71: "약한 눈", 73: "보통 눈", 75: "폭설", 77: "눈싸라기", 80: "소나기", 81: "강한 소나기",
    95: "천둥번개", 96: "뇌우 우박"
  };
  return map[c] || "날씨 파악 불능";
}

// ═══════════════════════════════════════════════════
//  유틸리티 기하 연산 및 변환기
// ═══════════════════════════════════════════════════
function bindSwipeDetection(el, cb, skipTiles = false) {
  let sx = null, sy = null;
  el.addEventListener("pointerdown", e => {
    if (skipTiles && e.target.closest(".app-tile")) return;
    sx = e.clientX;
    sy = e.clientY;
  });
  el.addEventListener("pointerup", e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      cb(dx < 0 ? "left" : "right");
    }
    sx = sy = null;
  });
  el.addEventListener("pointercancel", () => { sx = sy = null; });
}

function bindHoldWheel(btn, dir) {
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  const start = e => {
    e.preventDefault();
    stop();
    rotateCurveDial(dir);
    timer = setInterval(() => rotateCurveDial(dir), 120);
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

function convertFileToUrl(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
        const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const mime = /png|webp|svg/i.test(file.type) ? "image/png" : "image/jpeg";
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
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
