import { defineConfig } from "vitest/config";

/**
 * One file at a time: the integration suites each build a real ceremony with snarkjs, and their
 * time bounds must hold on any machine (the unit suites are fast either way).
 */
export default defineConfig({ test: { fileParallelism: false } });
