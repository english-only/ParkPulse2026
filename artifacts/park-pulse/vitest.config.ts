import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // Platform scaffolding that no product code reaches; excluded so coverage
      // reflects the app rather than the shadcn component library.
      exclude: ["src/components/ui/**", "src/test/**", "**/*.config.ts"],
    },
  },
});