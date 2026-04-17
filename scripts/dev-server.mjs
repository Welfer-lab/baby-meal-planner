import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../dist");
const PORT = 3000;

// 加载 .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
}

const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API routes
  if (url.pathname.startsWith("/api/")) {
    const apiFile = path.resolve(__dirname, "..", url.pathname.slice(1) + ".js");
    if (!fs.existsSync(apiFile)) {
      res.writeHead(404); res.end("Not found"); return;
    }
    // 收 body
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    await new Promise((r) => req.on("end", r));
    const bodyRaw = Buffer.concat(chunks).toString();
    req.body = bodyRaw ? JSON.parse(bodyRaw) : {};

    // 简单 res 包装
    const apiRes = {
      _status: 200, _headers: {},
      status(code) { this._status = code; return this; },
      json(data) {
        res.writeHead(this._status, { "Content-Type": "application/json", ...this._headers });
        res.end(JSON.stringify(data));
      },
    };

    try {
      const mod = await import(apiFile + `?t=${Date.now()}`);
      await (mod.default || mod)(req, apiRes);
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static files
  let filePath = path.join(root, url.pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`✅ Dev server: http://localhost:${PORT}`);
  console.log(`   API key loaded: ${process.env.DEEPSEEK_API_KEY ? "yes" : "NO"}`);
});
