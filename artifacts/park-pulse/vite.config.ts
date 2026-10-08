import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Port only matters for `dev`/`preview`. A production build must never fail
// because PORT is unset or 0 (0 is a legitimate "pick an ephemeral port").
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 4173;

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Route-level code splitting is done in App.tsx via React.lazy, so each
    // page becomes its own chunk. These manualChunks keep the two genuinely
    // heavy dependencies out of the entry chunk: Leaflet + markercluster (map)
    // and the React vendor runtime. A visitor landing on "/" therefore does
    // not download the map stack or the Explore page until they navigate there.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("leaflet") || id.includes("markercluster")) {
            return "leaflet";
          }
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("scheduler")) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
