// appointments.js - list with filters, booking modal with slot grid, complete (diagnosis + prescription), cancel.
const tableArea = document.getElementById("table-area");
const fDate = document.getElementById("f-date");
const fStatus = document.getElementById("f-status");
const fDoctor = document.getElementById("f-doctor");
let doctors = [], departments = [], rows = [];

const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

// ---------- list ----------
async function loadAppointments() {
  tableArea.innerHTML = skeleton(6);
  try {
    rows = await API.get("/appointments" + qs({ date: fDate.value, status: fStatus.value, doctorId: fDoctor.value }));
    if (rows.length === 0) {
      tableArea.innerHTML = emptyState("calendar-x", "No appointments match these filters");
      return icons();
    }
    tableArea.innerHTML = "<table><thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Doctor</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>" +
      rows.map((a) => "<tr><td>" + formatDate(a.date) + "</td><td>" + esc(a.timeSlot) + "</td><td>" + esc(a.patientName) +
        " <small style='color:var(--muted)'>" + esc(a.patientCode) + "</small></td><td>" + esc(a.doctorName) + "</td><td>" + esc(a.reason) +
        "</td><td>" + statusBadge(a.status) + '</td><td class="actions">' +
        (a.status === "Scheduled" ? '<button class="btn btn-secondary btn-sm" data-complete="' + a._id + '">Complete</button> <button class="btn btn-danger btn-sm" data-cancel="' + a._id + '">Cancel</button>' : "") +
        (a.status === "Completed" ? '<button class="icon-btn" data-view="' + a._id + '" aria-label="View details"><i data-lucide="eye"></i></button>' : "") +
        '<button class="icon-btn danger" data-del="' + a._id + '" aria-label="Delete"><i data-lucide="trash-2"></i></button></td></tr>').join("") + "</tbody></table>";
  } catch (err) {
    tableArea.innerHTML = emptyState("alert-circle", err.message);
  }
  icons();
}

tableArea.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.complete || btn.dataset.cancel || btn.dataset.view || btn.dataset.del;
  const appt = rows.find((r) => r._id === id);
  if (btn.dataset.complete) openComplete(appt);
  if (btn.dataset.view) openDetails(appt);
  if (btn.dataset.cancel && (await confirmDialog("Cancel this appointment? The time slot will become free.", "Yes, cancel"))) {
    await changeStatus(id, { status: "Cancelled" }, "Appointment cancelled");
  }
  if (btn.dataset.del && (await confirmDialog("Delete this appointment permanently?"))) {
    try { await API.del("/appointments/" + id); toast("Appointment deleted"); loadAppointments(); }
    catch (err) { toast(err.message, "error"); }
  }
});

async function changeStatus(id, body, message) {
  try { await API.put("/appointments/" + id, body); toast(message); loadAppointments(); }
  catch (err) { toast(err.message, "error"); }
}

// ---------- complete modal: diagnosis + dynamic list of medicines ----------
function openComplete(a) {
  formModal({
    title: "Complete appointment", submitText: "Save as completed",
    html: "<p style='margin-top:0'><b>" + esc(a.patientName) + "</b> with " + esc(a.doctorName) + " on " + formatDate(a.date) + " at " + esc(a.timeSlot) + "</p>" +
      '<div class="field" data-field="diagnosis"><label>Diagnosis</label><input name="diagnosis" placeholder="e.g. Viral Infection"></div>' +
      '<div class="form-section">Prescription</div><div id="rx-rows"></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="add-rx"><i data-lucide="plus"></i> Add medicine</button>',
    onOpen(form) {
      const box = form.querySelector("#rx-rows");
      const addRow = () => {
        const r = document.createElement("div");
        r.className = "row-inputs";
        r.style.gridTemplateColumns = "2fr 2fr 1fr auto";
        r.innerHTML = '<input placeholder="Medicine" aria-label="Medicine"><input placeholder="Dosage" aria-label="Dosage"><input placeholder="Days" inputmode="numeric" aria-label="Days">' +
          '<button type="button" class="icon-btn danger" aria-label="Remove"><i data-lucide="x"></i></button>';
        r.querySelector("button").onclick = () => r.remove();
        box.appendChild(r);
        icons();
      };
      addRow();
      form.querySelector("#add-rx").onclick = addRow;
    },
    async onSubmit(form) {
      const prescription = [...form.querySelectorAll("#rx-rows .row-inputs")].map((r) => ({ medicine: r.children[0].value, dosage: r.children[1].value, days: r.children[2].value }));
      await API.put("/appointments/" + a._id, { status: "Completed", diagnosis: form.elements.diagnosis.value, prescription });
      toast("Appointment completed");
      loadAppointments();
    }
  });
}

function openDetails(a) {
  const rx = a.prescription || [];
  openModal({
    title: "Visit details", size: "small",
    html: '<div class="kv"><span>Patient</span><span>' + esc(a.patientName) + "</span><span>Doctor</span><span>" + esc(a.doctorName) + "</span><span>Date</span><span>" +
      formatDate(a.date) + " " + esc(a.timeSlot) + "</span><span>Reason</span><span>" + esc(a.reason) + "</span><span>Diagnosis</span><span>" + esc(a.diagnosis) + "</span></div>" +
      "<h3>Prescription</h3>" + (rx.length ? "<ul>" + rx.map((r) => "<li>" + esc(r.medicine) + (r.dosage ? " - " + esc(r.dosage) : "") + (r.days ? " for " + esc(r.days) + " days" : "") + "</li>").join("") + "</ul>" : "<p>None</p>")
  });
}

// ---------- booking modal ----------
function openBooking() {
  let timeSlot = "";
  formModal({
    title: "Book Appointment", submitText: "Book", size: "",
    html: '<div class="form-grid">' +
      '<div class="field full" data-field="patientId"><label>Patient (type to search)</label><input id="pt-search" autocomplete="off" placeholder="Name, phone or code"><input type="hidden" name="patientId"><div class="pick-list" id="pt-list" hidden></div></div>' +
      '<div class="field" data-field="department"><label>Department</label><select id="dept-select"><option value="">All departments</option>' + departments.map((d) => '<option value="' + d._id + '">' + esc(d.name) + "</option>").join("") + "</select></div>" +
      '<div class="field" data-field="doctorId"><label>Doctor</label><select name="doctorId"></select></div>' +
      '<div class="field" data-field="date"><label>Date</label><input type="date" name="date" min="' + todayStr() + '" value="' + todayStr() + '"></div>' +
      '<div class="field" data-field="reason"><label>Reason for visit</label><input name="reason"></div>' +
      '<div class="field full" data-field="timeSlot"><label>Time slot</label><div id="hint" class="hint" hidden></div><div id="slots" class="slot-grid"></div></div></div>',
    onOpen(form) {
      const deptSel = form.querySelector("#dept-select"), docSel = form.elements.doctorId, dateIn = form.elements.date;
      const slotBox = form.querySelector("#slots"), hint = form.querySelector("#hint");

      // doctor dropdown is filtered by the chosen department
      function fillDoctors() {
        const list = doctors.filter((d) => !deptSel.value || d.departmentId === deptSel.value);
        docSel.innerHTML = '<option value="">Choose doctor...</option>' + list.map((d) =>
          '<option value="' + d._id + '"' + (d.status === "OnLeave" ? " disabled" : "") + ">" + esc(d.name) + " - " + esc(d.specialization) + (d.status === "OnLeave" ? " (on leave)" : "") + "</option>").join("");
        refreshSlots();
      }
      // ask the server which slots are free for this doctor and date
      async function refreshSlots() {
        timeSlot = "";
        hint.hidden = true;
        if (!docSel.value || !dateIn.value) { slotBox.innerHTML = "<span style='color:var(--muted)'>Choose a doctor and a date to see the time slots.</span>"; return; }
        slotBox.innerHTML = skeleton(2);
        try {
          const s = await API.get("/appointments/slots" + qs({ doctorId: docSel.value, date: dateIn.value }));
          if (!s.worksThatDay) { hint.textContent = "Note: this doctor does not usually work on " + s.weekday + "s."; hint.hidden = false; }
          slotBox.innerHTML = s.slots.map((x) => '<button type="button" class="slot" data-time="' + x.time + '"' + (x.booked ? " disabled title='Already booked'" : "") + ">" + x.time + "</button>").join("");
        } catch (err) { slotBox.innerHTML = '<span class="field-error">' + esc(err.message) + "</span>"; }
      }
      slotBox.addEventListener("click", (e) => {
        const b = e.target.closest(".slot");
        if (!b || b.disabled) return;
        slotBox.querySelectorAll(".slot").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        timeSlot = b.dataset.time;
      });
      deptSel.addEventListener("change", fillDoctors);
      docSel.addEventListener("change", refreshSlots);
      dateIn.addEventListener("change", refreshSlots);
      form._refreshSlots = refreshSlots;
      fillDoctors();

      // searchable patient select
      const search = form.querySelector("#pt-search"), list = form.querySelector("#pt-list");
      const findPatients = debounce(async () => {
        try {
          const res = await API.get("/patients" + qs({ q: search.value.trim(), limit: 8 }));
          list.innerHTML = res.data.length ? res.data.map((p) => '<div data-id="' + p._id + '" data-label="' + esc(p.name + " (" + p.patientCode + ")") + '">' + esc(p.name) + " <small style='color:var(--muted)'>" + esc(p.patientCode) + " &middot; " + esc(p.phone) + "</small></div>").join("") : "<div>No patients found</div>";
          list.hidden = false;
        } catch (err) { list.hidden = true; }
      }, 250);
      search.addEventListener("input", () => { form.elements.patientId.value = ""; findPatients(); });
      search.addEventListener("focus", findPatients);
      list.addEventListener("click", (e) => {
        const item = e.target.closest("[data-id]");
        if (!item) return;
        form.elements.patientId.value = item.dataset.id;
        search.value = item.dataset.label;
        list.hidden = true;
      });
    },
    async onSubmit(form) {
      if (!timeSlot) throw new Error("Please choose a time slot");
      const f = (n) => form.elements[n].value;
      try {
        await API.post("/appointments", { patientId: f("patientId"), doctorId: f("doctorId"), date: f("date"), timeSlot, reason: f("reason") });
      } catch (err) {
        if (err.status === 409) form._refreshSlots();       // someone else took the slot: grey it out
        throw err;
      }
      toast("Appointment booked");
      loadAppointments();
    }
  });
}

// ---------- start ----------
(async () => {
  try {
    [doctors, departments] = await Promise.all([API.get("/doctors"), API.get("/departments")]);
    fDoctor.innerHTML += doctors.map((d) => '<option value="' + d._id + '">' + esc(d.name) + "</option>").join("");
  } catch (err) { toast(err.message, "error"); }
  loadAppointments();
})();
[fDate, fStatus, fDoctor].forEach((el) => el.addEventListener("change", loadAppointments));
document.getElementById("clear-btn").addEventListener("click", () => { fDate.value = ""; fStatus.value = ""; fDoctor.value = ""; loadAppointments(); });
document.getElementById("book-btn").addEventListener("click", openBooking);
