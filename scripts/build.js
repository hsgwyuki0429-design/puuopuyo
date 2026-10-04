import { mkdir, copyFile, readdir } from "node:fs/promises";

// Publish only the browser's four assets, never source tooling or credentials.
const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
const assets = ["index.html", "style.css", "app.js", "game.js"];
await mkdir(output, { recursive: true });
const unexpected = (await readdir(output)).filter(
  (name) => !assets.includes(name),
);
if (unexpected.length) {
  throw new Error(
    `Unexpected files in dist; inspect them before publishing: ${unexpected.join(", ")}`,
  );
}
await Promise.all(
  assets.map((name) => copyFile(new URL(name, root), new URL(name, output))),
);
console.log(`Prepared ${assets.length} browser assets in dist/`);
