import { defineConfig } from "vitest/config";

// Backend tests only. The extensions run their own vitest from their folders.
export default defineConfig({
  test: { include: ["app/**/*.test.{js,ts}"], environment: "node" },
});
