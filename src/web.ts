import { createCurveClass } from "./bindings";
import { u128ToString } from "./utils";

type CurveWasmModule = typeof import("../native/pkg-web/curve_wasm.js");
type WebWasmInitSource = Parameters<CurveWasmModule["default"]>[0];
type WasmCurve = InstanceType<CurveWasmModule["WasmCurve"]>;

let wasmModulePromise: Promise<CurveWasmModule> | null = null;
let wasmInitPromise: Promise<void> | null = null;

async function loadWasmModule(): Promise<CurveWasmModule> {
  if (!wasmModulePromise) {
    wasmModulePromise = import("../native/pkg-web/curve_wasm.js");
  }
  return wasmModulePromise;
}

async function ensureWasmInitialized(
  source?: WebWasmInitSource
): Promise<CurveWasmModule> {
  const module = await loadWasmModule();
  if (!wasmInitPromise) {
    wasmInitPromise = module.default(source as any).then(() => undefined);
  }
  await wasmInitPromise;
  return module;
}

export async function initWebCurveWasm(
  source?: WebWasmInitSource
): Promise<void> {
  await ensureWasmInitialized(source);
}

export const Curve = createCurveClass<WasmCurve, WebWasmInitSource>({
  async instantiate(cfg, wasmSource) {
    const module = await ensureWasmInitialized(wasmSource);
    return new module.WasmCurve(
      u128ToString(cfg.total_supply),
      u128ToString(cfg.sell_amount),
      u128ToString(cfg.vt),
      u128ToString(cfg.mc_target_sats)
    );
  },
});
