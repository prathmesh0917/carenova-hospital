// patients.js - patient list (search + pagination), add/edit modal, profile drawer, delete.
const state = { page: 1, limit: 10, q: "" };
const tableArea = document.getElementById("table-area");

// ---------- list ----------
async function loadPatients() {
  tableArea.innerHTML = skeleton(6);
  try {
    const res = await API.get("/patients" + qs({ q: state.q, page: state.page, limit: state.limit }));
    if (res.data.length === 0) {
      tableArea.innerHTML = emptyState("users", state.q ? "No patients match your search" : "No patients yet. Add the first one!");
      document.getElementById("pager").innerHTML = "";
      return icons();
    }
    tableArea.innerHTML = "<table><thead><tr><th>Code</th><th>Name</th><th>Age/Gender</th><th>Blood group</th><th>Phone</th><th>City</th><th></th></tr></thead><tbody>" +
      res.data.map((p) => "<tr><td><b>" + esc(p.patientCode) + "</b></td><td>" + esc(p.name) + "</td><td>" + esc(p.age) + " / " + esc(p.gender) +
        "</td><td>" + esc(p.bloodGroup || "-") + "</td><td>" + esc(p.phone) + "</td><td>" + esc((p.address && p.address.city) || "-") +
        '</td><td class="actions">' +
        '<button class="icon-btn" data-view="' + p._id + '" aria-label="View"><i data-lucide="eye"></i></button>' +
        '<button class="icon-btn" data-edit="' + p._id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
        '<button class="icon-btn danger" data-del="' + p._id + '" data-name="' + esc(p.name) + '" aria-label="Delete"><i data-lucide="trash-2"></i></button></td></tr>').join("") +
      "</tbody></table>";
    tableArea._rows = res.data;
    drawPager(res);
  } catch (err) {
    tableArea.innerHTML = emptyState("alert-circle", err.message);
  }
  icons();
}

function drawPager(res) {
  const pages = Math.max(Math.ceil(res.total / state.limit), 1);
  const pager = document.getElementById("pager");
  pager.innerHTML = "<span>" + res.total + " patient(s) &middot; page " + res.page + " of " + pages + '</span><div class="btns">' +
    '<button class="btn btn-secondary btn-sm" id="prev"' + (res.page <= 1 ? " disabled" : "") + ">Previous</button>" +
    '<button class="btn btn-secondary btn-sm" id="next"' + (res.page >= pages ? " disabled" : "") + ">Next</button></div>";
  document.getElementById("prev").onclick = () => { state.page--; loadPatients(); };
  document.getElementById("next").onclick = () => { state.page++; loadPatients(); };
}

// Clicks on the icon buttons in the table
tableArea.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.view) openDrawer(btn.dataset.view);
  if (btn.dataset.edit) openForm(tableArea._rows.find((p) => p._id === btn.dataset.edit));
  if (btn.dataset.del && (await confirmDialog("Delete patient " + btn.dataset.name + "? This cannot be undone."))) {
    try {
      await API.del("/patients/" + btn.dataset.del);
      toast("Patient deleted");
      loadPatients();
    } catch (err) { toast(err.message, "error"); }
  }
});

document.getElementById("search").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; loadPatients(); }));
document.getElementById("add-btn").addEventListener("click", () => openForm(null));

// ---------- add / edit form ----------
function field(name, label, input, full) {
  return '<div class="field' + (full ? " full" : "") + '" data-field="' + name + '"><label>' + label + "</label>" + input + "</div>";
}
const val = (v) => esc(v == null ? "" : v);

function openForm(p) {
  const a = (p && p.address) || {};
  const isEdit = !!p;
  let allergyBox, historyRows;
  formModal({
    title: isEdit ? "Edit Patient " + p.patientCode : "Add Patient",
    html:
      '<div class="form-section" style="margin-top:0">Personal</div><div class="form-grid">' +
      field("name", "Full name", '<input name="name" value="' + val(p && p.name) + '">', true) +
      field("age", "Age", '<input name="age" value="' + val(p && p.age) + '" inputmode="numeric">') +
      field("gender", "Gender", '<select name="gender">' + ["Male", "Female", "Other"].map((g) => '<option' + (p && p.gender === g ? " selected" : "") + ">" + g + "</option>").join("") + "</select>") +
      field("bloodGroup", "Blood group", '<select name="bloodGroup"><option value="">Unknown</option>' + ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => '<option' + (p && p.bloodGroup === g ? " selected" : "") + ">" + g + "</option>").join("") + "</select>") +
      field("phone", "Phone (10 digits)", '<input name="phone" value="' + val(p && p.phone) + '" inputmode="numeric">') +
      '</div><div class="form-section">Address</div><div class="form-grid field" data-field="address">' +
      field("line", "Address line", '<input name="line" value="' + val(a.line) + '">', true) +
      field("city", "City", '<input name="city" value="' + val(a.city || "Pune") + '">') +
      field("state", "State", '<input name="state" value="' + val(a.state || "Maharashtra") + '">') +
      field("pincode", "Pincode", '<input name="pincode" value="' + val(a.pincode) + '" inputmode="numeric">') +
      '</div><div class="form-section">Medical</div>' +
      field("allergies", "Allergies", '<div id="allergy-box"></div>') +
      '<div class="field" data-field="medicalHistory" style="margin-top:12px"><label>Medical history</label><div id="history-rows"></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="add-history"><i data-lucide="plus"></i> Add condition</button></div>',
    onOpen(form) {
      allergyBox = tagInput(form.querySelector("#allergy-box"), (p && p.allergies) || []);
      historyRows = form.querySelector("#history-rows");
      const addRow = (h) => {
        const row = document.createElement("div");
        row.className = "row-inputs";
        row.style.gridTemplateColumns = "2fr 1fr auto";
        row.innerHTML = '<input placeholder="Condition" value="' + val(h && h.condition) + '"><input placeholder="Since (year)" value="' + val(h && h.since) + '" inputmode="numeric">' +
          '<button type="button" class="icon-btn danger" aria-label="Remove"><i data-lucide="x"></i></button>';
        row.querySelector("button").onclick = () => row.remove();
        historyRows.appendChild(row);
        icons();
      };
      ((p && p.medicalHistory) || []).forEach(addRow);
      form.querySelector("#add-history").onclick = () => addRow(null);
    },
    async onSubmit(form) {
      const f = (n) => form.elements[n].value;
      const body = {
        name: f("name"), age: f("age"), gender: f("gender"), bloodGroup: f("bloodGroup"), phone: f("phone"),
        address: { line: f("line"), city: f("city"), state: f("state"), pincode: f("pincode") },
        allergies: allergyBox.get(),
        medicalHistory: [...historyRows.children].map((r) => ({ condition: r.children[0].value, since: r.children[1].value }))
      };
      if (isEdit) await API.put("/patients/" + p._id, body);
      else await API.post("/patients", body);
      toast(isEdit ? "Patient updated" : "Patient added");
      loadPatients();
    }
  });
}

// ---------- side drawer with profile + appointment history ----------
async function openDrawer(id) {
  const drawer = document.createElement("div");
  drawer.className = "backdrop";
  drawer.style.placeItems = "stretch end";
  drawer.style.padding = "0";
  drawer.innerHTML = '<aside class="drawer" role="dialog" aria-label="Patient profile">' + skeleton(8) + "</aside>";
  document.body.appendChild(drawer);
  const close = () => { drawer.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  drawer.addEventListener("mousedown", (e) => { if (e.target === drawer) close(); });
  const panel = drawer.querySelector(".drawer");
  try {
    const p = await API.get("/patients/" + id);
    const a = p.address || {};
    panel.innerHTML =
      '<div class="card-head"><h3>' + esc(p.name) + '</h3><button class="icon-btn" aria-label="Close"><i data-lucide="x"></i></button></div>' +
      '<div class="kv"><span>Code</span><span>' + esc(p.patientCode) + "</span><span>Age / Gender</span><span>" + esc(p.age) + " / " + esc(p.gender) +
      "</span><span>Blood group</span><span>" + esc(p.bloodGroup || "-") + "</span><span>Phone</span><span>" + esc(p.phone) +
      "</span><span>Address</span><span>" + esc([a.line, a.city, a.state, a.pincode].filter(Boolean).join(", ") || "-") + "</span></div>" +
      "<h3 style='margin-top:16px'>Allergies</h3><p>" + ((p.allergies || []).map((x) => '<span class="chip">' + esc(x) + "</span> ").join("") || "None") + "</p>" +
      "<h3>Medical history</h3><p>" + ((p.medicalHistory || []).map((h) => '<span class="chip gray">' + esc(h.condition) + (h.since ? " (" + esc(h.since) + ")" : "") + "</span> ").join("") || "None") + "</p>" +
      "<h3 style='margin-bottom:8px'>Appointment history</h3>" +
      (p.appointments.length ? '<div class="timeline">' + p.appointments.map((x) =>
        '<div class="item"><b>' + formatDate(x.date) + "</b> &middot; " + esc(x.timeSlot) + " " + statusBadge(x.status) + "<br>" + esc(x.doctorName) +
        " <span style='color:var(--muted)'>(" + esc(x.specialization) + ")</span><br><small>" + esc(x.reason) + "</small>" +
        (x.diagnosis ? "<br><small><b>Diagnosis:</b> " + esc(x.diagnosis) + "</small>" : "") +
        ((x.prescription || []).length ? "<br><small><b>Rx:</b> " + x.prescription.map((r) => esc(r.medicine) + (r.dosage ? " - " + esc(r.dosage) : "") + (r.days ? " x " + esc(r.days) + "d" : "")).join("; ") + "</small>" : "") +
        "</div>").join("") + "</div>" : emptyState("calendar-x", "No appointments yet"));
    panel.querySelector(".icon-btn").onclick = close;
  } catch (err) {
    panel.innerHTML = emptyState("alert-circle", err.message);
  }
  icons();
}

// ---------- start ----------
const params = new URLSearchParams(location.search);
if (params.get("q")) { state.q = params.get("q"); document.getElementById("search").value = state.q; }
loadPatients();
if (params.get("view")) openDrawer(params.get("view"));    // opened from the top bar search
