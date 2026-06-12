const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of ["index.html", "css", "js", "smoke-home.png", "smoke-flight.png"]) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(out, entry), { recursive: true });
}
