import { resolve } from "node:path";

import { build } from "vite";

const rootDirectory = globalThis.process.cwd();
const outputDirectory = resolve(rootDirectory, "dist");
const watchOptions = globalThis.process.argv.includes("--watch")
  ? {}
  : undefined;

const popupEntry = resolve(rootDirectory, "src/popup.ts");
const workerEntry = resolve(rootDirectory, "src/worker.ts");
const contentEntry = resolve(rootDirectory, "src/content.ts");
const contentPageEntry = resolve(rootDirectory, "src/content-page.ts");

await build({
  configFile: false,
  publicDir: "public",
  root: rootDirectory,
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    watch: watchOptions,
    rollupOptions: {
      input: {
        popup: popupEntry,
        worker: workerEntry,
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  root: rootDirectory,
  build: {
    outDir: outputDirectory,
    emptyOutDir: false,
    watch: watchOptions,
    rollupOptions: {
      input: {
        content: contentEntry,
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
        name: "CgptVirtualizerContent",
      },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  root: rootDirectory,
  build: {
    outDir: outputDirectory,
    emptyOutDir: false,
    watch: watchOptions,
    rollupOptions: {
      input: {
        "content-page": contentPageEntry,
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
        name: "CgptVirtualizerContentPage",
      },
    },
  },
});
