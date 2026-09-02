const stages = [
  { key: "2000_mm", suffix: "2000" },
  { key: "1500_mm", suffix: "1500" },
  { key: "1000_mm", suffix: "1000" },
];
const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let records = [];
let chart = null;

function localIsoDate(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function loadSettings() {
  const projectStart = document.querySelector("#project-start");
  const plannedDays = document.querySelector("#planned-days");
  projectStart.value = localStorage.getItem("scoreboard-project-start") || localIsoDate();
  plannedDays.value = localStorage.getItem("scoreboard-planned-days") || "50";
}

function saveSettings() {
  localStorage.setItem("scoreboard-project-start", document.querySelector("#project-start").value);
  localStorage.setItem("scoreboard-planned-days", document.querySelector("#planned-days").value);
}

function stageQuantity(record, stage) {
  return Number(record.progress?.[stage]) || 0;
}

function completedQuantity(record, stage) {
  return record.completion?.[stage]?.done ? stageQuantity(record, stage) : 0;
}

function calculateScoreboard() {
  const plannedByStage = Object.fromEntries(stages.map(({ key }) => [key, records.reduce((total, record) => total + stageQuantity(record, key), 0)]));
  const doneByStage = Object.fromEntries(stages.map(({ key }) => [key, records.reduce((total, record) => total + completedQuantity(record, key), 0)]));
  const daily = new Map();

  records.forEach((record) => {
    stages.forEach(({ key }) => {
      const completion = record.completion?.[key];
      const quantity = completedQuantity(record, key);
      if (completion?.done && completion.date && quantity > 0) {
        daily.set(completion.date, (daily.get(completion.date) || 0) + quantity);
      }
    });
  });

  return {
    plannedByStage,
    doneByStage,
    totalPlanned: Object.values(plannedByStage).reduce((total, value) => total + value, 0),
    totalDone: Object.values(doneByStage).reduce((total, value) => total + value, 0),
    daily,
  };
}

function scheduleDates(start, plannedDays) {
  return Array.from({ length: plannedDays }, (_, index) => addDays(start, index));
}

function renderStageScores(scoreboard) {
  document.querySelector("#installation-count").textContent = integerFormat.format(records.length);
  stages.forEach(({ key, suffix }) => {
    document.querySelector(`#planned-${suffix}`).textContent = integerFormat.format(scoreboard.plannedByStage[key]);
    document.querySelector(`#done-${suffix}`).textContent = integerFormat.format(scoreboard.doneByStage[key]);
  });
  document.querySelector("#total-planned").textContent = integerFormat.format(scoreboard.totalPlanned);
  document.querySelector("#total-done").textContent = integerFormat.format(scoreboard.totalDone);
}

function renderKpis(scoreboard, start, plannedDays) {
  const today = parseIsoDate(localIsoDate());
  const elapsed = Math.max(0, Math.min(plannedDays, Math.floor((today - start) / 86400000) + 1));
  const remaining = Math.max(0, plannedDays - elapsed);
  const timeUsed = elapsed / plannedDays;
  const completion = scoreboard.totalPlanned ? scoreboard.totalDone / scoreboard.totalPlanned : 0;
  const requiredPerDay = scoreboard.totalPlanned ? Math.ceil(scoreboard.totalPlanned / plannedDays) : 0;

  document.querySelector("#kpi-planned-days").textContent = `${plannedDays} days`;
  document.querySelector("#kpi-days-elapsed").textContent = integerFormat.format(elapsed);
  document.querySelector("#kpi-days-remaining").textContent = integerFormat.format(remaining);
  document.querySelector("#kpi-time-used").textContent = `${percentFormat.format(timeUsed * 100)}%`;
  document.querySelector("#kpi-target").textContent = integerFormat.format(requiredPerDay);
  document.querySelector("#kpi-total").textContent = integerFormat.format(scoreboard.totalPlanned);
  document.querySelector("#kpi-installed").textContent = integerFormat.format(scoreboard.totalDone);
  document.querySelector("#kpi-complete").textContent = `${percentFormat.format(completion * 100)}%`;

  const health = document.querySelector("#kpi-health");
  health.className = "health-badge";
  if (completion >= 1) {
    health.textContent = "Complete";
    health.classList.add("complete");
  } else if (completion >= timeUsed) {
    health.textContent = "On track";
    health.classList.add("on-track");
  } else if (completion >= timeUsed * 0.75) {
    health.textContent = "At risk";
    health.classList.add("at-risk");
  } else {
    health.textContent = "Watch";
  }
}

function renderDailyTable(scoreboard, dates) {
  const body = document.querySelector("#daily-body");
  const today = localIsoDate();
  const fragment = document.createDocumentFragment();
  body.replaceChildren();

  dates.forEach((date) => {
    const isoDate = localIsoDate(date);
    const quantity = scoreboard.daily.get(isoDate) || 0;
    const row = document.createElement("tr");
    if (quantity > 0) row.classList.add("active-day");
    if (isoDate === today) row.classList.add("today");
    row.innerHTML = `<td>${formatDate(date)}</td><td>${integerFormat.format(quantity)}</td>`;
    fragment.append(row);
  });
  body.append(fragment);
}

function renderChart(scoreboard, dates) {
  const labels = dates.map(formatDate);
  const values = dates.map((date) => scoreboard.daily.get(localIsoDate(date)) || 0);
  document.querySelector("#chart-range").textContent = `${labels[0]} – ${labels[labels.length - 1]} · ${dates.length} planned days`;

  chart?.destroy();
  chart = new Chart(document.querySelector("#daily-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "X-bars installed",
        data: values,
        backgroundColor: values.map((value) => value > 0 ? "#3f70ba" : "#d8e0da"),
        borderColor: values.map((value) => value > 0 ? "#28558f" : "#c4cec7"),
        borderWidth: 1,
        borderRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { intersect: false, mode: "index" },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0, font: { size: 10 } }, title: { display: true, text: "Installation date" } },
        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "X-bars installed" } },
      },
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
    },
  });
}

function render() {
  const startValue = document.querySelector("#project-start").value;
  const plannedDays = Math.max(1, Math.min(365, Number(document.querySelector("#planned-days").value) || 50));
  if (!startValue) return;
  const start = parseIsoDate(startValue);
  const dates = scheduleDates(start, plannedDays);
  const scoreboard = calculateScoreboard();
  renderStageScores(scoreboard);
  renderKpis(scoreboard, start, plannedDays);
  renderDailyTable(scoreboard, dates);
  renderChart(scoreboard, dates);
}

async function loadData() {
  const status = document.querySelector("#data-status");
  try {
    const response = await fetch("/api/installations");
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const payload = await response.json();
    records = payload.records;
    status.classList.add("ready");
    status.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${payload.count} Firestore records ready`;
    render();
  } catch (error) {
    status.classList.add("error");
    status.innerHTML = `<span class="status-dot" aria-hidden="true"></span>Firestore connection failed`;
    document.querySelector("#chart-range").textContent = error.message;
  }
}

loadSettings();
document.querySelectorAll("#project-start, #planned-days").forEach((input) => input.addEventListener("change", () => {
  saveSettings();
  render();
}));
lucide.createIcons();
loadData();