import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "frontend/src/**/*.test.ts", "worker/src/**/*.test.ts"],
  },
});
