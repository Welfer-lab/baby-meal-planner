import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("main entry parses as valid JavaScript", () => {
  const mainPath = fileURLToPath(new URL("../src/main.js", import.meta.url));

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--check", mainPath], { stdio: "pipe" });
  });
});
