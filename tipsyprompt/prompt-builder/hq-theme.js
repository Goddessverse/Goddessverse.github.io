// Copied into the independent workspaces by scripts/sync-workspace-themes.mjs.
// No account preferences, form values or native theme overrides are written here.
(() => {
  if (window.parent === window) return;
  const channel = "goddessverse-theme-v1";
  const origin = "http://127.0.0.1:3002";
  const ids = ["goddess-veiled", "rumored-goddess"];
  const keys = ["bg", "well", "surface", "elevated", "border", "text", "muted", "pink", "pink-hover", "on-pink", "gold", "nav", "nav-top", "nav-end", "nav-secondary", "footer", "frame", "frame-deep", "frame-glow"];
  const root = document.documentElement;
  function hsl(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    let h = 0;
    if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    return `${h} ${d ? d / (1 - Math.abs(2 * l - 1)) * 100 : 0}% ${l * 100}%`;
  }
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window.parent || event.origin !== origin || message?.channel !== channel || message.type !== "theme" || !ids.includes(message.id)) return;
    if (!message.colors || !keys.every((key) => Object.hasOwn(message.colors, key) && /^#[\da-f]{6}$/i.test(message.colors[key]))) return;
    for (const key of keys) {
      const hex = message.colors[key], rgb = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
      root.style.setProperty(`--gv-${key}`, hex);
      root.style.setProperty(`--gv-${key}-rgb`, rgb.join(" "));
      root.style.setProperty(`--gv-${key}-hsl`, hsl(rgb));
    }
    root.dataset.gvTheme = message.id;
    window.dispatchEvent(new Event("goddessverse:theme"));
  });
  window.parent.postMessage({ channel, type: "ready" }, origin);
})();
