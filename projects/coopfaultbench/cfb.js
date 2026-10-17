/* CoopFaultBench page: the BibTeX copy button. Everything else is static. */
(function () {
  "use strict";
  function init() {
    var pre = document.getElementById("bibtex");
    var btn = document.getElementById("bib-copy");
    var status = document.getElementById("bib-status");
    if (!pre || !btn) return;
    btn.addEventListener("click", function () {
      var done = function (ok) {
        btn.dataset.state = ok ? "ok" : "err";
        btn.textContent = ok ? "Copied" : "Copy failed";
        if (status) status.textContent = ok ? "BibTeX copied to clipboard" : "Copy failed; select the text instead";
        setTimeout(function () { btn.textContent = "Copy BibTeX"; delete btn.dataset.state; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pre.textContent).then(function () { done(true); }, function () { done(false); });
      } else done(false);
    });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
