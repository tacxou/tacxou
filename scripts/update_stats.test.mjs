import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { refreshProfile } from "./update_stats.mjs";

const readme = "Before\n<!-- profile-stats:scope:start -->\nold scope\n<!-- profile-stats:scope:end -->\nAfter\n";
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>123</text></svg>';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "profile-stats-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "assets/stats"), { recursive: true });
  await writeFile(path.join(root, "assets/stats/stats-en-dark.svg"), "last good image");
  for (const name of ["README.md", "README.fr.md"]) await writeFile(path.join(root, name), readme);
  return root;
}

test("a late API failure preserves all published files and does not expose the response", async (t) => {
  const root = await fixture(t);
  let calls = 0;
  const render = async () => ++calls === 8
    ? { status: "error - temporary", error: { message: "private-client/repo secret-value" }, content: "broken card" }
    : { status: "success", content: svg };
  await assert.rejects(refreshProfile({ root, token: "fixture", privateAccess: true, statsApi: render, languageApi: render }),
    (error) => /existing cards were kept/.test(error.message) && !/private-client|secret-value/.test(error.message));
  assert.equal(await readFile(path.join(root, "assets/stats/stats-en-dark.svg"), "utf8"), "last good image");
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), readme);
  assert.equal((await readdir(path.join(root, "assets/stats"))).length, 1);
});

test("only rendered cards are saved and scope notes reflect the selected access mode", async (t) => {
  const root = await fixture(t);
  const render = async () => ({ status: "success", content: svg, internalData: "private-client/repo" });
  for (const privateAccess of [true, false]) {
    await refreshProfile({ root, token: "fixture", privateAccess, statsApi: render, languageApi: render });
    const english = await readFile(path.join(root, "README.md"), "utf8");
    assert.match(english, privateAccess ? /including accessible private repositories/ : /Private repositories are not included/);
    assert.match(english, /^Before\n/);
    assert.match(english, /\nAfter\n$/);
    const files = await readdir(path.join(root, "assets/stats"));
    assert.equal(files.length, 8);
    for (const name of files) assert.equal(await readFile(path.join(root, "assets/stats", name), "utf8"), svg);
  }
});
