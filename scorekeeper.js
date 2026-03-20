(function () {
  "use strict";

  const STORAGE_KEY = "liquan_mahjong_session";
  const INITIAL_SCORE = 20;

  const CARDS = [
    "1万", "2万", "3万", "4万", "5万", "6万", "7万", "8万", "9万",
    "1条", "2条", "3条", "4条", "5条", "6条", "7条", "8条", "9条",
    "1筒", "2筒", "3筒", "4筒", "5筒", "6筒", "7筒", "8筒", "9筒",
  ];

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

  function getChickenCard(flipped) {
    const match = flipped.match(/^([1-9])([万条筒])$/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    const suit = match[2];
    const nextNum = num === 9 ? 1 : num + 1;
    return nextNum + suit;
  }

  function isGoldenChicken(chickenCard) {
    return chickenCard === "1条";
  }

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
    const existing = loadSession();
    if (existing && existing.players && existing.players.length === 4) {
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
      const initialScore = parseInt(form.elements.initialScore.value, 10) || INITIAL_SCORE;
      const players = [];
      for (let i = 0; i < 4; i++) {
        const val = form.elements["p" + i]?.value?.trim();
        players.push(val || "玩家" + (i + 1));
      }
      const session = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        playerCount: 4,
        initialScore,
        players,
        rounds: [],
      };
      saveSession(session);
      startGame(session);
    });
  }

  function startGame(session) {
    document.getElementById("session-setup").classList.add("hidden");
    document.getElementById("game-panel").classList.remove("hidden");

    const state = { session };
    renderScoreboard(state);
    renderWinForm(state);
    renderLiujuForm(state);
    bindRoundForms(state);
    bindRoundTypeTabs();
    bindWinTypeToggle(state);
    bindPenaltyTabs();
    bindChickenToggle(state);
    renderHistory(state);

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
    const n = session.players.length;

    const el = document.getElementById("total-scores");
    el.innerHTML = totals
      .map((score, i) => {
        let cls = "score-item";
        if (score <= 0) cls += " danger";
        else if (score > 0) cls += " positive";
        else cls += " negative";
        if (score === 0) cls += " zero";
        return `<div class="${cls}">
          <span class="name">${escapeHtml(session.players[i])}</span>
          <span class="value">${score}</span>
        </div>`;
      })
      .join("");
  }

  function renderWinForm(state) {
    const { session } = state;
    const players = session.players;
    const n = players.length;

    const fillSelect = (selId, exclude) => {
      const sel = document.querySelector(selId);
      if (!sel) return;
      sel.innerHTML = players
        .map((name, i) =>
          exclude !== undefined && i === exclude
            ? ""
            : `<option value="${i}">${escapeHtml(name)}</option>`
        )
        .filter(Boolean)
        .join("");
    };

    fillSelect("#win-form select[name=feeder]");

    const winnerEl = document.getElementById("winner-checkboxes");
    winnerEl.innerHTML = players
      .map(
        (name, i) =>
          `<label><input type="checkbox" name="winner" value="${i}">${escapeHtml(name)}</label>`
      )
      .join("");

    updatePenaltyInputs(state);

    const tianqueEl = document.getElementById("tianque-checkboxes");
    tianqueEl.innerHTML = players
      .map(
        (name, i) =>
          `<label><input type="checkbox" name="tianque" value="${i}">${escapeHtml(name)}</label>`
      )
      .join("");

    const tingEl = document.getElementById("ting-checkboxes");
    tingEl.innerHTML = players
      .map(
        (name, i) =>
          `<label><input type="checkbox" name="ting" value="${i}">${escapeHtml(name)}</label>`
      )
      .join("");

    updateFanSelects(state);
    updateChickenInputs(state);

    const flippedEl = document.querySelector("#win-form select[name=flippedCard]");
    if (flippedEl && !flippedEl.options.length) {
      flippedEl.innerHTML = CARDS.map((c) => `<option value="${c}">${c}</option>`).join("");
    }
  }

  function renderLiujuForm(state) {
    const { session } = state;
    const el = document.getElementById("liuju-ting-checkboxes");
    el.innerHTML = session.players
      .map(
        (name, i) =>
          `<label><input type="checkbox" name="ting" value="${i}">${escapeHtml(name)}</label>`
      )
      .join("");
  }

  function updatePenaltyInputs(state) {
    const penaltyEl = document.getElementById("penalty-inputs");
    if (!penaltyEl || !state?.session) return;
    const winners = Array.from(document.querySelectorAll('#winner-checkboxes input[name="winner"]:checked')).map(
      (c) => parseInt(c.value, 10)
    );
    const players = state.session.players;
    const nonWinners = [...Array(players.length)].map((_, i) => i).filter((i) => !winners.includes(i));
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
    const chickenGroup = document.querySelector(".chicken-group");
    if (!chickenEl || !state?.session) return;
    const ting = Array.from(document.querySelectorAll('#ting-checkboxes input[name="ting"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    chickenGroup?.classList.toggle("hidden", ting.length === 0);
    chickenEl.innerHTML = ting
      .map(
        (i) =>
          `<label>${escapeHtml(state.session.players[i])} <input type="number" name="chicken_${i}" min="0" value="0"></label>`
      )
      .join("");
  }

  function bindChickenToggle(state) {
    const chickenGroup = document.querySelector(".chicken-group");
    if (!chickenGroup) return;
    document.getElementById("win-form")?.addEventListener("change", (e) => {
      if (e.target.name === "ting") {
        updateChickenInputs(state);
      }
      if (e.target.name === "winner") {
        updateFanSelects(state);
        updatePenaltyInputs(state);
      }
    });
  }

  function bindPenaltyTabs() {
    const row = document.querySelector(".penalty-row");
    const modeInput = document.querySelector('#win-form input[name="penaltyMode"]');
    if (!row || !modeInput) return;
    document.querySelectorAll(".penalty-tabs .tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.penalty;
        modeInput.value = val;
        document.querySelectorAll(".penalty-tabs .tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        row.classList.toggle("hidden", val !== "yes");
      });
    });
  }

  function bindRoundTypeTabs() {
    document.querySelectorAll(".round-type-tabs .tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        document.querySelectorAll(".round-type-tabs .tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("win-form").classList.toggle("hidden", type !== "win");
        document.getElementById("liuju-form").classList.toggle("hidden", type !== "liuju");
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
      feederSel.innerHTML = state.session.players
        .map((name, i) => (winners.includes(i) ? "" : `<option value="${i}">${escapeHtml(name)}</option>`))
        .filter(Boolean)
        .join("");
    };
    document.querySelectorAll(".win-type-tabs .tab").forEach((btn) => {
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
    document.getElementById("win-form")?.addEventListener("change", (e) => {
      if (e.target.name === "winner" && winTypeInput?.value === "dianpao") updateFeederOptions();
    });
  }

  function bindRoundForms(state) {
    document.getElementById("win-form").addEventListener("submit", (e) => {
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

    document.getElementById("liuju-form").addEventListener("submit", (e) => {
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

    document.getElementById("next-round").addEventListener("click", () => {
      document.querySelector(".round-result").classList.add("hidden");
      document.querySelector(".round-entry").classList.remove("hidden");
      document.getElementById("win-form").reset();
      document.getElementById("liuju-form").reset();
      document.querySelector(".round-type-tabs .tab[data-type=win]").classList.add("active");
      document.querySelector(".round-type-tabs .tab[data-type=liuju]").classList.remove("active");
      document.getElementById("win-form").classList.remove("hidden");
      document.getElementById("liuju-form").classList.add("hidden");
      document.querySelector("#win-form .dianpao-only")?.classList.add("hidden");
      document.querySelector(".penalty-row")?.classList.add("hidden");
      document.querySelector(".penalty-tabs .tab[data-penalty=no]")?.classList.add("active");
      document.querySelector(".penalty-tabs .tab[data-penalty=yes]")?.classList.remove("active");
      document.querySelector('#win-form input[name="penaltyMode"]').value = "no";
      document.querySelector(".chicken-group")?.classList.add("hidden");
      document.querySelectorAll(".win-type-tabs .tab").forEach((b) => b.classList.remove("active"));
      document.querySelector(".win-type-tabs .tab[data-wintype=zimo]")?.classList.add("active");
      document.querySelector("#win-form input[name=winType]").value = "zimo";
      renderWinForm(state);
      renderScoreboard(state);
    });

    document.getElementById("game-over-confirm").addEventListener("click", () => {
      if (!confirm("确定开始新大局？")) return;
      document.getElementById("game-over-overlay").classList.add("hidden");
      state.session.rounds = [];
      state.session.initialScore = state.session.initialScore ?? INITIAL_SCORE;
      saveSession(state.session);
      renderScoreboard(state);
      renderHistory(state);
      document.querySelector(".round-result").classList.add("hidden");
      document.querySelector(".round-entry").classList.remove("hidden");
    });

    document.getElementById("history-detail-close").addEventListener("click", () => {
      document.getElementById("history-detail-overlay").classList.add("hidden");
    });

    document.getElementById("history-detail-overlay").addEventListener("click", (e) => {
      if (e.target.id === "history-detail-overlay") {
        document.getElementById("history-detail-overlay").classList.add("hidden");
      }
    });

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
    const el = document.getElementById("game-over-scores");
    el.innerHTML = totals
      .map((score, i) => {
        let cls = "score-item";
        if (score <= 0) cls += " danger";
        else cls += score > 0 ? " positive" : " negative";
        return `<div class="${cls}">
          <span class="name">${escapeHtml(session.players[i])}</span>
          <span class="value">${score}</span>
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
    if (round.detail.chickenBreakdown && round.detail.chickenBreakdown.length) {
      html += `<div class="detail-section">`;
      html += round.detail.chickenBreakdown.map((l) => `<div class="detail-row">${l}</div>`).join("");
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
    round.scores.forEach((s, i) => {
      html += `<div class="detail-row">${escapeHtml(session.players[i])}: ${s >= 0 ? "+" : ""}${s}</div>`;
    });
    return html;
  }

  function formatRoundSummary(session, r, idx) {
    if (r.type === "win") {
      const winnerIndices = r.winners ?? (r.winner !== undefined ? [r.winner] : []);
      const winnerNames = winnerIndices.map((i) => session.players[i]).join("、");
      const desc = r.winType === "zimo" ? "自摸" : `点炮(${session.players[r.feeder]})`;
      return `第${idx}局: ${winnerNames} ${desc}`;
    }
    if (r.type === "tianque") return `天缺: ${(r.tianque || []).map((i) => session.players[i]).join("、") || "无"}`;
    const tingNames = (r.ting || []).map((i) => session.players[i]).join("、");
    return `第${idx}局: 流局 听牌: ${tingNames}`;
  }

  function collectWinFormData(session) {
    const form = document.getElementById("win-form");
    const n = session.players.length;
    const winners = Array.from(form.querySelectorAll('input[name="winner"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    const winType = form.elements.winType.value;
    const feeder = winType === "dianpao" ? parseInt(form.elements.feeder?.value, 10) : null;
    const ting = Array.from(form.querySelectorAll('input[name="ting"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );

    if (winners.length === 0) {
      alert("请选择胡牌者");
      return null;
    }
    if (winType === "zimo" && winners.length > 1) {
      alert("自摸只能有一人胡牌");
      return null;
    }
    if (winners.some((w) => !ting.includes(w))) {
      alert("胡牌者必须在听牌者中");
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
      if (winners.length === n) {
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
    const flippedCard = form.elements.flippedCard.value;
    const chickenCounts = [...Array(n)].map((_, i) =>
      parseInt(form.elements["chicken_" + i]?.value, 10) || 0
    );

    const winnerFans = winners.map((i) => {
      const fanId = form.elements["fan_" + i]?.value;
      const f = FAN_TYPES.find((x) => x.id === fanId);
      return { winner: i, fanId: fanId || "putong", score: f ? f.score : 2 };
    });
    const chickenCard = getChickenCard(flippedCard);
    const multiplier = chickenCard && isGoldenChicken(chickenCard) ? 2 : 1;

    const scores = calcWinRound({
      n,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
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

    const chickenBreakdown = [];
    if (chickenCard) {
      chickenBreakdown.push(`翻出牌：${flippedCard} → 鸡牌：${chickenCard}${multiplier > 1 ? "（金鸡×2）" : ""}`);
    }
    for (let i = 0; i < n; i++) {
      if (ting.includes(i) && chickenCounts[i] > 0) {
        const per = chickenCounts[i] * multiplier;
        chickenBreakdown.push(`鸡分：${session.players[i]} ${chickenCounts[i]}张 ×${multiplier} = 每人付${per}分`);
      }
    }

    const playerBreakdown = buildWinPlayerBreakdown({
      session,
      n,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
      scores,
    });

    return {
      type: "win",
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penalty,
      penaltyCounts,
      flippedCard,
      chickenCard,
      ting,
      chickenCounts,
      scores,
      detail: { baseBreakdown, chickenBreakdown, playerBreakdown },
    };
  }

  function buildWinPlayerBreakdown(params) {
    const { session, n, winners, winType, feeder, winnerFans, tianque, penaltyCounts, ting, chickenCounts, multiplier, scores } = params;
    const totalBasePerWinner = winners.map((w) => {
      const fan = winnerFans.find((x) => x.winner === w);
      const fanScore = fan ? fan.score : 2;
      const penalty = penaltyCounts[w] || 0;
      return fanScore - penalty;
    });
    const payers = winType === "zimo"
      ? [...Array(n)].map((_, i) => i).filter((i) => i !== winners[0])
      : [feeder];
    const payPerPerson = winType === "zimo" ? totalBasePerWinner[0] : totalBasePerWinner.reduce((s, t) => s + t, 0);

    return session.players.map((name, i) => {
      const items = [];
      const winnerIdx = winners.indexOf(i);
      if (winnerIdx >= 0) {
        const winnerReceive = winType === "zimo"
          ? totalBasePerWinner[winnerIdx] * (n - 1)
          : totalBasePerWinner[winnerIdx];
        items.push(`收番型: +${winnerReceive}`);
      } else if (payers.includes(i)) {
        items.push(`付番型: -${payPerPerson}`);
      }
      if (tianque && tianque.includes(i)) {
        const notTianqueCount = n - tianque.length;
        items.push(`收天缺: +${2 * notTianqueCount}`);
      } else if (tianque && tianque.length > 0) {
        items.push(`付天缺: -${2 * tianque.length}`);
      }
      if (penaltyCounts && penaltyCounts[i] > 0) {
        items.push(`查缺罚分: -${penaltyCounts[i]}`);
      }
      const chickenReceive = ting.includes(i) && chickenCounts[i] > 0
        ? chickenCounts[i] * multiplier * (n - 1)
        : 0;
      let chickenPay = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i && ting.includes(j) && chickenCounts[j] > 0) {
          chickenPay += chickenCounts[j] * multiplier;
        }
      }
      if (chickenReceive > 0 || chickenPay > 0) {
        if (chickenReceive > 0) items.push(`收鸡分: +${chickenReceive}`);
        if (chickenPay > 0) items.push(`付鸡分: -${chickenPay}`);
      }
      const score = scores ? scores[i] : 0;
      items.push(`小计: ${score >= 0 ? "+" : ""}${score}`);
      return { name, items };
    });
  }

  function calcWinRound(params) {
    const {
      n,
      winners,
      winType,
      feeder,
      winnerFans,
      tianque,
      penaltyCounts,
      ting,
      chickenCounts,
      multiplier,
    } = params;

    const totalBasePerWinner = winners.map((w) => {
      const fan = winnerFans.find((x) => x.winner === w);
      const fanScore = fan ? fan.score : 2;
      const penalty = penaltyCounts[w] || 0;
      return fanScore - penalty;
    });

    const scores = [...Array(n)].fill(0);

    if (winType === "zimo") {
      const winner = winners[0];
      const totalBase = totalBasePerWinner[0];
      const payers = [...Array(n)].map((_, i) => i).filter((i) => i !== winner);
      payers.forEach((i) => {
        scores[i] -= totalBase;
      });
      scores[winner] += totalBase * payers.length;
    } else {
      const payTotal = totalBasePerWinner.reduce((s, t) => s + t, 0);
      scores[feeder] -= payTotal;
      winners.forEach((w, idx) => (scores[w] += totalBasePerWinner[idx]));
    }

    for (let i = 0; i < n; i++) {
      if (!tianque.includes(i)) continue;
      const notTianque = [...Array(n)].map((_, j) => j).filter((j) => !tianque.includes(j));
      notTianque.forEach((j) => {
        scores[j] -= 2;
        scores[i] += 2;
      });
    }

    for (let i = 0; i < n; i++) {
      if (!ting.includes(i) || chickenCounts[i] <= 0) continue;
      const chickenPerPerson = chickenCounts[i] * multiplier;
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          scores[j] -= chickenPerPerson;
          scores[i] += chickenPerPerson;
        }
      }
    }

    return scores;
  }

  function collectLiujuFormData(session) {
    const form = document.getElementById("liuju-form");
    const n = session.players.length;
    const ting = Array.from(form.querySelectorAll('input[name="ting"]:checked')).map((c) =>
      parseInt(c.value, 10)
    );
    const scores = calcLiujuRound(n, ting);

    const notTing = [...Array(n)].map((_, i) => i).filter((i) => !ting.includes(i));
    const baseBreakdown = [
      `未听牌：${notTing.map((i) => session.players[i]).join("、")}`,
      `听牌：${ting.map((i) => session.players[i]).join("、")}`,
      `规则：未听牌者向每位听牌者付 2 分`,
    ];

    const playerBreakdown = session.players.map((name, i) => {
      const items = [];
      if (ting.includes(i)) {
        items.push(`流局收分：未听牌${notTing.length}人 × 2分 = +${2 * notTing.length}`);
      } else {
        items.push(`流局付分：听牌${ting.length}人 × 2分 = -${2 * ting.length}`);
      }
      items.push(`小计：${scores[i] >= 0 ? "+" : ""}${scores[i]}`);
      return { name, items };
    });

    return {
      type: "liuju",
      ting,
      scores,
      detail: { baseBreakdown, playerBreakdown },
    };
  }

  function calcLiujuRound(n, ting) {
    const scores = [...Array(n)].fill(0);
    const notTing = [...Array(n)].map((_, i) => i).filter((i) => !ting.includes(i));
    for (const i of notTing) {
      for (const j of ting) {
        scores[i] -= 2;
        scores[j] += 2;
      }
    }
    return scores;
  }

  function showRoundResult(state) {
    const round = state.lastRound;
    const { session } = state;
    const n = session.players.length;

    const el = document.getElementById("round-scores");
    el.innerHTML = [...Array(n)]
      .map((_, i) => {
        const s = round.scores[i];
        let cls = "score-item";
        if (s > 0) cls += " positive";
        else if (s < 0) cls += " negative";
        else cls += " zero";
        return `<div class="${cls}">
          <span class="name">${escapeHtml(session.players[i])}</span>
          <span class="value">${s >= 0 ? "+" : ""}${s}</span>
        </div>`;
      })
      .join("");

    const detailEl = document.getElementById("round-detail");
    detailEl.innerHTML = buildDetailHtml(round, session);
    detailEl.classList.toggle("hidden", !detailEl.innerHTML);

    document.querySelector(".round-entry").classList.add("hidden");
    document.querySelector(".round-result").classList.remove("hidden");
    renderScoreboard(state);
  }

  function renderHistory(state) {
    const { session } = state;
    const list = document.getElementById("history-list");
    if (session.rounds.length === 0) {
      list.innerHTML = "<p style='color:var(--text-muted);font-size:0.9rem'>暂无记录</p>";
      return;
    }
    list.innerHTML = session.rounds
      .map((r, idx) => {
        const summary = formatRoundSummary(session, r, idx + 1);
        return `<div class="history-item" data-idx="${idx}">
          <span class="summary">${summary}</span>
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
        document.getElementById("history-detail-overlay").classList.remove("hidden");
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  init();
})();
