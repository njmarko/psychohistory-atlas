import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  appType: "spa",
  publicDir: "public",
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
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: true,
  },
});
