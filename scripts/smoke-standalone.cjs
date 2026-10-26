// Runs the production "standalone" build (the same files the Docker image serves) against a
// throw-away copy of the database and checks that the things Docker needs actually work:
// the database engine, PDF reading (pdf.js worker + fonts) and Tesseract OCR.
//
//   npm run build && node scripts/smoke-standalone.cjs
//
// Nothing in your real database or uploads folder is touched.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build found — run `npm run build` first.");
  process.exit(1);
}

// A standalone build is run from its own folder; static files and OCR data are added beside it,
// exactly as the Dockerfile does.
function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, force: true });
}
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
if (fs.existsSync(path.join(root, "public"))) copyDir(path.join(root, "public"), path.join(standalone, "public"));
if (fs.existsSync(path.join(root, "ocr-data"))) copyDir(path.join(root, "ocr-data"), path.join(standalone, "ocr-data"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "propintel-standalone-"));
const dbCopy = path.join(tmp, "test.db");
fs.copyFileSync(path.join(root, "prisma", "dev.db"), dbCopy);
const uploads = path.join(standalone, "uploads");
fs.rmSync(uploads, { recursive: true, force: true });

const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production", DATABASE_URL: "file:" + dbCopy.replace(/\\/g, "/"), ANTHROPIC_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

async function main() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE + "/api/health")).ok) break; } catch {}
    await sleep(500);
  }
  console.log("\nStandalone build smoke test");

  const health = await fetch(BASE + "/api/health").then((r) => r.json());
  check("server starts and database responds", health.status === "healthy", `database: ${health.checks?.database?.status}`);

  const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "manager@sahyadri-demo.com", password: "Demo@12345" }) }).then((r) => r.json());
  const token = login.data?.accessToken || login.data?.tokens?.accessToken;
  check("login works (Prisma engine + bcrypt)", !!token);
  const H = { Authorization: "Bearer " + token };

  const props = await fetch(BASE + "/api/properties?limit=1", { headers: H }).then((r) => r.json());
  check("reads properties from SQLite", props.success && props.data.properties.length === 1);

  const page = await fetch(BASE + "/login");
  check("serves pages", page.ok);

  async function upload(file, type, mime) {
    const form = new FormData();
    form.append("propertyId", "pune-0002");
    form.append("documentTypeId", type);
    form.append("files", new Blob([fs.readFileSync(file)], { type: mime }), path.basename(file));
    const r = await fetch(BASE + "/api/documents", { method: "POST", headers: H, body: form }).then((x) => x.json());
    if (!r.success) return { error: r.error || JSON.stringify(r.data?.errors) };
    for (let i = 0; i < 90; i++) {
      const d = await fetch(BASE + "/api/documents?propertyId=pune-0002&limit=50", { headers: H }).then((x) => x.json());
      const doc = d.data.documents.find((x) => x.originalName === path.basename(file));
      if (doc && !["PENDING", "PROCESSING"].includes(doc.ocrStatus)) return doc;
      await sleep(1000);
    }
    return { error: "timed out" };
  }

  const png = path.join(root, "demo-docs", "1_7-12_CORRECT.png");
  const scanned = path.join(root, "sample-docs", "712-scanned.pdf");
  const digital = path.join(root, "sample-docs", "tax-receipt-text.pdf");

  if (fs.existsSync(png)) {
    const d = await upload(png, "dt-712", "image/png");
    check("OCR reads an image (Tesseract worker + language data)", d.ocrStatus === "COMPLETED", d.error || `confidence ${Math.round(d.ocrConfidence)}%, survey ${d.extracted?.fields?.surveyNumber}`);
  } else console.log("  – skipped image test (run `npm run demo:docs`)");

  if (fs.existsSync(scanned)) {
    const d = await upload(scanned, "dt-712", "application/pdf");
    check("reads a scanned PDF (pdf.js worker + embedded image extraction)", d.ocrStatus === "COMPLETED", d.error || d.ocrError || `method ${d.extracted?.ocr?.method}`);
  } else console.log("  – skipped scanned-PDF test (run `npm run ocr:samples`)");

  if (fs.existsSync(digital)) {
    const d = await upload(digital, "dt-tax", "application/pdf");
    check("reads a digital PDF (text layer)", d.ocrStatus === "COMPLETED", d.error || d.ocrError || `method ${d.extracted?.ocr?.method}`);
  }

  console.log(results.every(Boolean) ? "\nAll checks passed.\n" : "\nSome checks FAILED. Server log tail:\n" + serverLog.split("\n").slice(-25).join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    results.push(false);
  })
  .finally(async () => {
    server.kill();
    await sleep(1500); // Windows keeps the SQLite file locked until the server process has exited
    for (const dir of [tmp, uploads]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        console.log(`  (couldn't delete ${dir} — safe to remove by hand)`);
      }
    }
    process.exit(results.length && results.every(Boolean) ? 0 : 1);
  });
