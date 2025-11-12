const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "dist", "web");
const pkgPath = path.join(outDir, "package.json");

if (!fs.existsSync(outDir)) {
  console.warn(
    "[write-web-package] dist/web missing – did you run the web TypeScript build?"
  );
  process.exit(0);
}

const desired = JSON.stringify({ type: "module" }, null, 2) + "\n";

try {
  const current = fs.readFileSync(pkgPath, "utf8");
  if (current === desired) {
    process.exit(0);
  }
} catch {
  // file does not exist yet – fall through and write it
}

fs.writeFileSync(pkgPath, desired);

