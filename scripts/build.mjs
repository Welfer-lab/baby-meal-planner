import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(rootDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of ["index.html", "styles.css", "manifest.webmanifest", "service-worker.js"]) {
  copyFileSync(resolve(rootDir, file), resolve(distDir, file));
}

for (const dir of ["src", "public"]) {
  const from = resolve(rootDir, dir);
  if (existsSync(from)) {
    cpSync(from, resolve(distDir, dir), { recursive: true });
  }
}
