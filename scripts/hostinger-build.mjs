import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareNext16Project } from "./prepare-hostinger.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  prepareNext16Project(projectRoot);
} catch (error) {
  console.error("[Hostinger compatibility] Preparation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const nextCli = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextCli)) {
  console.error("Next.js CLI was not found. Hostinger must install dependencies before running the build.");
  process.exit(1);
}

console.log("[Hostinger build] Starting Next.js production build with Webpack and NODE_ENV=production.");
const child = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: "inherit",
});

if (child.error) {
  console.error("[Hostinger build] Could not start Next.js:", child.error.message);
  process.exit(1);
}
process.exit(child.status ?? 1);
