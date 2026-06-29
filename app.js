/* ======================================================================
   MagicHome - app.js (메모 핀 영구 보존 및 고난도 Three.js 리액션 버전)
   ====================================================================== */

const SYSTEM_KEY = "magichome_v4_state";

// ── 검색 엔진 주소 구축 ──────────────────────────────────────
const ENGINES = {
  google:  { label: "🔍 Google",  q: q => `https://www.google.com/search?q=${enc(q)}` },
  naver:   { label: "🟢 Naver",   q: q => `https://search.naver.com/search.naver?query=${enc(q)}` },
  daum:    { label: "🔵 Daum",    q: q => `https://search.daum.net/search?w=tot&q=${enc(q)}` },
  youtube: { label: "🔴 YouTube", q: q => `https://www.youtube.com/results?search_query=${enc(q)}` },
  nate:    { label: "🔵 Nate",    q: q => `https://search.nate.com/search/all.html?q=${enc(q)}` },
};
const enc = encodeURIComponent;

const MAGIC_SVG_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="82">🪄</text></svg>`;
const MAGIC_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(MAGIC_SVG_FAVICON)}`;

// ── DOM 캐치 유틸 ─────────────────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── 메모리 상태 변수군 ────────────────────────────────
let state = loadState();
let threeCtx = null;
let dragInfo = null;
let folderOpenId = null;
let curEditId = null;
let ignoreClickUntil = 0;
let pointerX = null, pointerY = null;
let toastTimer = null;
let clockInterval = null;

// ── 디폴트 데이터 주입 ───────────────────────────────
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
      autoPinNotes: false, // 메모 생성 시 핀 자동 비활성화(디폴트)
      // 탭 데코레이션
      faviconType: "emoji",
      faviconData: "",
      // 테마 배경 데이터
      bgType: "three",
      threeSceneType: "stars",
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
    notes: [], // 핀 고정 처리된 메모는 캐시를 통해 이곳에 로드됨
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

// ── 캐시 라이트 (요청에 부합하도록 오직 Pinned 메모만 선별 저장) ──
function saveState() {
  try {
    // 핀이 꽂혀있는 메모만 로컬 스토리지에 포함시킴
    const savedNotes = state.notes.filter(n => n.pinned === true);
    const dumpData = {
      ...state,
      notes: savedNotes
    };
    localStorage.setItem(SYSTEM_KEY, JSON.stringify(dumpData));
  } catch {
    toast("로컬 스토리지 한계 도달 - 미디어 파일 최적화가 요구됩니다.");
  }
}

// ═══════════════════════════════════════════════════
//  시스템 시동
// ═══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  setEngineLists();
  bindMainEvents();
  syncAllStateToUI();
  renderAllComponents();
  initThreeBackground(); // 고성능 물리입자 시각 피드백 로드
  startSystemClock();
  applyBackgroundTheme();
  applyFaviconTheme();
  handleIntroView();
});

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

function setEngineLists() {
  const h = Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("#engineSelect").innerHTML = h;
  $("#settingsEngineSelect").innerHTML = h;
}

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
//  이벤트 라우터 바인더
// ═══════════════════════════════════════════════════
function bindMainEvents() {
  $("#introSkipBtn").addEventListener("click", triggerIntroHide);

  $("#settingsBtn").addEventListener("click", () => openOverlayPanel($("#settingsPanel")));
  $("#addAppBtn").addEventListener("click", () => openAppInputModal());
  $("#addNoteBtn").addEventListener("click", makeNewStickyNote);
  $("#openAllBtn").addEventListener("click", handleBatchLaunch);

  $("#modalBackdrop").addEventListener("click", closeAllOverlays);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllOverlays();
  });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      const parent = e.target.closest(".panel, .modal");
      if (parent) closeOverlayPanel(parent);
    }
    if (!e.target.closest(".quickMenu") && !e.target.closest(".tile-more")) {
      hideQuickMenu();
    }
  });

  $("#engineSelect").addEventListener("change", e => syncSearchEngine(e.target.value));
  $("#settingsEngineSelect").addEventListener("change", e => syncSearchEngine(e.target.value));

  $("#searchBtn").addEventListener("click", execQuerySearch);
  $("#searchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") execQuerySearch();
  });

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
  bindSave("#autoPinToggle", "autoPinNotes");
  bindSave("#bgTypeSelect", "bgType", v => { applyBackgroundTheme(); toggleSubBgFields(v); return v; });
  bindSave("#threeSceneSelect", "threeSceneType", v => { resetThreeScene(); return v; });
  bindSave("#threeMouseToggle", "threeMouseFx");

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
      toast("배경이 업로드된 이미지로 반영되었습니다.");
    } catch {
      toast("이미지 변환 실패");
    }
    e.target.value = "";
  });

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
    toast("브라우저 탭 아이콘 변경이 완료되었습니다.");
  });

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
    toast("배경 환경설정이 변경되었습니다.");
  });

  $("#resetDataBtn").addEventListener("click", () => {
    if (!confirm("모든 앱 배치와 메모가 초기화됩니다. 계속 진행할까요?")) return;
    localStorage.removeItem(SYSTEM_KEY);
    window.location.reload();
  });

  bindSegmentCtrl("entryTypeSeg", "entryType", onEntryFormToggle);
  bindSegmentCtrl("iconModeSeg", "iconModeVal", onIconFormToggle);

  $("#appIconUpload").addEventListener("change", e => {
    $("#iconFileName").textContent = e.target.files?.[0]?.name || "선택된 파일 없음";
  });

  $("#appForm").addEventListener("submit", handleAppFormSave);

  $("#folderOpenAllBtn").addEventListener("click", () => triggerFolderLaunchAll(folderOpenId));
  $("#folderAddAppBtn").addEventListener("click", () => openAppInputModal(null, folderOpenId));

  // 마우스 이동 감지
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

  bindSwipeDetection($("#curveViewport"), dir => rotateCurveDial(dir === "left" ? 1 : -1), true);
  bindSwipeDetection($("#gridViewport"), dir => changeGridPage(dir === "left" ? 1 : -1));

  $("#curveViewport").addEventListener("wheel", e => {
    e.preventDefault();
    rotateCurveDial(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  bindHoldWheel($("#curveLeft"), -1);
  bindHoldWheel($("#curveRight"), 1);

  $("#gridLeft").addEventListener("click", () => changeGridPage(-1));
  $("#gridRight").addEventListener("click", () => changeGridPage(1));

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
//  배경 테마 제어 엔진
// ═══════════════════════════════════════════════════
function applyBackgroundTheme() {
  const s = state.settings;
  const solid = $("#bgSolidLayer");
  const img = $("#bgImageLayer");
  const three = $("#threeBg");

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
    solid.style.background = "#0c0a10";
    initEmojiBackground();
  } else if (s.bgType === "three") {
    three.style.opacity = "1";
  }
}

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

function applyFaviconTheme() {
  const f = state.settings.faviconData || MAGIC_ICON;
  const link = $("#favicon");
  if (link) {
    link.setAttribute("href", f);
  }
}

// ═══════════════════════════════════════════════════
//  UI 상태 연동 및 리스너 분기
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
//  💎 초고난도 Three.js 비주얼 수식 연산 제어 💎
// ═══════════════════════════════════════════════════
function initThreeBackground() {
  if (typeof THREE === "undefined") return;
  const canvas = $("#threeBg");
  const W = window.innerWidth, H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, W / H, 1, 1000);
  camera.position.z = 100;

  threeCtx = { renderer, scene, camera, meshObj: null, sceneType: "" };

  resetThreeScene();

  let targetX = 0, targetY = 0;
  let mouseX = 0, mouseY = 0;

  // 정밀 광원 및 카메라 타겟 센싱 구축
  document.addEventListener("mousemove", e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  let clock = new THREE.Clock();

  (function animationTick() {
    requestAnimationFrame(animationTick);
    if (!threeCtx || !threeCtx.meshObj) return;

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // ── 비주얼 모드별 고난도 기하 연산 루프 ──
    if (threeCtx.sceneType === "stars") {
      // 🌌 성운 소용돌이 기하 루프
      threeCtx.meshObj.rotation.z += 0.05 * delta;
      
      const positions = threeCtx.meshObj.geometry.attributes.position.array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        // 마우스 중력 영향도 계산
        if (state.settings.threeMouseFx) {
          const dx = positions[i3] - mouseX * 80;
          const dy = positions[i3 + 1] - (-mouseY * 50);
          const dist = Math.hypot(dx, dy);
          if (dist < 40) {
            positions[i3] += (dx / dist) * delta * 12;
            positions[i3 + 1] += (dy / dist) * delta * 12;
          }
        }
      }
      threeCtx.meshObj.geometry.attributes.position.needsUpdate = true;

    } else if (threeCtx.sceneType === "matrix") {
      // 🧬 매트릭스 큐브 레인 기하 파장 루프
      const children = threeCtx.meshObj.children;
      children.forEach((mesh, index) => {
        mesh.position.y -= (0.15 + (index % 5) * 0.05);
        mesh.rotation.y += 0.01;
        if (mesh.position.y < -120) {
          mesh.position.y = 120;
          mesh.position.x = (Math.random() - 0.5) * 260;
        }
        // 마우스 호버 왜곡 작용
        if (state.settings.threeMouseFx) {
          const dx = mesh.position.x - mouseX * 100;
          const dy = mesh.position.y - (-mouseY * 80);
          const dist = Math.hypot(dx, dy);
          if (dist < 50) {
            mesh.scale.setScalar(2.2 - dist / 50);
          } else {
            mesh.scale.setScalar(1.0);
          }
        }
      });

    } else if (threeCtx.sceneType === "waves") {
      // 🌊 마우스 압력 분산 디지털 지형 서핑 루프
      const positions = threeCtx.meshObj.geometry.attributes.position.array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const x = positions[i3];
        const z = positions[i3 + 2];
        
        // 삼각 정밀 합성 웨이브 수식
        let y = Math.sin(x * 0.08 + time * 1.5) * Math.cos(z * 0.08 + time * 1.5) * 6;
        y += Math.sin(x * 0.2 + time * 3.0) * 1.2; // 디테일 고주파 파도

        // 마우스 포인트 중심 하강 압력파 계산
        if (state.settings.threeMouseFx) {
          const mx = mouseX * 130;
          const mz = -mouseY * 100;
          const dist = Math.hypot(x - mx, z - mz);
          if (dist < 45) {
            y -= (45 - dist) * 0.45; // 밀려 내려가는 왜곡 형성
          }
        }
        positions[i3 + 1] = y;
      }
      threeCtx.meshObj.geometry.attributes.position.needsUpdate = true;
    }

    // 마우스 타겟 렌더러 반응 관성 작용
    if (state.settings.threeMouseFx) {
      targetX += (mouseX - targetX) * 0.04;
      targetY += (mouseY - targetY) * 0.04;
      camera.position.x += (targetX * 15 - camera.position.x) * 0.05;
      camera.position.y += (-targetY * 12 - camera.position.y) * 0.05;
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

  if (threeCtx.meshObj) scene.remove(threeCtx.meshObj);

  // 대분류 분기
  if (type === "stars") {
    // 🌌 성운 수식 빌드
    const starCount = 1400;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const c1 = new THREE.Color("#d0bcff"); // 퍼플
    const c2 = new THREE.Color("#4f378b"); // 인디고
    const c3 = new THREE.Color("#0c0a10"); // 다크

    for (let i = 0; i < starCount; i++) {
      // 나선 은하 수학 모델 공식 적용
      const r = Math.pow(Math.random(), 2.5) * 160;
      const spin = r * 0.05;
      const angle = (i % 3) * ((2 * Math.PI) / 3) + spin;

      pos[i * 3] = Math.cos(angle) * r + (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.sin(angle) * r + (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;

      // 은하 중심부에 수렴할수록 밝은 퍼플, 변두리는 다크 인디고 처리
      const mixedColor = c1.clone().lerp(c2, r / 160);
      colors[i * 3] = mixedColor.r;
      colors[i * 3 + 1] = mixedColor.g;
      colors[i * 3 + 2] = mixedColor.b;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    
    threeCtx.meshObj = new THREE.Points(geom, mat);

  } else if (type === "matrix") {
    // 🧬 사이버 와이어 구조체 그리드
    const parentGroup = new THREE.Group();
    const gridCount = 90;
    
    for (let i = 0; i < gridCount; i++) {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const wireframe = new THREE.WireframeGeometry(geometry);
      const line = new THREE.LineSegments(wireframe);
      
      line.position.x = (Math.random() - 0.5) * 260;
      line.position.y = (Math.random() - 0.5) * 220;
      line.position.z = (Math.random() - 0.5) * 160;
      line.material.color.setHex(0x4ddb9e);
      line.material.transparent = true;
      line.material.opacity = 0.45;
      parentGroup.add(line);
    }
    threeCtx.meshObj = parentGroup;

  } else if (type === "waves") {
    // 🌊 디지털 3D 터레인 파도 생성
    const gridX = 75, gridZ = 75;
    const geom = new THREE.BufferGeometry();
    const count = gridX * gridZ;
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const c1 = new THREE.Color("#4f378b");
    const c2 = new THREE.Color("#d0bcff");

    let idx = 0;
    for (let x = 0; x < gridX; x++) {
      for (let z = 0; z < gridZ; z++) {
        // 정렬 정점 계산
        const px = (x - gridX / 2) * 4.2;
        const pz = (z - gridZ / 2) * 4.2;

        pos[idx * 3] = px;
        pos[idx * 3 + 1] = 0; // 프레임 루프에서 연산
        pos[idx * 3 + 2] = pz;

        // 투톤 파동 그래디언트
        const mixed = c1.clone().lerp(c2, x / gridX);
        colors[idx * 3] = mixed.r;
        colors[idx * 3 + 1] = mixed.g;
        colors[idx * 3 + 2] = mixed.b;

        idx++;
      }
    }

    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });

    threeCtx.meshObj = new THREE.Points(geom, mat);
  }

  scene.add(threeCtx.meshObj);
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
//  [A] 커브 다이얼 레이아웃 재배치
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
    el.textContent = "상단 앱 버튼을 눌러 새 사이트를 주입해 보세요.";
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
  const baseY = Math.min(116, H * 0.35);
  const spacing = Math.min(144, W * 0.16);

  tiles.forEach((tile, index) => {
    const off = getCircularDistanceOffset(index, state.carouselIdx, total);
    
    // 직선 나열이되, 변두리로 갈 수록 살짝 아래 방향으로 자연스럽게 하강하는 수식
    const x = centerX + off * spacing;
    const y = baseY + Math.pow(Math.abs(off), 1.62) * 16.5; 
    
    const baseScale = Math.max(0.55, 1 - Math.abs(off) * 0.08);
    const rotation = off * -3.5;
    const opacity = Math.max(0.15, 1 - Math.abs(off) * 0.16);

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
//  [B] 일반 앱 격자 슬라이더 레이아웃
// ═══════════════════════════════════════════════════
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
      page.innerHTML = `<div class="emptyState">어플리케이션을 등록해 보세요.</div>`;
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
//  안드로이드 컴포넌트 렌더러
// ═══════════════════════════════════════════════════
function buildTileComponent(item, parentId = "", mode = "grid") {
  const tile = document.createElement("div");
  tile.className = `app-tile ${mode === "curve" ? "curve-tile" : "list-tile"}`;
  tile.dataset.id = item.id;
  tile.dataset.parentId = parentId;
  tile.dataset.kind = item.kind;

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
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return MAGIC_ICON;
  }
}

function routeAppTarget(url) {
  const target = normalizeAppUrl(url);
  if (!target) {
    toast("주소 규격이 올바르지 않습니다.");
    return;
  }
  window.location.href = target;
}

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
    toast("모음으로 설정된 어플리케이션이 존재하지 않습니다.");
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
      window.location.href = url;
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
//  컨텍스트 메뉴 제어
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
    add(item.launchGroup ? "✨ 모음 그룹 해제" : "✨ 모음 그룹 등록", () => {
      item.launchGroup = !item.launchGroup;
      saveState();
      renderAllComponents();
    });
    drawSep();
    add("🗑 앱 제거", () => deleteSelectedElement(item.id), true);
  } else {
    add("📂 폴더 열기", () => triggerFolderPopupView(item.id));
    add("✏️ 속성 편집", () => openAppInputModal(item.id));
    add("➕ 하위 앱 등록", () => openAppInputModal(null, item.id));
    add("🚀 내부 일괄 기동", () => triggerFolderLaunchAll(item.id));
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
//  어플리케이션 모달 구조 세팅
// ═══════════════════════════════════════════════════
function openAppInputModal(itemId = null, parentHint = "") {
  curEditId = itemId;
  const find = itemId ? findSystemItem(itemId) : null;
  const target = find?.item || null;

  $("#appModalTitle").textContent = target ? "디바이스 속성 편집" : "새 어플리케이션 주입";

  const type = target?.kind || "app";
  setSegmentActive("entryTypeSeg", "entryType", type);
  onEntryFormToggle(type);

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
//  안드로이드 드래그 앤 리오더 물리 피드백 런처
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

  toast("이동 중 - 아이콘끼리 겹치면 폴더로 병합됩니다.");
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
//  📌 포스트잇 메모 (고정식 선별 캐시 기능 탑재) 📌
// ═══════════════════════════════════════════════════
function makeNewStickyNote() {
  const palette = ["#ffe78d", "#ffd4ea", "#d6ffb3", "#cae8ff", "#f0d2ff"];
  const n = state.notes.length;
  
  // 설정에서 자동 고정(autoPinNotes)이 활성화되어 있으면 true, 기본값은 false(비활성)
  const isPinned = !!state.settings.autoPinNotes;

  state.notes.push({
    id: uid("note"),
    text: "새 메모",
    pinned: isPinned, 
    x: clamp(40 + (n * 24) % 240, 14, window.innerWidth - 230),
    y: clamp(120 + (n * 18) % 180, 90, window.innerHeight - 220),
    color: palette[n % palette.length],
  });
  saveState();
  renderNotes();
  if (isPinned) toast("메모가 핀으로 고정되어 자동 세이브됩니다.");
}

function renderNotes() {
  const layer = $("#notesLayer");
  layer.innerHTML = "";
  
  state.notes.forEach(note => {
    const el = document.createElement("div");
    el.className = "note";
    if (note.pinned) el.classList.add("pinned-state");
    
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    el.style.background = note.color;

    const bar = document.createElement("div");
    bar.className = "note-bar";
    bar.innerHTML = `<span>✏️</span>`;

    const ctrls = document.createElement("div");
    ctrls.className = "note-controls";

    // 동적 핀 고정 토글 버튼 생성
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = `note-pin-btn ${note.pinned ? 'active' : ''}`;
    pinBtn.innerHTML = note.pinned ? "📌" : "📍";
    pinBtn.title = note.pinned ? "고정 해제 (리로드 시 소멸)" : "핀 고정 세이브 (영구 저장)";
    
    pinBtn.addEventListener("click", () => {
      note.pinned = !note.pinned;
      pinBtn.className = `note-pin-btn ${note.pinned ? 'active' : ''}`;
      pinBtn.innerHTML = note.pinned ? "📌" : "📍";
      pinBtn.title = note.pinned ? "고정 해제 (리로드 시 소멸)" : "핀 고정 세이브 (영구 저장)";
      
      if (note.pinned) {
        el.classList.add("pinned-state");
        toast("메모가 핀 고정되어 영구 캐시에 등록되었습니다.");
      } else {
        el.classList.remove("pinned-state");
        toast("핀 고정이 풀려 새로고침 시 이 메모는 소멸됩니다.");
      }
      saveState();
    });

    const del = document.createElement("button");
    del.type = "button"; 
    del.textContent = "✕";
    del.title = "삭제";
    del.addEventListener("click", () => {
      state.notes = state.notes.filter(n => n.id !== note.id);
      saveState();
      renderNotes();
    });

    ctrls.append(pinBtn, del);
    bar.appendChild(ctrls);

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
      if (e.target.closest("button")) return;
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
//  시간 및 기상관측
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
    box.textContent = "GPS 수신 필요";
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
    0: "맑음", 1: "구름 없음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개 서리",
    51: "약한 이슬비", 53: "이슬비", 55: "강한 이슬비", 61: "약한 비", 63: "보통 비", 65: "폭우",
    71: "약한 눈", 73: "보통 눈", 75: "폭설", 77: "눈싸라기", 80: "소나기", 81: "강한 소나기",
    95: "천둥번개", 96: "뇌우 우박"
  };
  return map[c] || "날씨 파악 불능";
}

const getGridLimit = () => (window.innerWidth < 720 ? 6 : 8);

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
