const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
const outDir = path.join(distDir, "web");
const pkgPath = path.join(outDir, "package.json");
const wasmSrcDir = path.join(__dirname, "..", "native", "pkg-web");
const wasmDestDir = path.join(distDir, "native", "pkg-web");

if (!fs.existsSync(outDir)) {
  console.warn(
    "[write-web-package] dist/web missing – did you run the web TypeScript build?"
  );
  process.exit(0);
}

const desired = JSON.stringify({ type: "module" }, null, 2) + "\n";

let currentPkg = null;
try {
  currentPkg = fs.readFileSync(pkgPath, "utf8");
} catch {
  // file does not exist yet – fall through and write it
}

if (currentPkg !== desired) {
  fs.writeFileSync(pkgPath, desired);
}

if (!fs.existsSync(wasmSrcDir)) {
  console.warn(
    "[write-web-package] native/pkg-web missing – run `npm run build:wasm:web` first."
  );
  process.exit(0);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      try {
        fs.unlinkSync(destPath);
      } catch {}
      const linkTarget = fs.readlinkSync(srcPath);
      fs.symlinkSync(linkTarget, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(wasmSrcDir, wasmDestDir);
