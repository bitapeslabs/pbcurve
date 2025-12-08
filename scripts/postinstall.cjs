const fs = require("fs");
const path = require("path");

function log(message) {
  console.log(`[pbcurve] ${message}`);
}

function main() {
  const projectRoot = process.env.INIT_CWD;
  if (!projectRoot) {
    log(
      "Skipping wasm copy because INIT_CWD is missing (probably running inside node_modules)."
    );
    return;
  }

  const wasmSource = path.join(
    __dirname,
    "..",
    "native",
    "pkg-web",
    "curve_wasm_bg.wasm"
  );

  if (!fs.existsSync(wasmSource)) {
    log(
      "Skipping wasm copy because native/pkg-web/curve_wasm_bg.wasm is missing. Run `npm run build:wasm:web` first."
    );
    return;
  }

  const publicDir = path.join(projectRoot, "public");
  if (!fs.existsSync(publicDir)) {
    log(
      "Skipping wasm copy because no public/ directory exists (likely a Node-only install)."
    );
    return;
  }

  const destDir = path.join(publicDir, "pbcurve");
  const destPath = path.join(destDir, "curve_wasm_bg.wasm");

  fs.mkdirSync(destDir, { recursive: true });

  if (fs.existsSync(destPath)) {
    log(
      `Found existing ${path.relative(projectRoot, destPath)} – leaving it untouched.`
    );
    return;
  }

  fs.copyFileSync(wasmSource, destPath);
  log(
    `Copied curve_wasm_bg.wasm into ${path.relative(projectRoot, destDir)} so Next.js can serve it from /pbcurve/curve_wasm_bg.wasm.`
  );
}

try {
  main();
} catch (err) {
  log(
    `Failed to copy curve_wasm_bg.wasm automatically (${err?.message ?? err}). Please copy it manually into public/pbcurve/.`
  );
}
