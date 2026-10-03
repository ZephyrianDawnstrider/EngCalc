import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };
const appVersion = packageJson.version;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      filename: "sw.js",
      registerType: "prompt",
      injectRegister: null,
      manifest: false,
      includeAssets: ["manifest.webmanifest", "icons/engcalc-192.png", "icons/engcalc-512.png"],
      workbox: {
        cacheId: `engcalc-shell-v${appVersion}`,
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        globPatterns: ["**/*.{html,js,css,png,svg,webmanifest,ico}"],
        globIgnores: ["**/*.map"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/docs(?:\/|$)/],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
  define: {
    __ENGCALC_APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
