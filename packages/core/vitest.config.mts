import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // esbuild cannot emit decorator metadata, which the DI container and
  // class-validator rely on. SWC reads it from tsconfig.json.
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Coverage is opt-in: `npm run test:coverage` (or `vitest run --coverage`).
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reportsDirectory: "coverage",
      // Set slightly below measured coverage (2026-10-29: 55.1% stmts, 47.2% branches,
      // 44.9% funcs, 56.0% lines). Ratchet up as tests are added.
      thresholds: { statements: 53, branches: 45, functions: 43, lines: 54 },
    },
  },
});
