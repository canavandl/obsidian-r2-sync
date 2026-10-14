import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { obsidian: fileURLToPath(new URL("./src/__tests__/helpers/obsidian.ts", import.meta.url)) },
  },
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
  },
});
