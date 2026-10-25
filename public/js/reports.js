// reports.js - one card per aggregation report (Chart.js chart and/or table), 'Show pipeline' button,
// and the Index Proof card. All numbers come from /api/reports/<name>.
const COLORS = ["#0F766E", "#0EA5E9", "#8B5CF6", "#F59E0B", "#EF4444", "#64748B", "#14B8A6", "#EC4899"];
const STATUS_COLORS = { Scheduled: "#D97706", Completed: "#16A34A", Cancelled: "#DC2626" };

// How to draw each report: chart type, which fields are labels / values, and optional table columns
const REPORTS = [
  { key: "patients-per-doctor", title: "1. Patients per doctor", type: "bar", horizontal: true, height: 340, name: "Unique patients",
    label: (r) => r.doctor, value: (r) => r.uniquePatients,
    cols: [["Doctor", "doctor"], ["Specialization", "specialization"], ["Appointments", "total"], ["Patients", "uniquePatients"]] },
  { key: "per-day", title: "2. Appointments per day (last 7 days)", type: "line", name: "Appointments",
    label: (r) => formatDate(r.date).slice(0, -5), value: (r) => r.count },
  { key: "top-diagnoses", title: "3. Top 5 diagnoses", type: "doughnut", label: (r) => r.diagnosis, value: (r) => r.count },
  { key: "status-split", title: "4. Appointment status split", type: "pie", label: (r) => r.status, value: (r) => r.count,
    colors: (rows) => rows.map((r) => STATUS_COLORS[r.status]) },
  { key: "per-department", title: "5. Patients per department",
    cols: [["Department", "department"], ["Appointments", "appointments"], ["Unique patients", "uniquePatients"]] },
  { key: "age-groups", title: "6. Patients by age group", type: "bar", name: "Patients", label: (r) => r.group, value: (r) => r.count },
  { key: "revenue", title: "7. Revenue per doctor",
    cols: [["Doctor", "doctor"], ["Completed visits", "visits"], ["Revenue", "revenue", money]] },
  { key: "registrations", title: "Extra: new patients per month ($dateToString)", type: "bar", name: "New patients", label: (r) => r.month, value: (r) => r.count }
];

const pipelines = {};                       // pipeline text for each report, filled when it loads
const container = document.getElementById("reports");

// Build the empty cards first, then load every report at the same time
container.innerHTML = REPORTS.map((r) =>
  '<div class="card" id="card-' + r.key + '"><div class="card-head"><h3>' + esc(r.title) + "</h3>" +
  '<button class="btn btn-secondary btn-sm" data-pipeline="' + r.key + '"><i data-lucide="code"></i> Show pipeline</button></div>' +
  '<div class="body">' + skeleton(5) + "</div></div>").join("") +
  '<div class="card" style="grid-column:1/-1" id="card-proof"><div class="card-head"><h3>Index Proof: explain() with and without an index</h3>' +
  '<button class="btn btn-primary" id="run-proof"><i data-lucide="zap"></i> Run comparison</button></div>' +
  '<p style="margin-top:0;color:var(--muted)">Runs the same query on the patients collection twice: once forced to scan every document, once using the index.</p><div id="proof-result"></div></div>';
icons();

function table(cols, rows) {
  return '<div class="table-wrap" style="max-height:260px"><table><thead><tr>' + cols.map((c) => "<th>" + esc(c[0]) + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + cols.map((c) => "<td>" + esc(c[2] ? c[2](r[c[1]]) : r[c[1]]) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}

async function loadReport(def) {
  const body = document.querySelector("#card-" + def.key + " .body");
  try {
    const res = await API.get("/reports/" + def.key);
    pipelines[def.key] = res.pipeline;
    if (res.data.length === 0) { body.innerHTML = emptyState("bar-chart-2", "No data yet"); return icons(); }

    body.innerHTML = (def.type ? '<div class="chart-box" style="height:' + (def.height || 260) + 'px"><canvas></canvas></div>' : "") + (def.cols ? table(def.cols, res.data) : "");
    if (def.type) {
      const isRound = def.type === "doughnut" || def.type === "pie";
      const colors = def.colors ? def.colors(res.data) : isRound ? COLORS : COLORS[0];
      new Chart(body.querySelector("canvas"), {
        type: def.type,
        data: { labels: res.data.map(def.label), datasets: [{ label: def.name || "", data: res.data.map(def.value), backgroundColor: colors,
                borderColor: def.type === "line" ? COLORS[0] : undefined, tension: 0.35, borderRadius: def.type === "bar" ? 6 : 0 }] },
        options: { maintainAspectRatio: false, indexAxis: def.horizontal ? "y" : "x",
                   plugins: { legend: { display: isRound, position: "bottom" } },
                   scales: isRound ? {} : { [def.horizontal ? "x" : "y"]: { beginAtZero: true, ticks: { precision: 0 } } } }
      });
    }
  } catch (err) {
    body.innerHTML = emptyState("alert-circle", err.message);
  }
  icons();
}
REPORTS.forEach(loadReport);

// 'Show pipeline' opens the real aggregation code in a modal
container.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pipeline]");
  if (!btn) return;
  const text = pipelines[btn.dataset.pipeline];
  if (!text) return toast("Report is still loading", "error");
  openModal({ title: "Aggregation pipeline", size: "", html: "<pre><code>" + esc(text) + "</code></pre>" });
});

// ---------- Index Proof ----------
function proofColumn(title, s, good) {
  return '<div class="' + (good ? "good" : "") + '"><h3>' + title + "</h3><p style='margin:6px 0;color:var(--muted)'>Plan: <b>" + esc(s.stage) + "</b></p>" +
    "<div>Documents examined</div><div class='big'>" + s.docsExamined + "</div><div style='margin-top:8px'>Time</div><div class='big'>" + s.timeMs + " ms</div></div>";
}

document.getElementById("run-proof").addEventListener("click", async (e) => {
  const btn = e.currentTarget, out = document.getElementById("proof-result");
  btn.disabled = true;
  out.innerHTML = skeleton(3);
  try {
    const r = await API.get("/reports/index-proof");
    const badge = r.basis === "time" ? r.speedup + "&times; faster" : r.speedup + "&times; fewer documents examined";
    out.innerHTML = '<div class="compare">' + proofColumn("Without index (collection scan)", r.withoutIndex, false) + proofColumn("With index", r.withIndex, true) + "</div>" +
      '<span class="fast-badge">' + badge + "</span>" +
      '<p style="color:var(--muted)">Query: <code>' + esc(r.query) + "</code> on " + r.totalPatients + " patients." +
      (r.totalPatients < 1000 ? " The collection is small, so the difference is tiny. Run <code>node setup/seed.js --big</code> to add 5000 patients and try again." : "") + "</p>";
  } catch (err) {
    out.innerHTML = emptyState("alert-circle", err.message);
  }
  btn.disabled = false;
  icons();
});
