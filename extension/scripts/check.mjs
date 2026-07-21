import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest must use version 3.");
for (const permission of ["activeTab", "identity", "scripting", "sidePanel", "storage"]) {
  if (!manifest.permissions.includes(permission)) throw new Error(`Missing permission: ${permission}`);
}
for (const file of ["src/background.js", "src/content.js", "src/sidepanel.js", "src/sidepanel.html", "src/sidepanel.css", "assets/logo-horizontal.svg", "assets/icon-128.png"]) await stat(resolve(root, file));
for (const file of ["src/background.js", "src/content.js", "src/sidepanel.js"]) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, file)], { encoding: "utf8" });
  if (result.status) throw new Error(result.stderr || `${file} is invalid.`);
}
console.log("Scout extension manifest, scripts, UI, and brand assets are valid.");
