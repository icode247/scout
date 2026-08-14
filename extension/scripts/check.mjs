import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Manifest must use version 3.");
const contentScripts = manifest.content_scripts?.[0]?.js || [];
if (contentScripts[0] !== "src/job-extractor.js" || contentScripts[1] !== "src/content.js") {
  throw new Error("The production extractor must load before the Scout content bridge.");
}
if (manifest.content_scripts?.[0]?.all_frames !== true) {
  throw new Error("Embedded ATS pages require all-frame content extraction.");
}
for (const permission of ["identity", "scripting", "sidePanel", "storage", "webNavigation"]) {
  if (!manifest.permissions.includes(permission)) throw new Error(`Missing permission: ${permission}`);
}
for (const file of ["src/background.js", "src/content.js", "src/sidepanel.js", "src/sidepanel.html", "src/sidepanel.css", "assets/logo-horizontal.svg", "assets/icon-128.png"]) await stat(resolve(root, file));
const contentBridge = await readFile(resolve(root, "src/content.js"), "utf8");
for (const platform of ["linkedin", "indeed", "glassdoor", "ziprecruiter", "monster", "dice", "simplyhired"]) {
  if (!contentBridge.includes(platform)) throw new Error("Missing job extraction coverage for " + platform + ".");
}
if (contentBridge.includes("firstText(board")) throw new Error("Board extraction is calling an unavailable helper.");
for (const file of ["src/background.js", "src/job-extractor.js", "src/content.js", "src/sidepanel.js"]) {
  const result = spawnSync(process.execPath, ["--check", resolve(root, file)], { encoding: "utf8" });
  if (result.status) throw new Error(result.stderr || `${file} is invalid.`);
}
console.log("Scout extension manifest, scripts, UI, and brand assets are valid.");
