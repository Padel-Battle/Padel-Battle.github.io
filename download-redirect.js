// Run once when the landing page loads. In-page download buttons keep scrolling normally.
(() => {
  if (window.location.hash === "#download") {
    window.location.replace("download.html" + window.location.search);
  }
})();
