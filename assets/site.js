(function () {
  var root = document.documentElement;

  // ---- Dark-mode toggle ----
  // The header icon is hidden on phones, so the same switch is also added as
  // the last row of the mobile menu (shown only below 500px by basic.css).
  var btn = document.getElementById("theme-toggle");
  var menuBtn = null;
  var list = document.getElementById("site-nav");
  if (btn && list) {
    var li = document.createElement("li");
    li.className = "menu-theme";
    menuBtn = document.createElement("button");
    menuBtn.type = "button";
    li.appendChild(menuBtn);
    list.appendChild(li);
  }
  function paint() {
    var dark = root.getAttribute("data-theme") === "dark";
    if (btn) {
      btn.innerHTML = dark ? "&#9728;" : "&#9790;"; // sun in dark, moon in light
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
    }
    if (menuBtn) menuBtn.textContent = dark ? "Light mode" : "Dark mode";
  }
  function toggleTheme() {
    var dark = root.getAttribute("data-theme") === "dark";
    if (dark) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", "dark");
    try { localStorage.setItem("theme", dark ? "light" : "dark"); } catch (e) {}
    paint();
  }
  paint();
  if (btn) btn.addEventListener("click", toggleTheme);
  if (menuBtn) menuBtn.addEventListener("click", toggleTheme);

  // ---- BibTeX toggles + copy (Research page) ----
  document.querySelectorAll(".bib-toggle").forEach(function (t) {
    var wrap = t.nextElementSibling;
    if (!wrap) return;
    t.addEventListener("click", function (e) {
      e.preventDefault();
      var open = wrap.classList.toggle("open");
      t.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  document.querySelectorAll(".bib-copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var pre = b.parentElement.querySelector(".bibtex");
      if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.innerText).then(function () {
        var prev = b.textContent;
        b.textContent = "copied";
        setTimeout(function () { b.textContent = prev; }, 1200);
      }).catch(function () {});
    });
  });

  // ---- CV "last updated" note (homepage) ----
  var cvEl = document.getElementById("cv-updated");
  if (cvEl) {
    fetch("/Portfolio/assets/cv-meta.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.updated) return;
        var dt = new Date(d.updated + "T00:00:00");
        if (isNaN(dt)) return;
        var s = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        cvEl.textContent = "updated " + s;
      })
      .catch(function () {});
  }

  // ---- Mobile nav toggle (replaces fragile :hover on touch) ----
  var icon = document.getElementById("menu-icon");
  var nav = icon ? icon.closest("nav") : null;
  if (icon && nav) {
    function setOpen(open) {
      nav.classList.toggle("open", open);
      icon.setAttribute("aria-expanded", open ? "true" : "false");
    }
    icon.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!nav.classList.contains("open"));
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        setOpen(false);
        icon.focus();
      }
    });
  }
})();
