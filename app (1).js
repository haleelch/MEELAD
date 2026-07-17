/* ============================================================
   Tharuwana Meelad Fest — app.js
   Plain JavaScript, no build step. Data lives in memory (seeded
   from the JSON embedded in index.html / data.json).

   TO CONNECT FIREBASE LATER: see FIREBASE-SETUP.md. The only
   places you need to touch are marked with "FIREBASE HOOK" below —
   swap the in-memory read/write for firebase.database() calls.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- data layer ---------------- */
  const seed = JSON.parse(document.getElementById("seed-data").textContent);
  const state = {
    hero: seed.hero,
    categories: seed.categories,
    limits: seed.limits,
    teams: seed.teams,
    events: seed.events,
    students: seed.students,
    results: seed.results,
    gallery: seed.gallery,
  };

  const uid = () => Math.random().toString(36).slice(2, 9);
  const CATEGORY_CODE = { "Sub Junior": "SJ", Junior: "JR", Senior: "SR", "Super Senior": "SS" };
  const RANK_POINTS = { first: 5, second: 3, third: 1 };
  const RANK_LABEL = { first: "1st Place", second: "2nd Place", third: "3rd Place" };
  const RANK_ICON = { first: "\u{1F947}", second: "\u{1F948}", third: "\u{1F949}" };

  // FIREBASE HOOK: call this after any state mutation. Right now it's a
  // no-op; once connected, write the relevant slice to your Realtime DB, e.g.
  //   firebase.database().ref('teams').set(state.teams)
  function persist() {}

  /* ---------------- toast ---------------- */
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  /* ---------------- back-navigation stack (for overlay screens) ---------------- */
  const screenStack = [];
  const btnBack = document.getElementById("btnBack");
  function pushScreen(closeFn) {
    screenStack.push(closeFn);
    btnBack.classList.remove("hidden");
  }
  function popScreen() {
    const fn = screenStack.pop();
    if (fn) fn();
    if (!screenStack.length) btnBack.classList.add("hidden");
  }
  btnBack.addEventListener("click", popScreen);

  // swipe right from the left edge to go back
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
  function openSidebar() { sidebar.classList.add("open"); sidebarOverlay.classList.remove("hidden"); }
  function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.add("hidden"); }
  document.getElementById("btnMenu").addEventListener("click", openSidebar);
  document.getElementById("btnCloseSidebar").addEventListener("click", closeSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);
  document.querySelectorAll(".side-link[data-nav]").forEach((a) => a.addEventListener("click", closeSidebar));
  document.getElementById("brandHome").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

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
    document.getElementById("brandTitle").textContent = state.hero.title;
    document.getElementById("brandSub").textContent = state.hero.subtitle.split("\u00b7").pop().trim() || state.hero.title;
    document.getElementById("heroTitle").textContent = state.hero.title;
    document.getElementById("heroSubtitle").textContent = state.hero.subtitle;
    document.getElementById("heroAyah").textContent = state.hero.ayah;
    document.getElementById("heroTags").innerHTML = [state.hero.tag1, state.hero.tag2, state.hero.tag3]
      .map((t) => `<span>${escapeHtml(t)}</span>`).join("");
  }

  /* ---------------- counters ---------------- */
  function renderCounters() {
    document.getElementById("cntProgrammes").textContent = state.events.length;
    document.getElementById("cntStudents").textContent = state.students.length;
    document.getElementById("cntTeams").textContent = state.teams.length;
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
        <div class="leaderboard-rank">#${i + 1}</div>
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

  function renderResultsList() {
    const search = document.getElementById("searchBox").value.trim().toLowerCase();
    const list = document.getElementById("resultsList");

    if (search) {
      const matches = state.students.filter((s) => s.name.toLowerCase().includes(search) || s.chestNo.toLowerCase().includes(search));
      list.innerHTML = matches.length
        ? matches.map((s) => {
            const team = state.teams.find((t) => t.id === s.team);
            return `<div class="result-row"><div><div class="result-name">${escapeHtml(s.name)}</div><div class="result-meta">${s.chestNo} \u00b7 ${s.category} \u00b7 ${team ? escapeHtml(team.name) : ""}</div></div><div class="result-meta">${s.events.length} events</div></div>`;
          }).join("")
        : `<div class="empty-note">No students found for "${escapeHtml(search)}".</div>`;
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
  function drawPoster(payload) {
    const template = state.hero.posterTemplate || "classic";
    const canvas = document.createElement("canvas");
    canvas.width = 900; canvas.height = 1125;
    const ctx = canvas.getContext("2d");
    const { rankLabel, line1, line2, line3, subtitle } = payload;

    if (template === "minimal") {
      ctx.fillStyle = "#FAF6EC"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#0B3D2E"; ctx.lineWidth = 3; ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
      ctx.textAlign = "center";
      ctx.fillStyle = "#0B3D2E"; ctx.font = "600 26px Georgia"; ctx.fillText(state.hero.title.toUpperCase(), canvas.width / 2, 170);
      ctx.fillStyle = "#C9A227"; ctx.font = "bold 28px Georgia"; ctx.fillText(rankLabel, canvas.width / 2, 480);
      ctx.fillStyle = "#0B3D2E"; ctx.font = "bold 56px Georgia"; ctx.fillText(line1, canvas.width / 2, 570);
      ctx.font = "26px Georgia"; ctx.fillStyle = "#155E43"; ctx.fillText(line2, canvas.width / 2, 620);
      ctx.font = "22px Georgia"; ctx.fillText(line3, canvas.width / 2, 660);
      ctx.fillStyle = "#8FA99A"; ctx.font = "18px Georgia"; ctx.fillText(subtitle, canvas.width / 2, canvas.height - 90);
    } else if (template === "bold") {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, "#8B2635"); grad.addColorStop(1, "#3A0F16");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#E4C767"; ctx.lineWidth = 8; ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
      ctx.textAlign = "center";
      ctx.fillStyle = "#E4C767"; ctx.font = "bold 34px Georgia"; ctx.fillText(state.hero.title, canvas.width / 2, 220);
      ctx.font = "italic 26px Georgia"; ctx.fillText(subtitle, canvas.width / 2, 265);
      ctx.fillStyle = "#fff"; ctx.font = "bold 34px Georgia"; ctx.fillText(rankLabel, canvas.width / 2, 500);
      ctx.font = "bold 58px Georgia"; ctx.fillText(line1, canvas.width / 2, 590);
      ctx.fillStyle = "#E4C767"; ctx.font = "28px Georgia"; ctx.fillText(line2, canvas.width / 2, 645);
      ctx.fillStyle = "#fff"; ctx.font = "24px Georgia"; ctx.fillText(line3, canvas.width / 2, 685);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, "#0B3D2E"); grad.addColorStop(1, "#0A2A20");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 6; ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
      ctx.lineWidth = 1.5; ctx.strokeRect(45, 45, canvas.width - 90, canvas.height - 90);
      ctx.beginPath(); ctx.arc(canvas.width / 2, 220, 150, Math.PI, 0);
      ctx.fillStyle = "rgba(201,162,39,0.12)"; ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = "#E4C767"; ctx.font = "italic 32px Georgia"; ctx.fillText(state.hero.ayah, canvas.width / 2, 140);
      ctx.fillStyle = "#FAF6EC"; ctx.font = "bold 44px Georgia"; ctx.fillText(state.hero.title, canvas.width / 2, 280);
      ctx.font = "22px Georgia"; ctx.fillStyle = "#C9A227"; ctx.fillText(subtitle, canvas.width / 2, 320);
      ctx.fillStyle = "#C9A227"; ctx.font = "bold 30px Georgia"; ctx.fillText(rankLabel, canvas.width / 2, 470);
      ctx.fillStyle = "#FAF6EC"; ctx.font = "bold 52px Georgia"; ctx.fillText(line1, canvas.width / 2, 560);
      ctx.font = "28px Georgia"; ctx.fillStyle = "#E4C767"; ctx.fillText(line2, canvas.width / 2, 615);
      ctx.font = "24px Georgia"; ctx.fillStyle = "#FAF6EC"; ctx.fillText(line3, canvas.width / 2, 660);
      ctx.fillStyle = "#9BBFAE"; ctx.font = "20px Georgia"; ctx.fillText(subtitle, canvas.width / 2, canvas.height - 80);
    }
    return canvas.toDataURL("image/png");
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- victory poster modal ---------------- */
  const modalOverlay = document.getElementById("modalOverlay");
  const modalBody = document.getElementById("modalBody");
  function closeModal() { modalOverlay.classList.add("hidden"); modalBody.innerHTML = ""; }
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) popScreen(); });

  function openPosterModal({ student, rank, event, team }) {
    modalBody.innerHTML = `
      <div class="poster-head arch-top">
        <div style="font-size:1.4rem;color:var(--gold)">\u2605</div>
        <div class="poster-rank">${RANK_LABEL[rank]}</div>
        <div class="poster-name font-display">${escapeHtml(student.name)}</div>
        <div class="poster-code">${student.chestNo}</div>
        <div class="poster-event">${escapeHtml(event.name)} \u00b7 ${escapeHtml(team.name)}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadPoster">\u2B07 Download Poster</button>
        <button class="btn btn-whatsapp" id="btnSharePoster">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnClosePoster">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    document.getElementById("btnDownloadPoster").addEventListener("click", () => {
      const url = drawPoster({
        rankLabel: RANK_LABEL[rank],
        line1: student.name, line2: student.chestNo, line3: team.name,
        subtitle: event.name,
      });
      downloadDataUrl(url, `${student.chestNo}-${rank}.png`);
      showToast("Poster downloaded");
    });
    document.getElementById("btnSharePoster").addEventListener("click", () => {
      const text = encodeURIComponent(`Alhamdulillah! ${student.name} (${student.chestNo}) secured ${RANK_LABEL[rank]} in ${event.name} at ${state.hero.title}, representing ${team.name}!`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    });
    document.getElementById("btnClosePoster").addEventListener("click", popScreen);
  }

  /* ---------------- gallery ---------------- */
  function renderGallery() {
    document.getElementById("galleryGrid").innerHTML = state.gallery.map((p) => `
      <div class="gallery-tile" data-id="${p.id}" style="background:linear-gradient(160deg, ${p.color}, #0B3D2E)">
        <span>${escapeHtml(p.caption)}</span>
      </div>`).join("");
    document.querySelectorAll(".gallery-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const photo = state.gallery.find((p) => p.id === tile.dataset.id);
        openGalleryLightbox(photo);
      });
    });
  }

  function openGalleryLightbox(photo) {
    modalBody.innerHTML = `
      <div class="gallery-preview" style="background:linear-gradient(160deg, ${photo.color}, #0B3D2E)">
        <div><div style="font-size:2.2rem;opacity:.7">\u{1F5BC}</div><div class="cap font-display">${escapeHtml(photo.caption)}</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="btnDownloadPhoto">\u2B07 Download Photo</button>
        <button class="btn btn-whatsapp" id="btnSharePhoto">\u{1F4AC} Share</button>
      </div>
      <button class="modal-close" id="btnCloseGallery">Close</button>`;
    modalOverlay.classList.remove("hidden");
    pushScreen(closeModal);

    document.getElementById("btnDownloadPhoto").addEventListener("click", () => {
      const url = drawPoster({ rankLabel: "MEMORY", line1: photo.caption, line2: "", line3: "", subtitle: "Event Gallery" });
      downloadDataUrl(url, `${photo.caption.replace(/\s+/g, "-")}.png`);
      showToast("Photo downloaded");
    });
    document.getElementById("btnSharePhoto").addEventListener("click", () => {
      const text = encodeURIComponent(`Check out this photo from ${state.hero.title} \u2014 "${photo.caption}"`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    });
    document.getElementById("btnCloseGallery").addEventListener("click", popScreen);
  }

  /* ---------------- admin: login ---------------- */
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "meelad786";
  const loginScreen = document.getElementById("adminLoginScreen");
  const adminScreen = document.getElementById("adminScreen");

  function closeLoginScreen() { loginScreen.classList.add("hidden"); }
  function closeAdminScreen() { adminScreen.classList.add("hidden"); }

  document.getElementById("btnAdminMode").addEventListener("click", () => {
    closeSidebar();
    document.getElementById("adminUser").value = "";
    document.getElementById("adminPass").value = "";
    document.getElementById("adminError").classList.add("hidden");
    loginScreen.classList.remove("hidden");
    pushScreen(closeLoginScreen);
  });
  document.getElementById("btnAdminCancel").addEventListener("click", popScreen);
  document.getElementById("btnAdminLogin").addEventListener("click", () => {
    const u = document.getElementById("adminUser").value.trim();
    const p = document.getElementById("adminPass").value;
    const errEl = document.getElementById("adminError");
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      popScreen(); // close login
      adminScreen.classList.remove("hidden");
      pushScreen(closeAdminScreen);
      renderAdminTab("poster");
      showToast("Welcome, Ustadh \u2014 Admin Mode active");
    } else {
      errEl.textContent = "Invalid credentials. Try username 'admin' and password 'meelad786'.";
      errEl.classList.remove("hidden");
    }
  });
  document.getElementById("btnAdminExit").addEventListener("click", popScreen);

  /* ---------------- admin: tabs ---------------- */
  const adminContent = document.getElementById("adminContent");
  document.querySelectorAll(".atab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".atab").forEach((b) => b.classList.toggle("active", b === btn));
      renderAdminTab(btn.dataset.tab);
    });
  });

  function renderAdminTab(tab) {
    if (tab === "poster") return renderPosterTab();
    if (tab === "teams") return renderTeamsTab();
    if (tab === "events") return renderEventsTab();
    if (tab === "limits") return renderLimitsTab();
    if (tab === "students") return renderStudentsTab();
    if (tab === "export") return renderExportTab();
  }

  /* ---- Poster tab ---- */
  const POSTER_TEMPLATES = [
    { id: "classic", label: "Classic Emerald", bg: "linear-gradient(135deg,#0B3D2E,#155E43)", fg: "#E4C767" },
    { id: "minimal", label: "Minimal Cream", bg: "#FAF6EC", fg: "#0B3D2E" },
    { id: "bold", label: "Bold Crimson", bg: "linear-gradient(135deg,#8B2635,#3A0F16)", fg: "#E4C767" },
  ];
  function renderPosterTab() {
    const h = state.hero;
    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Poster Template</div>
        <div class="template-row" id="templateRow">
          ${POSTER_TEMPLATES.map((t) => `
            <div class="template-swatch ${h.posterTemplate === t.id ? "selected" : ""}" data-tpl="${t.id}" style="background:${t.bg};color:${t.fg}">${t.label}</div>`).join("")}
        </div>
        <div class="card-title">Home Page Poster</div>
        <div class="field-label">Fest Title (used on posters &amp; WhatsApp share text too)</div>
        <input id="fTitle" class="input" style="margin-bottom:.5rem" value="${escapeAttr(h.title)}" />
        <div class="field-label">Subtitle / Date &amp; Venue</div>
        <input id="fSubtitle" class="input" style="margin-bottom:.5rem" value="${escapeAttr(h.subtitle)}" />
        <div class="field-label">Arabic Line</div>
        <input id="fAyah" class="input" style="margin-bottom:.75rem;direction:rtl;font-family:'Amiri',serif" value="${escapeAttr(h.ayah)}" />
        <div class="field-label">Three Badges</div>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.75rem">
          <input id="fTag1" class="input" value="${escapeAttr(h.tag1)}" />
          <input id="fTag2" class="input" value="${escapeAttr(h.tag2)}" />
          <input id="fTag3" class="input" value="${escapeAttr(h.tag3)}" />
        </div>
        <button class="btn btn-primary" id="btnSavePoster" style="width:auto;padding:.6rem 1rem">\u2713 Save Poster</button>
      </div>
      <div class="muted" style="font-size:.72rem">Preview updates live on the Home page as soon as you save. The template you pick here is also used for the "Download Poster" button parents see on results and gallery photos.</div>`;

    document.querySelectorAll(".template-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll(".template-swatch").forEach((s) => s.classList.remove("selected"));
        sw.classList.add("selected");
      });
    });
    document.getElementById("btnSavePoster").addEventListener("click", () => {
      const selectedTpl = document.querySelector(".template-swatch.selected");
      state.hero = {
        title: document.getElementById("fTitle").value || h.title,
        subtitle: document.getElementById("fSubtitle").value,
        ayah: document.getElementById("fAyah").value,
        tag1: document.getElementById("fTag1").value,
        tag2: document.getElementById("fTag2").value,
        tag3: document.getElementById("fTag3").value,
        posterTemplate: selectedTpl ? selectedTpl.dataset.tpl : h.posterTemplate,
      };
      persist();
      renderHero();
      showToast("Home page poster updated");
    });
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
            <div class="muted" style="font-size:.7rem">${e.category} \u00b7 ${e.type} \u00b7 ${e.gender} \u00b7 ${participants.length} registered</div>
          </div>
          <div style="display:flex;gap:.4rem;align-items:center">
            <button class="chip" data-result="${e.id}" style="border:none">${state.results[e.id] ? "Edit Result" : "Enter Result"}</button>
            <button class="trash-btn" data-id="${e.id}">\u{1F5D1}</button>
          </div>
        </div>
        <div id="resultEntry-${e.id}"></div>
      </div>`;
    }).join("");
    document.querySelectorAll("#eventsListWrap .trash-btn").forEach((b) => b.addEventListener("click", () => {
      state.events = state.events.filter((e) => e.id !== b.dataset.id);
      persist(); renderCounters(); renderTicker(); renderFilters(); renderResultsList(); renderEventsTab();
    }));
    document.querySelectorAll("#eventsListWrap [data-result]").forEach((b) => b.addEventListener("click", () => {
      const eid = b.dataset.result;
      const holder = document.getElementById(`resultEntry-${eid}`);
      holder.innerHTML = holder.innerHTML ? "" : renderResultEntryForm(eid);
      if (holder.innerHTML) wireResultEntryForm(eid);
    }));
  }
  function renderResultEntryForm(eventId) {
    const event = state.events.find((e) => e.id === eventId);
    const participants = state.students.filter((s) => s.events.includes(eventId));
    const current = state.results[eventId] || {};
    const opts = (rank) => `<option value="">\u2014 none \u2014</option>` + participants.map((s) =>
      `<option value="${s.id}" ${current[rank] && current[rank].studentId === s.id ? "selected" : ""}>${escapeHtml(s.name)} (${s.chestNo})</option>`).join("");
    return `<div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border)">
      ${["first", "second", "third"].map((rank) => `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
          <div class="muted" style="width:4rem;font-size:.7rem;text-transform:capitalize">${rank}</div>
          <select class="input" data-rank-select="${rank}" data-event="${eventId}" style="flex:1;padding:.4rem .5rem;font-size:.75rem">${opts(rank)}</select>
        </div>`).join("")}
      <button class="btn btn-primary" data-save-result="${eventId}" style="width:auto;padding:.5rem .9rem;font-size:.75rem">Save Result</button>
    </div>`;
  }
  function wireResultEntryForm(eventId) {
    document.querySelectorAll(`[data-save-result="${eventId}"]`).forEach((btn) => btn.addEventListener("click", () => {
      const result = state.results[eventId] || {};
      document.querySelectorAll(`[data-event="${eventId}"][data-rank-select]`).forEach((sel) => {
        const rank = sel.dataset.rankSelect;
        result[rank] = sel.value ? { studentId: sel.value } : null;
      });
      state.results[eventId] = result;
      persist(); renderLeaderboard(); renderResultsList(); showToast("Result saved & published");
    }));
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

  /* ---- Students tab ---- */
  let studentForm = { gender: "Boys", category: state.categories[0], team: state.teams[0] ? state.teams[0].id : "", events: [] };
  function renderStudentsTab() {
    studentForm.team = studentForm.team || (state.teams[0] ? state.teams[0].id : "");
    const eligible = state.events.filter((e) => e.category === studentForm.category && (e.gender === studentForm.gender || e.gender === "General"));
    const selIndiv = studentForm.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Individual").length;
    const selGroup = studentForm.events.filter((id) => state.events.find((e) => e.id === id)?.type === "Group").length;

    adminContent.innerHTML = `
      <div class="card">
        <div class="card-title">Register Student</div>
        <div class="grid2" style="margin-bottom:.5rem">
          <input id="sName" class="input" placeholder="Full Name" />
          <input id="sClass" class="input" placeholder="Class" />
        </div>
        <input id="sPhone" class="input" placeholder="Phone" style="margin-bottom:.5rem" />
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
      <div id="studentsListWrap"></div>`;

    renderStudentsList();

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
      const name = document.getElementById("sName").value.trim();
      if (!name) return showToast("Student name is required");
      if (!studentForm.team) return showToast("Please select a team");
      const code = CATEGORY_CODE[studentForm.category] + (studentForm.gender === "Boys" ? "B" : "G");
      const count = state.students.filter((s) => s.chestNo.startsWith(code)).length + 1;
      const chestNo = `${code}-${String(count).padStart(2, "0")}`;
      state.students.push({
        id: uid(), name, cls: document.getElementById("sClass").value, phone: document.getElementById("sPhone").value,
        gender: studentForm.gender, team: studentForm.team, category: studentForm.category, chestNo, events: [...studentForm.events],
      });
      persist(); renderCounters();
      showToast(`Student registered \u2014 chest no. ${chestNo}`);
      studentForm.events = [];
      renderStudentsTab();
    });
  }
  function renderStudentsList() {
    document.getElementById("studentsListWrap").innerHTML = state.students.map((s) => {
      const team = state.teams.find((t) => t.id === s.team);
      return `<div class="card">
        <div class="row-between">
          <div>
            <div style="font-size:.85rem;font-weight:500">${escapeHtml(s.name)} <span style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--gold)">${s.chestNo}</span></div>
            <div class="muted" style="font-size:.7rem">${s.category} \u00b7 ${s.gender} \u00b7 ${team ? escapeHtml(team.name) : ""} \u00b7 ${s.events.length} events</div>
          </div>
          <button class="trash-btn" data-id="${s.id}">\u{1F5D1}</button>
        </div>
      </div>`;
    }).join("");
    document.querySelectorAll("#studentsListWrap .trash-btn").forEach((b) => b.addEventListener("click", () => {
      state.students = state.students.filter((s) => s.id !== b.dataset.id);
      persist(); renderCounters(); renderStudentsTab();
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
      <button class="btn btn-primary" id="btnExportCsv" style="width:100%;margin-top:1.25rem;padding:.75rem">\u{1F4CA} Download Full Database (CSV)</button>`;

    renderChecklist();
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
    const result = state.results[eventId];
    let body;
    if (kind === "Green Room Sign") {
      body = `<div style="text-align:center;padding:3rem 1rem;border:4px solid #C9A227">
        <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.1em;color:#8FA99A">Green Room</div>
        <div class="font-display" style="font-size:1.9rem;margin:.75rem 0;color:#0B3D2E">${escapeHtml(event.name)}</div>
        <div style="font-size:.85rem">${event.category} \u00b7 ${event.gender} \u00b7 ${event.type}</div>
      </div>`;
    } else if (kind === "Results") {
      body = `<table><thead><tr><th>Rank</th><th>Name</th><th>Chest No</th><th>Team</th></tr></thead><tbody>
        ${["first", "second", "third"].map((rank) => {
          const entry = result && result[rank];
          const st = entry ? state.students.find((s) => s.id === entry.studentId) : null;
          const team = st ? state.teams.find((t) => t.id === st.team) : null;
          return `<tr><td style="text-transform:capitalize">${rank}</td><td>${st ? escapeHtml(st.name) : "\u2014"}</td><td>${st ? st.chestNo : "\u2014"}</td><td>${team ? escapeHtml(team.name) : "\u2014"}</td></tr>`;
        }).join("")}
      </tbody></table>`;
    } else {
      body = `<table><thead><tr><th>S.No</th><th>Chest No</th><th>Name</th><th>Phone</th><th>Team</th>${kind === "Valuation Sheet" ? "<th>Marks</th>" : ""}</tr></thead><tbody>
        ${participants.map((s, i) => {
          const team = state.teams.find((t) => t.id === s.team);
          return `<tr><td>${i + 1}</td><td>${s.chestNo}</td><td>${escapeHtml(s.name)}</td><td>${s.phone || ""}</td><td>${team ? escapeHtml(team.name) : ""}</td>${kind === "Valuation Sheet" ? "<td>&nbsp;</td>" : ""}</tr>`;
        }).join("")}
      </tbody></table>`;
    }

    document.getElementById("printTitle").textContent = `${kind} \u2014 ${event.name}`;
    document.getElementById("printContent").innerHTML = `
      <div style="text-align:center;margin-bottom:1rem">
        <div class="font-display" style="font-size:1.1rem;color:#0B3D2E">${escapeHtml(state.hero.title)}</div>
        <div class="muted" style="font-size:.72rem">${kind} \u00b7 ${escapeHtml(event.name)} \u00b7 ${event.category} (${event.gender})</div>
      </div>${body}`;
    document.getElementById("printOverlay").classList.remove("hidden");
    pushScreen(() => document.getElementById("printOverlay").classList.add("hidden"));
    showToast(`${kind} generated \u2014 programme marked in progress`);
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
  renderAll();
})();
