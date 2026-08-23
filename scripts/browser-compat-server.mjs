import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../browser-compat/", import.meta.url));
const rootPrefix = root.endsWith("\\") ? root : `${root}\\`;
const types = { ".html": "text/html", ".js": "text/javascript" };

createServer(async (request, response) => {
  const relative = request.url === "/" ? "index.html" : request.url.slice(1);
  const file = normalize(join(root, relative));
  if (!file.startsWith(rootPrefix)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.BROWSER_COMPAT_PORT ?? 3000), "127.0.0.1");
