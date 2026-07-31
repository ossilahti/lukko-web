import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const content = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

test("the companion extension has least-scope page integration and dynamic blocking permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("declarativeNetRequestWithHostAccess"));
  assert.ok(manifest.permissions.includes("storage"));
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://lukko-web.laosmo.chatgpt.site/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*",
  ]);
  assert.match(background, /updateDynamicRules/);
  assert.match(background, /main_frame/);
  assert.match(content, /event\.origin !== window\.location\.origin/);
});
