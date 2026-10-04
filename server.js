import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicFiles = new Set(["index.html", "style.css", "app.js", "game.js"]);
const types = { html: "text/html", css: "text/css", js: "text/javascript" };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  const path =
    new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
  if (!publicFiles.has(path)) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(path, import.meta.url)));
    res.writeHead(200, {
      "Content-Type": `${types[path.split(".").pop()]}; charset=utf-8`,
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(500).end("Unable to load file");
  }
}).listen(port, "0.0.0.0", () =>
  console.log(`PUYO PLACE: http://localhost:${port}`),
);
