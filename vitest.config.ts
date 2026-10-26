import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: {
    globals: true, environment: "node",
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["./src/lib/test/setup.ts"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws outside a Next.js server bundle — stub it for tests
      "server-only": path.resolve(__dirname, "./src/lib/test/server-only-stub.ts"),
    },
  },
});
