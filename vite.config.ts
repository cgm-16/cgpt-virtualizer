/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.ts"),
        worker: resolve(__dirname, "src/worker.ts"),
        content: resolve(__dirname, "src/content.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
