// doctors.js - doctor cards, department filter, search, add/edit modal and delete.
const grid = document.getElementById("grid");
const deptFilter = document.getElementById("dept-filter");
let departments = [];
let doctors = [];

async function loadDoctors() {
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="card">' + skeleton(4) + "</div>").join("");
  try {
    doctors = await API.get("/doctors" + qs({ dept: deptFilter.value, q: document.getElementById("search").value.trim() }));
    if (doctors.length === 0) {
      grid.innerHTML = '<div class="card" style="grid-column:1/-1">' + emptyState("stethoscope", "No doctors found") + "</div>";
      return icons();
    }
    grid.innerHTML = doctors.map((d) =>
      '<div class="card doc-card"><div class="doc-actions">' +
      '<button class="icon-btn" data-edit="' + d._id + '" aria-label="Edit"><i data-lucide="pencil"></i></button>' +
      '<button class="icon-btn danger" data-del="' + d._id + '" data-name="' + esc(d.name) + '" aria-label="Delete"><i data-lucide="trash-2"></i></button></div>' +
      '<div class="doc-top"><div class="doc-avatar">' + esc(initials(d.name)) + "</div><div><h3>" + esc(d.name) + "</h3><div style='color:var(--muted)'>" + esc(d.specialization) + "</div></div></div>" +
      '<span class="chip">' + esc(d.department) + "</span>" +
      '<div class="doc-meta"><span>' + esc(d.experienceYears != null ? d.experienceYears + " yrs experience" : "") + "</span><b>" + (d.fee != null ? money(d.fee) : "") + "</b></div>" +
      '<div class="days">' + (d.availableDays || []).map((x) => '<span class="chip gray">' + esc(x) + "</span>").join("") + "</div>" +
      '<div style="margin-top:12px"><span class="dot ' + esc(d.status) + '"></span>' + (d.status === "OnLeave" ? "On leave" : "Active") + "</div></div>").join("");
  } catch (err) {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1">' + emptyState("alert-circle", err.message) + "</div>";
  }
  icons();
}

grid.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.edit) openForm(doctors.find((d) => d._id === btn.dataset.edit));
  if (btn.dataset.del && (await confirmDialog("Delete " + btn.dataset.name + "?"))) {
    try {
      await API.del("/doctors/" + btn.dataset.del);
      toast("Doctor deleted");
      loadDoctors();
    } catch (err) { toast(err.message, "error"); }     // e.g. 409: doctor has scheduled appointments
  }
});

function openForm(d) {
  const isEdit = !!d;
  const days = (d && d.availableDays) || [];
  const v = (x) => esc(x == null ? "" : x);
  formModal({
    title: isEdit ? "Edit Doctor" : "Add Doctor",
    html: '<div class="form-grid">' +
      '<div class="field full" data-field="name"><label>Full name</label><input name="name" value="' + v(d && d.name) + '" placeholder="Dr. ..."></div>' +
      '<div class="field" data-field="departmentId"><label>Department</label><select name="departmentId"><option value="">Choose...</option>' +
        departments.map((x) => '<option value="' + x._id + '"' + (d && d.departmentId === x._id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") + "</select></div>" +
      '<div class="field" data-field="specialization"><label>Specialization</label><input name="specialization" value="' + v(d && d.specialization) + '"></div>' +
      '<div class="field" data-field="experienceYears"><label>Experience (years)</label><input name="experienceYears" value="' + v(d && d.experienceYears) + '" inputmode="numeric"></div>' +
      '<div class="field" data-field="fee"><label>Consultation fee (&#8377;)</label><input name="fee" value="' + v(d && d.fee) + '" inputmode="numeric"></div>' +
      '<div class="field" data-field="phone"><label>Phone (10 digits)</label><input name="phone" value="' + v(d && d.phone) + '" inputmode="numeric"></div>' +
      '<div class="field" data-field="email"><label>Email (optional)</label><input name="email" value="' + v(d && d.email) + '"></div>' +
      '<div class="field full" data-field="availableDays"><label>Available days</label><div class="days">' +
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => '<label><input type="checkbox" name="day" value="' + x + '"' + (days.includes(x) ? " checked" : "") + "> " + x + "</label>").join("") + "</div></div>" +
      '<div class="field" data-field="status"><label>Status</label><select name="status"><option value="Active"' + (d && d.status === "Active" ? " selected" : "") + '>Active</option><option value="OnLeave"' + (d && d.status === "OnLeave" ? " selected" : "") + ">On leave</option></select></div></div>",
    async onSubmit(form) {
      const f = (n) => form.elements[n].value;
      const body = {
        name: f("name"), departmentId: f("departmentId"), specialization: f("specialization"),
        experienceYears: f("experienceYears"), fee: f("fee"), phone: f("phone"), email: f("email"), status: f("status"),
        availableDays: [...form.querySelectorAll('input[name="day"]:checked')].map((c) => c.value)
      };
      if (isEdit) await API.put("/doctors/" + d._id, body);
      else await API.post("/doctors", body);
      toast(isEdit ? "Doctor updated" : "Doctor added");
      loadDoctors();
    }
  });
}

// ---------- start ----------
(async () => {
  try {
    departments = await API.get("/departments");
    deptFilter.innerHTML += departments.map((x) => '<option value="' + x._id + '">' + esc(x.name) + "</option>").join("");
  } catch (err) { toast(err.message, "error"); }
  loadDoctors();
})();
deptFilter.addEventListener("change", loadDoctors);
document.getElementById("search").addEventListener("input", debounce(loadDoctors));
document.getElementById("add-btn").addEventListener("click", () => openForm(null));
