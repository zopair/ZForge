/* Black Phantom is a static presentation surface until the secure runtime exists. */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline caching is optional; the UI remains usable without it.
    });
  });
}
