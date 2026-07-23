/* ============================================================
   THARUVANA Meelad Fest — app.js
   Plain JavaScript, no build step. Data lives in memory (seeded
   from the JSON embedded in index.html / data.json).

   TO CONNECT FIREBASE LATER: see FIREBASE-SETUP.md. The only
   places you need to touch are marked with "FIREBASE HOOK" below —
   swap the in-memory read/write for firebase.database() calls.
   ============================================================ */
(function () {
  "use strict";

  // ============================================================
  // IMGBB CONFIG — paste your own free API key below.
  // 1. Go to https://api.imgbb.com/  →  "Get API Key" (free, no card, instant)
  // 2. Copy the key and paste it between the quotes here
  // Until a real key is pasted, event photos are stored directly in
  // Firebase (works fine, just uses a bit more Firebase bandwidth/sync size
  // as the gallery grows) — nothing breaks either way.
  const IMGBB_API_KEY = "7d292508d92db8758504f55f792ad53f";
  // ============================================================
  function uploadToImgBB(dataUrl) {
    if (!IMGBB_API_KEY || IMGBB_API_KEY.indexOf("PASTE_") === 0) return Promise.resolve(dataUrl);
    const base64 = dataUrl.split(",")[1];
    const body = new FormData();
    body.append("image", base64);
    return fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body })
      .then((res) => res.json())
      .then((json) => {
        if (json && json.success && json.data && json.data.url) return json.data.url;
        throw new Error("ImgBB upload failed");
      })
      .catch(() => dataUrl); // if ImgBB is unreachable, fall back to storing the image directly rather than losing the upload
  }

  /* ---------------- data layer ---------------- */
  const seed = JSON.parse(document.getElementById("seed-data").textContent);
  let state = {
    hero: seed.hero,
    categories: seed.categories,
    categoryStartNumbers: seed.categoryStartNumbers || {},
    limits: seed.limits,
    teams: seed.teams,
    events: seed.events,
    students: seed.students,
    results: seed.results,
    gallery: seed.gallery,
    marks: seed.marks || {},
    judges: seed.judges || ["Judge 1"],
    customTemplates: seed.customTemplates || [],
    cardTemplates: seed.cardTemplates || [],
    resultTemplates: seed.resultTemplates || [],
    printHistory: seed.printHistory || [],
  };

  function ensureStateDefaults() {
    state.hero = state.hero || seed.hero;
    state.categories = state.categories || seed.categories;
    state.limits = state.limits || seed.limits;
    state.teams = state.teams || [];
    state.events = state.events || [];
    state.students = state.students || [];
    state.results = state.results || {};
    state.gallery = state.gallery || [];
    state.marks = state.marks || {};
    state.judges = state.judges || ["Judge 1"];
    state.customTemplates = state.customTemplates || [];
    state.cardTemplates = state.cardTemplates || [];
    state.resultTemplates = state.resultTemplates || [];
    state.categoryStartNumbers = state.categoryStartNumbers || {};
    state.printHistory = state.printHistory || [];
    state.events.forEach((e) => {
      if (!e.resultStatus) e.resultStatus = state.results[e.id] ? "Published" : "Pending";
      if (!e.assignedJudges) e.assignedJudges = [...state.judges];
      e.status = e.status || "pending";
    });
    state.students.forEach((s) => { s.events = s.events || []; });
    // Every category needs a start number; new categories default to 1.
    state.categories.forEach((c) => {
      if (state.categoryStartNumbers[c] == null) state.categoryStartNumbers[c] = 1;
    });
  }
  ensureStateDefaults();

  /* ---------------- Firebase (Realtime Database) ---------------- */
  const firebaseConfig = {
    apiKey: "AIzaSyCrgKwFY55gROH2_FkZlEjyrZw3DmrC2us",
    authDomain: "meelad-9f4a0.firebaseapp.com",
    databaseURL: "https://meelad-9f4a0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "meelad-9f4a0",
    storageBucket: "meelad-9f4a0.firebasestorage.app",
    messagingSenderId: "1067848252475",
    appId: "1:1067848252475:web:1953d18d55fbb967f5301e",
  };
  let dataRef = null;
  let firebaseReady = false;
  let suppressNextPersist = false;
  try {
    firebase.initializeApp(firebaseConfig);
    dataRef = firebase.database().ref("festData");
  } catch (err) {
    console.error("Firebase init failed, running on local data only:", err);
  }

  const uid = () => Math.random().toString(36).slice(2, 9);

  // Resizes + re-compresses an uploaded image file so it stays small in Firebase
  // (which is not meant for big binary blobs) while staying visually sharp.
  // Photos are resized then re-encoded as WebP (roughly 70% smaller than an
  // equivalent-quality JPEG at the same dimensions). Browsers that can't encode
  // WebP (older Safari) fall back to PNG automatically per the canvas spec —
  // bigger file, but nothing breaks.
  function compressImageFile(file, maxDim = 1000, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not load image"));
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/webp", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function compressImagePngFile(file, maxDim = 1200) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not load image"));
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png")); // PNG keeps transparency, unlike the JPEG compressor above
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  const RANK_POINTS = { first: 10, second: 8, third: 4 };
  const RANK_LABEL = { first: "1st Place", second: "2nd Place", third: "3rd Place" };
  const RANK_ICON = { first: "\u{1F947}", second: "\u{1F948}", third: "\u{1F949}" };
  const ORDINAL = (n) => n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
  const GRADE_THRESHOLDS = [{ min: 80, label: "A" }, { min: 60, label: "B" }, { min: 40, label: "C" }];
  function gradeFor(mark) {
    if (mark == null) return "-";
    const g = GRADE_THRESHOLDS.find((t) => mark >= t.min);
    return g ? g.label : "-";
  }

  // Chest numbers fill the lowest available slot in a category, starting from
  // that category's Start Number. Deleting a student frees their number — the
  // very next student added gets that same number back (numbers are reused,
  // never skipped or permanently retired). Always 3-digit zero-padded (e.g. 005).
  function nextChestNo(category) {
    const start = state.categoryStartNumbers[category] || 1;
    const used = new Set(
      state.students.filter((s) => s.category === category).map((s) => parseInt(s.chestNo, 10))
    );
    let n = start;
    while (used.has(n)) n++;
    return String(n).padStart(3, "0");
  }

  // Group-programme leader: the first student of a team registered for a given
  // Group event is that team's "leader" for it — results only ever show the leader.
  function isGroupLeader(eventId, studentId) {
    const student = state.students.find((s) => s.id === studentId);
    if (!student) return false;
    const event = state.events.find((e) => e.id === eventId);
    if (!event || event.type !== "Group") return true;
    const teammates = state.students.filter((s) => s.team === student.team && s.events.includes(eventId));
    return teammates.length ? teammates[0].id === studentId : false;
  }
  // Participant list for scoring/results purposes: for Group events this collapses
  // every team down to just its leader, so each team is judged/ranked once.
  function groupAwareParticipants(eventId) {
    const event = state.events.find((e) => e.id === eventId);
    const all = state.students.filter((s) => s.events.includes(eventId));
    if (!event || event.type !== "Group") return all;
    return all.filter((s) => isGroupLeader(eventId, s.id));
  }

  // Writes the whole app state to Firebase so every device/browser sees the same live data.
  function persist() {
    if (!dataRef) return;
    suppressNextPersist = true;
    dataRef.set(state).catch((err) => {
      console.error("Firebase write failed:", err);
      showToast("Could not save to Firebase \u2014 check your connection");
    });
  }

  /* ---------------- mark-entry helpers ---------------- */
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function codeLetterFor(eventId, studentId) {
    const participants = state.students.filter((s) => s.events.includes(eventId));
    const idx = participants.findIndex((s) => s.id === studentId);
    return idx >= 0 ? LETTERS[idx % LETTERS.length] : "-";
  }
  function finalMarkFor(eventId, studentId) {
    const judgeMarks = (state.marks[eventId] || {})[studentId] || {};
    const vals = Object.values(judgeMarks).filter((v) => v !== "" && v != null && !isNaN(v)).map(Number);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }
  function rankedParticipants(eventId) {
    const participants = groupAwareParticipants(eventId);
    return participants
      .map((s) => ({ student: s, mark: finalMarkFor(eventId, s.id) }))
      .sort((a, b) => (b.mark ?? -Infinity) - (a.mark ?? -Infinity));
  }
  function publishEventResult(eventId) {
    const ranked = rankedParticipants(eventId).filter((r) => r.mark != null);
    const result = { first: null, second: null, third: null };
    ["first", "second", "third"].forEach((rank, i) => {
      if (ranked[i]) result[rank] = { studentId: ranked[i].student.id };
    });
    state.results[eventId] = result;
    const ev = state.events.find((e) => e.id === eventId);
    ev.resultStatus = "Published";
    persist();
  }
  function unpublishEventResult(eventId) {
    delete state.results[eventId];
    const ev = state.events.find((e) => e.id === eventId);
    ev.resultStatus = "Pending";
    persist();
  }

  /* ---------------- toast ---------------- */
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  /* ---------------- back-navigation stack (for overlay screens) ----------------
     Uses real browser History entries so the device's physical/gesture back
     button (not just our on-screen button) closes the current screen instead
     of exiting the site \u2014 there's now an actual history entry for it to land
     on. popScreen() only *requests* a back-navigation (history.back()); the
     matching screen is actually closed inside the popstate handler, so every
     path (our buttons, hardware back, edge-swipe) closes exactly one screen. */
  const screenStack = [];
  const btnBack = document.getElementById("btnBack");
  function pushScreen(closeFn) {
    screenStack.push(closeFn);
    history.pushState({ meelaScreen: screenStack.length }, "", location.pathname + location.search);
    btnBack.classList.remove("hidden");
  }
  function popScreen() {
    if (screenStack.length) history.back();
  }
  window.addEventListener("popstate", () => {
    const fn = screenStack.pop();
    if (fn) fn();
    btnBack.classList.toggle("hidden", screenStack.length === 0);
  });
  btnBack.addEventListener("click", popScreen);

  // Most modern mobile browsers already map an edge-swipe gesture to native
  // back navigation (which the popstate listener above already handles). This
  // touch fallback covers browsers/PWA contexts where that isn't wired up.
  let touchStartX = 0, touchStartY = 0;
  document.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });
  document.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dx > 80 && Math.abs(dy) < 60 && touchStartX < 60 && screenStack.length) popScreen();
  });

  /* ---------------- sidebar ---------------- */
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  function openSidebar() { sidebar.classList.add("open"); sidebarOverlay.classList.remove("hidden"); pushScreen(closeSidebar); }
  function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.add("hidden"); }
  document.getElementById("btnMenu").addEventListener("click", openSidebar);
  document.getElementById("btnCloseSidebar").addEventListener("click", popScreen);
  sidebarOverlay.addEventListener("click", popScreen);
  document.querySelectorAll(".side-link[data-nav]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.getElementById(a.getAttribute("href").slice(1));
    popScreen(); // close the sidebar
    if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 50);
  }));
  document.getElementById("brandHome").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelectorAll('a.primary-button[href^="#"], a.explore-card[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const target = document.getElementById(a.getAttribute("href").slice(1));
    if (target) target.scrollIntoView({ behavior: "smooth" });
  }));

  /* ---------------- live ticker ---------------- */
  function renderTicker() {
    const live = state.events.filter((e) => e.status === "ticked");
    const upNext = state.events.find((e) => e.status !== "ticked");
    const badge = document.getElementById("tickerBadge");
    const text = document.getElementById("tickerText");
    if (live.length) {
      badge.textContent = "LIVE";
      badge.classList.add("live");
      text.textContent = live.map((e) => `${e.name} \u2014 ${e.category} (${e.gender})`).join("     \u2726     ");
    } else if (upNext) {
      badge.textContent = "NEXT";
      badge.classList.remove("live");
      text.textContent = `${upNext.name} \u2014 ${upNext.category} (${upNext.gender})`;
    } else {
      badge.textContent = "DONE";
      badge.classList.remove("live");
      text.textContent = "All programmes completed \u2014 check Live Standings for final results";
    }
  }

  /* ---------------- hero ---------------- */
  function renderHero() {
    // Page Header (top bar) — independent of the poster text below
    const headerText = state.hero.headerText || state.hero.title;
    const showHeader = state.hero.showHeaderText !== false;
    document.getElementById("brandTitle").textContent = headerText;
    document.getElementById("sideBrandTitle").textContent = headerText;
    document.getElementById("brandTitle").style.display = showHeader ? "" : "none";
    document.getElementById("sideBrandTitle").style.display = showHeader ? "" : "none";

    // Homepage Poster Text (badge + heading + subtitle) — shown/hidden together
    document.getElementById("posterHeading").textContent = state.hero.title;
    document.getElementById("heroBadgeText").textContent = state.hero.badge || "ANNUAL FESTIVAL";
    document.getElementById("heroSubText").textContent = state.hero.subtitle || "";

    const showPoster = state.hero.showText !== false;
    document.getElementById("heroBadge").style.display = showPoster ? "" : "none";
    document.getElementById("posterHeading").style.display = showPoster ? "" : "none";
    document.getElementById("heroSubText").style.display = showPoster ? "" : "none";

    const card = document.getElementById("heroCard");
    if (state.hero.photoUrl) {
      card.style.backgroundImage = `url('${state.hero.photoUrl}')`;
    } else {
      card.style.backgroundImage = "";
    }
  }

  /* ---------------- counters ---------------- */
  function renderCounters() {
    document.getElementById("cntProgrammes").textContent = state.events.length;
    document.getElementById("cntStudents").textContent = state.students.length;
    document.getElementById("cntTeams").textContent = state.teams.length;
    const ptsEl = document.getElementById("cntPoints");
    if (ptsEl) {
      const pts = computeTeamPoints();
      ptsEl.textContent = Object.values(pts).reduce((a, b) => a + b, 0);
    }
    const catCount = document.getElementById("exploreCategoryCount");
    const partCount = document.getElementById("exploreParticipantCount");
    if (catCount) catCount.textContent = state.categories.length;
    if (partCount) partCount.textContent = state.students.length;
  }

  /* ---------------- team points / leaderboard ---------------- */
  function computeTeamPoints() {
    const pts = {};
    state.teams.forEach((t) => (pts[t.id] = 0));
    Object.entries(state.results).forEach(([, r]) => {
      ["first", "second", "third"].forEach((rank) => {
        const entry = r && r[rank];
        if (!entry) return;
        const st = state.students.find((s) => s.id === entry.studentId);
        if (st) pts[st.team] = (pts[st.team] || 0) + RANK_POINTS[rank];
      });
    });
    return pts;
  }

  function renderLeaderboard() {
    const pts = computeTeamPoints();
    const max = Math.max(1, ...Object.values(pts));
    const sorted = [...state.teams].sort((a, b) => (pts[b.id] || 0) - (pts[a.id] || 0));
    document.getElementById("leaderboard").innerHTML = sorted.map((t, i) => `
      <div class="leaderboard-row">
        <div class="leaderboard-rank ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other"}">${i === 0 ? "\u265B" : i + 1}</div>
        <div class="leaderboard-main">
          <div class="leaderboard-top"><span>${escapeHtml(t.name)}</span><span class="leaderboard-pts">${pts[t.id] || 0} pts</span></div>
          <div class="leaderboard-track"><div class="leaderboard-fill" style="width:${Math.max(4, ((pts[t.id] || 0) / max) * 100)}%;background:${t.color}"></div></div>
        </div>
      </div>`).join("");
  }

  /* ---------------- results portal (search + text list) ---------------- */
  let resultsGender = "Boys";
  document.querySelectorAll("#genderTabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      resultsGender = btn.dataset.gender;
      document.querySelectorAll("#genderTabs .tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderFilters();
      renderResultsList();
    });
  });

  function renderFilters() {
    const catSel = document.getElementById("filterCategory");
    catSel.innerHTML = state.categories.map((c) => `<option value="${c}">${c}</option>`).join("");
    const category = catSel.value || state.categories[0];
    catSel.value = category;

    const evSel = document.getElementById("filterEvent");
    const eligible = state.events.filter((e) => e.category === category && (e.gender === resultsGender || e.gender === "General"));
    evSel.innerHTML = eligible.length
      ? eligible.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")
      : `<option value="">No programmes</option>`;
  }
  document.getElementById("filterCategory").addEventListener("change", () => { renderFilters(); renderResultsList(); });
  document.getElementById("filterEvent").addEventListener("change", renderResultsList);
  document.getElementById("searchBox").addEventListener("input", renderResultsList);
  document.getElementById("btnResultSearch").addEventListener("click", () => {
    const eventId = document.getElementById("filterEvent").value;
    openResultPosterModal(eventId);
  });

  function renderResultsList() {
    const search = document.getElementById("searchBox").value.trim().toLowerCase();
    const list = document.getElementById("resultsList");

    if (search) {
      const matches = state.students.filter((s) => s.name.toLowerCase().includes(search) || s.chestNo.toLowerCase().includes(search));
      list.innerHTML = matches.length
        ? matches.map((s) => {
            const team = state.teams.find((t) => t.id === s.team);
            return `<div class="result-row" data-student="${s.id}"><div><div class="result-name">${escapeHtml(s.name)}</div><div class="result-meta">${s.chestNo} \u00b7 ${s.category} \u00b7 ${team ? escapeHtml(team.name) : ""}</div></div><div class="result-meta">${s.events.length} events \u00b7 tap for ID card</div></div>`;
          }).join("")
        : `<div class="empty-note">No students found for "${escapeHtml(search)}".</div>`;
      list.querySelectorAll(".result-row[data-student]").forEach((row) => {
        row.addEventListener("click", () => {
          const student = state.students.find((s) => s.id === row.dataset.student);
          if (student) openCardModal(student);
        });
      });
      return;
    }

    const eventId = document.getElementById("filterEvent").value;
    const event = state.events.find((e) => e.id === eventId);
    const result = eventId ? state.results[eventId] : null;

    if (!event) { list.innerHTML = `<div class="empty-note">No programmes match this category/gender.</div>`; return; }
    if (!result) { list.innerHTML = `<div class="empty-note">Results not published yet for ${escapeHtml(event.name)}.</div>`; return; }

    const rows = ["first", "second", "third"].map((rank) => {
      const entry = result[rank];
      if (!entry) return "";
      const st = state.students.find((s) => s.id === entry.studentId);
      if (!st) return "";
      const team = state.teams.find((t) => t.id === st.team);
      return `<div class="result-row" data-rank="${rank}" data-event="${event.id}">
        <span class="result-rank rank-${rank}">${RANK_ICON[rank]} ${RANK_LABEL[rank]}</span>
        <span class="result-name">${escapeHtml(st.name)}</span>
        <span class="result-meta">${st.chestNo}</span>
      </div>`;
    }).join("");

    list.innerHTML = rows || `<div class="empty-note">Results not published yet for ${escapeHtml(event.name)}.</div>`;

    list.querySelectorAll(".result-row[data-rank]").forEach((row) => {
      row.addEventListener("click", () => {
        const rank = row.dataset.rank;
        const ev = state.events.find((e) => e.id === row.dataset.event);
        const entry = state.results[ev.id][rank];
        const st = state.students.find((s) => s.id === entry.studentId);
        const team = state.teams.find((t) => t.id === st.team);
        openPosterModal({ student: st, rank, event: ev, team });
      });
    });
  }

  /* ---------------- poster templates (canvas) ---------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // needed to canvas-process images hosted on ImgBB etc.
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Turns any image URL (including a remote ImgBB link) into a local data: URL
  // by drawing it through a canvas. Browsers ignore the `download` attribute
  // and can't attach cross-origin files to the share sheet, so anything we
  // download/share gets normalized through here first.
  function toLocalDataUrl(url) {
    if (url && url.startsWith("data:")) return Promise.resolve(url);
    return loadImage(url).then((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.92);
    });
  }

  function dataUrlToFile(dataUrl, filename) {
    const [header, base64] = dataUrl.split(",");
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  }

  // Shares an image + caption together as one native share-sheet action (so
  // WhatsApp gets both the photo and the text, not just a text link). Falls
  // back to downloading the photo and opening WhatsApp's text composer on
  // browsers/devices where file-sharing isn't supported.
  async function shareImageWithText(dataUrl, filename, text) {
    if (navigator.canShare) {
      try {
        const file = dataUrlToFile(dataUrl, filename);
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return; // user cancelled the share sheet
      }
    }
    downloadDataUrl(dataUrl, filename);
    showToast("Photo downloaded \u2014 attach it manually in the WhatsApp chat that just opened");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // Cover-fits the photo to the frame's canvas size, then draws the
  // transparent-centre PNG frame on top so the photo shows through the
  // frame's opening while its decorative border stays fixed.
  function compositeWithFrame(photoDataUrl) {
    const frameUrl = state.hero.galleryFrameUrl;
    if (!frameUrl) return Promise.resolve(photoDataUrl);
    return Promise.all([loadImage(photoDataUrl), loadImage(frameUrl)]).then(([photo, frame]) => {
      const canvas = document.createElement("canvas");
      canvas.width = frame.width; canvas.height = frame.height;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(canvas.width / photo.width, canvas.height / photo.height);
      const w = photo.width * scale, h = photo.height * scale;
      ctx.drawImage(photo, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/webp", 0.9);
    });
  }

  // Frame is applied only when the guest actually downloads/shares a photo —
  // not baked into the stored photo — so the gallery itself always shows the
  // clean original, and admin can turn framing off/on any time without
  // needing to re-upload anything.
  function getFramedPhotoUrl(photo) {
    const shouldFrame = state.hero.galleryFrameUrl && state.hero.applyFrameOnDownload !== false;
    if (shouldFrame) return compositeWithFrame(photo.url);
    return toLocalDataUrl(photo.url);
  }

  function drawTextBlock(ctx, cx, y, color, rankLabel, line1, line2, line3) {
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = 12;
    ctx.fillStyle = color; ctx.font = "bold 34px Georgia"; ctx.fillText(rankLabel, cx, y);
    ctx.font = "bold 60px Georgia"; ctx.fillText(line1, cx, y + 74);
    ctx.font = "31px Georgia"; ctx.fillText(line2, cx, y + 130);
    ctx.font = "26px Georgia"; ctx.fillText(line3, cx, y + 173);
    ctx.shadowBlur = 0;
  }

  // Returns a Promise<dataURL>. Poster templates are madrasa-designed images
  // (uploaded via Admin → Poster Templates) — we cover-fit the image onto a
  // fixed 1080x1350 canvas and print the winner's name/rank/team on top at
  // the position the admin configured (textY / textColor per template).
  function drawPoster(payload, templateOverride) {
    const template = templateOverride || state.hero.posterTemplate;
    const { rankLabel, line1, line2, line3 } = payload;
    const custom = template ? state.customTemplates.find((ct) => ct.id === template) : null;

    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext("2d");

    if (custom && custom.imageUrl) {
      return loadImage(custom.imageUrl).then((img) => {
        // cover-fit the uploaded template image into the poster canvas
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        const y = canvas.height * ((custom.textY || 78) / 100);
        drawTextBlock(ctx, canvas.width / 2, y, custom.textColor || "#FFFFFF", rankLabel, line1, line2, line3);
        return canvas.toDataURL("image/jpeg", 0.92);
      });
    }

    // Fallback so nothing breaks if no template has been uploaded yet —
    // not offered as a selectable "design", just a plain safety net.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#0B3D2E"); grad.addColorStop(1, "#0A2A20");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 6; ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    ctx.textAlign = "center";
    ctx.fillStyle = "#FAF6EC"; ctx.font = "bold 44px Georgia"; ctx.fillText(state.hero.title, canvas.width / 2, 300);
    drawTextBlock(ctx, canvas.width / 2, canvas.height * 0.6, "#E4C767", rankLabel, line1, line2, line3);
    return Promise.resolve(canvas.toDataURL("image/png"));
  }

  function getAllResultTemplates() {
    return state.resultTemplates.map((t) => ({ id: t.id, label: t.label, imageUrl: t.imageUrl, textY: t.textY, textColor: t.textColor, rowGap: t.rowGap }));
  }

  // Combined result poster: 1st, 2nd & 3rd winners of one programme stacked
  // together in a single frame. `winners` is up to 3 entries: {rank, student, team}.
  function drawResultPoster(event, winners, templateOverride) {
    const template = templateOverride || state.hero.resultTemplate;
    const custom = template ? state.resultTemplates.find((rt) => rt.id === template) : null;

    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext("2d");

    const paintBlocks = (startYPct, rowGap, color) => {
      ctx.textAlign = "center";
      let y = canvas.height * (startYPct / 100);
      const gap = rowGap || 150;
      winners.forEach((w) => {
        ctx.shadowColor = "rgba(0,0,0,.65)"; ctx.shadowBlur = 10;
        ctx.fillStyle = color; ctx.font = "bold 26px Georgia"; ctx.fillText(RANK_LABEL[w.rank], canvas.width / 2, y);
        ctx.font = "bold 44px Georgia"; ctx.fillText(w.student.name, canvas.width / 2, y + 46);
        ctx.font = "24px Georgia"; ctx.fillText(`${w.student.chestNo} \u00b7 ${w.team ? w.team.name : ""}`, canvas.width / 2, y + 84);
        ctx.shadowBlur = 0;
        y += gap;
      });
    };

    if (custom && custom.imageUrl) {
      return loadImage(custom.imageUrl).then((img) => {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        paintBlocks(custom.textY || 55, custom.rowGap || 150, custom.textColor || "#FFFFFF");
        return canvas.toDataURL("image/jpeg", 0.92);
      });
    }

    // Fallback design so the feature works even before a result frame template is uploaded.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#0B3D2E"); grad.addColorStop(1, "#0A2A20");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 6; ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    ctx.textAlign = "center";
    ctx.fillStyle = "#FAF6EC"; ctx.font = "bold 40px Georgia";
    wrapText(ctx, event.name, canvas.width - 160).forEach((ln, i) => ctx.fillText(ln, canvas.width / 2, 210 + i * 48));
    ctx.font = "22px Georgia"; ctx.fillStyle = "#C9A227"; ctx.fillText(event.category.toUpperCase(), canvas.width / 2, 280);
    paintBlocks(38, 210, "#E4C767");
    return Promise.resolve(canvas.toDataURL("image/png"));
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  /* ---- ID / Chest-No Card ----
     Landscape card (1013x638px \u2248 CR80 badge ratio). Templates are admin-
     uploaded images (see state.cardTemplates); we print name, chest no,
     team and the student's registered programme names on top. */
  function getAllCardTemplates() {
    return state.cardTemplates.map((t) => ({
      id: t.id, label: t.label, imageUrl: t.imageUrl, textY: t.textY, textColor: t.textColor,
    }));
  }

  function drawIdCard(student, templateOverride) {
    const template = templateOverride || state.hero.cardTemplate;
    const custom = template ? state.cardTemplates.find((ct) => ct.id === template) : null;
    const team = state.teams.find((t) => t.id === student.team);
    const programmes = student.events.map((id) => state.events.find((e) => e.id === id)).filter(Boolean).map((e) => e.name);

    const canvas = document.createElement("canvas");
    canvas.width = 1013; canvas.height = 638;
    const ctx = canvas.getContext("2d");

    const paint = (img) => {
      if (img) {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, "#0B3D2E"); grad.addColorStop(1, "#0A2A20");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 4; ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
        ctx.textAlign = "left"; ctx.fillStyle = "#FAF6EC"; ctx.font = "bold 26px Georgia";
        ctx.fillText(state.hero.title, 40, 60);
      }
      const color = (custom && custom.textColor) || "#FFFFFF";
      const startY = canvas.height * ((custom && custom.textY ? custom.textY : 55) / 100);
      ctx.textAlign = "left";
      ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 8;
      ctx.fillStyle = color; ctx.font = "bold 42px Georgia"; ctx.fillText(student.name, 40, startY);
      ctx.font = "26px 'JetBrains Mono', monospace"; ctx.fillText(`Chest No: ${student.chestNo}`, 40, startY + 42);
      ctx.font = "22px Georgia"; ctx.fillText(`${student.category} \u00b7 ${team ? team.name : ""}`, 40, startY + 76);
      ctx.font = "20px Georgia";
      const label = "Programmes: " + (programmes.length ? programmes.join(", ") : "\u2014");
      const lines = wrapText(ctx, label, canvas.width - 80).slice(0, 3);
      lines.forEach((ln, i) => ctx.fillText(ln, 40, startY + 112 + i * 26));
      ctx.shadowBlur = 0;
      return canvas.toDataURL("image/jpeg", 0.92);
    };

    if (custom && custom.imageUrl) return loadImage(custom.imageUrl).then(paint);
    return Promise.resolve(paint(null));
  }

  // Builds a real downloadable PDF (not a browser print) with every student's
  // ID card in a category laid out on A4 pages. 8/page uses true ATM/credit
  // card size (85.6x53.98mm); 12/page scales the same card down to fit 3 across.
  function generateCategoryCardsPdf(category, perPage) {
    if (!category) return showToast("Choose a category first");
    const students = state.students.filter((s) => s.category === category);
    if (!students.length) return showToast("No students found in this category");
    if (!window.jspdf) return showToast("PDF library failed to load \u2014 check your connection and try again");
    showToast(`Preparing ${students.length} card${students.length > 1 ? "s" : ""}\u2026`);

    Promise.all(students.map((s) => drawIdCard(s))).then((urls) => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210, pageH = 297, margin = 10;
      const ratio = 1013 / 638; // card image aspect ratio

      let cols, rows, cardW, cardH, gapX, gapY;
      if (perPage === 12) {
        cols = 3; rows = 4; gapX = 6; gapY = 8;
        cardW = (pageW - margin * 2 - gapX * (cols - 1)) / cols;
        cardH = cardW / ratio;
      } else {
        cols = 2; rows = 4; gapX = 10; gapY = 8;
        cardW = 85.6; cardH = 53.98; // standard ATM/credit card size (ISO/IEC 7810 ID-1)
      }
      const totalW = cols * cardW + (cols - 1) * gapX;
      const totalH = rows * cardH + (rows - 1) * gapY;
      const startX = (pageW - totalW) / 2;
      const startY = (pageH - totalH) / 2;
      const perPageCount = cols * rows;

      urls.forEach((url, i) => {
        const posInPage = i % perPageCount;
        if (i > 0 && posInPage === 0) doc.addPage();
        const col = posInPage % cols;
        const row = Math.floor(posInPage / cols);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);
        doc.addImage(url, "JPEG", x, y, cardW, cardH);
      });

      doc.save(`${category.replace(/\s+/g, "_")}-id-cards.pdf`);
      showToast("PDF downloaded");
    }).catch(() => showToast("Could not prepare the PDF"));
  }

  /* ---------------- victory poster modal ---------------- */
  const modalOverlay = document.getElementById("modalOverlay");
  const modalBody = document.getElementById("modalBody");
  function closeModal() { modalOverlay.classList.add("hidden"); modalBody.innerHTML = ""; }
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) popScreen(); });

  function openPosterModal({ student, rank, event, team }) {
    const templates = getAllTemplates();
    let selectedTemplate = templates.some((t) => t.id === state.hero.posterTemplate)
      ? state.hero.posterTemplate : (templates[0] ? templates[0].id : null);

    const cardHtml = (t) => `
      <div class="poster-card ${t.id === selectedTemplate ? "active" : ""}" data-tpl="${t.id}" style="background-image:url('${t.imageUrl}')">
        <div class="poster-card-overlay" style="top:${t.textY || 78}%;color:${t.textColor || "#fff"}">
          <div class="poster-card-rank">${RANK_LABEL[rank]}</div>
          <div class="poster-card-name">${escapeHtml(student.name)}</div>
          <div class="poster-card-code">${student.chestNo}</div>
          <div class="poster-card-team">${escapeHtml(team.name)}</div>
        </div>
      </div>`;

    modalBody.innerHTML = `
      <div class="poster-head arch-top">
        <div style="font-size:1.4rem;color:var(--gold)">\u2605</div>
        <div class="poster-rank">${RANK_LABEL[rank]}</div>
        <div class="poster-name font-display">${escapeHtml(student.name)}</div>
        <div class="poster-code">${student.chestNo}</div>
        <div class="poster-event">${escapeHtml(event.name)} \u00b7 ${escapeHtml(team.name)}</div>
      </div>
      ${templates.length ? `
        <div class="field-label" style="padding:.85rem 1rem 0;background:var(--surface)">Swipe to choose a poster design</div>
        <div class="poster-carousel" id="posterCarousel">${templates.map(cardHtml).join("")}</div>
      ` : `
        <div class="empty-note" style="margin:1rem">No poster template has been added yet. Ask your madrasa admin to add one under Admin \u2192 Home Page \u2192 Poster Templates.</div>
      `}
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadPoster">\u2B07 Download Poster</button>
        <button class="btn btn-whatsapp" id="btnSharePoster">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnClosePoster">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    const carousel = document.getElementById("posterCarousel");
    if (carousel) {
      const cards = () => Array.from(carousel.querySelectorAll(".poster-card"));
      const setActive = (tpl) => {
        selectedTemplate = tpl;
        cards().forEach((c) => c.classList.toggle("active", c.dataset.tpl === tpl));
      };
      cards().forEach((c) => c.addEventListener("click", () => {
        c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        setActive(c.dataset.tpl);
      }));
      let scrollTimer;
      carousel.addEventListener("scroll", () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const mid = carousel.scrollLeft + carousel.clientWidth / 2;
          let closest = null, closestDist = Infinity;
          cards().forEach((c) => {
            const dist = Math.abs((c.offsetLeft + c.offsetWidth / 2) - mid);
            if (dist < closestDist) { closestDist = dist; closest = c; }
          });
          if (closest) setActive(closest.dataset.tpl);
        }, 100);
      }, { passive: true });
    }

    document.getElementById("btnDownloadPoster").addEventListener("click", () => {
      if (!selectedTemplate) return showToast("No poster template added yet");
      showToast("Preparing poster\u2026");
      drawPoster({
        rankLabel: RANK_LABEL[rank],
        line1: student.name, line2: student.chestNo, line3: team.name,
      }, selectedTemplate).then((url) => {
        downloadDataUrl(url, `${student.chestNo}-${rank}.png`);
        showToast("Poster downloaded");
      }).catch(() => showToast("Could not generate poster"));
    });
    document.getElementById("btnSharePoster").addEventListener("click", () => {
      if (!selectedTemplate) return showToast("No poster template added yet");
      showToast("Preparing poster\u2026");
      const text = `Alhamdulillah! ${student.name} (${student.chestNo}) secured ${RANK_LABEL[rank]} in ${event.name} at ${state.hero.title}, representing ${team.name}!`;
      drawPoster({
        rankLabel: RANK_LABEL[rank],
        line1: student.name, line2: student.chestNo, line3: team.name,
      }, selectedTemplate).then((url) => shareImageWithText(url, `${student.chestNo}-${rank}.jpg`, text))
        .catch(() => showToast("Could not generate poster"));
    });
    document.getElementById("btnClosePoster").addEventListener("click", popScreen);
  }

  // Combined result modal: shows 1st, 2nd & 3rd winners of one programme together
  // in a single poster, with a template carousel (admin-managed), download & share.
  function openResultPosterModal(eventId) {
    const event = state.events.find((e) => e.id === eventId);
    if (!event) return showToast("Choose a programme first");
    const result = state.results[eventId];
    if (!result) return showToast(`Results not published yet for ${event.name}`);

    const winners = ["first", "second", "third"].map((rank) => {
      const entry = result[rank];
      if (!entry) return null;
      const student = state.students.find((s) => s.id === entry.studentId);
      if (!student) return null;
      const team = state.teams.find((t) => t.id === student.team);
      return { rank, student, team };
    }).filter(Boolean);
    if (!winners.length) return showToast("No winners recorded for this programme yet");

    const templates = getAllResultTemplates();
    let selectedTemplate = templates.some((t) => t.id === state.hero.resultTemplate)
      ? state.hero.resultTemplate : (templates[0] ? templates[0].id : null);

    const rowsHtml = (color) => winners.map((w) => `
      <div class="result-card-row">
        <div class="result-card-rank">${RANK_LABEL[w.rank]}</div>
        <div class="result-card-name">${escapeHtml(w.student.name)}</div>
        <div class="result-card-meta">${w.student.chestNo} \u00b7 ${w.team ? escapeHtml(w.team.name) : ""}</div>
      </div>`).join("");

    const cardHtml = (t) => `
      <div class="poster-card" data-tpl="${t.id}" style="background-image:url('${t.imageUrl}')">
        <div class="result-card-overlay" style="top:${t.textY || 55}%;color:${t.textColor || "#fff"}">${rowsHtml()}</div>
      </div>`;

    modalBody.innerHTML = `
      <div class="poster-head arch-top">
        <div style="font-size:1.4rem;color:var(--gold)">\u{1F3C6}</div>
        <div class="poster-name font-display">${escapeHtml(event.name)}</div>
        <div class="poster-event">${escapeHtml(event.category)}${event.gender !== "General" ? " \u00b7 " + event.gender : ""}</div>
      </div>
      ${templates.length ? `
        <div class="field-label" style="padding:.85rem 1rem 0;background:var(--surface)">Swipe to choose a result frame design</div>
        <div class="poster-carousel" id="resultCarousel">${templates.map(cardHtml).join("")}</div>
      ` : `
        <div class="card" style="margin:1rem;background:linear-gradient(180deg,#0B3D2E,#0A2A20);border-radius:.9rem;padding:1.5rem 1rem">
          <div style="text-align:center;color:#E4C767;font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:.75rem">${escapeHtml(state.hero.title)}</div>
          <div style="color:#FAF6EC">${rowsHtml()}</div>
        </div>
        <div class="empty-note" style="margin:0 1rem 1rem">No result frame template uploaded yet. Ask your madrasa admin to add one under Admin \u2192 Home \u2192 Result Templates.</div>
      `}
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadResult">\u2B07 Download Poster</button>
        <button class="btn btn-whatsapp" id="btnShareResult">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnCloseResult">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    const carousel = document.getElementById("resultCarousel");
    if (carousel) {
      const cards = () => Array.from(carousel.querySelectorAll(".poster-card"));
      const setActive = (tpl) => { selectedTemplate = tpl; cards().forEach((c) => c.classList.toggle("active", c.dataset.tpl === tpl)); };
      setActive(selectedTemplate);
      cards().forEach((c) => c.addEventListener("click", () => {
        c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        setActive(c.dataset.tpl);
      }));
      let scrollTimer;
      carousel.addEventListener("scroll", () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const mid = carousel.scrollLeft + carousel.clientWidth / 2;
          let closest = null, closestDist = Infinity;
          cards().forEach((c) => {
            const dist = Math.abs((c.offsetLeft + c.offsetWidth / 2) - mid);
            if (dist < closestDist) { closestDist = dist; closest = c; }
          });
          if (closest) setActive(closest.dataset.tpl);
        }, 100);
      }, { passive: true });
    }

    document.getElementById("btnDownloadResult").addEventListener("click", () => {
      showToast("Preparing result poster\u2026");
      drawResultPoster(event, winners, selectedTemplate).then((url) => {
        downloadDataUrl(url, `${event.name.replace(/\s+/g, "-")}-result.png`);
        showToast("Result poster downloaded");
      }).catch(() => showToast("Could not generate poster"));
    });
    document.getElementById("btnShareResult").addEventListener("click", () => {
      showToast("Preparing result poster\u2026");
      const summary = winners.map((w) => `${RANK_LABEL[w.rank]}: ${w.student.name} (${w.student.chestNo})`).join(", ");
      const text = `Alhamdulillah! Results for ${event.name} (${event.category}) at ${state.hero.title} \u2014 ${summary}`;
      drawResultPoster(event, winners, selectedTemplate)
        .then((url) => shareImageWithText(url, `${event.name.replace(/\s+/g, "-")}-result.jpg`, text))
        .catch(() => showToast("Could not generate poster"));
    });
    document.getElementById("btnCloseResult").addEventListener("click", popScreen);
  }

  /* ---------------- ID card modal (parent-facing) ---------------- */
  function openCardModal(student) {
    const team = state.teams.find((t) => t.id === student.team);
    const programmes = student.events.map((id) => state.events.find((e) => e.id === id)).filter(Boolean).map((e) => e.name);
    const templates = getAllCardTemplates();
    let selectedTemplate = templates.some((t) => t.id === state.hero.cardTemplate)
      ? state.hero.cardTemplate : (templates[0] ? templates[0].id : null);

    const cardHtml = (t) => `
      <div class="id-card ${t.id === selectedTemplate ? "active" : ""}" data-tpl="${t.id}" style="background-image:url('${t.imageUrl}')">
        <div class="id-card-overlay" style="top:${t.textY || 55}%;color:${t.textColor || "#fff"}">
          <div class="id-card-name">${escapeHtml(student.name)}</div>
          <div class="id-card-code">Chest No: ${student.chestNo}</div>
          <div class="id-card-meta">${escapeHtml(student.category)} \u00b7 ${team ? escapeHtml(team.name) : ""}</div>
          <div class="id-card-prog">${escapeHtml(programmes.join(", ") || "\u2014")}</div>
        </div>
      </div>`;

    modalBody.innerHTML = `
      <div class="poster-head arch-top">
        <div style="font-size:1.4rem;color:var(--gold)">\u{1F4B3}</div>
        <div class="poster-name font-display">${escapeHtml(student.name)}</div>
        <div class="poster-code">Chest No: ${student.chestNo}</div>
        <div class="poster-event">${escapeHtml(student.category)} \u00b7 ${team ? escapeHtml(team.name) : ""}</div>
      </div>
      ${templates.length ? `
        <div class="field-label" style="padding:.85rem 1rem 0;background:var(--surface)">Swipe to choose a card design</div>
        <div class="id-card-carousel" id="idCardCarousel">${templates.map(cardHtml).join("")}</div>
      ` : `
        <div class="empty-note" style="margin:1rem">No ID card template has been added yet. Ask your madrasa admin to add one under Admin \u2192 ID Cards.</div>
      `}
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadCard">\u2B07 Download Card</button>
        <button class="btn btn-whatsapp" id="btnShareCard">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnCloseCard">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    const carousel = document.getElementById("idCardCarousel");
    if (carousel) {
      const cards = () => Array.from(carousel.querySelectorAll(".id-card"));
      const setActive = (tpl) => {
        selectedTemplate = tpl;
        cards().forEach((c) => c.classList.toggle("active", c.dataset.tpl === tpl));
      };
      cards().forEach((c) => c.addEventListener("click", () => {
        c.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        setActive(c.dataset.tpl);
      }));
      let scrollTimer;
      carousel.addEventListener("scroll", () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const mid = carousel.scrollLeft + carousel.clientWidth / 2;
          let closest = null, closestDist = Infinity;
          cards().forEach((c) => {
            const dist = Math.abs((c.offsetLeft + c.offsetWidth / 2) - mid);
            if (dist < closestDist) { closestDist = dist; closest = c; }
          });
          if (closest) setActive(closest.dataset.tpl);
        }, 100);
      }, { passive: true });
    }

    document.getElementById("btnDownloadCard").addEventListener("click", () => {
      showToast("Preparing card\u2026");
      drawIdCard(student, selectedTemplate).then((url) => {
        downloadDataUrl(url, `${student.chestNo}-idcard.jpg`);
        showToast("Card downloaded");
      }).catch(() => showToast("Could not generate card"));
    });
    document.getElementById("btnShareCard").addEventListener("click", () => {
      showToast("Preparing card\u2026");
      const text = `${student.name} \u2014 Chest No ${student.chestNo}, ${student.category} at ${state.hero.title}, representing ${team ? team.name : ""}!`;
      drawIdCard(student, selectedTemplate)
        .then((url) => shareImageWithText(url, `${student.chestNo}-idcard.jpg`, text))
        .catch(() => showToast("Could not generate card"));
    });
    document.getElementById("btnCloseCard").addEventListener("click", popScreen);
  }

  /* ---------------- gallery ---------------- */
  const GALLERY_PREVIEW_COUNT = 6;
  function renderGallery() {
    const preview = state.gallery.slice(0, GALLERY_PREVIEW_COUNT);
    const tilesHtml = preview.map((p) => `
      <div class="gallery-tile" data-id="${p.id}" style="${p.url ? `background-image:url('${p.url}');background-size:cover;background-position:center` : `background:linear-gradient(160deg, ${p.color}, #0B3D2E)`}">
        <span>${escapeHtml(p.caption)}</span>
      </div>`).join("");
    const viewAllTile = state.gallery.length > GALLERY_PREVIEW_COUNT
      ? `<div class="gallery-tile gallery-view-all-tile" id="galleryViewAllTile"><span>&#187;</span><span class="gallery-view-all-label">View All<br />(${state.gallery.length})</span></div>`
      : "";
    document.getElementById("galleryGrid").innerHTML = tilesHtml + viewAllTile;
    document.querySelectorAll("#galleryGrid .gallery-tile[data-id]").forEach((tile) => {
      tile.addEventListener("click", () => {
        const photo = state.gallery.find((p) => p.id === tile.dataset.id);
        openGalleryLightbox(photo);
      });
    });
    const viewAllBtn = document.getElementById("galleryViewAllTile");
    if (viewAllBtn) viewAllBtn.addEventListener("click", openFullGallery);
  }

  // Full gallery overlay — shows every photo (not just the home-page preview),
  // reached via the "View All" tile so the home page never gets cluttered as
  // more event photos are added. Supports two densities: "small" (9/page, 3
  // columns) and "large" (6/page, 2 columns) with Next/page-number controls.
  let galleryDensity = "small"; // "small" | "large"
  let galleryPage = 0; // 0-indexed
  function galleryPageSize() { return galleryDensity === "large" ? 6 : 9; }

  function renderFullGalleryGrid() {
    const pageSize = galleryPageSize();
    const totalPages = Math.max(1, Math.ceil(state.gallery.length / pageSize));
    if (galleryPage >= totalPages) galleryPage = totalPages - 1;
    if (galleryPage < 0) galleryPage = 0;
    const pageItems = state.gallery.slice(galleryPage * pageSize, galleryPage * pageSize + pageSize);

    const grid = document.getElementById("fullGalleryGrid");
    grid.classList.toggle("large-density", galleryDensity === "large");
    grid.innerHTML = pageItems.map((p) => `
      <div class="gallery-tile" data-id="${p.id}" style="${p.url ? `background-image:url('${p.url}');background-size:cover;background-position:center` : `background:linear-gradient(160deg, ${p.color}, #0B3D2E)`}${galleryDensity === "large" ? ";min-height:11rem" : ""}">
        <span>${escapeHtml(p.caption)}</span>
      </div>`).join("");
    document.querySelectorAll("#fullGalleryGrid .gallery-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const photo = state.gallery.find((p) => p.id === tile.dataset.id);
        openGalleryLightbox(photo);
      });
    });

    // Page number buttons + Prev/Next
    const pager = document.getElementById("fullGalleryPagination");
    if (pager) {
      let html = `<button class="gallery-page-btn" id="galPrev" ${galleryPage === 0 ? "disabled" : ""}>&#8249;</button>`;
      for (let i = 0; i < totalPages; i++) {
        html += `<button class="gallery-page-btn ${i === galleryPage ? "active" : ""}" data-page="${i}">${i + 1}</button>`;
      }
      html += `<button class="gallery-page-btn" id="galNext" ${galleryPage >= totalPages - 1 ? "disabled" : ""}>&#8250;</button>`;
      pager.innerHTML = html;
      const prevBtn = document.getElementById("galPrev");
      const nextBtn = document.getElementById("galNext");
      if (prevBtn) prevBtn.addEventListener("click", () => { galleryPage--; renderFullGalleryGrid(); });
      if (nextBtn) nextBtn.addEventListener("click", () => { galleryPage++; renderFullGalleryGrid(); });
      pager.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => {
        galleryPage = parseInt(b.dataset.page, 10); renderFullGalleryGrid();
      }));
    }
  }

  function openFullGallery() {
    galleryPage = 0;
    document.getElementById("fullGalleryCount").textContent = `${state.gallery.length} photo${state.gallery.length === 1 ? "" : "s"}`;
    renderFullGalleryGrid();
    document.getElementById("fullGalleryOverlay").classList.remove("hidden");
    pushScreen(closeFullGallery);
  }
  const galSmallBtn = document.getElementById("galDensitySmall");
  const galLargeBtn = document.getElementById("galDensityLarge");
  if (galSmallBtn && galLargeBtn) {
    galSmallBtn.addEventListener("click", () => { galleryDensity = "small"; galleryPage = 0; galSmallBtn.classList.add("active"); galLargeBtn.classList.remove("active"); renderFullGalleryGrid(); });
    galLargeBtn.addEventListener("click", () => { galleryDensity = "large"; galleryPage = 0; galLargeBtn.classList.add("active"); galSmallBtn.classList.remove("active"); renderFullGalleryGrid(); });
  }
  function closeFullGallery() { document.getElementById("fullGalleryOverlay").classList.add("hidden"); }
  document.getElementById("btnCloseFullGallery").addEventListener("click", popScreen);

  function openGalleryLightbox(photo) {
    modalBody.innerHTML = `
      <div class="gallery-preview" style="${photo.url ? `background-image:url('${photo.url}');background-size:cover;background-position:center` : `background:linear-gradient(160deg, ${photo.color}, #0B3D2E)`}">
        ${photo.url ? "" : `<div><div style="font-size:2.2rem;opacity:.7">\u{1F5BC}</div><div class="cap font-display">${escapeHtml(photo.caption)}</div></div>`}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadPhoto">\u2B07 Download Photo</button>
        <button class="btn btn-whatsapp" id="btnSharePhoto">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnCloseGallery">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    document.getElementById("btnDownloadPhoto").addEventListener("click", () => {
      if (!photo.url) {
        drawPoster({ rankLabel: "MEMORY", line1: photo.caption, line2: "", line3: "", subtitle: "Event Gallery" }).then((url) => {
          downloadDataUrl(url, `${photo.caption.replace(/\s+/g, "-")}.png`);
          showToast("Photo downloaded");
        });
        return;
      }
      showToast("Preparing photo\u2026");
      getFramedPhotoUrl(photo).then((finalUrl) => {
        downloadDataUrl(finalUrl, `${photo.caption.replace(/\s+/g, "-")}.jpg`);
        showToast("Photo downloaded");
      }).catch(() => showToast("Could not prepare that photo \u2014 check your connection"));
    });
    document.getElementById("btnSharePhoto").addEventListener("click", () => {
      const text = `Check out this photo from ${state.hero.title} \u2014 "${photo.caption}"`;
      if (!photo.url) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank"); return; }
      showToast("Preparing photo\u2026");
      getFramedPhotoUrl(photo)
        .then((finalUrl) => shareImageWithText(finalUrl, `${photo.caption.replace(/\s+/g, "-")}.jpg`, text))
        .catch(() => showToast("Could not prepare that photo \u2014 check your connection"));
    });
    document.getElementById("btnCloseGallery").addEventListener("click", popScreen);
  }

  /* ---------------- admin: login ---------------- */
  const SUPER_ADMIN_USER = "admin";
  const SUPER_ADMIN_PASS = "meelad786";
  const NORMAL_ADMIN_USER = "staff";
  const NORMAL_ADMIN_PASS = "meelad123";
  const SUPER_ONLY_TABS = ["poster", "limits", "chestno", "idcards"]; // home page design, categories/limits, chest-no & id-card templates
  const loginScreen = document.getElementById("adminLoginScreen");
  const adminScreen = document.getElementById("adminScreen");
  const ADMIN_SESSION_KEY = "meelad_admin_session";
  const ADMIN_ROLE_KEY = "meelad_admin_role";
  function safeStorageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeStorageSet(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } }
  function safeStorageRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  let adminAuthed = safeStorageGet(ADMIN_SESSION_KEY) === "1";
  let adminRole = safeStorageGet(ADMIN_ROLE_KEY) || "super"; // "super" | "normal"
  let pendingAdminTab = "dashboard";
  function isSuperAdmin() { return adminRole === "super"; }

  function closeLoginScreen() { loginScreen.classList.add("hidden"); }
  function closeAdminScreen() { adminScreen.classList.add("hidden"); }

  function setActiveAdminTab(tab) {
    if (SUPER_ONLY_TABS.includes(tab) && !isSuperAdmin()) tab = "dashboard";
    document.querySelectorAll(".admin-menu-link").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".side-link[data-admin-tab]").forEach((l) => l.classList.toggle("active", l.dataset.adminTab === tab));
    renderAdminTab(tab);
  }

  function openAdminEntry(tab) {
    popScreen(); // close the sidebar (was pushed by openSidebar)
    pendingAdminTab = tab || "dashboard";
    if (adminAuthed) {
      adminScreen.classList.remove("hidden");
      pushScreen(closeAdminScreen);
      setActiveAdminTab(pendingAdminTab);
      return;
    }
    document.getElementById("adminUser").value = "";
    document.getElementById("adminPass").value = "";
    document.getElementById("adminError").classList.add("hidden");
    loginScreen.classList.remove("hidden");
    pushScreen(closeLoginScreen);
  }

  document.querySelectorAll(".side-link[data-admin-tab]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openAdminEntry(link.dataset.adminTab);
    });
  });
  document.getElementById("btnAdminCancel").addEventListener("click", popScreen);
  document.getElementById("btnAdminLogin").addEventListener("click", () => {
    const u = document.getElementById("adminUser").value.trim();
    const p = document.getElementById("adminPass").value;
    const errEl = document.getElementById("adminError");
    let role = null;
    if (u === SUPER_ADMIN_USER && p === SUPER_ADMIN_PASS) role = "super";
    else if (u === NORMAL_ADMIN_USER && p === NORMAL_ADMIN_PASS) role = "normal";
    if (role) {
      adminAuthed = true;
      adminRole = role;
      safeStorageSet(ADMIN_SESSION_KEY, "1");
      safeStorageSet(ADMIN_ROLE_KEY, role);
      applyRoleVisibility();
      popScreen(); // close login \u2014 goes straight to the admin panel, no message, no delay
      adminScreen.classList.remove("hidden");
      pushScreen(closeAdminScreen);
      setActiveAdminTab(SUPER_ONLY_TABS.includes(pendingAdminTab) && role !== "super" ? "dashboard" : pendingAdminTab);
    } else {
      errEl.textContent = "Invalid username or password.";
      errEl.classList.remove("hidden");
    }
  });
  // Guest Mode always exits ALL the way back to the site home page — from either
  // Super Admin or Admin — even if a drawer/modal happens to be open on top of
  // the admin panel. It unwinds every pushed screen in one go instead of just one.
  function exitToHomeAsGuest() {
    if (screenStack.length) history.go(-screenStack.length);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }
  document.getElementById("btnAdminGuestView").addEventListener("click", exitToHomeAsGuest);

  // Hides Super-Admin-only items from the drawer/sidebar for Normal Admins,
  // and blocks direct navigation to those tabs.
  function applyRoleVisibility() {
    const superOnly = document.querySelectorAll('[data-super-only="1"]');
    superOnly.forEach((el) => { el.style.display = isSuperAdmin() ? "" : "none"; });
  }
  if (adminAuthed) applyRoleVisibility();

  /* ---------------- admin: portrait drawer menu ---------------- */
  const adminSidebar = document.getElementById("adminSidebar");
  const adminSidebarOverlay = document.getElementById("adminSidebarOverlay");
  function openAdminSidebar() { adminSidebar.classList.add("open"); adminSidebarOverlay.classList.remove("hidden"); pushScreen(closeAdminSidebar); }
  function closeAdminSidebar() { adminSidebar.classList.remove("open"); adminSidebarOverlay.classList.add("hidden"); }
  document.getElementById("btnAdminMenu").addEventListener("click", openAdminSidebar);
  document.getElementById("btnCloseAdminSidebar").addEventListener("click", popScreen);
  adminSidebarOverlay.addEventListener("click", popScreen);
  document.getElementById("btnDrawerLogout").addEventListener("click", (e) => {
    e.preventDefault();
    adminAuthed = false;
    adminRole = "super";
    safeStorageRemove(ADMIN_SESSION_KEY);
    safeStorageRemove(ADMIN_ROLE_KEY);
    popScreen(); // close drawer
    popScreen(); // close admin screen
    showToast("Logged out");
  });

  /* ---------------- admin: tabs ---------------- */
  const adminContent = document.getElementById("adminContent");
  document.querySelectorAll(".admin-menu-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveAdminTab(link.dataset.tab);
      popScreen(); // close drawer
    });
  });

  function renderAdminTab(tab) {
    if (tab === "dashboard") return renderDashboardTab();
    if (tab === "poster") return renderPosterTab();
    if (tab === "idcards") return renderCardsTab();
    if (tab === "teams") return renderTeamsTab();
    if (tab === "events") return renderEventsTab();
    if (tab === "markentry") return renderMarksTab();
    if (tab === "limits") return renderLimitsTab();
    if (tab === "students") return renderStudentsTab();
    if (tab === "chestno") return renderChestNoTab();
    if (tab === "gallery") return renderGalleryTab();
    if (tab === "export") return renderExportTab();
  }

  /* ---- Dashboard tab ---- */
  function renderDashboardTab() {
    const marksEntered = Object.values(state.marks).reduce((sum, ev) => sum + Object.keys(ev).length, 0);
    const resultsPublished = state.events.filter((e) => e.resultStatus === "Published").length;
    const cards = [
      { label: "Teams", value: state.teams.length, ic: "&#128101;", cls: "ic-green" },
      { label: "Categories", value: state.categories.length, ic: "&#128220;", cls: "ic-blue" },
      { label: "Events", value: state.events.length, ic: "&#127941;", cls: "ic-orange" },
      { label: "Students", value: state.students.length, ic: "&#128100;", cls: "ic-purple" },
      { label: "Marks Entered", value: marksEntered, ic: "&#127908;", cls: "ic-pink" },
      { label: "Results Published", value: resultsPublished, ic: "&#127942;", cls: "ic-red" },
    ];
    adminContent.innerHTML = `
      <div class="dash-grid">
        ${cards.map((c) => `
          <div class="dash-card">
            <div class="atab-ic ${c.cls}" style="width:2.4rem;height:2.4rem;font-size:1.1rem;border-radius:.7rem;margin-bottom:.9rem">${c.ic}</div>
            <div class="dash-value">${c.value}</div>
            <div class="dash-label">${c.label}</div>
          </div>`).join("")}
      </div>`;
  }

  /* ---- Poster tab ---- */
  // Templates are the madrasa's own designed posters (uploaded as images),
  // not built-in presets — each template carries its imageUrl, textY (where
  // the winner's name sits, as % from top) and textColor.
  function getAllTemplates() {
    return state.customTemplates.map((t) => ({
      id: t.id, label: t.label, imageUrl: t.imageUrl,
      textY: t.textY, textColor: t.textColor,
      bg: t.imageUrl ? `url('${t.imageUrl}') center/cover` : "#0B3D2E",
      fg: "#fff", custom: true,
    }));
  }
  function renderPosterTab() {
    const h = state.hero;
    const allTemplates = getAllTemplates();
    const resultTemplates = getAllResultTemplates();
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Page Header</div>
        <div class="field-label">Shown at the top of every page (menu bar), independent of the poster below.</div>
        <input id="fHeaderText" class="input" style="margin:.4rem 0 .75rem" value="${escapeAttr(h.headerText || h.title)}" />
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;cursor:pointer">
          <input type="checkbox" id="fShowHeaderText" ${h.showHeaderText === false ? "" : "checked"} />
          <span class="field-label" style="margin:0">Show this Page Header text (turn off to hide it completely from the top bar)</span>
        </label>
        <button class="btn btn-primary" id="btnSaveHeader" style="width:auto;padding:.5rem .9rem">\u2713 Save Header</button>
      </div>

      <div class="card">
        <div class="card-title">Home Page Poster</div>
        <div class="field-label">Upload your own designed poster (from Canva, Photoshop, etc.) \u2014 it replaces the whole banner at the top of the home page, exactly as you made it. No poster uploaded yet? A simple text banner is shown instead.</div>
        ${h.photoUrl ? `<div class="hero-photo-preview" style="background-image:url('${h.photoUrl}')"></div>` : ""}
        <input type="file" id="heroPhotoFile" accept="image/*" class="input" style="margin:.5rem 0;padding:.4rem" />
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary" id="btnSaveHeroPhoto" style="width:auto;padding:.5rem .9rem">${h.photoUrl ? "Replace Photo" : "Upload Photo"}</button>
          ${h.photoUrl ? `<button class="btn btn-ghost" id="btnRemoveHeroPhoto" style="width:auto;padding:.5rem .9rem">Remove</button>` : ""}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Poster Templates</div>
        <div class="field-label" style="margin-bottom:.5rem">Upload up to 5 of your own designed poster templates (Canva, Photoshop, etc.) \u2014 with your madrasa's name, logo and branding already on them. <b>Recommended size: 1080\u00d71350px (portrait).</b> Leave the bottom \u2248\u2153 of the image clear \u2014 that's where the winner's rank, name, chest number and team are printed automatically when a parent downloads it. Parents swipe through your templates and pick one.</div>
        <div class="template-row" id="templateRow">
          ${allTemplates.map((t) => `
            <div class="template-swatch ${h.posterTemplate === t.id ? "selected" : ""}" data-tpl="${t.id}" style="background:${t.bg};color:${t.fg};text-shadow:0 1px 3px rgba(0,0,0,.6);position:relative">
              ${t.label}
              ${t.custom ? `<span class="template-del" data-id="${t.id}">&times;</span>` : ""}
            </div>`).join("")}
        </div>
        <button class="link-btn" id="btnShowAddTemplate" style="text-align:left;color:var(--gold-light);padding:0;margin-bottom:.5rem">+ Add Template ${state.customTemplates.length}/5</button>
        <div id="addTemplateForm"></div>
      </div>

      <div class="card">
        <div class="card-title">Result Templates (1st, 2nd &amp; 3rd together)</div>
        <div class="field-label" style="margin-bottom:.5rem">Upload up to 5 result-frame designs \u2014 used on the "Result Download Options" page when someone taps the search icon to see all three winners of a programme in one poster. <b>Recommended size: 1080\u00d71350px (portrait).</b> Leave enough clear space for three stacked winner blocks.</div>
        <div class="template-row" id="resultTemplateRow">
          ${resultTemplates.map((t) => `
            <div class="template-swatch result-template-swatch ${h.resultTemplate === t.id ? "selected" : ""}" data-tpl="${t.id}" style="background:${t.imageUrl ? `url('${t.imageUrl}') center/cover` : "#0B3D2E"};color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);position:relative">
              ${escapeHtml(t.label)}
              <span class="template-del result-template-del" data-id="${t.id}">&times;</span>
            </div>`).join("")}
        </div>
        <button class="link-btn" id="btnShowAddResultTemplate" style="text-align:left;color:var(--gold-light);padding:0;margin-bottom:.5rem">+ Add Result Template ${state.resultTemplates.length}/5</button>
        <div id="addResultTemplateForm"></div>
      </div>

      <div class="card">
        <div class="card-title">Homepage Poster Text</div>
        <div class="field-label">Heading (also used as a fallback banner, and in WhatsApp share text)</div>
        <input id="fTitle" class="input" style="margin-bottom:.5rem" value="${escapeAttr(h.title)}" />
        <div class="field-label">Badge Label (small text above the heading on the home banner)</div>
        <input id="fBadge" class="input" style="margin-bottom:.5rem" value="${escapeAttr(h.badge || "ANNUAL FESTIVAL")}" />
        <div class="field-label">Subtitle (paragraph shown under the heading on the home banner)</div>
        <input id="fSubtitle" class="input" style="margin-bottom:.5rem" value="${escapeAttr(h.subtitle)}" />
        <div class="field-label">Arabic Line (reserved for future use \u2014 not shown on posters currently)</div>
        <input id="fAyah" class="input" style="margin-bottom:.75rem;direction:rtl;font-family:'Amiri',serif" value="${escapeAttr(h.ayah)}" />
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;cursor:pointer">
          <input type="checkbox" id="fShowText" ${h.showText === false ? "" : "checked"} />
          <span class="field-label" style="margin:0">Show badge, heading &amp; subtitle text on the home banner (turn off if your poster photo already has this text on it \u2014 the Page Header above is not affected)</span>
        </label>
        <button class="btn btn-primary" id="btnSavePoster" style="width:auto;padding:.6rem 1rem">\u2713 Save Poster Text</button>
      </div>
      <div class="muted" style="font-size:.72rem">Preview updates live on the Home page as soon as you save.</div>`;

    document.getElementById("btnSaveHeader").addEventListener("click", () => {
      state.hero.headerText = document.getElementById("fHeaderText").value || state.hero.title;
      state.hero.showHeaderText = document.getElementById("fShowHeaderText").checked;
      persist(); renderHero();
      showToast("Page header saved");
    });

    document.getElementById("btnSaveHeroPhoto").addEventListener("click", () => {
      const file = document.getElementById("heroPhotoFile").files[0];
      if (!file) return showToast("Choose a photo first");
      showToast("Uploading\u2026");
      compressImageFile(file, 1400, 0.75).then((dataUrl) => {
        state.hero.photoUrl = dataUrl;
        persist(); renderHero(); renderPosterTab();
        showToast("Home page photo updated");
      }).catch(() => showToast("Could not process that photo"));
    });
    const removeBtn = document.getElementById("btnRemoveHeroPhoto");
    if (removeBtn) removeBtn.addEventListener("click", () => {
      delete state.hero.photoUrl;
      persist(); renderHero(); renderPosterTab();
      showToast("Home page photo removed");
    });

    document.querySelectorAll("#templateRow .template-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#templateRow .template-swatch").forEach((s) => s.classList.remove("selected"));
        sw.classList.add("selected");
      });
    });
    document.getElementById("btnShowAddTemplate").addEventListener("click", () => {
      if (state.customTemplates.length >= 5) return showToast("Maximum 5 custom templates \u2014 delete one first");
      const holder = document.getElementById("addTemplateForm");
      if (holder.innerHTML) { holder.innerHTML = ""; return; }
      holder.innerHTML = `
        <div class="card" style="margin-bottom:.75rem">
          <div class="field-label">Template Name</div>
          <input id="ntName" class="input" placeholder="e.g. Gold Frame" style="margin-bottom:.5rem" />
          <div class="field-label">Poster Image \u2014 portrait, 1080\u00d71350px recommended</div>
          <input type="file" id="ntImage" accept="image/*" class="input" style="margin-bottom:.5rem;padding:.4rem" />
          <div class="grid3" style="margin-bottom:.5rem">
            <div><div class="field-label">Name Text Colour</div><input id="ntFg" type="color" class="input" value="#FFFFFF" style="padding:.25rem" /></div>
          </div>
          <div class="field-label">Text Position (how far down the image the rank/name/team text starts)</div>
          <input id="ntTextY" type="range" min="30" max="90" value="78" style="width:100%;margin-bottom:.75rem" />
          <button class="btn btn-primary" id="btnSaveTemplate" style="width:auto;padding:.5rem .9rem">Save Template</button>
        </div>`;
      document.getElementById("btnSaveTemplate").addEventListener("click", () => {
        const name = document.getElementById("ntName").value.trim() || "Custom";
        const file = document.getElementById("ntImage").files[0];
        const textY = Number(document.getElementById("ntTextY").value);
        const textColor = document.getElementById("ntFg").value;
        if (!file) return showToast("Choose a poster image first");
        showToast("Compressing template image\u2026");
        compressImageFile(file, 1350, 0.82).then((imageUrl) => {
          state.customTemplates.push({ id: "custom-" + uid(), label: name, imageUrl, textY, textColor });
          persist(); showToast("Template added"); renderPosterTab();
        }).catch(() => showToast("Could not process that image"));
      });
    });
    document.querySelectorAll("#templateRow .template-del").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.customTemplates = state.customTemplates.filter((t) => t.id !== b.dataset.id);
      persist(); renderPosterTab();
    }));

    document.querySelectorAll("#resultTemplateRow .result-template-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#resultTemplateRow .result-template-swatch").forEach((s) => s.classList.remove("selected"));
        sw.classList.add("selected");
      });
    });
    document.getElementById("btnShowAddResultTemplate").addEventListener("click", () => {
      if (state.resultTemplates.length >= 5) return showToast("Maximum 5 result templates \u2014 delete one first");
      const holder = document.getElementById("addResultTemplateForm");
      if (holder.innerHTML) { holder.innerHTML = ""; return; }
      holder.innerHTML = `
        <div class="card" style="margin-bottom:.75rem">
          <div class="field-label">Template Name</div>
          <input id="rtName" class="input" placeholder="e.g. Gold Result Frame" style="margin-bottom:.5rem" />
          <div class="field-label">Result Frame Image \u2014 portrait, 1080\u00d71350px recommended</div>
          <input type="file" id="rtImage" accept="image/*" class="input" style="margin-bottom:.5rem;padding:.4rem" />
          <div class="grid3" style="margin-bottom:.5rem">
            <div><div class="field-label">Text Colour</div><input id="rtFg" type="color" class="input" value="#FFFFFF" style="padding:.25rem" /></div>
          </div>
          <div class="field-label">Text Start Position (how far down the image the 1st place block starts)</div>
          <input id="rtTextY" type="range" min="20" max="70" value="45" style="width:100%;margin-bottom:.75rem" />
          <div class="field-label">Row Spacing (gap between the 1st/2nd/3rd blocks)</div>
          <input id="rtRowGap" type="range" min="120" max="320" value="200" style="width:100%;margin-bottom:.75rem" />
          <button class="btn btn-primary" id="btnSaveResultTemplate" style="width:auto;padding:.5rem .9rem">Save Template</button>
        </div>`;
      document.getElementById("btnSaveResultTemplate").addEventListener("click", () => {
        const name = document.getElementById("rtName").value.trim() || "Custom";
        const file = document.getElementById("rtImage").files[0];
        const textY = Number(document.getElementById("rtTextY").value);
        const rowGap = Number(document.getElementById("rtRowGap").value);
        const textColor = document.getElementById("rtFg").value;
        if (!file) return showToast("Choose a result frame image first");
        showToast("Compressing template image\u2026");
        compressImageFile(file, 1350, 0.82).then((imageUrl) => {
          state.resultTemplates.push({ id: "result-" + uid(), label: name, imageUrl, textY, rowGap, textColor });
          persist(); showToast("Result template added"); renderPosterTab();
        }).catch(() => showToast("Could not process that image"));
      });
    });
    document.querySelectorAll("#resultTemplateRow .result-template-del").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.resultTemplates = state.resultTemplates.filter((t) => t.id !== b.dataset.id);
      persist(); renderPosterTab();
    }));

    document.getElementById("btnSavePoster").addEventListener("click", () => {
      const selectedTpl = document.querySelector("#templateRow .template-swatch.selected");
      const selectedResultTpl = document.querySelector("#resultTemplateRow .result-template-swatch.selected");
      state.hero = {
        ...h,
        title: document.getElementById("fTitle").value || h.title,
        badge: document.getElementById("fBadge").value,
        subtitle: document.getElementById("fSubtitle").value,
        ayah: document.getElementById("fAyah").value,
        showText: document.getElementById("fShowText").checked,
        posterTemplate: selectedTpl ? selectedTpl.dataset.tpl : h.posterTemplate,
        resultTemplate: selectedResultTpl ? selectedResultTpl.dataset.tpl : h.resultTemplate,
      };
      persist();
      renderHero();
      showToast("Home page updated");
    });
  }

  /* ---- ID Cards tab ---- */
  function renderCardsTab() {
    const h = state.hero;
    const allCards = getAllCardTemplates();
    adminContent.innerHTML = `
      <button class="link-btn" id="btnCardsBack" style="text-align:left;color:var(--gold-light);padding:0;margin-bottom:.75rem">&larr; Back to Chess No</button>
      <div class="card">
        <div class="card-title">Chest-No ID Cards</div>
        <div class="field-label" style="margin-bottom:.5rem">Upload up to 5 of your own designed ID card templates \u2014 landscape, <b>recommended size: 1013\u00d7638px</b> (standard ID-card ratio). Leave a clear area for the student's name, chest number, category/team and their list of programmes \u2014 these are printed automatically for each student.</div>
        <div class="template-row" id="cardTemplateRow">
          ${allCards.map((t) => `
            <div class="template-swatch ${h.cardTemplate === t.id ? "selected" : ""}" data-tpl="${t.id}" style="background:${t.imageUrl ? `url('${t.imageUrl}') center/cover` : "#0B3D2E"};color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);position:relative;min-height:2.6rem">
              ${escapeHtml(t.label)}
              <span class="template-del" data-id="${t.id}">&times;</span>
            </div>`).join("")}
        </div>
        <button class="link-btn" id="btnShowAddCard" style="text-align:left;color:var(--gold-light);padding:0;margin-bottom:.5rem">+ Add Card Template ${state.cardTemplates.length}/5</button>
        <div id="addCardForm"></div>
      </div>

      <div class="card">
        <div class="card-title">Bulk Print by Category (PDF)</div>
        <div class="field-label" style="margin-bottom:.5rem">Pick a category \u2014 downloads a ready-to-print PDF with every registered student's ID card, at normal ATM/credit card size, laid out on A4 pages.</div>
        <select id="cardCategoryPick" class="input" style="margin-bottom:.5rem">
          ${state.categories.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)} (${state.students.filter((s) => s.category === c).length} students)</option>`).join("")}
        </select>
        <div class="field-label" style="margin-bottom:.4rem">Cards per page</div>
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
          <label class="radio-pill"><input type="radio" name="cardsPerPage" value="8" checked /> 8 per page (true card size)</label>
          <label class="radio-pill"><input type="radio" name="cardsPerPage" value="12" /> 12 per page (smaller)</label>
        </div>
        <button class="btn btn-primary" id="btnPrintCategoryCards" style="width:auto;padding:.5rem .9rem">\u2B07 Download PDF</button>
      </div>

      <div class="card">
        <div class="card-title">Download / Test a Card</div>
        <div class="field-label" style="margin-bottom:.5rem">Pick a registered student to preview and download their ID card with the template above.</div>
        <select id="cardStudentPick" class="input" style="margin-bottom:.5rem">
          <option value="">Choose a student\u2026</option>
          ${state.students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} \u2014 ${s.chestNo}</option>`).join("")}
        </select>
        <button class="btn btn-primary" id="btnDownloadTestCard" style="width:auto;padding:.5rem .9rem">\u2B07 Download Card</button>
      </div>`;

    document.querySelectorAll("#cardTemplateRow .template-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#cardTemplateRow .template-swatch").forEach((s) => s.classList.remove("selected"));
        sw.classList.add("selected");
        state.hero.cardTemplate = sw.dataset.tpl;
        persist();
      });
    });
    document.getElementById("btnShowAddCard").addEventListener("click", () => {
      if (state.cardTemplates.length >= 5) return showToast("Maximum 5 card templates \u2014 delete one first");
      const holder = document.getElementById("addCardForm");
      if (holder.innerHTML) { holder.innerHTML = ""; return; }
      holder.innerHTML = `
        <div class="card" style="margin-bottom:.75rem">
          <div class="field-label">Template Name</div>
          <input id="ctName" class="input" placeholder="e.g. Gold Card" style="margin-bottom:.5rem" />
          <div class="field-label">Card Image \u2014 landscape, 1013\u00d7638px recommended</div>
          <input type="file" id="ctImage" accept="image/*" class="input" style="margin-bottom:.5rem;padding:.4rem" />
          <div class="grid3" style="margin-bottom:.5rem">
            <div><div class="field-label">Text Colour</div><input id="ctFg" type="color" class="input" value="#FFFFFF" style="padding:.25rem" /></div>
          </div>
          <div class="field-label">Text Position (how far down the card the name block starts)</div>
          <input id="ctTextY" type="range" min="20" max="80" value="55" style="width:100%;margin-bottom:.75rem" />
          <button class="btn btn-primary" id="btnSaveCardTemplate" style="width:auto;padding:.5rem .9rem">Save Template</button>
        </div>`;
      document.getElementById("btnSaveCardTemplate").addEventListener("click", () => {
        const name = document.getElementById("ctName").value.trim() || "Custom";
        const file = document.getElementById("ctImage").files[0];
        const textY = Number(document.getElementById("ctTextY").value);
        const textColor = document.getElementById("ctFg").value;
        if (!file) return showToast("Choose a card image first");
        showToast("Compressing template image\u2026");
        compressImageFile(file, 1013, 0.85).then((imageUrl) => {
          state.cardTemplates.push({ id: "card-" + uid(), label: name, imageUrl, textY, textColor });
          persist(); showToast("Card template added"); renderCardsTab();
        }).catch(() => showToast("Could not process that image"));
      });
    });
    document.querySelectorAll("#cardTemplateRow .template-del").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.cardTemplates = state.cardTemplates.filter((t) => t.id !== b.dataset.id);
      persist(); renderCardsTab();
    }));
    document.getElementById("btnPrintCategoryCards").addEventListener("click", () => {
      const category = document.getElementById("cardCategoryPick").value;
      const perPage = Number(document.querySelector('input[name="cardsPerPage"]:checked').value);
      generateCategoryCardsPdf(category, perPage);
    });
    document.getElementById("btnDownloadTestCard").addEventListener("click", () => {
      const sid = document.getElementById("cardStudentPick").value;
      const student = state.students.find((s) => s.id === sid);
      if (!student) return showToast("Pick a student first");
      showToast("Preparing card\u2026");
      drawIdCard(student).then((url) => {
        downloadDataUrl(url, `${student.chestNo}-idcard.jpg`);
        showToast("Card downloaded");
      }).catch(() => showToast("Could not generate card"));
    });
    document.getElementById("btnCardsBack").addEventListener("click", () => setActiveAdminTab("chestno"));
  }

  /* ---- Teams tab ---- */
  function renderTeamsTab() {
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">New Team</div>
        <div class="grid2" style="margin-bottom:.5rem">
          <input id="tName" class="input" placeholder="Team Name" />
          <input id="tColor" type="color" class="input" value="#155E43" style="padding:.25rem" />
        </div>
        <div class="grid2" style="margin-bottom:.75rem">
          <input id="tLeader" class="input" placeholder="Team Leader" />
          <input id="tAssistant" class="input" placeholder="Assistant Leader" />
        </div>
        <button class="btn btn-primary" id="btnAddTeam" style="width:auto;padding:.6rem 1rem">+ Add Team</button>
      </div>
      <div id="teamsListWrap"></div>`;
    renderTeamsList();
    document.getElementById("btnAddTeam").addEventListener("click", () => {
      const name = document.getElementById("tName").value.trim();
      if (!name) return showToast("Team name is required");
      state.teams.push({
        id: uid(), name,
        color: document.getElementById("tColor").value,
        leader: document.getElementById("tLeader").value,
        assistant: document.getElementById("tAssistant").value,
      });
      persist(); renderCounters(); renderLeaderboard(); renderTeamsTab();
      showToast("Team added");
    });
  }
  function renderTeamsList() {
    document.getElementById("teamsListWrap").innerHTML = state.teams.map((t) => `
      <div class="card">
        <div class="row-between">
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="width:.75rem;height:.75rem;border-radius:50%;background:${t.color};display:inline-block"></span>
            <div><div style="font-size:.85rem;font-weight:500">${escapeHtml(t.name)}</div>
            <div class="muted" style="font-size:.7rem">Leader: ${escapeHtml(t.leader || "\u2014")} \u00b7 Asst: ${escapeHtml(t.assistant || "\u2014")}</div></div>
          </div>
          <button class="trash-btn" data-id="${t.id}">\u{1F5D1}</button>
        </div>
      </div>`).join("");
    document.querySelectorAll("#teamsListWrap .trash-btn").forEach((b) => b.addEventListener("click", () => {
      state.teams = state.teams.filter((t) => t.id !== b.dataset.id);
      persist(); renderCounters(); renderLeaderboard(); renderTeamsTab();
    }));
  }

  /* ---- Events tab ---- */
  function renderEventsTab() {
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">New Programme</div>
        <input id="evName" class="input" placeholder="Programme Name" style="margin-bottom:.5rem" />
        <div class="grid3" style="margin-bottom:.75rem">
          <select id="evCategory" class="input">${state.categories.map((c) => `<option>${c}</option>`).join("")}</select>
          <select id="evType" class="input"><option>Individual</option><option>Group</option></select>
          <select id="evGender" class="input"><option>General</option><option>Boys</option><option>Girls</option></select>
        </div>
        <button class="btn btn-primary" id="btnAddEvent" style="width:auto;padding:.6rem 1rem">+ Add Programme</button>
      </div>
      <div id="eventsListWrap"></div>`;
    renderEventsList();
    document.getElementById("btnAddEvent").addEventListener("click", () => {
      const name = document.getElementById("evName").value.trim();
      if (!name) return showToast("Programme name is required");
      state.events.push({
        id: uid(), name,
        category: document.getElementById("evCategory").value,
        type: document.getElementById("evType").value,
        gender: document.getElementById("evGender").value,
        status: "pending",
      });
      persist(); renderCounters(); renderTicker(); renderFilters(); renderResultsList(); renderEventsTab();
      showToast("Programme added");
    });
  }
  function renderEventsList() {
    document.getElementById("eventsListWrap").innerHTML = state.events.map((e) => {
      const participants = state.students.filter((s) => s.events.includes(e.id));
      return `<div class="card">
        <div class="row-between">
          <div>
            <div style="font-size:.85rem;font-weight:500">${escapeHtml(e.name)} ${e.status === "ticked" ? '<span class="tick">\u2713</span>' : ""}</div>
            <div class="muted" style="font-size:.7rem">${e.category} \u00b7 ${e.type} \u00b7 ${e.gender} \u00b7 ${participants.length} registered \u00b7 <span style="color:${e.resultStatus === "Published" ? "var(--emerald-light)" : "var(--muted)"}">${e.resultStatus}</span></div>
          </div>
          <button class="trash-btn" data-id="${e.id}">\u{1F5D1}</button>
        </div>
      </div>`;
    }).join("");
    document.querySelectorAll("#eventsListWrap .trash-btn").forEach((b) => b.addEventListener("click", () => {
      state.events = state.events.filter((e) => e.id !== b.dataset.id);
      persist(); renderCounters(); renderTicker(); renderFilters(); renderResultsList(); renderEventsTab();
    }));
  }
  /* ---- Mark Entry tab ---- */
  function renderMarksTab() {
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Judges Panel</div>
        <div class="judge-chips" id="judgesChips">
          ${state.judges.map((j) => `<span class="judge-chip">${escapeHtml(j)} <button data-judge="${escapeAttr(j)}">&times;</button></span>`).join("")}
        </div>
        <div style="display:flex;gap:.5rem">
          <input id="newJudge" class="input" placeholder="Judge name" style="flex:1" />
          <button class="btn btn-primary" id="btnAddJudge" style="width:auto;padding:.5rem .9rem">+ Add</button>
        </div>
      </div>
      <div class="marks-table-wrap">
        <table class="marks-table">
          <thead><tr><th>Competition</th><th>Category</th><th>Gender</th><th>Status</th><th></th></tr></thead>
          <tbody id="marksTableBody"></tbody>
        </table>
      </div>`;

    document.getElementById("btnAddJudge").addEventListener("click", () => {
      const v = document.getElementById("newJudge").value.trim();
      if (!v) return;
      if (!state.judges.includes(v)) state.judges.push(v);
      persist(); renderMarksTab();
    });
    document.querySelectorAll("#judgesChips [data-judge]").forEach((b) => b.addEventListener("click", () => {
      state.judges = state.judges.filter((j) => j !== b.dataset.judge);
      state.events.forEach((e) => { e.assignedJudges = e.assignedJudges.filter((j) => j !== b.dataset.judge); });
      persist(); renderMarksTab();
    }));

    document.getElementById("marksTableBody").innerHTML = state.events.map((e) => `
      <tr>
        <td style="text-align:left">${escapeHtml(e.name)}</td>
        <td>${e.category}</td>
        <td>${e.gender}</td>
        <td><span class="status-pill ${e.resultStatus === "Published" ? "status-published" : "status-pending"}">${e.resultStatus}</span></td>
        <td><button class="dots-btn" data-open="${e.id}">\u22EF</button></td>
      </tr>`).join("");
    document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openMarksModal(b.dataset.open)));
  }

  function openMarksModal(eventId) {
    const event = state.events.find((e) => e.id === eventId);
    if (!state.marks[eventId]) state.marks[eventId] = {};
    let sortMode = "code";

    function getSortedParticipants() {
      const participants = groupAwareParticipants(eventId);
      if (sortMode === "marks") {
        return [...participants].sort((a, b) => (finalMarkFor(eventId, b.id) ?? -Infinity) - (finalMarkFor(eventId, a.id) ?? -Infinity));
      }
      return [...participants].sort((a, b) => codeLetterFor(eventId, a.id).localeCompare(codeLetterFor(eventId, b.id)));
    }

    function draw() {
      const rows = getSortedParticipants();
      modalBody.innerHTML = `
        <div class="marks-modal">
          <div class="row-between" style="margin-bottom:.75rem">
            <div style="font-weight:600;font-size:.95rem">${escapeHtml(event.name)} \u2014 ${event.category}${event.gender !== "General" ? " (" + event.gender + " Only)" : ""}</div>
            <button class="dots-btn" id="meClose" style="font-size:1.2rem">&times;</button>
          </div>
          ${event.resultStatus === "Published" ? `<div class="warn-banner">\u26A0 Result Published. Editing marks might affect the live leaderboard.</div>` : ""}
          ${event.type === "Group" ? `<div class="muted" style="font-size:.7rem;margin-bottom:.5rem">\u2139 Group programme \u2014 each team is scored once, under its team leader (first member registered).</div>` : ""}
          <div class="field-label">Judges</div>
          <div class="judge-chips">
            ${state.judges.map((j) => `<span class="judge-chip" data-toggle-judge="${escapeAttr(j)}" style="cursor:pointer;${event.assignedJudges.includes(j) ? "" : "opacity:.4"}">${escapeHtml(j)}</span>`).join("") || '<span class="muted" style="font-size:.72rem">Add judges in the panel above first.</span>'}
          </div>
          <div class="marks-table-wrap" style="margin-top:.5rem">
            <table class="marks-table">
              <thead><tr><th>Chest #</th><th>Code</th>${event.assignedJudges.map((j) => `<th>${escapeHtml(j)}</th>`).join("")}<th>Final</th></tr></thead>
              <tbody>
                ${rows.map((student) => `
                  <tr>
                    <td>${student.chestNo}</td>
                    <td>${codeLetterFor(eventId, student.id)}</td>
                    ${event.assignedJudges.map((j) => `<td><input type="number" class="me-mark-input" data-student="${student.id}" data-judge="${escapeAttr(j)}" value="${(state.marks[eventId][student.id] || {})[j] ?? ""}" /></td>`).join("")}
                    <td><b>${finalMarkFor(eventId, student.id) ?? "\u2014"}</b></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>
          <div class="sort-row">
            <button class="sort-btn" id="sortByCode">Sort by Code Letter</button>
            <button class="sort-btn" id="sortByMarks">Sort by Marks</button>
          </div>
          <div class="modal-actions" style="background:transparent;padding:0 0 .6rem">
            <button class="btn btn-ghost" id="meCancel">Cancel</button>
            <button class="btn btn-primary" id="meSubmit">Submit Marks</button>
          </div>
          <div class="modal-actions" style="background:transparent;padding:0">
            ${event.resultStatus === "Published"
              ? `<button class="btn" style="background:rgba(139,38,53,.12);color:var(--crimson)" id="meUnpublish">Unpublish</button>`
              : `<button class="btn btn-primary" id="mePublish">\u2713 Publish Result</button>`}
          </div>
        </div>`;

      document.getElementById("meClose").addEventListener("click", popScreen);
      document.getElementById("meCancel").addEventListener("click", popScreen);
      document.getElementById("sortByCode").addEventListener("click", () => { sortMode = "code"; draw(); });
      document.getElementById("sortByMarks").addEventListener("click", () => { sortMode = "marks"; draw(); });
      document.querySelectorAll("[data-toggle-judge]").forEach((chip) => chip.addEventListener("click", () => {
        const j = chip.dataset.toggleJudge;
        if (event.assignedJudges.includes(j)) event.assignedJudges = event.assignedJudges.filter((x) => x !== j);
        else event.assignedJudges.push(j);
        draw();
      }));
      function collectMarks() {
        document.querySelectorAll(".me-mark-input").forEach((inp) => {
          const sid = inp.dataset.student, j = inp.dataset.judge;
          if (!state.marks[eventId][sid]) state.marks[eventId][sid] = {};
          state.marks[eventId][sid][j] = inp.value === "" ? "" : Number(inp.value);
        });
      }
      document.getElementById("meSubmit").addEventListener("click", () => {
        collectMarks(); persist(); showToast("Marks saved"); draw();
      });
      const publishBtn = document.getElementById("mePublish");
      if (publishBtn) publishBtn.addEventListener("click", () => {
        collectMarks();
        publishEventResult(eventId);
        renderLeaderboard(); renderResultsList(); renderTicker();
        showToast(`${event.name} result published \u2014 now live on the home page`);
        draw(); renderMarksTab();
      });
      const unpublishBtn = document.getElementById("meUnpublish");
      if (unpublishBtn) unpublishBtn.addEventListener("click", () => {
        unpublishEventResult(eventId);
        renderLeaderboard(); renderResultsList(); renderTicker();
        showToast(`${event.name} result unpublished`);
        draw(); renderMarksTab();
      });
    }

    draw();
    modalOverlay.classList.remove("hidden");
    modalBody.classList.add("wide-modal");
    pushScreen(() => { modalOverlay.classList.add("hidden"); modalBody.classList.remove("wide-modal"); modalBody.innerHTML = ""; });
  }

  /* ---- Limits tab ---- */
  function renderLimitsTab() {
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Global Event Limits</div>
        <div class="grid2" style="margin-bottom:.75rem">
          <div><div class="field-label">Max Individual Events</div><input id="limIndiv" type="number" min="0" class="input" value="${state.limits.maxIndividual}" /></div>
          <div><div class="field-label">Max Group Events</div><input id="limGroup" type="number" min="0" class="input" value="${state.limits.maxGroup}" /></div>
        </div>
        <button class="btn btn-primary" id="btnSaveLimits" style="width:auto;padding:.6rem 1rem">Save Limits</button>
      </div>`;
    document.getElementById("btnSaveLimits").addEventListener("click", () => {
      state.limits = {
        maxIndividual: Number(document.getElementById("limIndiv").value) || 0,
        maxGroup: Number(document.getElementById("limGroup").value) || 0,
      };
      persist(); showToast("Limits updated");
    });
  }

  /* ---- Students / Participants tab ---- */
  let studentForm = { name: "", cls: "", phone: "", gender: "Boys", category: state.categories[0], team: state.teams[0] ? state.teams[0].id : "", events: [] };
  let studentsView = { mode: "list", id: null };

  function eligibleEventsFor(gender, category) {
    return state.events.filter((e) => e.category === category && (e.gender === gender || e.gender === "General"));
  }

  function renderStudentsTab() {
    if (studentsView.mode === "profile" && state.students.some((s) => s.id === studentsView.id)) {
      return renderStudentProfile(studentsView.id);
    }
    studentsView = { mode: "list", id: null };
    studentForm.team = studentForm.team || (state.teams[0] ? state.teams[0].id : "");
    const eligible = eligibleEventsFor(studentForm.gender, studentForm.category);
    const selIndiv = studentForm.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Individual").length;
    const selGroup = studentForm.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Group").length;

    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Register Student</div>
        <div class="grid2" style="margin-bottom:.5rem">
          <input id="sName" class="input" placeholder="Full Name" value="${escapeAttr(studentForm.name)}" />
          <input id="sClass" class="input" placeholder="Class" value="${escapeAttr(studentForm.cls)}" />
        </div>
        <input id="sPhone" class="input" placeholder="Phone" style="margin-bottom:.5rem" value="${escapeAttr(studentForm.phone)}" />
        <div class="grid3" style="margin-bottom:.6rem">
          <select id="sGender" class="input">
            <option ${studentForm.gender === "Boys" ? "selected" : ""}>Boys</option>
            <option ${studentForm.gender === "Girls" ? "selected" : ""}>Girls</option>
          </select>
          <select id="sCategory" class="input">${state.categories.map((c) => `<option ${studentForm.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
          <select id="sTeam" class="input">${state.teams.map((t) => `<option value="${t.id}" ${studentForm.team === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select>
        </div>
        <div class="row-between" style="margin-bottom:.4rem">
          <span class="muted" style="font-size:.68rem">Eligible Programmes (${studentForm.category}, ${studentForm.gender}/General)</span>
          <span class="muted" style="font-size:.65rem;font-family:'JetBrains Mono',monospace">${selIndiv}/${state.limits.maxIndividual} indiv \u00b7 ${selGroup}/${state.limits.maxGroup} group</span>
        </div>
        <div class="checkbox-list" id="checkList">
          ${eligible.length === 0 ? `<div class="muted" style="font-size:.72rem;font-style:italic">No programmes match this category/gender.</div>` :
            eligible.map((ev) => {
              const checked = studentForm.events.includes(ev.id);
              const disabled = !checked && ((ev.type === "Individual" && selIndiv >= state.limits.maxIndividual) || (ev.type === "Group" && selGroup >= state.limits.maxGroup));
              return `<label class="checkbox-row ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}">
                <input type="checkbox" data-ev="${ev.id}" data-type="${ev.type}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
                ${escapeHtml(ev.name)} <span style="margin-left:auto;font-size:.6rem;text-transform:uppercase">${ev.type}</span>
              </label>`;
            }).join("")}
        </div>
        <button class="btn btn-primary" id="btnAddStudent" style="width:auto;padding:.6rem 1rem">+ Register &amp; Generate Chest No.</button>
      </div>
      <div style="font-size:.75rem;font-weight:500;color:var(--gold-light);margin:1rem 0 .5rem">Registered Students (${state.students.length})</div>
      <div class="muted" style="font-size:.68rem;margin:-.35rem 0 .6rem">Tap a student to view/edit their profile and programmes.</div>
      <div id="studentsListWrap"></div>`;

    renderStudentsList();

    document.getElementById("sName").addEventListener("input", (e) => { studentForm.name = e.target.value; });
    document.getElementById("sClass").addEventListener("input", (e) => { studentForm.cls = e.target.value; });
    document.getElementById("sPhone").addEventListener("input", (e) => { studentForm.phone = e.target.value; });
    document.getElementById("sGender").addEventListener("change", (e) => { studentForm.gender = e.target.value; studentForm.events = []; renderStudentsTab(); });
    document.getElementById("sCategory").addEventListener("change", (e) => { studentForm.category = e.target.value; studentForm.events = []; renderStudentsTab(); });
    document.getElementById("sTeam").addEventListener("change", (e) => { studentForm.team = e.target.value; });
    document.querySelectorAll("#checkList input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const evId = cb.dataset.ev;
        if (cb.checked) {
          const type = cb.dataset.type;
          const count = studentForm.events.filter((id) => state.events.find((e) => e.id === id)?.type === type).length;
          const limit = type === "Individual" ? state.limits.maxIndividual : state.limits.maxGroup;
          if (count >= limit) { cb.checked = false; showToast("Maximum event limit reached for this student"); return; }
          studentForm.events.push(evId);
        } else {
          studentForm.events = studentForm.events.filter((id) => id !== evId);
        }
        renderStudentsTab();
      });
    });
    document.getElementById("btnAddStudent").addEventListener("click", () => {
      const name = studentForm.name.trim();
      if (!name) return showToast("Student name is required");
      if (!studentForm.team) return showToast("Please select a team");
      const chestNo = nextChestNo(studentForm.category);
      state.students.push({
        id: uid(), name, cls: studentForm.cls, phone: studentForm.phone,
        gender: studentForm.gender, team: studentForm.team, category: studentForm.category, chestNo, events: [...studentForm.events],
      });
      persist(); renderCounters();
      showToast(`Student registered \u2014 chest no. ${chestNo}`);
      studentForm.name = ""; studentForm.cls = ""; studentForm.phone = ""; studentForm.events = [];
      renderStudentsTab();
    });
  }

  function renderStudentsList() {
    document.getElementById("studentsListWrap").innerHTML = state.students.map((s) => {
      const team = state.teams.find((t) => t.id === s.team);
      return `<div class="card student-card" data-open="${s.id}" style="cursor:pointer">
        <div class="row-between">
          <div>
            <div style="font-size:.85rem;font-weight:500">${escapeHtml(s.name)} <span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--gold)">${s.chestNo}</span></div>
            <div class="muted" style="font-size:.7rem">${s.category} \u00b7 ${s.gender} \u00b7 ${team ? escapeHtml(team.name) : ""} \u00b7 ${s.events.length} events</div>
          </div>
          <button class="trash-btn" data-id="${s.id}">\u{1F5D1}</button>
        </div>
      </div>`;
    }).join("");
    document.querySelectorAll("#studentsListWrap .student-card").forEach((card) => card.addEventListener("click", (e) => {
      if (e.target.closest(".trash-btn")) return;
      studentsView = { mode: "profile", id: card.dataset.open };
      renderStudentsTab();
    }));
    document.querySelectorAll("#studentsListWrap .trash-btn").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const student = state.students.find((s) => s.id === b.dataset.id);
      state.students = state.students.filter((s) => s.id !== b.dataset.id);
      persist(); renderCounters(); renderStudentsTab();
    }));
  }

  // Student profile screen \u2014 view/edit name, class, phone, category, team and
  // programmes for an already-registered student, or delete them entirely.
  function renderStudentProfile(studentId) {
    const student = state.students.find((s) => s.id === studentId);
    if (!student) { studentsView = { mode: "list", id: null }; return renderStudentsTab(); }

    const eligible = eligibleEventsFor(student.gender, student.category);
    const selIndiv = student.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Individual").length;
    const selGroup = student.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Group").length;

    adminContent.innerHTML = `
      <button class="link-btn" id="btnProfileBack" style="text-align:left;color:var(--gold-light);padding:0;margin-bottom:.75rem">&larr; Back to list</button>
      <div class="card">
        <div class="card-title">Student Profile \u2014 <span style="font-family:'JetBrains Mono',monospace;color:var(--gold)">${student.chestNo}</span></div>
        <div class="grid2" style="margin-bottom:.5rem">
          <input id="pName" class="input" placeholder="Full Name" value="${escapeAttr(student.name)}" />
          <input id="pClass" class="input" placeholder="Class" value="${escapeAttr(student.cls || "")}" />
        </div>
        <input id="pPhone" class="input" placeholder="Phone" style="margin-bottom:.5rem" value="${escapeAttr(student.phone || "")}" />
        <div class="grid3" style="margin-bottom:.6rem">
          <select id="pGender" class="input">
            <option ${student.gender === "Boys" ? "selected" : ""}>Boys</option>
            <option ${student.gender === "Girls" ? "selected" : ""}>Girls</option>
          </select>
          <select id="pCategory" class="input">${state.categories.map((c) => `<option ${student.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
          <select id="pTeam" class="input">${state.teams.map((t) => `<option value="${t.id}" ${student.team === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select>
        </div>
        <div class="muted" style="font-size:.65rem;margin-bottom:.6rem">Changing category/gender refreshes the eligible programme list below \u2014 save to apply.</div>
        <div class="row-between" style="margin-bottom:.4rem">
          <span class="muted" style="font-size:.68rem">Programmes (${student.category}, ${student.gender}/General)</span>
          <span class="muted" style="font-size:.65rem;font-family:'JetBrains Mono',monospace">${selIndiv}/${state.limits.maxIndividual} indiv \u00b7 ${selGroup}/${state.limits.maxGroup} group</span>
        </div>
        <div class="checkbox-list" id="pCheckList">
          ${eligible.length === 0 ? `<div class="muted" style="font-size:.72rem;font-style:italic">No programmes match this category/gender.</div>` :
            eligible.map((ev) => {
              const checked = student.events.includes(ev.id);
              const disabled = !checked && ((ev.type === "Individual" && selIndiv >= state.limits.maxIndividual) || (ev.type === "Group" && selGroup >= state.limits.maxGroup));
              const leaderBadge = ev.type === "Group" && checked
                ? (isGroupLeader(ev.id, student.id) ? ` <span class="status-pill status-published" style="font-size:.55rem">TEAM LEADER</span>` : ` <span class="status-pill status-pending" style="font-size:.55rem">MEMBER</span>`)
                : "";
              return `<label class="checkbox-row ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}">
                <input type="checkbox" data-ev="${ev.id}" data-type="${ev.type}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
                ${escapeHtml(ev.name)}${leaderBadge} <span style="margin-left:auto;font-size:.6rem;text-transform:uppercase">${ev.type}</span>
              </label>`;
            }).join("")}
        </div>
        <div class="muted" style="font-size:.63rem;margin:.3rem 0 .75rem">For group programmes, whichever member was registered first is the team leader \u2014 only the leader appears in published results.</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-primary" id="btnSaveProfile" style="width:auto;padding:.6rem 1rem">\u2713 Save Changes</button>
          <button class="btn" id="btnDeleteProfile" style="width:auto;padding:.6rem 1rem;background:rgba(139,38,53,.12);color:var(--crimson)">\u{1F5D1} Delete Student</button>
        </div>
      </div>`;

    // Local edit buffer so toggling checkboxes / switching category doesn't touch
    // Firebase until "Save Changes" is pressed.
    let draft = { name: student.name, cls: student.cls || "", phone: student.phone || "", gender: student.gender, category: student.category, team: student.team, events: [...student.events] };

    document.getElementById("btnProfileBack").addEventListener("click", () => { studentsView = { mode: "list", id: null }; renderStudentsTab(); });
    document.getElementById("pName").addEventListener("input", (e) => { draft.name = e.target.value; });
    document.getElementById("pClass").addEventListener("input", (e) => { draft.cls = e.target.value; });
    document.getElementById("pPhone").addEventListener("input", (e) => { draft.phone = e.target.value; });
    document.getElementById("pTeam").addEventListener("change", (e) => { draft.team = e.target.value; });
    document.getElementById("pGender").addEventListener("change", (e) => {
      draft.gender = e.target.value; draft.events = [];
      Object.assign(student, draft); renderStudentProfile(studentId); // live-refresh eligible list only, not yet saved to Firebase
    });
    document.getElementById("pCategory").addEventListener("change", (e) => {
      draft.category = e.target.value; draft.events = [];
      Object.assign(student, draft); renderStudentProfile(studentId);
    });
    document.querySelectorAll("#pCheckList input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const evId = cb.dataset.ev;
        if (cb.checked) {
          const type = cb.dataset.type;
          const count = draft.events.filter((id) => state.events.find((e) => e.id === id)?.type === type).length;
          const limit = type === "Individual" ? state.limits.maxIndividual : state.limits.maxGroup;
          if (count >= limit) { cb.checked = false; showToast("Maximum event limit reached for this student"); return; }
          draft.events.push(evId);
        } else {
          draft.events = draft.events.filter((id) => id !== evId);
        }
        Object.assign(student, draft); renderStudentProfile(studentId);
      });
    });
    document.getElementById("btnSaveProfile").addEventListener("click", () => {
      if (!draft.name.trim()) return showToast("Student name is required");
      if (!draft.team) return showToast("Please select a team");
      Object.assign(student, { name: draft.name.trim(), cls: draft.cls, phone: draft.phone, gender: draft.gender, category: draft.category, team: draft.team, events: [...draft.events] });
      persist(); renderCounters();
      showToast("Student profile updated");
      renderStudentProfile(studentId);
    });
    document.getElementById("btnDeleteProfile").addEventListener("click", () => {
      state.students = state.students.filter((s) => s.id !== studentId);
      persist(); renderCounters();
      showToast("Student deleted");
      studentsView = { mode: "list", id: null };
      renderStudentsTab();
    });
  }

  /* ---- Chess No tab ---- */
  function renderChestNoTab() {
    adminContent.innerHTML = `
      <div class="card">
        <div class="field-label" style="margin-bottom:.6rem">Numbers fill the lowest free slot in each category, starting from its Start Number. Deleting a student frees their number \u2014 the next student added gets it back (numbers are reused, never skipped).</div>
        <div class="marks-table-wrap">
          <table class="marks-table">
            <thead><tr><th>Category Name</th><th>Active</th><th>Start Number</th><th></th><th></th></tr></thead>
            <tbody>
              ${state.categories.map((c) => {
                const active = state.students.filter((s) => s.category === c).length;
                const start = state.categoryStartNumbers[c] || 1;
                const safeId = c.replace(/[^a-zA-Z0-9]/g, "_");
                return `<tr>
                  <td style="text-align:left">${escapeHtml(c)}</td>
                  <td>${active}</td>
                  <td><input type="number" step="1" class="input chest-start-input" data-category="${escapeAttr(c)}" id="start_${safeId}" value="${start}" style="width:5.5rem;padding:.35rem .5rem;font-family:'JetBrains Mono',monospace" /></td>
                  <td><button class="btn btn-primary btn-save-start" data-category="${escapeAttr(c)}" style="width:auto;padding:.35rem .6rem;font-size:.7rem">Save</button></td>
                  <td><button class="btn btn-ghost btn-delete-category" data-category="${escapeAttr(c)}" style="width:auto;padding:.35rem .6rem;font-size:.7rem;border-color:var(--crimson);color:var(--crimson)" title="Delete category">\u{1F5D1}</button></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">+ Add Category</div>
        <div class="field-label" style="margin-bottom:.5rem">A new category automatically starts at the next free hundred above every existing category's start number.</div>
        <div style="display:flex;gap:.5rem;align-items:center">
          <input id="newCategoryName" class="input" placeholder="e.g. Kids" style="flex:1" />
          <button class="btn btn-primary" id="btnAddCategory" style="width:auto;padding:.5rem .9rem">+ Add</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">ID Cards</div>
        <div class="field-label" style="margin-bottom:.5rem">Chest-no ID cards are managed here \u2014 upload templates per category and print or download cards.</div>
        <button class="btn btn-primary" id="btnOpenIdCards" style="width:auto;padding:.5rem .9rem">\u{1F4B3} Open ID Cards</button>
      </div>

      <div class="card">
        <div class="card-title" style="color:var(--crimson)">Reset Sample Data</div>
        <div class="field-label" style="margin-bottom:.5rem">Removes <b>every registered student</b> and their chest numbers so real registrations can start fresh from each category's Start Number. Teams, programmes and categories themselves are kept. This cannot be undone.</div>
        <button class="btn btn-ghost" id="btnResetStudents" style="width:auto;padding:.5rem .9rem;border-color:var(--crimson);color:var(--crimson)">\u{1F5D1} Delete All Students &amp; Reset Numbers</button>
      </div>`;

    document.querySelectorAll(".btn-save-start").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.category;
        const safeId = cat.replace(/[^a-zA-Z0-9]/g, "_");
        const val = parseInt(document.getElementById(`start_${safeId}`).value, 10);
        if (!val || val < 1) return showToast("Enter a valid start number");
        state.categoryStartNumbers[cat] = val;
        persist();
        showToast(`Start number for ${cat} set to ${val}`);
        renderChestNoTab();
      });
    });

    document.getElementById("btnAddCategory").addEventListener("click", () => {
      const name = document.getElementById("newCategoryName").value.trim();
      if (!name) return showToast("Enter a category name");
      if (state.categories.includes(name)) return showToast("That category already exists");
      const highestStart = Object.values(state.categoryStartNumbers).reduce((m, v) => Math.max(m, v), 0);
      const nextStart = Math.floor(highestStart / 100) * 100 + 100;
      state.categories.push(name);
      state.categoryStartNumbers[name] = nextStart;
      persist();
      showToast(`"${name}" added \u2014 starts at ${nextStart}`);
      renderChestNoTab();
    });

    document.querySelectorAll(".btn-delete-category").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.dataset.category;
        if (state.categories.length <= 1) return showToast("At least one category must remain");
        const studentCount = state.students.filter((s) => s.category === cat).length;
        const eventCount = state.events.filter((e) => e.category === cat).length;
        if (studentCount || eventCount) {
          return showToast(`Can't delete "${cat}" \u2014 it still has ${studentCount} student(s) and ${eventCount} programme(s). Remove those first.`);
        }
        if (!confirm(`Delete the "${cat}" category? This cannot be undone.`)) return;
        state.categories = state.categories.filter((c) => c !== cat);
        delete state.categoryStartNumbers[cat];
        persist();
        showToast(`"${cat}" deleted`);
        renderChestNoTab();
      });
    });

    document.getElementById("btnResetStudents").addEventListener("click", () => {
      if (!confirm(`Delete all ${state.students.length} registered student(s) and reset chest numbers? This cannot be undone.`)) return;
      state.students = [];
      persist();
      renderCounters();
      showToast("All students removed \u2014 chest numbers reset");
      renderChestNoTab();
    });
    document.getElementById("btnOpenIdCards").addEventListener("click", () => setActiveAdminTab("idcards"));
  }

  /* ---- Gallery tab ---- */
  function renderGalleryTab() {
    const frameUrl = state.hero.galleryFrameUrl;
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Photo Frame</div>
        <div class="field-label" style="margin-bottom:.5rem">Upload a decorative frame with a <b>transparent centre (PNG only)</b>. The frame is applied automatically only when a guest downloads or shares a photo \u2014 the gallery itself always shows the clean, unframed photo.</div>
        ${frameUrl ? `<div class="hero-photo-preview" style="background-image:url('${frameUrl}');background-color:#0B3D2E"></div>` : ""}
        <input type="file" id="gFrameFile" accept="image/png" class="input" style="margin:.5rem 0;padding:.4rem" />
        <div style="display:flex;gap:.5rem;margin-bottom:${frameUrl ? ".75rem" : "0"}">
          <button class="btn btn-primary" id="btnSaveFrame" style="width:auto;padding:.5rem .9rem">${frameUrl ? "Replace Frame" : "Upload Frame"}</button>
          ${frameUrl ? `<button class="btn btn-ghost" id="btnRemoveFrame" style="width:auto;padding:.5rem .9rem">Remove Frame</button>` : ""}
        </div>
        ${frameUrl ? `
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
          <input type="checkbox" id="gApplyFrameOnDownload" ${state.hero.applyFrameOnDownload === false ? "" : "checked"} />
          <span class="field-label" style="margin:0">Apply frame on download/share (turn off for madrasas that don't want the frame)</span>
        </label>` : ""}
      </div>
      <div class="card">
        <div class="card-title">Add Event Photo</div>
        <input type="file" id="gPhotoFile" accept="image/*" class="input" style="margin-bottom:.5rem;padding:.4rem" />
        <input id="gCaption" class="input" placeholder="Caption (e.g. Opening Ceremony)" style="margin-bottom:.75rem" />
        <button class="btn btn-primary" id="btnAddPhoto" style="width:auto;padding:.6rem 1rem">+ Add Photo</button>
        <div class="muted" style="font-size:.68rem;margin-top:.5rem">Photos are auto-compressed and converted to WebP before upload \u2014 sharp but small, so things stay fast for everyone.</div>
      </div>
      <div id="galleryAdminWrap" class="gallery-admin-grid"></div>`;

    document.getElementById("gFrameFile").addEventListener("change", () => {
      showToast("Frame selected \u2014 tap Upload Frame to save it");
    });
    document.getElementById("btnSaveFrame").addEventListener("click", () => {
      const file = document.getElementById("gFrameFile").files[0];
      if (!file) return showToast("Choose a PNG frame first");
      if (file.type !== "image/png") return showToast("Please choose a PNG file (needs a transparent centre)");
      showToast("Saving frame\u2026");
      compressImagePngFile(file, 1400).then((dataUrl) => {
        state.hero.galleryFrameUrl = dataUrl;
        persist(); renderGalleryTab();
        showToast("Frame saved \u2014 new photos will use it");
      }).catch(() => showToast("Could not process that frame image"));
    });
    const removeFrameBtn = document.getElementById("btnRemoveFrame");
    if (removeFrameBtn) removeFrameBtn.addEventListener("click", () => {
      delete state.hero.galleryFrameUrl;
      persist(); renderGalleryTab();
      showToast("Frame removed");
    });

    const applyFrameToggle = document.getElementById("gApplyFrameOnDownload");
    if (applyFrameToggle) applyFrameToggle.addEventListener("change", (e) => {
      state.hero.applyFrameOnDownload = e.target.checked;
      persist();
      showToast(e.target.checked ? "Frame will be applied on download" : "Frame will be skipped on download");
    });

    document.getElementById("gPhotoFile").addEventListener("change", () => {
      showToast("Photo selected \u2014 add a caption and tap Add Photo");
    });
    document.getElementById("btnAddPhoto").addEventListener("click", () => {
      const fileInput = document.getElementById("gPhotoFile");
      const caption = document.getElementById("gCaption").value.trim() || "Event Photo";
      const file = fileInput.files[0];
      if (!file) return showToast("Choose a photo first");
      showToast("Compressing & uploading photo\u2026");
      compressImageFile(file, 1000, 0.72).then((dataUrl) => uploadToImgBB(dataUrl)).then((finalUrl) => {
        state.gallery.push({ id: uid(), caption, color: "#155E43", url: finalUrl });
        persist(); renderGallery(); renderGalleryTab();
        showToast("Photo added to gallery");
      }).catch(() => showToast("Could not process that photo"));
    });
    renderGalleryAdminList();
  }
  function renderGalleryAdminList() {
    document.getElementById("galleryAdminWrap").innerHTML = state.gallery.map((p) => `
      <div class="gallery-admin-tile" style="${p.url ? "" : `background:linear-gradient(160deg, ${p.color}, #0B3D2E)`}">
        ${p.url ? `<img src="${p.url}" alt="${escapeAttr(p.caption)}" />` : ""}
        <button class="gdel" data-id="${p.id}">\u{1F5D1}</button>
        <span class="gcap">${escapeHtml(p.caption)}</span>
      </div>`).join("");
    document.querySelectorAll(".gdel").forEach((b) => b.addEventListener("click", () => {
      state.gallery = state.gallery.filter((p) => p.id !== b.dataset.id);
      persist(); renderGallery(); renderGalleryTab();
    }));
  }

  /* ---- Export tab ---- */
  let pickEventKind = null;
  function renderExportTab() {
    const cards = [
      { id: "Call List", icon: "\u{1F4CB}" }, { id: "Valuation Sheet", icon: "\u{1F3C5}" },
      { id: "Green Room Sign", icon: "\u2B50" }, { id: "Results", icon: "\u{1F3C6}" },
    ];
    adminContent.innerHTML = `
      <div class="export-grid">
        ${cards.map((c) => `<button class="export-card" data-kind="${c.id}"><div class="ic">${c.icon}</div><div class="t">${c.id}</div><div class="s">Tap to generate</div></button>`).join("")}
      </div>
      <div id="pickWrap"></div>
      <div style="font-size:.85rem;font-weight:500;color:var(--gold-light);margin:1.25rem 0 .5rem">Auto-Checklist Tracker</div>
      <div id="checklistWrap"></div>
      <div style="font-size:.85rem;font-weight:500;color:var(--gold-light);margin:1.25rem 0 .5rem">Sheet History</div>
      <div class="card" style="padding:.5rem .75rem"><div id="historyListWrap"></div></div>
      <button class="btn btn-primary" id="btnExportCsv" style="width:100%;margin-top:1.25rem;padding:.75rem">\u{1F4CA} Download Full Database (CSV)</button>`;

    renderChecklist();
    renderPrintHistoryList();
    document.querySelectorAll(".export-card").forEach((b) => b.addEventListener("click", () => {
      pickEventKind = b.dataset.kind;
      document.getElementById("pickWrap").innerHTML = `
        <div class="card">
          <div class="muted" style="font-size:.72rem;margin-bottom:.5rem">Select programme for "${pickEventKind}"</div>
          <div style="display:flex;gap:.5rem">
            <select id="pickEventSel" class="input" style="flex:1">
              <option value="">Choose programme...</option>
              ${state.events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${e.category})</option>`).join("")}
            </select>
            <button class="btn btn-primary" id="btnGenerate" style="width:auto;padding:.5rem .9rem">Generate</button>
          </div>
        </div>`;
      document.getElementById("btnGenerate").addEventListener("click", () => {
        const eid = document.getElementById("pickEventSel").value;
        if (!eid) return showToast("Choose a programme first");
        openPrintSheet(pickEventKind, eid);
      });
    }));
    document.getElementById("btnExportCsv").addEventListener("click", downloadCsv);
  }
  function renderChecklist() {
    document.getElementById("checklistWrap").innerHTML = state.events.map((e) => `
      <div class="checklist-row ${e.status === "ticked" ? "done" : ""}">
        <span>${escapeHtml(e.name)} <span class="muted">\u00b7 ${e.category}</span></span>
        ${e.status === "ticked" ? '<span class="tick">\u2713 In Progress</span>' : '<span class="muted">Pending</span>'}
      </div>`).join("");
  }

  function openPrintSheet(kind, eventId) {
    const event = state.events.find((e) => e.id === eventId);
    event.status = "ticked";
    persist(); renderTicker(); renderChecklist();

    const participants = state.students.filter((s) => s.events.includes(eventId));
    const now = new Date();
    const timestamp = now.toLocaleDateString("en-GB") + " " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const sectorLine = `${escapeHtml(state.hero.title)}`;
    let body;

    if (kind === "Green Room Sign") {
      body = `
        <div class="print-section-row"><b>${escapeHtml(event.name.toUpperCase())}</b><span>${event.type}</span><b>${event.category.toUpperCase()}</b></div>
        <table><thead><tr><th>Chest No</th><th>Participant</th><th>Code Letter</th><th>Participants Signature</th></tr></thead><tbody>
          ${participants.map((s) => `<tr><td>${s.chestNo}</td><td>${escapeHtml(s.name)}</td><td>${codeLetterFor(eventId, s.id)}</td><td>&nbsp;</td></tr>`).join("")}
          <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        </tbody></table>
        <div style="margin-top:1.25rem;font-size:.78rem">
          <div style="margin-bottom:.4rem">Competition Start Time: ______________</div>
          <div style="margin-bottom:1.5rem">Competition End Time: ______________</div>
          <div style="text-align:center;font-size:.75rem;color:#444">Stage incharge's Name and Signature</div>
        </div>`;
    } else if (kind === "Valuation Sheet") {
      const judges = event.assignedJudges.length ? event.assignedJudges : ["Judge 1"];
      body = `
        <div class="print-section-row"><b>${escapeHtml(event.name.toUpperCase())}</b><b>${event.category.toUpperCase()}</b><span>${event.type}</span></div>
        <div style="text-align:right;font-size:.7rem;color:#666;margin-bottom:.4rem">Stage No: ______</div>
        <table><thead>
          <tr><th>Code Letter</th>${judges.map((j) => `<th>${escapeHtml(j)}</th>`).join("")}<th>Mark out of 100</th></tr>
        </thead><tbody>
          ${participants.map((s) => `<tr><td>${codeLetterFor(eventId, s.id)}</td>${judges.map(() => "<td>&nbsp;</td>").join("")}<td>&nbsp;</td></tr>`).join("")}
        </tbody></table>
        <div style="margin-top:1.25rem;font-size:.78rem">
          <div>Judge's Name and Signature :</div>
          <div style="margin-top:1rem">Judging Comments:</div>
        </div>`;
    } else if (kind === "Results") {
      const ranked = rankedParticipants(eventId).filter((r) => r.mark != null);
      const legacy = ["first", "second", "third"].map((rank) => {
        const entry = state.results[eventId] && state.results[eventId][rank];
        const st = entry ? state.students.find((s) => s.id === entry.studentId) : null;
        return st ? { student: st, mark: null } : null;
      }).filter(Boolean);
      const list = ranked.length ? ranked : legacy;
      body = `
        <div class="print-section-row"><b>${escapeHtml(event.name.toUpperCase())}</b><span>${event.type} \u2013 ${event.gender}</span><b>${event.category.toUpperCase()}</b></div>
        <table><thead><tr><th>Standing</th><th>Chest No</th><th>Candidate Name</th><th>Team</th><th>Grade</th><th>Points</th></tr></thead><tbody>
          ${list.map((r, i) => {
            const team = state.teams.find((t) => t.id === r.student.team);
            const points = i === 0 ? RANK_POINTS.first : i === 1 ? RANK_POINTS.second : i === 2 ? RANK_POINTS.third : null;
            return `<tr><td>${ORDINAL(i + 1)}</td><td>${r.student.chestNo}</td><td>${escapeHtml(r.student.name)}</td><td>${team ? escapeHtml(team.name) : ""}</td><td>${gradeFor(r.mark)}</td><td>${points ?? "-"}</td></tr>`;
          }).join("") || `<tr><td colspan="6" style="text-align:center;color:#999">No entries recorded yet.</td></tr>`}
        </tbody></table>
        <div class="print-footnote">Total entries: ${list.length}</div>`;
    } else {
      body = `
        <div class="print-section-row"><b>${escapeHtml(event.name.toUpperCase())}</b><b>${event.category.toUpperCase()}</b><span>${event.type}</span></div>
        <table><thead><tr><th>Sl. No</th><th>Chest No</th><th>Participant</th><th>Team Name</th></tr></thead><tbody>
          ${participants.map((s, i) => {
            const team = state.teams.find((t) => t.id === s.team);
            return `<tr><td>${i + 1}</td><td>${s.chestNo}</td><td>${escapeHtml(s.name)}</td><td>${team ? escapeHtml(team.name) : ""}</td></tr>`;
          }).join("")}
        </tbody></table>
        <div class="print-footnote">Total participants: ${participants.length}</div>`;
    }

    const printTitleText = `${kind} \u2014 ${event.name}`;
    const printContentHtml = `
      <div class="print-masthead"><b>${sectorLine}</b><span>${timestamp}</span></div>
      <div class="print-heading">${kind}</div>
      <hr class="print-hr" />
      ${body}`;
    document.getElementById("printTitle").textContent = printTitleText;
    document.getElementById("printContent").innerHTML = printContentHtml;
    document.getElementById("printOverlay").classList.remove("hidden");
    pushScreen(() => document.getElementById("printOverlay").classList.add("hidden"));
    showToast(`${kind} generated \u2014 programme marked in progress`);

    // Save a lightweight snapshot (just HTML text) to history — no PDF/image is ever stored.
    state.printHistory.unshift({
      id: uid(), kind, eventName: event.name, category: event.category,
      title: printTitleText, contentHtml: printContentHtml, savedAt: Date.now(),
    });
    if (state.printHistory.length > 200) state.printHistory.length = 200; // keep it bounded
    persist();
    if (document.getElementById("historyListWrap")) renderPrintHistoryList();
  }

  function reopenPrintHistoryEntry(entryId) {
    const entry = state.printHistory.find((h) => h.id === entryId);
    if (!entry) return;
    document.getElementById("printTitle").textContent = entry.title;
    document.getElementById("printContent").innerHTML = entry.contentHtml;
    document.getElementById("printOverlay").classList.remove("hidden");
    pushScreen(() => document.getElementById("printOverlay").classList.add("hidden"));
  }

  function deletePrintHistoryEntry(entryId) {
    state.printHistory = state.printHistory.filter((h) => h.id !== entryId);
    persist();
    renderPrintHistoryList();
  }

  function renderPrintHistoryList() {
    const wrap = document.getElementById("historyListWrap");
    if (!wrap) return;
    if (!state.printHistory.length) {
      wrap.innerHTML = `<div class="muted" style="font-size:.78rem;padding:.5rem 0">No sheets generated yet.</div>`;
      return;
    }
    wrap.innerHTML = state.printHistory.map((h) => {
      const d = new Date(h.savedAt);
      const when = d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `
      <div class="history-row" data-id="${h.id}">
        <div class="history-row-main">
          <div class="history-row-title">${escapeHtml(h.kind)} \u2014 ${escapeHtml(h.eventName)}</div>
          <div class="muted" style="font-size:.68rem">${escapeHtml(h.category)} \u00b7 ${when}</div>
        </div>
        <div class="history-dots-wrap">
          <button class="history-dots-btn" data-id="${h.id}">&#8942;</button>
          <div class="history-dots-menu hidden" data-id="${h.id}">
            <button class="history-menu-item" data-action="open" data-id="${h.id}">&#128065; Re-open</button>
            <button class="history-menu-item danger" data-action="delete" data-id="${h.id}">&#128465; Delete</button>
          </div>
        </div>
      </div>`;
    }).join("");

    document.querySelectorAll(".history-dots-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".history-dots-menu").forEach((m) => {
          if (m.dataset.id !== btn.dataset.id) m.classList.add("hidden");
        });
        wrap.querySelector(`.history-dots-menu[data-id="${btn.dataset.id}"]`).classList.toggle("hidden");
      });
    });
    document.querySelectorAll(".history-menu-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = item.dataset.id;
        if (item.dataset.action === "open") reopenPrintHistoryEntry(id);
        else if (confirm("Delete this saved sheet from history?")) deletePrintHistoryEntry(id);
        document.querySelectorAll(".history-dots-menu").forEach((m) => m.classList.add("hidden"));
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".history-dots-menu").forEach((m) => m.classList.add("hidden"));
    }, { once: true });
  }
  document.getElementById("btnPrintNow").addEventListener("click", () => window.print());
  document.getElementById("btnPrintClose").addEventListener("click", popScreen);

  function downloadCsv() {
    const rows = [["Chest No", "Name", "Class", "Phone", "Gender", "Category", "Team", "Programmes", "Rank Won"]];
    state.students.forEach((s) => {
      const team = state.teams.find((t) => t.id === s.team);
      const wonRanks = Object.entries(state.results)
        .filter(([, r]) => ["first", "second", "third"].some((k) => r && r[k] && r[k].studentId === s.id))
        .map(([eid, r]) => {
          const rank = ["first", "second", "third"].find((k) => r[k] && r[k].studentId === s.id);
          const ev = state.events.find((e) => e.id === eid);
          return `${ev ? ev.name : eid}:${rank}`;
        }).join("; ");
      rows.push([
        s.chestNo, s.name, s.cls, s.phone, s.gender, s.category, team ? team.name : "",
        s.events.map((id) => state.events.find((e) => e.id === id)?.name).filter(Boolean).join("; "),
        wonRanks,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadDataUrl(URL.createObjectURL(blob), "meeladfest-full-backup.csv");
    showToast("Full database exported as CSV");
  }

  /* ---------------- utils ---------------- */
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  /* ---------------- init ---------------- */
  function renderAll() {
    renderTicker(); renderHero(); renderCounters(); renderLeaderboard(); renderFilters(); renderResultsList(); renderGallery();
  }

  if (dataRef) {
    dataRef.on(
      "value",
      (snapshot) => {
        if (suppressNextPersist) { suppressNextPersist = false; return; }
        const remote = snapshot.val();
        if (remote) {
          state = remote;
          ensureStateDefaults();
        } else {
          // first time this project is used: seed Firebase with our starter data
          persist();
        }
        firebaseReady = true;
        renderAll();
      },
      (err) => {
        console.error("Firebase read failed, using local data only:", err);
        renderAll();
      }
    );
  } else {
    renderAll();
  }
})();
