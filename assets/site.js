(function () {
  var root = document.documentElement;

  // ---- Dark-mode toggle ----
  var btn = document.getElementById("theme-toggle");
  function paint() {
    if (!btn) return;
    var dark = root.getAttribute("data-theme") === "dark";
    btn.innerHTML = dark ? "&#9728;" : "&#9790;"; // sun in dark, moon in light
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }
  paint();
  if (btn) {
    btn.addEventListener("click", function () {
      var dark = root.getAttribute("data-theme") === "dark";
      if (dark) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", "dark");
      try { localStorage.setItem("theme", dark ? "light" : "dark"); } catch (e) {}
      paint();
    });
  }

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
    icon.addEventListener("click", function (e) {
      e.stopPropagation();
      nav.classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) nav.classList.remove("open");
    });
  }
})();
