// layout.js - builds the sidebar and top bar on every page, so each HTML file only holds its own content.
// Each page sets <body data-page="patients" data-title="Patients"> and has a <main id="content">.
(function () {
  const page = document.body.dataset.page;
  const title = document.body.dataset.title || "";
  document.title = title + " | " + HOSPITAL_NAME;

  // Favicon: teal rounded square with a white cross (inline SVG, no image file needed)
  const fav = document.createElement("link");
  fav.rel = "icon";
  fav.href = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0F766E"/>' +
    '<path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff"/></svg>');
  document.head.appendChild(fav);

  const links = [
    ["index.html", "dashboard", "Dashboard", "layout-dashboard"],
    ["patients.html", "patients", "Patients", "users"],
    ["doctors.html", "doctors", "Doctors", "stethoscope"],
    ["appointments.html", "appointments", "Appointments", "calendar-check"],
    ["reports.html", "reports", "Reports", "trending-up"]
  ];
  const logoName = HOSPITAL_NAME.split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const shell = document.createElement("div");
  shell.className = "shell";
  shell.innerHTML =
    '<aside class="sidebar" id="sidebar">' +
      '<a class="logo" href="index.html"><div class="logo-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg></div><span>' + esc(logoName) + "</span></a>" +
      '<nav class="nav" aria-label="Main">' +
        links.map((l) => '<a href="' + l[0] + '" class="' + (l[1] === page ? "active" : "") + '"' + (l[1] === page ? ' aria-current="page"' : "") +
          '><i data-lucide="' + l[3] + '"></i><span>' + l[2] + "</span></a>").join("") +
      "</nav>" +
      '<div class="sidebar-foot">' + esc(HOSPITAL_TAGLINE) + "<br>" + esc(HOSPITAL_ADDRESS) + "</div>" +
    "</aside>" +
    '<div class="main">' +
      '<header class="topbar">' +
        '<button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu"><i data-lucide="menu"></i></button>' +
        "<h1>" + esc(title) + "</h1>" +
        '<div class="global-search"><i data-lucide="search"></i>' +
          '<input id="global-search" type="search" placeholder="Search patients by name, phone or code" aria-label="Search patients" autocomplete="off">' +
          '<div class="search-results" id="search-results" hidden></div></div>' +
        '<div class="top-right"><span class="date">' + today + '</span><div class="avatar" title="Admin">Admin</div></div>' +
      "</header></div>";

  // Move the page's own <main id="content"> into the layout
  const content = document.getElementById("content");
  document.body.prepend(shell);
  shell.querySelector(".main").appendChild(content);

  // Hamburger menu (small screens)
  document.getElementById("menu-btn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

  // Global patient search: type to see matches, click one to open the patient profile
  const input = document.getElementById("global-search");
  const box = document.getElementById("search-results");
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { box.hidden = true; return; }
    timer = setTimeout(async () => {
      try {
        const res = await API.get("/patients" + qs({ q, limit: 5 }));
        box.innerHTML = res.data.length
          ? res.data.map((p) => '<a href="patients.html?view=' + p._id + '">' + esc(p.name) + " <small>" + esc(p.patientCode) + " &middot; " + esc(p.phone) + "</small></a>").join("")
          : '<div style="padding:12px;color:var(--muted)">No patients found</div>';
        box.hidden = false;
      } catch (e) { box.hidden = true; }
    }, 300);
  });
  document.addEventListener("click", (e) => { if (!shell.querySelector(".global-search").contains(e.target)) box.hidden = true; });

  icons();
})();
