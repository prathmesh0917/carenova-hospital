// dashboard.js - stat cards, two charts and today's appointments (all data from /api/dashboard).
const STATUS_COLORS = { Scheduled: "#D97706", Completed: "#16A34A", Cancelled: "#DC2626" };

async function loadDashboard() {
  const table = document.getElementById("today-table");
  table.innerHTML = skeleton(4);
  try {
    const d = await API.get("/dashboard");

    // stat cards
    document.getElementById("s-patients").textContent = d.stats.patients;
    document.getElementById("s-doctors").textContent = d.stats.doctors;
    document.getElementById("s-today").textContent = d.stats.todayAppointments;
    document.getElementById("s-completed").textContent = d.stats.completedThisMonth;

    // line chart: appointments in the last 7 days
    new Chart(document.getElementById("trend-chart"), {
      type: "line",
      data: {
        labels: d.trend.map((t) => formatDate(t.date).slice(0, -5)),   // "25 Oct"
        datasets: [{ label: "Appointments", data: d.trend.map((t) => t.count), borderColor: "#0F766E",
                     backgroundColor: "rgba(15,118,110,0.12)", fill: true, tension: 0.35, pointRadius: 4 }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
                 scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    // doughnut chart: status split
    new Chart(document.getElementById("status-chart"), {
      type: "doughnut",
      data: {
        labels: d.statusSplit.map((s) => s.status),
        datasets: [{ data: d.statusSplit.map((s) => s.count), backgroundColor: d.statusSplit.map((s) => STATUS_COLORS[s.status] || "#64748B") }]
      },
      options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } }
    });

    // today's appointments table
    if (d.today.length === 0) {
      table.innerHTML = emptyState("calendar-x", "No appointments today");
    } else {
      table.innerHTML = "<table><thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Status</th></tr></thead><tbody>" +
        d.today.map((a) => "<tr><td>" + esc(a.timeSlot) + "</td><td>" + esc(a.patientName) + "</td><td>" +
          esc(a.doctorName) + "</td><td>" + statusBadge(a.status) + "</td></tr>").join("") + "</tbody></table>";
    }
  } catch (err) {
    table.innerHTML = emptyState("alert-circle", err.message);
    toast(err.message, "error");
  }
  icons();
}

loadDashboard();
