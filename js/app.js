(function () {
  "use strict";

  const STORAGE_KEY = "challenge-local-v1";
  const base = window.CHALLENGE;
  if (!base) {
    console.error("CHALLENGE data missing");
    return;
  }

  const LOSS_RATIO = 0.15;
  const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  function parseDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatRu(iso) {
    const d = parseDate(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function daysBetween(a, b) {
    const ms = parseDate(b) - parseDate(a);
    return Math.round(ms / 86400000);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { weights: {}, checkIns: {} };
    } catch {
      return { weights: {}, checkIns: {} };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let local = loadLocal();

  function getWeight(p) {
    if (local.weights[p.id] != null) return Number(local.weights[p.id]);
    return Number(p.currentWeight);
  }

  function getTarget(p) {
    return Math.round(p.startWeight * (1 - LOSS_RATIO) * 10) / 10;
  }

  function getCheckIn(personId, dateIso) {
    const fromLocal = local.checkIns?.[dateIso]?.[personId];
    if (fromLocal) return fromLocal;
    const fromBase = base.checkIns?.[dateIso]?.[personId];
    return fromBase || { sport: false, noSmoke: false };
  }

  function setCheckIn(personId, dateIso, field, value) {
    if (!local.checkIns[dateIso]) local.checkIns[dateIso] = {};
    const prev = getCheckIn(personId, dateIso);
    local.checkIns[dateIso][personId] = { ...prev, [field]: value };
    saveLocal(local);
  }

  function setWeight(personId, kg) {
    local.weights[personId] = kg;
    saveLocal(local);
  }

  function weightProgress(p) {
    const start = p.startWeight;
    const target = getTarget(p);
    const current = getWeight(p);
    const need = start - target;
    const done = start - current;
    if (need <= 0) return 100;
    const pct = Math.max(0, Math.min(100, (done / need) * 100));
    return Math.round(pct * 10) / 10;
  }

  function lostKg(p) {
    return Math.round((p.startWeight - getWeight(p)) * 10) / 10;
  }

  function streak(personId, field) {
    const start = parseDate(base.startDate);
    const end = parseDate(base.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = today > end ? new Date(end) : new Date(today);
    if (cursor < start) return 0;
    let count = 0;
    while (cursor >= start) {
      const iso = toISO(cursor);
      const c = getCheckIn(personId, iso);
      if (!c[field]) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function renderCountdown() {
    const el = document.getElementById("countdown");
    const dates = document.getElementById("hero-dates");
    dates.textContent = `${formatRu(base.startDate)} — ${formatRu(base.endDate)}`;

    const today = toISO(new Date());
    const total = daysBetween(base.startDate, base.endDate);
    let phase = "";
    let num = 0;
    let label = "";

    if (today < base.startDate) {
      num = daysBetween(today, base.startDate);
      label = num === 1 ? "день до старта" : num < 5 ? "дня до старта" : "дней до старта";
      phase = "Скоро старт";
    } else if (today > base.endDate) {
      num = 0;
      label = "челлендж завершён";
      phase = "Финиш";
    } else {
      num = daysBetween(today, base.endDate);
      label = num === 1 ? "день до финиша" : num < 5 ? "дня до финиша" : "дней до финиша";
      const dayN = daysBetween(base.startDate, today) + 1;
      phase = `День ${dayN} из ${total + 1}`;
    }

    el.innerHTML = `
      <span class="countdown__phase">${phase}</span>
      <span class="countdown__num">${num}</span>
      <span class="countdown__label">${label}</span>
    `;
  }

  function renderGoals() {
    const list = document.getElementById("goals-list");
    list.innerHTML = base.goals
      .map(
        (text, i) => `
      <li class="goal">
        <span class="goal__n">0${i + 1}</span>
        <p class="goal__text">${text}</p>
      </li>`
      )
      .join("");
  }

  function renderTeam() {
    const root = document.getElementById("team");
    root.innerHTML = base.participants
      .map((p) => {
        const target = getTarget(p);
        const current = getWeight(p);
        const pct = weightProgress(p);
        const lost = lostKg(p);
        return `
        <article class="person" style="--person-color:${p.color}">
          <h3 class="person__name">${p.name}</h3>
          <p class="person__meta">Старт ${p.startWeight} кг → цель ${target} кг</p>
          <div class="person__stats">
            <div>
              <span class="stat__label">Сейчас</span>
              <span class="stat__value">${current}</span>
            </div>
            <div>
              <span class="stat__label">Сброшено</span>
              <span class="stat__value">${lost > 0 ? "−" + lost : lost}</span>
            </div>
          </div>
          <div class="progress">
            <div class="progress__head">
              <span>К цели −15%</span>
              <span>${pct}%</span>
            </div>
            <div class="progress__bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress__fill" data-pct="${pct}"></div>
            </div>
          </div>
          <div class="streaks">
            <div class="streak">Спорт: <strong>${streak(p.id, "sport")}</strong> дн.</div>
            <div class="streak">Без курения: <strong>${streak(p.id, "noSmoke")}</strong> дн.</div>
          </div>
          <form class="weight-form" data-id="${p.id}">
            <label>
              Обновить вес (кг)
              <input type="number" step="0.1" min="30" max="250" value="${current}" name="weight" required />
            </label>
            <button type="submit" class="btn btn--small">OK</button>
          </form>
        </article>`;
      })
      .join("");

    requestAnimationFrame(() => {
      root.querySelectorAll(".progress__fill").forEach((bar) => {
        bar.style.width = bar.dataset.pct + "%";
      });
    });

    root.querySelectorAll(".weight-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = form.dataset.id;
        const kg = Number(new FormData(form).get("weight"));
        if (!Number.isFinite(kg) || kg <= 0) return;
        setWeight(id, Math.round(kg * 10) / 10);
        renderAll();
        flashStatus("Вес сохранён локально. Скопируйте данные и запушьте, чтобы все увидели.");
      });
    });
  }

  function renderToday() {
    const today = toISO(new Date());
    document.getElementById("today-date").textContent = formatRu(today);
    const grid = document.getElementById("today-grid");
    const inRange = today >= base.startDate && today <= base.endDate;

    if (!inRange) {
      grid.innerHTML = `<p class="section__lead" style="margin:0">Отметки доступны с ${formatRu(base.startDate)} по ${formatRu(base.endDate)}.</p>`;
      return;
    }

    grid.innerHTML = base.participants
      .map((p) => {
        const c = getCheckIn(p.id, today);
        return `
        <div class="check-card" data-id="${p.id}">
          <h3 class="check-card__name">${p.name}</h3>
          <label class="check">
            <input type="checkbox" data-field="sport" ${c.sport ? "checked" : ""} />
            <span>Спорт сегодня</span>
          </label>
          <label class="check">
            <input type="checkbox" data-field="noSmoke" ${c.noSmoke ? "checked" : ""} />
            <span>Без курения</span>
          </label>
        </div>`;
      })
      .join("");

    grid.querySelectorAll(".check-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelectorAll("input[type=checkbox]").forEach((input) => {
        input.addEventListener("change", () => {
          setCheckIn(id, today, input.dataset.field, input.checked);
          renderTeam();
          renderCalendar();
        });
      });
    });
  }

  let activePerson = base.participants[0].id;

  function renderCalTabs() {
    const tabs = document.getElementById("cal-tabs");
    tabs.innerHTML = base.participants
      .map(
        (p) => `
      <button type="button" class="cal-tab" role="tab" data-id="${p.id}"
        aria-selected="${p.id === activePerson}">${p.name}</button>`
      )
      .join("");

    tabs.querySelectorAll(".cal-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activePerson = btn.dataset.id;
        renderCalTabs();
        renderCalendar();
      });
    });
  }

  function renderCalendar() {
    const root = document.getElementById("calendar");
    const start = parseDate(base.startDate);
    const end = parseDate(base.endDate);
    const todayIso = toISO(new Date());

    // Build from Monday of start week through end
    const first = new Date(start);
    const dow = (first.getDay() + 6) % 7; // Mon=0
    first.setDate(first.getDate() - dow);

    const last = new Date(end);
    const lastDow = (last.getDay() + 6) % 7;
    last.setDate(last.getDate() + (6 - lastDow));

    let html = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
    const cursor = new Date(first);

    while (cursor <= last) {
      const iso = toISO(cursor);
      const inChallenge = iso >= base.startDate && iso <= base.endDate;
      const dayNum = cursor.getDate();

      if (!inChallenge) {
        html += `<div class="cal-day cal-day--out" title="${formatRu(iso)}">${dayNum}</div>`;
      } else {
        const c = getCheckIn(activePerson, iso);
        let cls = "cal-day";
        if (c.sport && c.noSmoke) cls += " cal-day--full";
        else if (c.sport || c.noSmoke) cls += " cal-day--partial";
        if (iso === todayIso) cls += " cal-day--today";
        const tip = [
          formatRu(iso),
          c.sport ? "спорт ✓" : "спорт ✗",
          c.noSmoke ? "без курения ✓" : "курение ✗",
        ].join(" · ");
        html += `<div class="${cls}" title="${tip}">${dayNum}</div>`;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    root.innerHTML = html;
  }

  function mergedExport() {
    const participants = base.participants.map((p) => ({
      ...p,
      currentWeight: getWeight(p),
    }));

    const checkIns = { ...(base.checkIns || {}) };
    for (const [date, people] of Object.entries(local.checkIns || {})) {
      checkIns[date] = { ...(checkIns[date] || {}), ...people };
    }

    return {
      ...base,
      participants,
      checkIns,
    };
  }

  function flashStatus(msg) {
    const el = document.getElementById("sync-status");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      el.hidden = true;
    }, 5000);
  }

  function setupSync() {
    document.getElementById("btn-copy").addEventListener("click", async () => {
      const data = mergedExport();
      const text =
        "/** Общие данные челленджа — правьте и пушьте, чтобы все видели актуальный прогресс */\n" +
        "window.CHALLENGE = " +
        JSON.stringify(data, null, 2) +
        ";\n";

      try {
        await navigator.clipboard.writeText(text);
        flashStatus("Скопировано! Вставьте в js/data.js и сделайте git push.");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flashStatus("Скопировано! Вставьте в js/data.js и сделайте git push.");
      }
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (!confirm("Сбросить локальные отметки и веса на этом устройстве?")) return;
      local = { weights: {}, checkIns: {} };
      saveLocal(local);
      renderAll();
      flashStatus("Локальные правки сброшены.");
    });
  }

  function renderAll() {
    renderCountdown();
    renderGoals();
    renderTeam();
    renderToday();
    renderCalTabs();
    renderCalendar();
  }

  setupSync();
  renderAll();
})();
