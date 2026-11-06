// Theme: Auto (follow the device), Light, or Dark. Loaded first in every page's <head> so the colors
// are right before the page draws. The choice is a per-browser display preference kept with the
// layout option (ncaaCompare.view.v1 {multi, theme}): not in shared links, not cleared by Reset.
// Every page's CSS already reads <html data-theme="light|dark">; with no attribute it follows
// prefers-color-scheme. Source: tools/site/theme.js (copied to site2026/ by tools/build_site.py).
(function () {
  var KEY = "ncaaCompare.view.v1";
  function get() {
    try {
      var t = (JSON.parse(localStorage.getItem(KEY)) || {}).theme;
      return t === "light" || t === "dark" ? t : "auto";
    } catch (e) { return "auto"; }
  }
  function apply(t) {
    var r = document.documentElement;
    if (t === "light" || t === "dark") r.setAttribute("data-theme", t);
    else r.removeAttribute("data-theme");
  }
  function isDark() {
    var t = get();
    return t === "dark" || (t === "auto" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  var api = { KEY: KEY, get: get, apply: apply, isDark: isDark, onchange: null };
  apply(get());
  // picked in another tab (the index's settings): follow it here too
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY && e.key !== null) return;
    apply(get());
    if (api.onchange) api.onchange();
  });
  window.ncaaTheme = api;
})();
