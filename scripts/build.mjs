import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const runtimeConfigTarget = resolve(distDir, "src", "runtime-config.js");
const runtimeConfigSource = `export const runtimeConfig = ${JSON.stringify(
  {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    sharedStateId: process.env.SUPABASE_SHARED_STATE_ID ?? "shared-home",
    sharedLoginEmail: process.env.SHARED_LOGIN_EMAIL ?? "",
    redirectTo: process.env.SUPABASE_REDIRECT_URL ?? "",
  },
  null,
  2,
)};

export function isSupabaseEnabled() {
  return Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);
}
`;

writeFileSync(runtimeConfigTarget, runtimeConfigSource, "utf8");
