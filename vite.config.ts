import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";

// Vanilla Vite SPA (Psychohistory Atlas). Keep Grok preview/deploy contracts:
// 0.0.0.0:8080 live preview, loopback :8081 built preview, grokPwaPlugin,
// and build/preview-gated nitro with serverDir for the install page.
export default defineConfig(({ command, isPreview }) => ({
  base: "/",
  appType: "spa",
  publicDir: "public",
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      name: "root-to-index",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/" || req.url === "") req.url = "/index.html";
          next();
        });
      },
    },
    appEnvPlugin(),
    grokPwaPlugin(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            serverDir: "./server",
          }),
        ]
      : []),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0,
  },
}));
