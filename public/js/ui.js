// ui.js - small helpers shared by all pages: toast, modal, confirm dialog, badges, form errors.

// Escape text before putting it into innerHTML (stops HTML injection)
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Draw the Lucide icons that were added to the page (<i data-lucide="name">)
function icons() {
  if (window.lucide) lucide.createIcons();
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function initials(name) {
  return String(name || "?").replace(/^Dr\.?\s*/i, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// "2026-10-25" -> "25 Oct 2026"
function formatDate(str) {
  if (!str) return "";
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const statusBadge = (s) => '<span class="badge ' + esc(s) + '">' + esc(s) + "</span>";
const skeleton = (n = 5) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join("");
const emptyState = (icon, text) => '<div class="empty"><i data-lucide="' + icon + '"></i><div>' + esc(text) + "</div></div>";

// ---------- toast (top right, hides after 3 seconds) ----------
function toast(message, type = "success") {
  let box = document.querySelector(".toast-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast-box";
    box.setAttribute("role", "status");
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast " + (type === "error" ? "error" : "");
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ---------- modal (closes with Esc or a click on the dark backdrop) ----------
function openModal({ title, html = "", size = "", footer = "" }) {
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML =
    '<div class="modal ' + size + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="icon-btn" data-close aria-label="Close"><i data-lucide="x"></i></button></div>' +
    '<div class="modal-body">' + html + "</div>" +
    (footer ? '<div class="modal-foot">' + footer + "</div>" : "") + "</div>";
  document.body.appendChild(backdrop);

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  }
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector("[data-close]").addEventListener("click", close);
  icons();
  return { el: backdrop, body: backdrop.querySelector(".modal-body"), close };
}

// ---------- form modal: a modal with a <form>, Save/Cancel buttons and server error display ----------
// onSubmit(form) should return a promise; if it throws, the error is shown inside the form.
function formModal({ title, html, submitText = "Save", size = "", onOpen, onSubmit }) {
  const m = openModal({
    title, size,
    html: '<form id="modal-form" novalidate><div class="form-error" hidden></div>' + html + "</form>",
    footer: '<button class="btn btn-secondary" data-close type="button">Cancel</button>' +
            '<button class="btn btn-primary" type="submit" form="modal-form">' + esc(submitText) + "</button>"
  });
  m.el.querySelector(".modal-foot [data-close]").addEventListener("click", m.close);
  const form = m.el.querySelector("form");
  const saveBtn = m.el.querySelector('button[type="submit"]');
  if (onOpen) onOpen(form, m);
  icons();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    saveBtn.disabled = true;
    try {
      await onSubmit(form, m);
      m.close();
    } catch (err) {
      showFormErrors(form, err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });
  const first = form.querySelector("input, select");
  if (first) first.focus();
  return m;
}

function clearFormErrors(form) {
  const banner = form.querySelector(".form-error");
  banner.hidden = true;
  form.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  form.querySelectorAll(".field-error").forEach((e) => e.remove());
}

// Show the message at the top of the form and mark the fields it mentions in red.
// Server messages look like: "Validation failed: age is not valid; phone is not valid"
function showFormErrors(form, message) {
  const banner = form.querySelector(".form-error");
  banner.textContent = message;
  banner.hidden = false;
  const names = new Set();
  (message.match(/(\w+) is not valid/g) || []).forEach((m) => names.add(m.split(" ")[0]));
  if (/missing:/.test(message)) message.split("missing:")[1].split(/[,;]/).forEach((n) => names.add(n.trim()));
  if (/phone/i.test(message)) names.add("phone");
  names.forEach((name) => {
    const field = form.querySelector('.field[data-field="' + name + '"]');
    if (!field) return;
    field.classList.add("invalid");
    const note = document.createElement("div");
    note.className = "field-error";
    note.textContent = /phone/i.test(message) && name === "phone" && /exists|Duplicate/.test(message)
      ? "This phone number is already used" : "Please check this value";
    field.appendChild(note);
  });
  banner.scrollIntoView({ block: "nearest" });
}

// ---------- confirm dialog (used before every delete) ----------
function confirmDialog(message, okText = "Delete") {
  return new Promise((resolve) => {
    const m = openModal({
      title: "Please confirm", size: "small",
      html: "<p>" + esc(message) + "</p>",
      footer: '<button class="btn btn-secondary" data-no>Cancel</button><button class="btn btn-primary" style="background:var(--danger)" data-yes>' + esc(okText) + "</button>"
    });
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } m.close(); };
    m.el.querySelector("[data-yes]").addEventListener("click", () => answer(true));
    m.el.querySelector("[data-no]").addEventListener("click", () => answer(false));
    m.el.querySelector("[data-close]").addEventListener("click", () => answer(false));
    m.el.addEventListener("mousedown", (e) => { if (e.target === m.el) answer(false); });
    document.addEventListener("keydown", function esc2(e) {
      if (e.key === "Escape") { answer(false); document.removeEventListener("keydown", esc2); }
    });
  });
}

// ---------- tag input (used for allergies) ----------
// Returns { get() } so the form can read the list of tags.
function tagInput(container, initial = []) {
  const tags = [...initial];
  container.classList.add("tag-box");
  container.innerHTML = '<input type="text" placeholder="Type and press Enter" aria-label="Add allergy">';
  const input = container.querySelector("input");
  function draw() {
    container.querySelectorAll(".chip").forEach((c) => c.remove());
    tags.forEach((t, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = esc(t) + ' <button type="button" aria-label="Remove ' + esc(t) + '">&times;</button>';
      chip.querySelector("button").addEventListener("click", () => { tags.splice(i, 1); draw(); });
      container.insertBefore(chip, input);
    });
  }
  function add() {
    const v = input.value.trim().replace(/,$/, "");
    if (v && !tags.includes(v)) tags.push(v);
    input.value = "";
    draw();
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !input.value && tags.length) { tags.pop(); draw(); }
  });
  input.addEventListener("blur", add);
  draw();
  return { get: () => { add(); return [...tags]; } };
}
