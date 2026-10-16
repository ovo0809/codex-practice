import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/game-core.js", ["game-core.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
]);
const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (request, response) => {
  const route = routes.get(new URL(request.url, "http://localhost").pathname);
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  if (!route) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(path.join(root, route[0]));
    response.writeHead(200, {
      "Content-Type": route[1],
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Unable to read game file");
  }
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, "0.0.0.0", () =>
  console.log(`小蛇俱乐部已启动，端口 ${port}。按 Ctrl+C 停止。`),
);
