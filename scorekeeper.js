(function () {
  "use strict";

  const STORAGE_KEY = "liquan_mahjong_session";
  const INITIAL_SCORE = 20;
  const SEAT_LABELS = ["东", "南", "西", "北"];
  const appState = {
    session: null,
    lastRound: null,
    scoreboardExpanded: false,
  };

  const FAN_TYPES = [
    { id: "putong", name: "普通胡", score: 2 },
    { id: "bianzhang", name: "边张", score: 3 },
    { id: "jiazhang", name: "夹张", score: 3 },
    { id: "husanzhang", name: "胡三张", score: 4 },
    { id: "pengpeng", name: "碰碰胡", score: 4 },
    { id: "qingyise", name: "清一色", score: 5 },
    { id: "qidui", name: "七对", score: 5 },
    { id: "jingoudiao", name: "金钩吊", score: 5 },
    { id: "qingqidui", name: "清七对", score: 7 },
  ];

  function saveSession(session) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function init() {
    setupPlayerCountToggle();
    const existing = loadSession();
    if (existing && existing.players && existing.players.length >= 4) {
      existing.playerCount = existing.playerCount ?? existing.players.length;
      existing.initialScore = existing.initialScore ?? INITIAL_SCORE;
      startGame(existing);
    } else {
      document.getElementById("session-setup").classList.remove("hidden");
      document.getElementById("game-panel").classList.add("hidden");
    }

    document.getElementById("new-session-btn")?.addEventListener("click", () => {
      if (!confirm("确定要开始新对局吗？当前对局数据将被清空。")) return;
      localStorage.removeItem(STORAGE_KEY);
      document.getElementById("session-setup").classList.remove("hidden");
      document.getElementById("game-panel").classList.add("hidden");
    });

    document.getElementById("new-session-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const playerCount = parseInt(document.getElementById("player-count")?.value || "4", 10) || 4;
      const initialScore = parseInt(form.elements.initialScore.value, 10) || INITIAL_SCORE;
      const players = [];
      for (let i = 0; i < playerCount; i++) {
        const val = form.elements["p" + i]?.value?.trim();
        players.push(val || "玩家" + (i + 1));
      }
      const session = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        playerCount,
        initialScore,
        players,
        rounds: [],
      };
      saveSession(session);
      startGame(session);
    });
  }

  function setupPlayerCountToggle() {
    const countSel = document.getElementById("player-count");
    const container = document.getElementById("player-inputs");
    if (!countSel || !container) return;
    const sync = () => {
      const n = parseInt(countSel.value, 10) || 4;
      container.innerHTML = [...Array(n)]
        .map(
          (_, i) =>
            `<label><span>玩家${i + 1}</span><input type="text" class="player-name-input" name="p${i}" placeholder="玩家${i + 1}"></label>`
        )
        .join("");
    };
    countSel.addEventListener("change", sync);
    sync();
  }

  function startGame(session) {
    document.getElementById("session-setup").classList.add("hidden");
    document.getElementById("game-panel").classList.remove("hidden");

    const state = appState;
    state.session = session;
    state.lastRound = null;
    state.scoreboardExpanded = false;
    renderTablePlayersRow(state);
    renderScoreboard(state);
    renderWinForm(state);
    renderLiujuForm(state);
    bindRoundForms(state);
    bindRoundTypeTabs(state);
    bindWinTypeToggle(state);
    bindPenaltyTabs();
    bindChickenPresenceTabs();
    bindChickenModeTabs();
    bindChickenToggle(state);
    bindKongButtons(state);
    bindLiveSummary(state);
    bindScoreboardToggle(state);
    bindUndoRound(state);
    renderHistory(state);
    renderRoundSummary(state);
  }

  function bindScoreboardToggle(state) {
    const btn = document.getElementById("scoreboard-toggle-btn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      state.scoreboardExpanded = !state.scoreboardExpanded;
      renderScoreboard(state);
    });
  }

  function getTablePlayers(state) {
    const n = state.session.players.length;
    if (n === 4) return [0, 1, 2, 3];
    const row = document.getElementById("table-player-seats");
    if (!row) return [0, 1, 2, 3];
    const selected = SEAT_LABELS.map((_, seatIdx) => {
      const select = row.querySelector(`select[name="seatPlayer_${seatIdx}"]`);
      return parseInt(select?.value, 10);
    }).filter((value) => !Number.isNaN(value));
    return [...new Set(selected)].length === 4 ? selected : [0, 1, 2, 3];
  }

  function getSeatAssignments(state) {
    const players = getTablePlayers(state);
    return SEAT_LABELS.map((seat, idx) => ({ seat, playerIndex: players[idx] }));
  }

  function renderTablePlayersRow(state) {
    const row = document.getElementById("table-players-row");
    const container = document.getElementById("table-player-seats");
    if (!row || !container) return;
    const n = state.session.players.length;
    row.classList.toggle("hidden", n <= 4);
    if (n <= 4) return;
    const current = getTablePlayers(state);
    container.innerHTML = SEAT_LABELS.map((seat, seatIdx) => {
      const options = state.session.players
        .map((name, playerIdx) => `<option value="${playerIdx}" ${current[seatIdx] === playerIdx ? "selected" : ""}>${escapeHtml(name)}</option>`)
        .join("");
      return `<div class="seat-card">
        <span class="seat-badge">${seat}位</span>
        <div class="seat-preview">${escapeHtml(state.session.players[current[seatIdx]] || "")}</div>
        <label>选择玩家</label>
        <select name="seatPlayer_${seatIdx}">${options}</select>
      </div>`;
    }).join("");
    if (!container.dataset.bound) {
      container.dataset.bound = "1";
      container.addEventListener("change", (e) => {
        if (e.target.name.startsWith("seatPlayer_")) {
          normalizeSeatSelection(container);
          syncSeatPreview(container, state.session.players);
          renderWinForm(state);
          renderLiujuForm(state);
          renderRoundSummary(state);
        }
      });
    }
    syncSeatPreview(container, state.session.players);
  }

  function normalizeSeatSelection(container) {
    const selects = Array.from(container.querySelectorAll('select[name^="seatPlayer_"]'));
    const used = new Set();
    selects.forEach((select) => {
      if (!used.has(select.value)) {
        used.add(select.value);
        return;
      }
      const fallback = Array.from(select.options).find((option) => !used.has(option.value));
      if (fallback) {
        select.value = fallback.value;
        used.add(fallback.value);
      }
    });
  }

  function syncSeatPreview(container, players) {
    Array.from(container.querySelectorAll(".seat-card")).forEach((card, idx) => {
      const select = card.querySelector(`select[name="seatPlayer_${idx}"]`);
      const preview = card.querySelector(".seat-preview");
      if (!select || !preview) return;
      preview.textContent = players[parseInt(select.value, 10)] || "";
    });
  }

  function getTotals(session) {
    const n = session.players.length;
    const base = session.initialScore ?? INITIAL_SCORE;
    return [...Array(n)].map((_, i) =>
      base + session.rounds.reduce((s, r) => s + (r.scores[i] || 0), 0)
    );
  }

  function renderScoreboard(state) {
    const { session } = state;
    const totals = getTotals(session);
    const latestRound = session.rounds[session.rounds.length - 1];
    const seatAssignments = getSeatAssignments(state);
    const subtitle = document.getElementById("scoreboard-subtitle");
    if (subtitle) {
      subtitle.textContent = session.rounds.length
        ? `已记录 ${session.rounds.length} 局，最近一局：${formatRoundSummary(session, latestRound, session.rounds.length)}`
        : "新大局已开始";
    }
    const details = document.getElementById("scoreboard-details");
    const toggleBtn = document.getElementById("scoreboard-toggle-btn");
    if (details) details.classList.toggle("hidden", !state.scoreboardExpanded);
    if (toggleBtn) toggleBtn.textContent = state.scoreboardExpanded ? "收起四家积分" : "展开四家积分";

    const sorted = totals.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranks = Array(totals.length);
    sorted.forEach(({ i }, rank) => { ranks[i] = rank + 1; });

    const el = document.getElementById("total-scores");
    el.innerHTML = sorted
      .map(({ i }) => {
        const score = totals[i];
        const delta = latestRound ? latestRound.scores[i] || 0 : 0;
        const seat = seatAssignments.find((item) => item.playerIndex === i)?.seat;
        const rank = ranks[i];
        let cls = "score-item";
        if (score <= 0) cls += " danger busted";
        else if (score > 0) cls += " positive";
        else cls += " negative";
        return `<div class="${cls}" data-rank="${rank}">
          <span class="score-rank">#${rank}</span>
          <div class="score-body">
            <div class="score-top">
              <span class="name">${escapeHtml(session.players[i])}</span>
              <span class="seat-tag">${seat ? `${seat}位` : `P${i + 1}`}</span>
            </div>
            <div class="score-foot">
              <span class="value">${score}</span>
              <span class="delta ${deltaClass(delta)}">${deltaLabel(delta)}</span>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function renderWinForm(state) {
    const { session } = state;
    const players = session.players;
    const tablePlayers = getTablePlayers(state);

    const fillSelect = (selId, exclude) => {
      const sel = document.querySelector(selId);
      if (!sel) return;
      sel.innerHTML = tablePlayers
        .map((i) =>
          exclude !== undefined && i === exclude
            ? ""
            : `<option value="${i}">${escapeHtml(players[i])}</option>`
        )
        .filter(Boolean)
        .join("");
    };

    fillSelect("#win-form select[name=feeder]");

    const winnerEl = document.getElementById("winner-checkboxes");
    winnerEl.innerHTML = tablePlayers
      .map(
        (i) =>
          `<label><input type="checkbox" name="winner" value="${i}">${escapeHtml(players[i])}</label>`
      )
      .join("");

    updatePenaltyInputs(state);

    const tianqueEl = document.getElementById("tianque-checkboxes");
    tianqueEl.innerHTML = tablePlayers
      .map(
        (i) =>
          `<label><input type="checkbox" name="tianque" value="${i}">${escapeHtml(players[i])}</label>`
      )
      .join("");

    updateFanSelects(state);
    updateChickenInputs(state);
    const chickenEnabled = document.querySelector('#win-form input[name="chickenEnabled"]')?.value === "yes";
    document.querySelector(".chicken-mode-row")?.classList.toggle("hidden", !chickenEnabled);
    document.querySelector(".chicken-count-row")?.classList.toggle("hidden", !chickenEnabled);
    renderKongList(state, "kong-list", tablePlayers);
    renderSpecialList(state, "special-list", tablePlayers);
  }

  function bindChickenModeTabs() {
    const modeInput = document.querySelector('#win-form input[name="chickenMode"]');
    const tabs = document.querySelectorAll(".chicken-mode-tabs .tab");
    if (!modeInput || !tabs.length || tabs[0].dataset.bound) return;
    tabs.forEach((btn) => {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const val = btn.dataset.chicken;
        modeInput.value = val;
        tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function bindChickenPresenceTabs() {
    const enabledInput = document.querySelector('#win-form input[name="chickenEnabled"]');
    const tabs = document.getElementById("chicken-presence-tabs");
    const modeRow = document.querySelector(".chicken-mode-row");
    const countRow = document.querySelector(".chicken-count-row");
    if (!enabledInput || !tabs || tabs.dataset.bound) return;
    tabs.dataset.bound = "1";
    tabs.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.chickenEnabled;
        enabledInput.value = val;
        tabs.querySelectorAll(".tab").forEach((node) => node.classList.remove("active"));
        btn.classList.add("active");
        const show = val === "yes";
        modeRow?.classList.toggle("hidden", !show);
        countRow?.classList.toggle("hidden", !show);
        if (!show) {
          document.querySelector('#win-form input[name="chickenMode"]').value = "no";
          document.querySelectorAll(".chicken-mode-tabs .tab").forEach((node) => {
            node.classList.toggle("active", node.dataset.chicken === "no");
          });
          document.querySelectorAll('#chicken-inputs input[type="number"]').forEach((input) => {
            input.value = "0";
          });
        }
      });
    });
  }

  function renderLiujuForm(state) {
    const { session } = state;
    const tablePlayers = getTablePlayers(state);
    const el = document.getElementById("liuju-ting-checkboxes");
    el.innerHTML = tablePlayers
      .map(
        (i) =>
          `<label><input type="checkbox" name="ting" value="${i}">${escapeHtml(session.players[i])}</label>`
      )
      .join("");
    renderKongList(state, "liuju-kong-list", tablePlayers);
    renderSpecialList(state, "liuju-special-list", tablePlayers);
  }

  function renderRoundSummary(state) {
    const el = document.getElementById("round-summary");
    if (!el || !state?.session) return;
    const { players } = state.session;
    const activeType = document.querySelector(".round-type-tabs .tab.active")?.dataset.type || "win";
    let main = "";
    const items = [];

    if (activeType === "liuju") {
      const ting = Array.from(document.querySelectorAll('#liuju-ting-checkboxes input[name="ting"]:checked')).map((c) =>
        state.session.players[parseInt(c.value, 10)]
      );
      const liujuKongText = buildKongSummaryText("liuju-kong-list", players);
      const liujuSpecialText = buildSpecialSummaryText("liuju-special-list", players);
      main = ting.length ? `流局，${ting.join("、")} 听牌` : "流局，待选择听牌者";
      items.push({ label: "听牌", value: ting.length ? ting.join("、") : "待选择" });
      items.push({ label: "杠牌", value: liujuKongText });
      items.push({ label: "特殊", value: liujuSpecialText });
    } else {
      const tablePlayers = getTablePlayers(state);
      const winType = document.querySelector('#win-form input[name="winType"]')?.value || "zimo";
      const winners = Array.from(document.querySelectorAll('#winner-checkboxes input[name="winner"]:checked')).map((c) =>
        parseInt(c.value, 10)
      );
      const winnerNames = winners.map((i) => state.session.players[i]);
      const feederIdx = parseInt(document.querySelector('#win-form select[name="feeder"]')?.value, 10);
      const feederName = Number.isNaN(feederIdx) ? "" : state.session.players[feederIdx];
      const chickenEnabled = document.querySelector('#win-form input[name="chickenEnabled"]')?.value === "yes";
      const chickenMode = chickenEnabled && document.querySelector('#win-form input[name="chickenMode"]')?.value === "yes";
      const penaltyMode = document.querySelector('#win-form input[name="penaltyMode"]')?.value === "yes";
      const kongText = buildKongSummaryText("kong-list", players);
      const specialText = buildSpecialSummaryText("special-list", players);
      const tianque = Array.from(document.querySelectorAll('#tianque-checkboxes input[name="tianque"]:checked')).map((c) =>
        state.session.players[parseInt(c.value, 10)]
      );
      const penaltyEntries = penaltyMode
        ? tablePlayers
            .map((i) => {
              const input = document.querySelector(`#penalty-inputs input[name="penalty_${i}"]`);
              const count = parseInt(input?.value, 10) || 0;
              return count > 0 ? `${state.session.players[i]}${count}` : null;
            })
            .filter(Boolean)
        : [];
      const chickenEntries = chickenEnabled
        ? tablePlayers
            .map((i) => {
              const input = document.querySelector(`#chicken-inputs input[name="chicken_${i}"]`);
              const count = parseInt(input?.value, 10) || 0;
              return count > 0 ? `${state.session.players[i]} ${count}` : null;
            })
            .filter(Boolean)
        : [];
      const fanEntries = winners
        .map((i) => {
          const fanId = document.querySelector(`#fan-select-container select[name="fan_${i}"]`)?.value;
          const fan = FAN_TYPES.find((entry) => entry.id === fanId);
          return fan ? fan.name : null;
        })
        .filter(Boolean);
      if (!winnerNames.length) {
        main = winType === "dianpao" ? "点炮局，待选择胡牌者和点炮者" : "自摸局，待选择胡牌者";
      } else {
        const segments = [
          `${winType === "dianpao" ? "点炮胡牌" : "自摸胡牌"}`,
          `胡牌者：${winnerNames.join("、")}`,
        ];
        if (winType === "dianpao") segments.push(`点炮者：${feederName || "待选择"}`);
        if (fanEntries.length) segments.push(`番型：${fanEntries.join("、")}`);
        main = segments.join("，");
      }
      items.push({ label: "天缺", value: tianque.length ? tianque.join("、") : "无" });
      items.push({ label: "查缺", value: penaltyMode ? "是" : "否" });
      items.push({ label: "缺门", value: penaltyEntries.length ? penaltyEntries.join("、") : "无" });
      items.push({ label: "鸡牌", value: chickenEnabled ? "是" : "否" });
      items.push({ label: "金鸡", value: chickenEnabled ? (chickenMode ? "是" : "否") : "无" });
      items.push({ label: "鸡数", value: chickenEntries.length ? chickenEntries.join("、") : "无" });
      items.push({ label: "杠牌", value: kongText });
      items.push({ label: "特殊", value: specialText });
    }

    el.innerHTML = `
      <p class="round-summary-title">当前录入摘要</p>
      <p class="round-summary-main">${escapeHtml(main)}</p>
      <div class="round-summary-list">
        ${items.map((row) => `
          <div class="summary-cell">
            <span class="summary-label">${escapeHtml(row.label)}</span>
            <span class="summary-value">${escapeHtml(row.value)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function buildKongSummaryText(listId, players) {
    const list = document.getElementById(listId);
    if (!list) return "无";
    const rows = Array.from(list.querySelectorAll(".kong-item"));
    if (!rows.length) return "无";
    return rows
      .map((row) => {
        const konger = parseInt(row.querySelector('select[name="konger"]')?.value, 10);
        const type = row.querySelector('input[name="kongType"]')?.value || "zigang";
        const feeder = parseInt(row.querySelector('select[name="kongFeeder"]')?.value, 10);
        const kongerName = Number.isNaN(konger) ? "未选玩家" : players[konger];
        if (type === "fanggang") {
          const feederName = Number.isNaN(feeder) ? "待补放杠者" : players[feeder];
          return `${kongerName} 放杠（${feederName}）`;
        }
        return `${kongerName} 自杠`;
      })
      .join("、");
  }

  function collectSpecials(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    return Array.from(list.querySelectorAll(".special-item"))
      .map((item) => {
        const from = parseInt(item.querySelector('select[name="specialFrom"]')?.value, 10);
        const to = parseInt(item.querySelector('select[name="specialTo"]')?.value, 10);
        const amount = parseInt(item.querySelector('input[name="specialAmount"]')?.value, 10) || 0;
        if (Number.isNaN(from) || Number.isNaN(to) || from === to || amount <= 0) return null;
        return { from, to, amount };
      })
      .filter(Boolean);
  }

  function buildSpecialSummaryText(listId, players) {
    const rows = collectSpecials(listId);
    if (!rows.length) return "无";
    return rows
      .map((row) => `${players[row.from]} 付 ${players[row.to]} ${row.amount}分`)
      .join("、");
  }

  function appendKongItem(listEl, tablePlayers, players) {
    const item = document.createElement("div");
    item.className = "kong-item";
    const opts = tablePlayers.map((i) => `<option value="${i}">${players[i]}</option>`).join("");
    item.innerHTML = `
      <div class="kong-main">
        <label class="kong-field">
          <span class="kong-label">谁杠了</span>
          <select name="konger">${opts}</select>
        </label>
        <div class="kong-field">
          <div class="kong-type-toggle">
            <button type="button" class="tab active" data-kong-type="zigang">自杠</button>
            <button type="button" class="tab" data-kong-type="fanggang">放杠</button>
          </div>
          <input type="hidden" name="kongType" class="kong-type-select" value="zigang">
        </div>
        <label class="kong-field kong-feeder-field hidden">
          <span class="kong-label">谁放的</span>
          <select name="kongFeeder" class="kong-feeder-select">
            <option value="">请选择</option>
            ${tablePlayers.map((i) => `<option value="${i}">${players[i]}</option>`).join("")}
          </select>
        </label>
      </div>
      <button type="button" class="btn-remove btn-ghost">删除</button>
    `;
    const typeSel = item.querySelector(".kong-type-select");
    const feederField = item.querySelector(".kong-feeder-field");
    const feederSel = item.querySelector(".kong-feeder-select");
    const typeButtons = item.querySelectorAll(".kong-type-toggle .tab");
    const updateFeeder = () => {
      feederField.classList.toggle("hidden", typeSel.value !== "fanggang");
      if (typeSel.value !== "fanggang" && feederSel) feederSel.value = "";
    };
    typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        typeSel.value = btn.dataset.kongType;
        typeButtons.forEach((node) => node.classList.toggle("active", node === btn));
        updateFeeder();
      });
    });
    item.querySelector(".btn-remove").addEventListener("click", () => item.remove());
    updateFeeder();
    listEl.appendChild(item);
  }

  function appendSpecialItem(listEl, tablePlayers, players) {
    const opts = tablePlayers.map((i) => `<option value="${i}">${players[i]}</option>`).join("");
    const item = document.createElement("div");
    item.className = "special-item";
    item.innerHTML = `
      <div class="special-main">
        <label class="special-field special-inline">
          <span class="special-inline-text">由</span>
          <select name="specialFrom">${opts}</select>
        </label>
        <label class="special-field special-inline">
          <span class="special-inline-text">付给</span>
          <select name="specialTo">${opts}</select>
        </label>
        <label class="special-field special-inline special-amount-field">
          <span class="special-inline-text">分数</span>
          <input type="number" name="specialAmount" min="1" step="1" value="1">
        </label>
      </div>
      <button type="button" class="btn-remove btn-ghost">删除</button>
    `;
    item.querySelector(".btn-remove").addEventListener("click", () => item.remove());
    listEl.appendChild(item);
  }

  function renderKongList(state, listId, tablePlayers) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    const current = collectKongs(listId).filter((item) => tablePlayers.includes(item.konger));
    listEl.innerHTML = "";
    current.forEach((kong) => {
      appendKongItem(listEl, tablePlayers, state.session.players);
      const row = listEl.lastElementChild;
      if (!row) return;
      row.querySelector('select[name="konger"]').value = String(kong.konger);
      row.querySelector('input[name="kongType"]').value = kong.type;
      row.querySelectorAll(".kong-type-toggle .tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.kongType === kong.type);
      });
      const feederSel = row.querySelector('select[name="kongFeeder"]');
      if (kong.type === "fanggang" && feederSel) {
        row.querySelector(".kong-feeder-field")?.classList.remove("hidden");
        feederSel.value = String(kong.feeder);
      }
    });
  }

  function renderSpecialList(state, listId, tablePlayers) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    const current = collectSpecials(listId).filter((item) => tablePlayers.includes(item.from) && tablePlayers.includes(item.to));
    listEl.innerHTML = "";
    current.forEach((special) => {
      appendSpecialItem(listEl, tablePlayers, state.session.players);
      const row = listEl.lastElementChild;
      if (!row) return;
      row.querySelector('select[name="specialFrom"]').value = String(special.from);
      row.querySelector('select[name="specialTo"]').value = String(special.to);
      row.querySelector('input[name="specialAmount"]').value = String(special.amount);
    });
  }

  function bindKongButtons(state) {
    const addKongBtn = document.getElementById("add-kong-btn");
    if (addKongBtn && !addKongBtn.dataset.bound) {
      addKongBtn.dataset.bound = "1";
      addKongBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tablePlayers = getTablePlayers(state);
        const list = document.getElementById("kong-list");
        if (list) appendKongItem(list, tablePlayers, state.session.players);
        renderRoundSummary(state);
      });
    }
    const addLiujuKongBtn = document.getElementById("add-liuju-kong-btn");
    if (addLiujuKongBtn && !addLiujuKongBtn.dataset.bound) {
      addLiujuKongBtn.dataset.bound = "1";
      addLiujuKongBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tablePlayers = getTablePlayers(state);
        const list = document.getElementById("liuju-kong-list");
        if (list) appendKongItem(list, tablePlayers, state.session.players);
        renderRoundSummary(state);
      });
    }
    const addSpecialBtn = document.getElementById("add-special-btn");
    if (addSpecialBtn && !addSpecialBtn.dataset.bound) {
      addSpecialBtn.dataset.bound = "1";
      addSpecialBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tablePlayers = getTablePlayers(state);
        const list = document.getElementById("special-list");
        if (list) appendSpecialItem(list, tablePlayers, state.session.players);
        renderRoundSummary(state);
      });
    }
    const addLiujuSpecialBtn = document.getElementById("add-liuju-special-btn");
    if (addLiujuSpecialBtn && !addLiujuSpecialBtn.dataset.bound) {
      addLiujuSpecialBtn.dataset.bound = "1";
      addLiujuSpecialBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const tablePlayers = getTablePlayers(state);
        const list = document.getElementById("liuju-special-list");
        if (list) appendSpecialItem(list, tablePlayers, state.session.players);
        renderRoundSummary(state);
      });
    }
  }

  function bindLiveSummary(state) {
    const panel = document.querySelector(".round-entry");
    if (!panel || panel.dataset.summaryBound) return;
    panel.dataset.summaryBound = "1";
    const schedule = () => window.requestAnimationFrame(() => renderRoundSummary(state));
    panel.addEventListener("change", schedule);
    panel.addEventListener("input", schedule);
    panel.addEventListener("click", schedule);
  }

  function bindUndoRound(state) {
    const btn = document.getElementById("undo-round-btn");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      if (!state.session.rounds.length) return;
      if (!confirm("确定撤销上一局吗？")) return;
      state.session.rounds.pop();
      state.lastRound = state.session.rounds[state.session.rounds.length - 1] || null;
      saveSession(state.session);
      document.getElementById("game-over-overlay").classList.add("hidden");
      document.querySelector(".round-result").classList.add("hidden");
      document.querySelector(".round-entry").classList.remove("hidden");
      renderScoreboard(state);
      renderHistory(state);
      renderWinForm(state);
      renderLiujuForm(state);
      renderRoundSummary(state);
    });
  }

  function updatePenaltyInputs(state) {
    const penaltyEl = document.getElementById("penalty-inputs");
    if (!penaltyEl || !state?.session) return;
    const winners = Array.from(document.querySelectorAll('#winner-checkboxes input[name="winner"]:checked')).map(
      (c) => parseInt(c.value, 10)
    );
    const tablePlayers = getTablePlayers(state);
    const nonWinners = tablePlayers.filter((i) => !winners.includes(i));
    const players = state.session.players;
    penaltyEl.innerHTML = nonWinners
      .map(
        (i) =>
          `<label>${escapeHtml(players[i])} <input type="number" name="penalty_${i}" min="0" value="0"></label>`
      )
      .join("");
  }

  function updateFanSelects(state) {
    const container = document.getElementById("fan-select-container");
    if (!container || !state?.session) return;
    const winners = Array.from(document.querySelectorAll('#winner-checkboxes input[name="winner"]:checked')).map(
      (c) => parseInt(c.value, 10)
    );
    const options = FAN_TYPES.map(
      (f) => `<option value="${f.id}">${f.name}(${f.score}分)</option>`
    ).join("");
    if (winners.length <= 1) {
      const idx = winners.length === 1 ? winners[0] : 0;
      container.innerHTML = `<select name="fan_${idx}">${options}</select>`;
    } else {
      container.innerHTML = winners
        .map(
          (i) =>
            `<label class="fan-per-winner">${escapeHtml(state.session.players[i])}
              <select name="fan_${i}">${options}</select>
            </label>`
        )
        .join("");
    }
  }

  function updateChickenInputs(state) {
    const chickenEl = document.getElementById("chicken-inputs");
    if (!chickenEl || !state?.session) return;
    const tablePlayers = getTablePlayers(state);
    chickenEl.innerHTML = tablePlayers
      .map(
        (i) =>
          `<label>${escapeHtml(state.session.players[i])} <input type="number" name="chicken_${i}" min="0" value="0"></label>`
      )
      .join("");
  }

  function bindChickenToggle(state) {
    const form = document.getElementById("win-form");
    if (!form || form.dataset.chickenToggleBound) return;
    form.dataset.chickenToggleBound = "1";
    form.addEventListener("change", (e) => {
      if (e.target.name === "winner") {
        updateFanSelects(state);
        updatePenaltyInputs(state);
      }
    });
  }

  function bindPenaltyTabs() {
    const row = document.querySelector(".penalty-row");
    const modeInput = document.querySelector('#win-form input[name="penaltyMode"]');
    const tabs = document.getElementById("penalty-mode-tabs");
    if (!row || !modeInput || !tabs || tabs.dataset.bound) return;
    tabs.dataset.bound = "1";
    tabs.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.penalty;
        modeInput.value = val;
        tabs.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        row.classList.toggle("hidden", val !== "yes");
      });
    });
  }

  function bindRoundTypeTabs(state) {
    const tabs = document.querySelectorAll(".round-type-tabs .tab");
    if (!tabs.length || tabs[0].dataset.bound) return;
    tabs.forEach((btn) => {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        document.querySelectorAll(".round-type-tabs .tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("win-form").classList.toggle("hidden", type !== "win");
        document.getElementById("liuju-form").classList.toggle("hidden", type !== "liuju");
        if (type === "win") renderWinForm(state);
        else renderLiujuForm(state);
        renderRoundSummary(state);
      });
    });
  }

  function bindWinTypeToggle(state) {
    const winTypeInput = document.querySelector("#win-form input[name=winType]");
    const feederRow = document.querySelector("#win-form .dianpao-only");
    const feederSel = document.querySelector("#win-form select[name=feeder]");
    const winnerCheckboxes = () => document.querySelectorAll('#winner-checkboxes input[name="winner"]');
    if (!winTypeInput || !feederRow) return;
    const updateFeederOptions = () => {
      const winners = Array.from(winnerCheckboxes())
        .filter((c) => c.checked)
        .map((c) => parseInt(c.value, 10));
      if (!feederSel || !state?.session) return;
      const tablePlayers = getTablePlayers(state);
      feederSel.innerHTML = tablePlayers
        .map((i) => ({ index: i, name: state.session.players[i] }))
        .map(({ index, name }) => (winners.includes(index) ? "" : `<option value="${index}">${escapeHtml(name)}</option>`))
        .filter(Boolean)
        .join("");
    };
    const tabs = document.querySelectorAll(".win-type-tabs .tab");
    if (tabs.length && tabs[0].dataset.bound) return;
    tabs.forEach((btn) => {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const val = btn.dataset.wintype;
        winTypeInput.value = val;
        document.querySelectorAll(".win-type-tabs .tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        feederRow.classList.toggle("hidden", val !== "dianpao");
        if (val === "dianpao") updateFeederOptions();
      });
    });
    document.querySelector(".win-type-tabs .tab[data-wintype=zimo]")?.classList.add("active");
    const form = document.getElementById("win-form");
    if (form && !form.dataset.winTypeBound) {
      form.dataset.winTypeBound = "1";
      form.addEventListener("change", (e) => {
        if (e.target.name === "winner" && winTypeInput?.value === "dianpao") updateFeederOptions();
      });
    }
  }

  function bindRoundForms(state) {
    const proceedNextRound = () => {
      const historyOverlay = document.getElementById("history-detail-overlay");
      document.querySelector(".round-result").classList.add("hidden");
      document.querySelector(".round-entry").classList.remove("hidden");
      historyOverlay.classList.add("hidden");
      delete historyOverlay.dataset.mode;
      document.getElementById("history-detail-next")?.classList.add("hidden");
      document.getElementById("win-form").reset();
      document.getElementById("liuju-form").reset();
      document.getElementById("kong-list").innerHTML = "";
      document.getElementById("liuju-kong-list").innerHTML = "";
      document.getElementById("special-list").innerHTML = "";
      document.getElementById("liuju-special-list").innerHTML = "";
      document.querySelector(".round-type-tabs .tab[data-type=win]").classList.add("active");
      document.querySelector(".round-type-tabs .tab[data-type=liuju]").classList.remove("active");
      document.getElementById("win-form").classList.remove("hidden");
      document.getElementById("liuju-form").classList.add("hidden");
      document.querySelector("#win-form .dianpao-only")?.classList.add("hidden");
      document.querySelector(".penalty-row")?.classList.add("hidden");
      document.querySelector(".penalty-tabs .tab[data-penalty=no]")?.classList.add("active");
      document.querySelector(".penalty-tabs .tab[data-penalty=yes]")?.classList.remove("active");
      document.querySelector('#win-form input[name="penaltyMode"]').value = "no";
      document.querySelector(".chicken-mode-row")?.classList.add("hidden");
      document.querySelector(".chicken-count-row")?.classList.add("hidden");
      document.querySelector('#win-form input[name="chickenEnabled"]').value = "no";
      document.querySelectorAll("#chicken-presence-tabs .tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.chickenEnabled === "no");
      });
      document.querySelectorAll(".win-type-tabs .tab").forEach((b) => b.classList.remove("active"));
      document.querySelector(".win-type-tabs .tab[data-wintype=zimo]")?.classList.add("active");
      document.querySelector("#win-form input[name=winType]").value = "zimo";
      document.querySelector('#win-form input[name="chickenMode"]').value = "no";
      document.querySelectorAll(".chicken-mode-tabs .tab").forEach((b) => b.classList.remove("active"));
      document.querySelector(".chicken-mode-tabs .tab[data-chicken=no]")?.classList.add("active");
      renderTablePlayersRow(state);
      renderWinForm(state);
      renderLiujuForm(state);
      renderScoreboard(state);
      renderRoundSummary(state);
    };

    const winForm = document.getElementById("win-form");
    if (winForm && !winForm.dataset.submitBound) {
      winForm.dataset.submitBound = "1";
      winForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const round = collectWinFormData(state.session);
        if (!round) return;
        state.lastRound = round;
        state.session.rounds.push(round);
        saveSession(state.session);
        showRoundResult(state);
        renderHistory(state);
        checkGameOver(state);
      });
    }

    const liujuForm = document.getElementById("liuju-form");
    if (liujuForm && !liujuForm.dataset.submitBound) {
      liujuForm.dataset.submitBound = "1";
      liujuForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const round = collectLiujuFormData(state.session);
        if (!round) return;
        state.lastRound = round;
        state.session.rounds.push(round);
        saveSession(state.session);
        showRoundResult(state);
        renderHistory(state);
        checkGameOver(state);
      });
    }

    const nextBtn = document.getElementById("next-round");
    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = "1";
      nextBtn.addEventListener("click", proceedNextRound);
    }
    const detailNextBtn = document.getElementById("history-detail-next");
    if (detailNextBtn && !detailNextBtn.dataset.bound) {
      detailNextBtn.dataset.bound = "1";
      detailNextBtn.addEventListener("click", proceedNextRound);
    }

    const gameOverConfirm = document.getElementById("game-over-confirm");
    if (gameOverConfirm && !gameOverConfirm.dataset.bound) {
      gameOverConfirm.dataset.bound = "1";
      gameOverConfirm.addEventListener("click", () => {
      if (!confirm("确定开始新大局？")) return;
      document.getElementById("game-over-overlay").classList.add("hidden");
      state.session.rounds = [];
      state.session.initialScore = state.session.initialScore ?? INITIAL_SCORE;
      saveSession(state.session);
      renderScoreboard(state);
      renderHistory(state);
      document.querySelector(".round-result").classList.add("hidden");
      document.querySelector(".round-entry").classList.remove("hidden");
      renderRoundSummary(state);
      });
    }

    const historyDetailClose = document.getElementById("history-detail-close");
    if (historyDetailClose && !historyDetailClose.dataset.bound) {
      historyDetailClose.dataset.bound = "1";
      historyDetailClose.addEventListener("click", () => {
        const overlay = document.getElementById("history-detail-overlay");
        if (overlay?.dataset.mode === "result") {
          proceedNextRound();
          return;
        }
        overlay.classList.add("hidden");
        delete overlay.dataset.mode;
        document.getElementById("history-detail-next")?.classList.add("hidden");
      });
    }

    const historyOverlay = document.getElementById("history-detail-overlay");
    if (historyOverlay && !historyOverlay.dataset.bound) {
      historyOverlay.dataset.bound = "1";
      historyOverlay.addEventListener("click", (e) => {
        if (e.target.id === "history-detail-overlay") {
          if (historyOverlay.dataset.mode === "result") {
            proceedNextRound();
            return;
          }
          document.getElementById("history-detail-overlay").classList.add("hidden");
          delete historyOverlay.dataset.mode;
          document.getElementById("history-detail-next")?.classList.add("hidden");
        }
      });
    }

  }

  function checkGameOver(state) {
    const totals = getTotals(state.session);
    if (totals.some((t) => t <= 0)) {
      showGameOverModal(state);
    }
  }

  function showGameOverModal(state) {
    const { session } = state;
    const totals = getTotals(session);
    const seatAssignments = getSeatAssignments(state);
    const el = document.getElementById("game-over-scores");
    const sortedGO = totals.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    const ranksGO = Array(totals.length);
    sortedGO.forEach(({ i }, rank) => { ranksGO[i] = rank + 1; });
    el.innerHTML = sortedGO
      .map(({ i }) => {
        const score = totals[i];
        const seat = seatAssignments.find((item) => item.playerIndex === i)?.seat;
        const rank = ranksGO[i];
        let cls = "score-item";
        if (score <= 0) cls += " danger busted";
        else cls += score > 0 ? " positive" : " negative";
        return `<div class="${cls}" data-rank="${rank}">
          <span class="score-rank">#${rank}</span>
          <div class="score-body">
            <div class="score-top">
              <span class="name">${escapeHtml(session.players[i])}</span>
              <span class="seat-tag">${seat ? `${seat}位` : `P${i + 1}`}</span>
            </div>
            <span class="value">${score}</span>
          </div>
        </div>`;
      })
      .join("");

    const detailEl = document.getElementById("game-over-detail");
    let html = `<div class="detail-row">本大局共 ${session.rounds.length} 局</div>`;
    if (session.rounds.length > 0) {
      const lastRound = session.rounds[session.rounds.length - 1];
      html += `<div class="detail-section"><strong>上一局明细</strong></div>`;
      html += buildDetailHtml(lastRound, session);
    }
    detailEl.innerHTML = html;

    document.getElementById("game-over-overlay").classList.remove("hidden");
  }

  function buildDetailHtml(round, session) {
    if (!round.detail) return "";
    let html = "";
    if (round.detail.baseBreakdown) {
      html += round.detail.baseBreakdown.map((l) => `<div class="detail-row">${l}</div>`).join("");
    }
    if (round.detail.kongBreakdown && round.detail.kongBreakdown.length) {
      html += `<div class="detail-section">`;
      html += round.detail.kongBreakdown.map((l) => `<div class="detail-row">${l}</div>`).join("");
      html += "</div>";
    }
    if (round.detail.chickenBreakdown && round.detail.chickenBreakdown.length) {
      html += `<div class="detail-section">`;
      html += round.detail.chickenBreakdown.map((l) => `<div class="detail-row">${l}</div>`).join("");
      html += "</div>";
    }
    if (round.detail.specialBreakdown && round.detail.specialBreakdown.length) {
      html += `<div class="detail-section">`;
      html += round.detail.specialBreakdown.map((l) => `<div class="detail-row">${l}</div>`).join("");
      html += "</div>";
    }
    if (round.detail.playerBreakdown && round.detail.playerBreakdown.length) {
      html += `<div class="detail-section"><strong>每人明细</strong></div>`;
      round.detail.playerBreakdown.forEach((p) => {
        html += `<div class="detail-row detail-player">${escapeHtml(p.name)}</div>`;
        p.items.forEach((item) => {
          html += `<div class="detail-row detail-indent">${item}</div>`;
        });
      });
    }
    html += `<div class="detail-section"><strong>本局得分</strong></div>`;
    const tbl = round.tablePlayers && round.tablePlayers.length === 4 ? round.tablePlayers : [...Array(session.players.length)].map((_, i) => i);
    tbl.forEach((i) => {
      const s = round.scores[i] ?? 0;
      html += `<div class="detail-row">${escapeHtml(session.players[i])}: ${s >= 0 ? "+" : ""}${s}</div>`;
    });
    return html;
  }

  function formatRoundSummary(session, r, idx) {
    if (!r) return `第${idx}局`;
    if (r.type === "win") {
      const winnerIndices = r.winners ?? (r.winner !== undefined ? [r.winner] : []);
      const winnerNames = winnerIndices.map((i) => session.players[i]).join("、");
      const desc = r.winType === "zimo" ? "自摸" : `点炮(${session.players[r.feeder]})`;
      return `第${idx}局 ${winnerNames} ${desc}`;
    }
    const tingNames = (r.ting || []).map((i) => session.players[i]).join("、");
    return `第${idx}局 流局${tingNames ? `，听牌：${tingNames}` : ""}`;
  }

  function deltaClass(delta) {
    if (delta > 0) return "positive";
    if (delta < 0) return "negative";
    return "zero";
  }

  function deltaLabel(delta) {
    if (delta > 0) return `上一局 +${delta}`;
    if (delta < 0) return `上一局 ${delta}`;
    return "上一局 0";
  }

  function buildHistoryScores(session, round) {
    const table = round.tablePlayers && round.tablePlayers.length
      ? round.tablePlayers
      : [...Array(session.players.length)].map((_, i) => i);
    return table
      .filter((i) => (round.scores[i] || 0) !== 0)
      .sort((a, b) => (round.scores[b] || 0) - (round.scores[a] || 0))
      .slice(0, 4)
      .map((i) => {
        const score = round.scores[i] || 0;
        return `<span class="mini-score ${deltaClass(score)}">${escapeHtml(session.players[i])} ${score > 0 ? "+" : ""}${score}</span>`;
      })
      .join("");
  }

  function collectKongs(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    const items = list.querySelectorAll(".kong-item");
    return Array.from(items)
      .map((item) => {
        const kongerSel = item.querySelector("select[name=konger]");
        const typeSel = item.querySelector("input[name=kongType]");
        const feederSel = item.querySelector("select[name=kongFeeder]");
        if (!kongerSel || !typeSel) return null;
        const konger = parseInt(kongerSel.value, 10);
        const type = typeSel.value;
        if (type === "fanggang") {
          const feeder = parseInt(feederSel?.value, 10);
          if (feeder === undefined || feeder === null || isNaN(feeder)) return null;
          return { konger, type, feeder };
        }
        return { konger, type };
      })
      .filter(Boolean);
  }

  function collectWinFormData(session) {
    const state = { session };
    const form = document.getElementById("win-form");
    const n = session.players.length;
    const tablePlayers = getTablePlayers(state);
    if (n > 4 && tablePlayers.length !== 4) {
      alert("请选择 4 人本局上场");
      return null;
    }
    const winners = Array.from(form.querySelectorAll('input[name="winner"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    const winType = form.elements.winType.value;
    const feeder = winType === "dianpao" ? parseInt(form.elements.feeder?.value, 10) : null;
    const chickenEnabled = form.elements.chickenEnabled?.value === "yes";
    const chickenCountsRaw = [...Array(n)].map((_, i) =>
      chickenEnabled ? (parseInt(form.elements["chicken_" + i]?.value, 10) || 0) : 0
    );
    const ting = [...new Set([
      ...winners,
      ...tablePlayers.filter((i) => chickenCountsRaw[i] > 0),
    ])];

    if (winners.length === 0) {
      alert("请选择胡牌者");
      return null;
    }
    if (winType === "zimo" && winners.length > 1) {
      alert("自摸只能有一人胡牌");
      return null;
    }
    if (winType === "dianpao") {
      if (feeder === undefined || feeder === null || isNaN(feeder)) {
        alert("请选择点炮者");
        return null;
      }
      if (winners.includes(feeder)) {
        alert("点炮者不能是胡牌者");
        return null;
      }
      if (winners.length === 4) {
        alert("点炮时至少一人不能是胡牌者");
        return null;
      }
    }

    const tianque = Array.from(form.querySelectorAll('input[name="tianque"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    const penaltyMode = form.elements.penaltyMode?.value || "no";
    const penaltyCounts = penaltyMode === "yes"
      ? [...Array(n)].map((_, i) => parseInt(form.elements["penalty_" + i]?.value, 10) || 0)
      : [...Array(n)].fill(0);
    const chickenCounts = chickenCountsRaw;
    const multiplier = chickenEnabled && form.elements.chickenMode?.value === "yes" ? 2 : 1;

    const winnerFans = winners.map((i) => {
      const fanId = form.elements["fan_" + i]?.value;
      const f = FAN_TYPES.find((x) => x.id === fanId);
      return { winner: i, fanId: fanId || "putong", score: f ? f.score : 2 };
    });
    const kongs = collectKongs("kong-list");
    const specials = collectSpecials("special-list");
    const totalsBefore = getTotals(session);

    const scores = calcWinRound({
      n,
      session,
      totalsBefore,
      tablePlayers,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
      kongs,
      specials,
    });

    const baseBreakdown = [];
    winnerFans.forEach(({ winner, fanId, score }) => {
      const f = FAN_TYPES.find((x) => x.id === fanId);
      baseBreakdown.push(`番型：${session.players[winner]} ${f?.name || "普通胡"} +${score}`);
    });
    if (tianque.length) {
      baseBreakdown.push(`天缺：${tianque.map((i) => session.players[i]).join("、")} 无天缺者每人付2分`);
    }
    const penalty = penaltyCounts.reduce((s, p) => s + p, 0);
    if (penalty > 0) {
      const parts = penaltyCounts
        .map((p, i) => (p > 0 ? `${session.players[i]}${p}张` : null))
        .filter(Boolean);
      baseBreakdown.push(`查缺罚分：${parts.join("、")} 共-${penalty}`);
    }
    const kongBreakdown = [];
    kongs.forEach((k) => {
      if (k.type === "zigang") {
        kongBreakdown.push(`自杠：${session.players[k.konger]} 其余3人各付2分`);
      } else {
        kongBreakdown.push(`放杠：${session.players[k.konger]} 收 ${session.players[k.feeder]} 2分`);
      }
    });
    const specialBreakdown = specials.map((item) =>
      `特殊结算：${session.players[item.from]} 付 ${session.players[item.to]} ${item.amount}分`
    );

    const chickenBreakdown = [];
    const chickenDesc = multiplier > 1 ? "金鸡×2" : "1分/鸡";
    if (tablePlayers.some((i) => ting.includes(i) && chickenCounts[i] > 0)) {
      chickenBreakdown.push(`鸡分：${chickenDesc}`);
    }
    for (const i of tablePlayers) {
      if (ting.includes(i) && chickenCounts[i] > 0) {
        const per = chickenCounts[i] * multiplier;
        chickenBreakdown.push(`鸡分：${session.players[i]} ${chickenCounts[i]}张 ×${multiplier} = 每人付${per}分`);
      }
    }

    const playerBreakdown = buildWinPlayerBreakdown({
      session,
      n,
      tablePlayers,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
      kongs,
      specials,
      scores,
    });

    return {
      type: "win",
      tablePlayers,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penalty,
      penaltyCounts,
      chickenMode: multiplier > 1 ? "yes" : "no",
      ting,
      chickenCounts,
      kongs,
      specials,
      scores,
      detail: { baseBreakdown, kongBreakdown, chickenBreakdown, specialBreakdown, playerBreakdown },
    };
  }

  function buildWinPlayerBreakdown(params) {
    const { session, n, tablePlayers, winners, winType, feeder, winnerFans, tianque, penaltyCounts, ting, chickenCounts, multiplier, kongs, specials = [], scores } = params;
    const table = tablePlayers || [0, 1, 2, 3];
    const totalBasePerWinner = winners.map((w) => {
      const fan = winnerFans.find((x) => x.winner === w);
      return fan ? fan.score : 2;
    });
    const fanPayers = winType === "zimo"
      ? table.filter((i) => i !== winners[0])
      : [feeder];
    const penaltyPayers = table.filter((i) => !winners.includes(i));
    const payPerPerson = winType === "zimo" ? totalBasePerWinner[0] : totalBasePerWinner.reduce((s, t) => s + t, 0);
    const winnerPenaltyReceive = penaltyPayers.reduce((s, p) => s + (penaltyCounts[p] || 0), 0);

    return table.map((i) => {
      const name = session.players[i];
      const items = [];
      const winnerIdx = winners.indexOf(i);
      if (winnerIdx >= 0) {
        const winnerReceive = winType === "zimo"
          ? totalBasePerWinner[winnerIdx] * fanPayers.length
          : totalBasePerWinner[winnerIdx];
        items.push(`收番型: +${winnerReceive}`);
        if (winnerIdx === 0 && winnerPenaltyReceive > 0) {
          items.push(`收查缺: +${winnerPenaltyReceive}`);
        }
      } else if (fanPayers.includes(i)) {
        items.push(`付番型: -${payPerPerson}`);
      }
      if (!winners.includes(i) && penaltyCounts && penaltyCounts[i] > 0) {
        items.push(`付查缺: -${penaltyCounts[i]}`);
      }
      if (tianque && tianque.includes(i)) {
        const notTianqueCount = table.filter((j) => !tianque.includes(j)).length;
        items.push(`收天缺: +${2 * notTianqueCount}`);
      } else if (tianque && tianque.length > 0 && table.includes(i)) {
        items.push(`付天缺: -${2 * tianque.length}`);
      }
      const chickenReceive = ting.includes(i) && chickenCounts[i] > 0
        ? chickenCounts[i] * multiplier * (table.length - 1)
        : 0;
      let chickenPay = 0;
      for (const j of table) {
        if (j !== i && ting.includes(j) && chickenCounts[j] > 0) {
          chickenPay += chickenCounts[j] * multiplier;
        }
      }
      if (chickenReceive > 0 || chickenPay > 0) {
        if (chickenReceive > 0) items.push(`收鸡分: +${chickenReceive}`);
        if (chickenPay > 0) items.push(`付鸡分: -${chickenPay}`);
      }
      if (kongs && table.includes(i)) {
        for (const k of kongs) {
          if (k.type === "zigang") {
            if (k.konger === i) items.push(`收自杠: +6`);
            else items.push(`付自杠: -2`);
          } else {
            if (k.konger === i) items.push(`收放杠: +2`);
            else if (k.feeder === i) items.push(`付放杠: -2`);
          }
        }
      }
      if (specials.length) {
        specials.forEach((item) => {
          if (item.from === i) items.push(`付特殊结算: -${item.amount}`);
          else if (item.to === i) items.push(`收特殊结算: +${item.amount}`);
        });
      }
      const score = scores ? scores[i] : 0;
      items.push(`小计: ${score >= 0 ? "+" : ""}${score}`);
      return { name, items };
    });
  }

  function payCap(bal, fromIdx, toIdx, amount) {
    const actual = Math.min(Math.max(0, amount), Math.max(0, bal[fromIdx]));
    bal[fromIdx] -= actual;
    bal[toIdx] += actual;
    return actual;
  }

  function calcWinRound(params) {
    const {
      n,
      session,
      totalsBefore = [],
      tablePlayers = [0, 1, 2, 3],
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
      kongs = [],
      specials = [],
    } = params;

    const bal = totalsBefore.length === n ? [...totalsBefore] : [...Array(n)].fill(session?.initialScore ?? INITIAL_SCORE);
    const totalBasePerWinner = winners.map((w) => {
      const fan = winnerFans.find((x) => x.winner === w);
      return fan ? fan.score : 2;
    });

    for (const i of tablePlayers) {
      if (!tianque.includes(i)) continue;
      const notTianque = tablePlayers.filter((j) => !tianque.includes(j));
      notTianque.forEach((j) => payCap(bal, j, i, 2));
    }

    for (const k of kongs) {
      if (k.type === "zigang") {
        const others = tablePlayers.filter((x) => x !== k.konger);
        others.forEach((j) => payCap(bal, j, k.konger, 2));
      } else {
        payCap(bal, k.feeder, k.konger, 2);
      }
    }

    if (winType === "zimo") {
      const winner = winners[0];
      const totalBase = totalBasePerWinner[0];
      const payers = tablePlayers.filter((i) => i !== winner);
      payers.forEach((i) => payCap(bal, i, winner, totalBase));
    } else {
      payCap(bal, feeder, winners[0], totalBasePerWinner[0]);
      for (let idx = 1; idx < winners.length; idx++) {
        payCap(bal, feeder, winners[idx], totalBasePerWinner[idx]);
      }
    }

    if (winType === "zimo") {
      const winner = winners[0];
      const payers = tablePlayers.filter((i) => i !== winner);
      payers.forEach((i) => payCap(bal, i, winner, penaltyCounts[i] || 0));
    } else {
      const penaltyPayers = tablePlayers.filter((i) => !winners.includes(i));
      penaltyPayers.forEach((i) => payCap(bal, i, winners[0], penaltyCounts[i] || 0));
    }

    for (const i of tablePlayers) {
      if (!ting.includes(i) || chickenCounts[i] <= 0) continue;
      const chickenPerPerson = chickenCounts[i] * multiplier;
      for (const j of tablePlayers) {
        if (j !== i) payCap(bal, j, i, chickenPerPerson);
      }
    }

    for (const item of specials) {
      payCap(bal, item.from, item.to, item.amount);
    }

    const base = session?.initialScore ?? INITIAL_SCORE;
    return bal.map((b, i) => b - (totalsBefore[i] ?? base));
  }

  function collectLiujuFormData(session) {
    const state = { session };
    const form = document.getElementById("liuju-form");
    const n = session.players.length;
    const tablePlayers = getTablePlayers(state);
    if (n > 4 && tablePlayers.length !== 4) {
      alert("请选择 4 人本局上场");
      return null;
    }
    const ting = Array.from(form.querySelectorAll('input[name="ting"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    const kongs = collectKongs("liuju-kong-list");
    const specials = collectSpecials("liuju-special-list");
    const totalsBefore = getTotals(session);
    const scores = calcLiujuRound(n, session, totalsBefore, ting, tablePlayers, kongs, specials);

    const notTing = tablePlayers.filter((i) => !ting.includes(i));
    const baseBreakdown = [
      `未听牌：${notTing.map((i) => session.players[i]).join("、")}`,
      `听牌：${ting.map((i) => session.players[i]).join("、")}`,
      `规则：未听牌者向每位听牌者付 2 分`,
    ];
    const kongBreakdown = kongs.map((k) => {
      if (k.type === "zigang") return `自杠：${session.players[k.konger]} 其余3人各付2分`;
      return `放杠：${session.players[k.konger]} 收 ${session.players[k.feeder]} 2分`;
    });
    const specialBreakdown = specials.map((item) =>
      `特殊结算：${session.players[item.from]} 付 ${session.players[item.to]} ${item.amount}分`
    );

    const playerBreakdown = session.players.map((name, i) => {
      const items = [];
      if (!tablePlayers.includes(i)) {
        items.push(`小计：0（本局未上场）`);
        return { name, items };
      }
      if (ting.includes(i)) {
        items.push(`流局收分：未听牌${notTing.length}人 × 2分 = +${2 * notTing.length}`);
      } else {
        items.push(`流局付分：听牌${ting.length}人 × 2分 = -${2 * ting.length}`);
      }
      if (kongs.length && tablePlayers.includes(i)) {
        for (const k of kongs) {
          if (k.type === "zigang") {
            if (k.konger === i) items.push(`收自杠: +6`);
            else items.push(`付自杠: -2`);
          } else {
            if (k.konger === i) items.push(`收放杠: +2`);
            else if (k.feeder === i) items.push(`付放杠: -2`);
          }
        }
      }
      if (specials.length) {
        specials.forEach((item) => {
          if (item.from === i) items.push(`付特殊结算: -${item.amount}`);
          else if (item.to === i) items.push(`收特殊结算: +${item.amount}`);
        });
      }
      items.push(`小计：${scores[i] >= 0 ? "+" : ""}${scores[i]}`);
      return { name, items };
    });

    return {
      type: "liuju",
      tablePlayers,
      ting,
      kongs,
      specials,
      scores,
      detail: { baseBreakdown, kongBreakdown, specialBreakdown, playerBreakdown },
    };
  }

  function calcLiujuRound(n, session, totalsBefore, ting, tablePlayers = [0, 1, 2, 3], kongs = [], specials = []) {
    const base = session?.initialScore ?? INITIAL_SCORE;
    const bal = totalsBefore.length === n ? [...totalsBefore] : [...Array(n)].fill(base);

    for (const k of kongs) {
      if (k.type === "zigang") {
        const others = tablePlayers.filter((x) => x !== k.konger);
        others.forEach((j) => payCap(bal, j, k.konger, 2));
      } else {
        payCap(bal, k.feeder, k.konger, 2);
      }
    }

    const notTing = tablePlayers.filter((i) => !ting.includes(i));
    for (const i of notTing) {
      for (const j of ting) {
        payCap(bal, i, j, 2);
      }
    }

    for (const item of specials) {
      payCap(bal, item.from, item.to, item.amount);
    }

    return bal.map((b, i) => b - (totalsBefore[i] ?? base));
  }

  function showRoundResult(state) {
    const round = state.lastRound;
    const { session } = state;
    const tbl = round.tablePlayers && round.tablePlayers.length === 4
      ? round.tablePlayers
      : [...Array(session.players.length)].map((_, i) => i);
    const seatAssignments = getSeatAssignments(state);

    const el = document.getElementById("round-scores");
    el.innerHTML = tbl
      .map((i) => {
        const s = round.scores[i] ?? 0;
        const seat = seatAssignments.find((item) => item.playerIndex === i)?.seat;
        let cls = "score-item";
        if (s > 0) cls += " positive";
        else if (s < 0) cls += " negative";
        else cls += " zero";
        return `<div class="${cls}">
          <div class="score-body">
            <div class="score-top">
              <span class="name">${escapeHtml(session.players[i])}</span>
              <span class="seat-tag">${seat ? `${seat}位` : "本局"}</span>
            </div>
            <span class="value">${s >= 0 ? "+" : ""}${s}</span>
          </div>
        </div>`;
      })
      .join("");

    const detailEl = document.getElementById("round-detail");
    detailEl.innerHTML = buildDetailHtml(round, session);
    detailEl.classList.toggle("hidden", !detailEl.innerHTML);

    document.querySelector(".round-entry").classList.add("hidden");
    document.querySelector(".round-result").classList.add("hidden");
    document.getElementById("history-detail-title").textContent = "本局结算";
    document.getElementById("history-detail-content").innerHTML = detailEl.innerHTML;
    document.getElementById("history-detail-next")?.classList.remove("hidden");
    document.getElementById("history-detail-overlay").dataset.mode = "result";
    document.getElementById("history-detail-overlay").classList.remove("hidden");
    renderScoreboard(state);
  }

  function renderHistory(state) {
    const { session } = state;
    const list = document.getElementById("history-list");
    const undoBtn = document.getElementById("undo-round-btn");
    if (undoBtn) undoBtn.disabled = session.rounds.length === 0;
    if (session.rounds.length === 0) {
      list.innerHTML = "<p style='color:var(--text-muted);font-size:0.9rem'>暂无记录</p>";
      return;
    }
    list.innerHTML = session.rounds
      .map((r, idx) => {
        const summary = formatRoundSummary(session, r, idx + 1);
        const typeTag = r.type === "win" ? (r.winType === "zimo" ? "胡牌" : "点炮") : "流局";
        const miniScores = buildHistoryScores(session, r) || `<span class="mini-score">本局分数全为 0</span>`;
        return `<div class="history-item" data-idx="${idx}" data-type="${r.type}" data-wintype="${r.winType || ''}">
          <span class="summary">
            <span class="history-top">
              <span class="history-title">${summary}</span>
              <span class="history-tag">${typeTag}</span>
            </span>
            <span class="history-scores">${miniScores}</span>
          </span>
          <span class="expand">查看详情</span>
        </div>`;
      })
      .reverse()
      .join("");

    list.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.idx, 10);
        const r = session.rounds[idx];
        const title = r.type === "tianque" ? "天缺结算（历史）" : `第${idx + 1}局详情`;
        document.getElementById("history-detail-title").textContent = title;
        const content = document.getElementById("history-detail-content");
        content.innerHTML = buildDetailHtml(r, session) || `<div class="detail-row">${formatRoundSummary(session, r, idx + 1)}</div>`;
        document.getElementById("history-detail-next")?.classList.add("hidden");
        document.getElementById("history-detail-overlay").dataset.mode = "history";
        document.getElementById("history-detail-overlay").classList.remove("hidden");
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      INITIAL_SCORE,
      FAN_TYPES,
      payCap,
      calcWinRound,
      calcLiujuRound,
    };
  }

  if (typeof document !== "undefined") {
    init();
  }
})();
