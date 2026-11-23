// The unit tests: plain Node, no browser plugins; the build-time constants as in a build.
import { defineConfig } from "vitest/config";
import { clientDefines } from "./vite.config.ts";

export default defineConfig({
  define: clientDefines(),
  test: { include: ["tests/**/*.test.ts"] },
});
