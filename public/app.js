// ---- State --------------------------------------------------------------
const state = {
  vehicles: [],
  activeId: null,
  selectedTireId: null,
};

const POSITIONS = [
  { key: "front-left", label: "Front Left", short: "FL" },
  { key: "front-right", label: "Front Right", short: "FR" },
  { key: "rear-left", label: "Rear Left", short: "RL" },
  { key: "rear-right", label: "Rear Right", short: "RR" },
  { key: "spare", label: "Spare", short: "SP" },
];
const posLabel = (k) => (POSITIONS.find((p) => p.key === k) || { label: k }).label;
const posShort = (k) => (POSITIONS.find((p) => p.key === k) || { short: "?" }).short;

const STATUS_LABEL = { good: "Good", monitor: "Monitor", replace: "Replace" };

// ---- API ----------------------------------------------------------------
async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

async function loadVehicles() {
  state.vehicles = await api("/api/vehicles");
  if (!state.activeId && state.vehicles.length) state.activeId = state.vehicles[0].id;
  if (state.activeId && !state.vehicles.some((v) => v.id === state.activeId))
    state.activeId = state.vehicles[0]?.id ?? null;
  render();
}

const activeVehicle = () => state.vehicles.find((v) => v.id === state.activeId) || null;

// ---- Rendering ----------------------------------------------------------
function render() {
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const list = document.getElementById("vehicleList");
  if (!state.vehicles.length) {
    list.innerHTML = `<p style="color:var(--text-faint);font-size:13px;padding:8px 6px">No vehicles yet.</p>`;
    return;
  }
  list.innerHTML = state.vehicles
    .map((v) => {
      const dots = POSITIONS.map((p) => {
        const t = v.tires.find((x) => x.position === p.key);
        return `<span class="dot ${t ? t.status : ""}"></span>`;
      }).join("");
      const sub = [v.year, v.make, v.model].filter(Boolean).join(" ") || "—";
      return `<button class="vehicle-item ${v.id === state.activeId ? "active" : ""}" data-vid="${v.id}">
        <span class="vi-name">${esc(v.name)}</span>
        <span class="vi-sub">${esc(sub)}</span>
        <span class="vi-dots">${dots}</span>
      </button>`;
    })
    .join("");
  list.querySelectorAll(".vehicle-item").forEach((el) =>
    el.addEventListener("click", () => {
      state.activeId = Number(el.dataset.vid);
      state.selectedTireId = null;
      render();
    })
  );
}

function renderMain() {
  const main = document.getElementById("main");
  const v = activeVehicle();

  if (!v) {
    main.innerHTML = `
      <div class="empty" style="margin-top:40px">
        ${wheelIcon()}
        <h3>No vehicles in your garage</h3>
        <p>Add a car, truck, or bike to start tracking tread depth, pressure and wear on every tire.</p>
        <button class="btn btn-primary" id="emptyAdd">+ Add your first vehicle</button>
      </div>`;
    document.getElementById("emptyAdd").addEventListener("click", () => openVehicleModal());
    return;
  }

  const tires = v.tires;
  const worst = (s) => tires.filter((t) => t.status === s).length;
  const avgTread = tires.length
    ? (tires.reduce((a, t) => a + (Number(t.tread_mm) || 0), 0) / tires.length).toFixed(1)
    : "—";
  const sub = [v.year, v.make, v.model, v.plate ? "· " + v.plate : ""].filter(Boolean).join(" ");

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(v.name)}</h2>
        <div class="sub">${esc(sub || "No details yet")}</div>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" id="editVehicle">Edit vehicle</button>
        <button class="btn btn-danger" id="deleteVehicle">Delete</button>
        <button class="btn btn-primary" id="addTire">+ Log tire</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Tires logged</div><div class="value">${tires.length}<small> /5</small></div></div>
      <div class="stat accent-good"><div class="label">Good</div><div class="value">${worst("good")}</div></div>
      <div class="stat accent-monitor"><div class="label">Monitor</div><div class="value">${worst("monitor")}</div></div>
      <div class="stat accent-replace"><div class="label">Replace</div><div class="value">${worst("replace")}</div></div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Layout</h3>
        ${renderCar(tires)}
        <div class="car-caption">Avg tread ${avgTread}${avgTread !== "—" ? " mm" : ""} · tap a wheel to log or edit</div>
        ${renderSpare(tires)}
      </div>
      <div>
        ${tires.length ? `<div class="tires">${tires.map(renderTire).join("")}</div>` : emptyTires()}
      </div>
    </div>
  `;

  document.getElementById("editVehicle").addEventListener("click", () => openVehicleModal(v));
  document.getElementById("deleteVehicle").addEventListener("click", () => deleteVehicle(v));
  document.getElementById("addTire").addEventListener("click", () => openTireModal(v));
  const et = document.getElementById("emptyTireBtn");
  if (et) et.addEventListener("click", () => openTireModal(v));

  // Wheel clicks
  main.querySelectorAll(".wheel, .spare-chip").forEach((el) =>
    el.addEventListener("click", () => {
      const pos = el.dataset.pos;
      const existing = tires.find((t) => t.position === pos);
      if (existing) openTireModal(v, existing);
      else openTireModal(v, null, pos);
    })
  );

  // Tire card actions
  main.querySelectorAll("[data-edit-tire]").forEach((el) =>
    el.addEventListener("click", () => {
      const t = tires.find((x) => x.id === Number(el.dataset.editTire));
      openTireModal(v, t);
    })
  );
  main.querySelectorAll("[data-del-tire]").forEach((el) =>
    el.addEventListener("click", () => deleteTire(Number(el.dataset.delTire)))
  );
}

function renderCar(tires) {
  const cls = { "front-left": "fl", "front-right": "fr", "rear-left": "rl", "rear-right": "rr" };
  const wheels = ["front-left", "front-right", "rear-left", "rear-right"]
    .map((pos) => {
      const t = tires.find((x) => x.position === pos);
      const status = t ? t.status : "empty";
      return `<button class="wheel ${cls[pos]} ${status}" data-pos="${pos}" title="${posLabel(pos)}">
        <span class="w-label">${posShort(pos)}</span>
      </button>`;
    })
    .join("");
  return `<div class="car"><div class="car-body"></div>${wheels}</div>`;
}

function renderSpare(tires) {
  const t = tires.find((x) => x.position === "spare");
  const status = t ? t.status : "empty";
  const txt = t ? `Spare · ${STATUS_LABEL[t.status]}${t.tread_mm ? " · " + t.tread_mm + "mm" : ""}` : "Spare · not logged";
  return `<div class="spare-row">
    <button class="spare-chip" data-pos="spare">
      <span class="dot ${status === "empty" ? "" : status}"></span> ${esc(txt)}
    </button>
  </div>`;
}

function renderTire(t) {
  const treadPct = clamp(((Number(t.tread_mm) || 0) / 8) * 100, 0, 100);
  const treadColor = t.status === "replace" ? "var(--replace)" : t.status === "monitor" ? "var(--monitor)" : "var(--good)";
  const psi = t.pressure_psi != null ? t.pressure_psi : null;
  const target = t.target_psi != null ? t.target_psi : null;
  const psiOff = psi != null && target != null ? Math.abs(psi - target) : null;
  const psiNote = psiOff != null && psiOff >= 3 ? ` <small style="color:var(--monitor)">(${psi > target ? "+" : "-"}${psiOff.toFixed(0)})</small>` : "";
  const miles = t.current_mileage != null && t.install_mileage != null
    ? (t.current_mileage - t.install_mileage) : null;

  return `<div class="tire ${t.status}">
    <div class="tire-top">
      <div>
        <div class="tire-pos">${posLabel(t.position)}
          <span class="tire-tag tag-${t.status}">${STATUS_LABEL[t.status]}</span>
        </div>
        <div class="tire-brand">${esc([t.brand, t.model].filter(Boolean).join(" ") || "Unbranded")}${t.size ? " · " + esc(t.size) : ""}</div>
      </div>
      <div class="tire-actions">
        <button class="btn-icon" data-edit-tire="${t.id}" title="Edit" aria-label="Edit">${pencil()}</button>
        <button class="btn-icon" data-del-tire="${t.id}" title="Delete" aria-label="Delete">${trash()}</button>
      </div>
    </div>
    <div class="tire-metrics">
      <div class="metric">
        <div class="m-label">Tread</div>
        <div class="m-val">${t.tread_mm != null ? t.tread_mm + "<small> mm</small>" : "—"}</div>
        <div class="bar"><span style="width:${treadPct}%;background:${treadColor}"></span></div>
      </div>
      <div class="metric">
        <div class="m-label">Pressure</div>
        <div class="m-val">${psi != null ? psi + "<small> psi</small>" : "—"}${psiNote}</div>
      </div>
      <div class="metric">
        <div class="m-label">On vehicle</div>
        <div class="m-val">${miles != null ? miles.toLocaleString() + "<small> mi</small>" : "—"}</div>
      </div>
    </div>
    ${t.notes ? `<div class="tire-notes">${esc(t.notes)}</div>` : ""}
  </div>`;
}

function emptyTires() {
  return `<div class="empty">
    ${wheelIcon()}
    <h3>No tires logged yet</h3>
    <p>Tap a wheel on the diagram, or log a tire to record its brand, tread depth, pressure and status.</p>
    <button class="btn btn-primary" id="emptyTireBtn">+ Log a tire</button>
  </div>`;
}

// ---- Modals -------------------------------------------------------------
const backdrop = document.getElementById("modalBackdrop");
const modalForm = document.getElementById("modalForm");
const modalTitle = document.getElementById("modalTitle");

function openModal(title) {
  modalTitle.textContent = title;
  backdrop.hidden = false;
  setTimeout(() => modalForm.querySelector("input,select,textarea")?.focus(), 40);
}
function closeModal() {
  backdrop.hidden = true;
  modalForm.innerHTML = "";
  modalForm.onsubmit = null;
}
document.getElementById("modalClose").addEventListener("click", closeModal);
backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) closeModal(); });

function field(label, name, opts = {}) {
  const { type = "text", value = "", full = false, hint = "", placeholder = "", step, min } = opts;
  const v = value == null ? "" : value;
  return `<div class="field ${full ? "full" : ""}">
    <label for="f_${name}">${label}</label>
    <input id="f_${name}" name="${name}" type="${type}" value="${esc(String(v))}" placeholder="${esc(placeholder)}" ${step ? `step="${step}"` : ""} ${min != null ? `min="${min}"` : ""} />
    ${hint ? `<span class="hint">${hint}</span>` : ""}
  </div>`;
}

function openVehicleModal(vehicle = null) {
  openModal(vehicle ? "Edit vehicle" : "Add vehicle");
  modalForm.innerHTML = `
    <div class="form-grid">
      ${field("Name", "name", { value: vehicle?.name, full: true, placeholder: "e.g. Weekend Truck" })}
      ${field("Make", "make", { value: vehicle?.make, placeholder: "Toyota" })}
      ${field("Model", "model", { value: vehicle?.model, placeholder: "Tacoma" })}
      ${field("Year", "year", { value: vehicle?.year, placeholder: "2022" })}
      ${field("Plate", "plate", { value: vehicle?.plate, placeholder: "ABC-1234" })}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${vehicle ? "Save" : "Add vehicle"}</button>
      </div>
    </div>`;
  wireCancel();
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData();
    if (!data.name.trim()) return toast("Name is required", true);
    try {
      if (vehicle) {
        await api(`/api/vehicles/${vehicle.id}`, "PUT", data);
        toast("Vehicle updated");
      } else {
        const created = await api("/api/vehicles", "POST", data);
        state.activeId = created.id;
        toast("Vehicle added");
      }
      closeModal();
      await loadVehicles();
    } catch (err) { toast(err.message, true); }
  };
}

function openTireModal(vehicle, tire = null, presetPos = null) {
  openModal(tire ? `Edit ${posLabel(tire.position)}` : "Log tire");
  const usedPositions = vehicle.tires.map((t) => t.position);
  const posOptions = POSITIONS.map((p) => {
    const disabled = !tire && p.key !== presetPos && usedPositions.includes(p.key);
    const selected = (tire?.position || presetPos || firstFree(usedPositions)) === p.key;
    return `<option value="${p.key}" ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}>${p.label}${disabled ? " (logged)" : ""}</option>`;
  }).join("");

  modalForm.innerHTML = `
    <div class="form-grid">
      <div class="field">
        <label for="f_position">Position</label>
        <select id="f_position" name="position">${posOptions}</select>
      </div>
      <div class="field">
        <label for="f_status">Status</label>
        <select id="f_status" name="status">
          <option value="">Auto (from tread)</option>
          <option value="good" ${tire?.status === "good" ? "selected" : ""}>Good</option>
          <option value="monitor" ${tire?.status === "monitor" ? "selected" : ""}>Monitor</option>
          <option value="replace" ${tire?.status === "replace" ? "selected" : ""}>Replace</option>
        </select>
      </div>
      ${field("Brand", "brand", { value: tire?.brand, placeholder: "Michelin" })}
      ${field("Model", "model", { value: tire?.model, placeholder: "Pilot Sport 4S" })}
      ${field("Size", "size", { value: tire?.size, placeholder: "235/40R18" })}
      ${field("Install date", "install_date", { value: tire?.install_date, type: "date" })}
      ${field("Tread depth", "tread_mm", { value: tire?.tread_mm, type: "number", step: "0.1", min: 0, hint: "mm — new ≈ 8, replace ≤ 3.2" })}
      ${field("Pressure", "pressure_psi", { value: tire?.pressure_psi, type: "number", step: "0.1", min: 0, hint: "psi" })}
      ${field("Target pressure", "target_psi", { value: tire?.target_psi, type: "number", step: "0.1", min: 0, hint: "psi (door placard)" })}
      ${field("Odometer now", "current_mileage", { value: tire?.current_mileage, type: "number", min: 0, hint: "mi" })}
      ${field("Odometer at install", "install_mileage", { value: tire?.install_mileage, type: "number", min: 0, hint: "mi" })}
      <div class="field full">
        <label for="f_notes">Notes</label>
        <textarea id="f_notes" name="notes" placeholder="Rotation done, slight cupping, etc.">${esc(tire?.notes || "")}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary">${tire ? "Save tire" : "Log tire"}</button>
      </div>
    </div>`;
  wireCancel();
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = formData();
    data.vehicle_id = vehicle.id;
    try {
      if (tire) {
        await api(`/api/tires/${tire.id}`, "PUT", data);
        toast("Tire updated");
      } else {
        await api("/api/tires", "POST", data);
        toast("Tire logged");
      }
      closeModal();
      await loadVehicles();
    } catch (err) { toast(err.message, true); }
  };
}

function firstFree(used) {
  return (POSITIONS.find((p) => !used.includes(p.key)) || POSITIONS[0]).key;
}

async function deleteVehicle(v) {
  if (!confirm(`Delete "${v.name}" and all its tire records? This can't be undone.`)) return;
  try {
    await api(`/api/vehicles/${v.id}`, "DELETE");
    if (state.activeId === v.id) state.activeId = null;
    toast("Vehicle deleted");
    await loadVehicles();
  } catch (err) { toast(err.message, true); }
}

async function deleteTire(id) {
  if (!confirm("Delete this tire record?")) return;
  try {
    await api(`/api/tires/${id}`, "DELETE");
    toast("Tire deleted");
    await loadVehicles();
  } catch (err) { toast(err.message, true); }
}

// ---- Helpers ------------------------------------------------------------
function wireCancel() {
  modalForm.querySelector("[data-cancel]")?.addEventListener("click", closeModal);
}
function formData() {
  const fd = new FormData(modalForm);
  const obj = {};
  for (const [k, val] of fd.entries()) obj[k] = val;
  return obj;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

let toastTimer;
function toast(msg, isErr = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (isErr ? " err" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function wheelIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/></svg>`;
}
function pencil() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}
function trash() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>`;
}

// ---- Boot ---------------------------------------------------------------
document.getElementById("addVehicleBtn").addEventListener("click", () => openVehicleModal());
loadVehicles().catch((err) => toast(err.message, true));
