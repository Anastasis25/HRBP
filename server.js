/*
 * HRBP Case Management — tiny self-hosted backend
 * --------------------------------------------------------------------------
 * Pure Node.js. No npm install, no external dependencies.
 * Serves the app (index.html) and stores shared data in data.json.
 *
 * Run:   node server.js
 * Then:  open  http://<your-server-ip>:3000
 *
 * Optional environment variables:
 *   PORT=3000              port to listen on (default 3000)
 *   ACCESS_TOKEN=secret    if set, the data API requires header  x-access-token: secret
 *                          (leave unset for the trial; add before using real data)
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

const PORT  = process.env.PORT || 3000;
const TOKEN = process.env.ACCESS_TOKEN || "";   // empty = open (trial mode)
const DIR   = __dirname;
const DATA  = path.join(DIR, "data.json");
const INDEX = "index.html";

/* ---- data file: read, and serialise writes so two saves can't collide ---- */
let writeChain = Promise.resolve();

function readData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA, "utf8"));
    return { matters: d.matters || [], sh: d.sh || [], initialized: true };
  } catch (e) {
    return { matters: [], sh: [], initialized: false };
  }
}

function writeData(obj) {
  writeChain = writeChain.then(() => new Promise((resolve, reject) => {
    const tmp = DATA + ".tmp";
    const payload = JSON.stringify({ matters: obj.matters || [], sh: obj.sh || [] }, null, 2);
    fs.writeFile(tmp, payload, (err) => {
      if (err) return reject(err);
      fs.rename(tmp, DATA, (err2) => err2 ? reject(err2) : resolve());
    });
  }));
  return writeChain;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

function authorised(req) {
  if (!TOKEN) return true;
  return req.headers["x-access-token"] === TOKEN;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  /* ----------------------------- data API ----------------------------- */
  if (pathname === "/api/data") {
    if (!authorised(req)) { res.writeHead(401); res.end("Unauthorised"); return; }

    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(readData()));
      return;
    }
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 20 * 1024 * 1024) req.destroy(); });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          await writeData({ matters: parsed.matters || [], sh: parsed.sh || [] });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "bad request" }));
        }
      });
      return;
    }
    res.writeHead(405); res.end("Method not allowed"); return;
  }

  /* --------------------------- static files --------------------------- */
  let rel = pathname === "/" ? INDEX : pathname.replace(/^\/+/, "");
  const full = path.normalize(path.join(DIR, rel));
  if (!full.startsWith(DIR)) { res.writeHead(403); res.end("Forbidden"); return; } // no path traversal

  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("HRBP Case Management server running.");
  console.log("  Local:   http://localhost:" + PORT);
  console.log("  Network: http://<this-server-ip>:" + PORT);
  console.log("  Data file: " + DATA + (TOKEN ? "   [access token required]" : "   [open — trial mode]"));
});
