/**
 * @fileoverview Runs the unit tests: bundles test/*.test.ts with esbuild, then runs them with node's test runner.
 *
 * Usage: `pnpm test`
 */

import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import esbuild from "esbuild";

const outdir = ".test-build";
const entryPoints = readdirSync("test")
	.filter((f) => f.endsWith(".test.ts"))
	.map((f) => `test/${f}`);

rmSync(outdir, { recursive: true, force: true });
await esbuild.build({
	entryPoints,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	outdir,
	outExtension: { ".js": ".mjs" },
	logLevel: "warning",
});

const files = entryPoints.map((f) => `${outdir}/${f.slice("test/".length).replace(/\.ts$/, ".mjs")}`);
const { status } = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(status ?? 1);
