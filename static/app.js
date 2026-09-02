const state = {
  records: [],
  directions: new Set(["CCW", "CW", "INNER"]),
  rows: new Set(Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, "0"))),
  search: "",
  sortColumn: "plan_no",
  sortDirection: "asc",
  columnOrder: [],
  columnWidths: {},
};

const directionLabels = { CCW: "CCW", CW: "CW", INNER: "Interior" };
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const columnDefinitions = [
  { key: "plan_no", width: 82, value: (record) => Number(record.plan_no) },
  { key: "region", width: 94, value: (record) => record.region },
  { key: "row", width: 62, value: (record) => Number(record.row) },
  { key: "position", width: 72, value: (record) => record.position },
  { key: "measured_dimensions", width: 100, value: (record) => record.measured_dimensions },
  { key: "xbar_coverage_size", width: 100, value: (record) => record.xbar_coverage_size },
  { key: "pixels", width: 74, value: (record) => record.pixels },
  { key: "actual_length", width: 105, value: (record) => record.actual_length },
  { key: "progress_2000", group: "2000", width: 82, value: (record) => record.progress?.["2000_mm"] },
  { key: "done_2000", group: "2000", width: 62, value: (record) => record.completion?.["2000_mm"]?.done ?? false },
  { key: "date_2000", group: "2000", width: 138, value: (record) => record.completion?.["2000_mm"]?.date },
  { key: "progress_1500", group: "1500", width: 82, value: (record) => record.progress?.["1500_mm"] },
  { key: "done_1500", group: "1500", width: 62, value: (record) => record.completion?.["1500_mm"]?.done ?? false },
  { key: "date_1500", group: "1500", width: 138, value: (record) => record.completion?.["1500_mm"]?.date },
  { key: "progress_1000", group: "1000", width: 82, value: (record) => record.progress?.["1000_mm"] },
  { key: "done_1000", group: "1000", width: 62, value: (record) => record.completion?.["1000_mm"]?.done ?? false },
  { key: "date_1000", group: "1000", width: 138, value: (record) => record.completion?.["1000_mm"]?.date },
  { key: "cutting_length", width: 86, value: (record) => record.cutting_length },
  { key: "actual_cutted_pixel", width: 108, value: (record) => record.actual_cutted_pixel },
  { key: "remarks", width: 230, value: (record) => record.remarks },
];
const defaultColumnOrder = columnDefinitions.map((column) => column.key);
const columnByKey = new Map(columnDefinitions.map((column) => [column.key, column]));

function loadTablePreferences() {
  try {
    const savedOrder = JSON.parse(localStorage.getItem("installation-column-order"));
    const savedWidths = JSON.parse(localStorage.getItem("installation-column-widths"));
    state.columnOrder = Array.isArray(savedOrder)
      && savedOrder.length === defaultColumnOrder.length
      && savedOrder.every((key) => columnByKey.has(key))
      ? savedOrder
      : [...defaultColumnOrder];
    state.columnWidths = savedWidths && typeof savedWidths === "object" ? savedWidths : {};
  } catch {
    state.columnOrder = [...defaultColumnOrder];
    state.columnWidths = {};
  }
}

function saveTablePreferences() {
  localStorage.setItem("installation-column-order", JSON.stringify(state.columnOrder));
  localStorage.setItem("installation-column-widths", JSON.stringify(state.columnWidths));
}

function setupTableColumns() {
  const table = document.querySelector("table");
  const headerCells = [...table.querySelectorAll("thead th")];
  const colgroup = document.createElement("colgroup");

  headerCells.forEach((header, index) => {
    const key = defaultColumnOrder[index];
    const label = header.textContent.trim();
    header.dataset.column = key;
    const group = columnByKey.get(key).group;
    if (group) header.classList.add("stage-column", `stage-${group}`);
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-label", `Sort by ${label}; drag to move column`);
    header.innerHTML = `<span class="header-label">${escapeHtml(label)}</span><span class="sort-indicator" aria-hidden="true"></span><span class="resize-handle" title="Resize ${escapeHtml(label)}" aria-hidden="true"></span>`;
    header.addEventListener("click", handleHeaderSort);
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        sortByColumn(key);
      }
    });
    header.addEventListener("pointerdown", startColumnDrag);
    header.querySelector(".resize-handle").addEventListener("pointerdown", startColumnResize);

    const column = document.createElement("col");
    column.dataset.column = key;
    colgroup.append(column);
  });
  table.prepend(colgroup);
  applyColumnLayout();
  updateSortIndicators();
}

function columnWidth(key) {
  return Number(state.columnWidths[key]) || columnByKey.get(key).width;
}

function applyColumnLayout() {
  const table = document.querySelector("table");
  const headerRow = table.querySelector("thead tr");
  const colgroup = table.querySelector("colgroup");
  const headers = new Map([...headerRow.cells].map((cell) => [cell.dataset.column, cell]));
  const columns = new Map([...colgroup.children].map((column) => [column.dataset.column, column]));

  state.columnOrder.forEach((key) => {
    headerRow.append(headers.get(key));
    colgroup.append(columns.get(key));
    columns.get(key).style.width = `${columnWidth(key)}px`;
  });
  document.querySelectorAll("#installation-body tr").forEach((row) => {
    const cells = new Map([...row.cells].map((cell) => [cell.dataset.column, cell]));
    state.columnOrder.forEach((key) => row.append(cells.get(key)));
  });
  const totalWidth = state.columnOrder.reduce((total, key) => total + columnWidth(key), 0);
  table.style.width = `${Math.max(totalWidth, table.parentElement.clientWidth)}px`;
}

let columnWasDragged = false;
let columnDrag = null;

function startColumnDrag(event) {
  if (event.button !== 0 || event.target.closest(".resize-handle")) return;
  const key = event.currentTarget.dataset.column;
  const group = columnByKey.get(key).group;
  columnDrag = {
    header: event.currentTarget,
    key,
    keys: group
      ? state.columnOrder.filter((column) => columnByKey.get(column).group === group)
      : [key],
    startX: event.clientX,
    startY: event.clientY,
    target: null,
    moved: false,
  };
  window.addEventListener("pointermove", moveColumnDrag);
  window.addEventListener("pointerup", finishColumnDrag, { once: true });
}

function moveColumnDrag(event) {
  if (!columnDrag) return;
  const distance = Math.hypot(event.clientX - columnDrag.startX, event.clientY - columnDrag.startY);
  if (!columnDrag.moved && distance < 6) return;
  columnDrag.moved = true;
  columnWasDragged = true;
  columnDrag.keys.forEach((key) => document.querySelector(`th[data-column="${key}"]`)?.classList.add("dragging"));
  document.querySelectorAll("thead th.drop-target").forEach((header) => header.classList.remove("drop-target"));
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("th[data-column]");
  columnDrag.target = target && !columnDrag.keys.includes(target.dataset.column) ? target : null;
  if (columnDrag.target) {
    const targetGroup = columnByKey.get(columnDrag.target.dataset.column).group;
    const targetKeys = targetGroup
      ? state.columnOrder.filter((key) => columnByKey.get(key).group === targetGroup)
      : [columnDrag.target.dataset.column];
    targetKeys.forEach((key) => document.querySelector(`th[data-column="${key}"]`)?.classList.add("drop-target"));
  }
}

function finishColumnDrag(event) {
  window.removeEventListener("pointermove", moveColumnDrag);
  if (!columnDrag) return;
  const { keys, target, moved } = columnDrag;
  document.querySelectorAll("thead th.dragging, thead th.drop-target").forEach((header) => header.classList.remove("dragging", "drop-target"));

  if (moved && target) {
    const order = state.columnOrder.filter((column) => !keys.includes(column));
    const targetGroup = columnByKey.get(target.dataset.column).group;
    const targetKeys = targetGroup
      ? order.filter((key) => columnByKey.get(key).group === targetGroup)
      : [target.dataset.column];
    const dropAfter = event.clientX > target.getBoundingClientRect().left + target.offsetWidth / 2;
    let targetIndex = dropAfter
      ? Math.max(...targetKeys.map((key) => order.indexOf(key))) + 1
      : Math.min(...targetKeys.map((key) => order.indexOf(key)));
    order.splice(targetIndex, 0, ...keys);
    state.columnOrder = order;
    saveTablePreferences();
    applyColumnLayout();
  }
  columnDrag = null;
  setTimeout(() => { columnWasDragged = false; }, 0);
}

function startColumnResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const header = event.currentTarget.closest("th");
  const key = header.dataset.column;
  const startX = event.clientX;
  const startWidth = columnWidth(key);
  document.body.classList.add("resizing-column");

  function resize(moveEvent) {
    state.columnWidths[key] = Math.max(52, Math.round(startWidth + moveEvent.clientX - startX));
    applyColumnLayout();
  }
  function stopResize() {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("resizing-column");
    saveTablePreferences();
  }
  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize, { once: true });
}

function handleHeaderSort(event) {
  if (columnWasDragged || event.target.closest(".resize-handle")) return;
  sortByColumn(event.currentTarget.dataset.column);
}

function sortByColumn(key) {
  if (state.sortColumn === key) {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  } else {
    state.sortColumn = key;
    state.sortDirection = "asc";
  }
  updateSortIndicators();
  render();
}

function updateSortIndicators() {
  document.querySelectorAll("thead th").forEach((header) => {
    const active = header.dataset.column === state.sortColumn;
    header.querySelector(".sort-indicator").textContent = active ? (state.sortDirection === "asc" ? "↑" : "↓") : "";
    header.setAttribute("aria-sort", active ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none");
  });
}

function createFilterButton(value, label, type) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "filter-option";
  button.dataset.value = value;
  button.dataset.type = type;
  button.textContent = label;
  button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", () => toggleFilter(button));
  return button;
}

function buildFilters() {
  const directionContainer = document.querySelector("#direction-options");
  Object.entries(directionLabels).forEach(([value, label]) => directionContainer.append(createFilterButton(value, label, "direction")));

  const rowContainer = document.querySelector("#row-options");
  for (let row = 1; row <= 26; row += 1) {
    const value = String(row).padStart(2, "0");
    rowContainer.append(createFilterButton(value, String(row), "row"));
  }
}

function toggleFilter(button) {
  const selection = button.dataset.type === "direction" ? state.directions : state.rows;
  selection.has(button.dataset.value) ? selection.delete(button.dataset.value) : selection.add(button.dataset.value);
  button.setAttribute("aria-pressed", String(selection.has(button.dataset.value)));
  render();
}

function setFilterGroup(type, selectAll) {
  const selection = type === "direction" ? state.directions : state.rows;
  selection.clear();
  document.querySelectorAll(`[data-type="${type}"]`).forEach((button) => {
    if (selectAll) selection.add(button.dataset.value);
    button.setAttribute("aria-pressed", String(selectAll));
  });
  render();
}

function filteredRecords() {
  const query = state.search.trim().toLowerCase();
  const records = state.records.filter((record) => {
    const haystack = `${record.plan_no} ${record.position}`.toLowerCase();
    return state.directions.has(record.region)
      && state.rows.has(String(record.row).padStart(2, "0"))
      && (!query || haystack.includes(query));
  });
  const definition = columnByKey.get(state.sortColumn);
  const direction = state.sortDirection === "asc" ? 1 : -1;
  return records.sort((left, right) => {
    const leftValue = definition.value(left);
    const rightValue = definition.value(right);
    if (leftValue === null || leftValue === undefined || leftValue === "") return rightValue === null || rightValue === undefined || rightValue === "" ? 0 : 1;
    if (rightValue === null || rightValue === undefined || rightValue === "") return -1;
    if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}

function valueOrDash(value) {
  return value === null || value === undefined ? "–" : numberFormat.format(value);
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function completionControls(record, stage) {
  const completion = record.completion?.[stage] || { done: false, date: null };
  const checked = completion.done ? " checked" : "";
  const disabled = completion.done ? "" : " disabled";
  return `
    <td class="completion-cell">
      <input class="done-checkbox" type="checkbox" data-id="${escapeHtml(record.id)}" data-stage="${stage}" aria-label="Mark ${stage.replace("_", " ")} done for plan ${escapeHtml(record.plan_no)}"${checked}>
    </td>
    <td class="date-cell">
      <input class="date-input" type="date" data-id="${escapeHtml(record.id)}" data-stage="${stage}" aria-label="Completion date for ${stage.replace("_", " ")} on plan ${escapeHtml(record.plan_no)}" value="${escapeHtml(completion.date || "")}"${disabled}>
    </td>`;
}

function detailControls(record) {
  return `
    <td class="actual-cut-cell">
      <input class="actual-cut-input" type="number" min="0" step="1" inputmode="numeric" data-id="${escapeHtml(record.id)}" aria-label="Actual Cut for plan ${escapeHtml(record.plan_no)}" value="${escapeHtml(record.actual_cutted_pixel ?? "")}">
    </td>
    <td class="remarks-cell">
      <textarea class="remarks-input" rows="1" maxlength="1000" data-id="${escapeHtml(record.id)}" aria-label="Remarks for plan ${escapeHtml(record.plan_no)}" placeholder="Add remarks">${escapeHtml(record.remarks ?? "")}</textarea>
    </td>`;
}

function renderTable(records) {
  const body = document.querySelector("#installation-body");
  const emptyState = document.querySelector("#empty-state");
  body.replaceChildren();
  emptyState.hidden = records.length !== 0;
  const fragment = document.createDocumentFragment();

  records.forEach((record) => {
    const row = document.createElement("tr");
    const regionClass = record.region === "INNER" ? "region-tag inner" : "region-tag";
    row.innerHTML = `
      <td><strong>${escapeHtml(record.plan_no)}</strong></td>
      <td><span class="${regionClass}">${escapeHtml(directionLabels[record.region] || record.region)}</span></td>
      <td>${escapeHtml(record.row)}</td><td>${escapeHtml(record.position)}</td>
      <td class="number">${valueOrDash(record.measured_dimensions)}</td>
      <td class="number">${valueOrDash(record.xbar_coverage_size)}</td>
      <td class="number">${valueOrDash(record.pixels)}</td>
      <td class="number">${valueOrDash(record.actual_length)}</td>
      <td class="number">${valueOrDash(record.progress?.["2000_mm"])}</td>
      ${completionControls(record, "2000_mm")}
      <td class="number">${valueOrDash(record.progress?.["1500_mm"])}</td>
      ${completionControls(record, "1500_mm")}
      <td class="number">${valueOrDash(record.progress?.["1000_mm"])}</td>
      ${completionControls(record, "1000_mm")}
      <td class="number">${valueOrDash(record.cutting_length)}</td>
      ${detailControls(record)}`;
    [...row.cells].forEach((cell, index) => {
      const key = defaultColumnOrder[index];
      cell.dataset.column = key;
      const group = columnByKey.get(key).group;
      if (group) cell.classList.add("stage-column", `stage-${group}`);
    });
    fragment.append(row);
  });
  body.append(fragment);
  applyColumnLayout();
  body.querySelectorAll(".done-checkbox").forEach((checkbox) => checkbox.addEventListener("change", handleDoneChange));
  body.querySelectorAll(".date-input").forEach((input) => input.addEventListener("change", handleDateChange));
  body.querySelectorAll(".actual-cut-input").forEach((input) => input.addEventListener("change", handleDetailChange));
  body.querySelectorAll(".remarks-input").forEach((input) => input.addEventListener("change", handleDetailChange));
}

function today() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function findRecord(documentId) {
  return state.records.find((record) => record.id === documentId);
}

function setCompletion(record, stage, done, date) {
  record.completion ||= {};
  record.completion[stage] = { done, date };
}

async function saveCompletion(documentId, stage, done, date, controls) {
  controls.forEach((control) => { control.disabled = true; });
  const checkbox = controls.find((control) => control.type === "checkbox");
  const dateInput = controls.find((control) => control.type === "date");
  try {
    const response = await fetch(`/api/installations/${encodeURIComponent(documentId)}/completion/${stage}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done, date }),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || `Save failed: ${response.status}`);
    }
    setCompletion(findRecord(documentId), stage, done, date);
  } catch (error) {
    alert(error.message);
    render();
  } finally {
    checkbox.disabled = false;
    dateInput.disabled = !done;
  }
}

function stageControls(documentId, stage) {
  const selector = `[data-id="${CSS.escape(documentId)}"][data-stage="${stage}"]`;
  return [...document.querySelectorAll(selector)];
}

function handleDoneChange(event) {
  const checkbox = event.currentTarget;
  const controls = stageControls(checkbox.dataset.id, checkbox.dataset.stage);
  const dateInput = controls.find((control) => control.type === "date");
  const date = checkbox.checked ? (dateInput.value || today()) : null;
  dateInput.value = date || "";
  dateInput.disabled = !checkbox.checked;
  saveCompletion(checkbox.dataset.id, checkbox.dataset.stage, checkbox.checked, date, controls);
}

function handleDateChange(event) {
  const dateInput = event.currentTarget;
  if (!dateInput.value) return;
  const controls = stageControls(dateInput.dataset.id, dateInput.dataset.stage);
  const checkbox = controls.find((control) => control.type === "checkbox");
  checkbox.checked = true;
  saveCompletion(dateInput.dataset.id, dateInput.dataset.stage, true, dateInput.value, controls);
}

async function handleDetailChange(event) {
  const control = event.currentTarget;
  const field = control.classList.contains("actual-cut-input") ? "actual_cutted_pixel" : "remarks";
  let value = control.value.trim() || null;
  if (field === "actual_cutted_pixel" && value !== null) {
    if (!/^\d+$/.test(value)) {
      alert("Actual Cut must be a whole number.");
      render();
      return;
    }
    value = Number(value);
    if (!Number.isSafeInteger(value)) {
      alert("Actual Cut is too large for this browser.");
      render();
      return;
    }
  }

  control.disabled = true;
  try {
    const response = await fetch(`/api/installations/${encodeURIComponent(control.dataset.id)}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || `Save failed: ${response.status}`);
    }
    findRecord(control.dataset.id)[field] = value;
    control.classList.add("saved");
    setTimeout(() => control.classList.remove("saved"), 700);
  } catch (error) {
    alert(error.message);
    render();
  } finally {
    control.disabled = false;
  }
}

function renderSummary(records) {
  const stageTotal = (stage) => records.reduce(
    (total, record) => total + (Number(record.progress?.[stage]) || 0),
    0,
  );
  const stageInstalled = (stage) => records.reduce(
    (total, record) => total + (record.completion?.[stage]?.done ? (Number(record.progress?.[stage]) || 0) : 0),
    0,
  );
  const total2000 = stageTotal("2000_mm");
  const total1500 = stageTotal("1500_mm");
  const total1000 = stageTotal("1000_mm");
  const installed2000 = stageInstalled("2000_mm");
  const installed1500 = stageInstalled("1500_mm");
  const installed1000 = stageInstalled("1000_mm");
  const values = {
    2000: [total2000, installed2000],
    1500: [total1500, installed1500],
    1000: [total1000, installed1000],
    total: [total2000 + total1500 + total1000, installed2000 + installed1500 + installed1000],
  };
  Object.entries(values).forEach(([key, [total, installed]]) => {
    const remaining = Math.max(0, total - installed);
    document.querySelector(`#metric-${key}-total`).textContent = numberFormat.format(total);
    document.querySelector(`#metric-${key}-installed`).textContent = numberFormat.format(installed);
    document.querySelector(`#metric-${key}-remaining`).textContent = numberFormat.format(remaining);
  });
  document.querySelector("#result-count").textContent = `Showing ${records.length} of ${state.records.length} records`;
}

function render() {
  const records = filteredRecords();
  renderSummary(records);
  renderTable(records);
}

async function loadData() {
  const status = document.querySelector("#data-status");
  try {
    const response = await fetch("/api/installations");
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const payload = await response.json();
    state.records = payload.records;
    status.classList.add("ready");
    status.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${payload.count} Firestore records ready`;
    render();
  } catch (error) {
    status.classList.add("error");
    status.innerHTML = `<span class="status-dot" aria-hidden="true"></span>Firestore connection failed`;
    document.querySelector("#result-count").textContent = error.message;
  }
}

function bindControls() {
  document.querySelector("#direction-all").addEventListener("click", () => setFilterGroup("direction", true));
  document.querySelector("#direction-clear").addEventListener("click", () => setFilterGroup("direction", false));
  document.querySelector("#row-all").addEventListener("click", () => setFilterGroup("row", true));
  document.querySelector("#row-clear").addEventListener("click", () => setFilterGroup("row", false));
  document.querySelector("#search-input").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
}

loadTablePreferences();
buildFilters();
bindControls();
setupTableColumns();
lucide.createIcons();
loadData();