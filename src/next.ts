import { createCurveClass } from "./bindings";
import { u128ToString } from "./utils";
export type {
  IPbCurveConfig,
  IPbCurveMintResult,
  IPbCurveSnapshot,
  PbCurveResult,
  PbCurveWrapperErrorType,
} from "./types";

type CurveWasmModule = typeof import("../native/pkg-web/curve_wasm.js");
type WebWasmInitSource = Parameters<CurveWasmModule["default"]>[0];
type WasmCurve = InstanceType<CurveWasmModule["WasmCurve"]>;

export interface NextCurveInstantiateOptions {
  wasmUrl: string;
  fetch?: (input: string, init?: unknown) => Promise<any>;
  requestInit?: unknown;
}

let wasmModulePromise: Promise<CurveWasmModule> | null = null;
let wasmInitPromise: Promise<void> | null = null;

async function loadWasmModule(): Promise<CurveWasmModule> {
  if (!wasmModulePromise) {
    wasmModulePromise = import("../native/pkg-web/curve_wasm.js");
  }
  return wasmModulePromise;
}

function resolveWasmUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).toString();
  } catch {
    // fall through – probably relative
  }

  const maybeWindow =
    typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
  if (maybeWindow?.location?.origin) {
    return new URL(rawUrl, maybeWindow.location.origin).toString();
  }

  throw new Error(
    `Cannot resolve the relative wasmUrl "${rawUrl}" without a browser context. Pass an absolute URL (e.g. https://example.com/pbcurve/curve_wasm_bg.wasm) when running outside the client runtime.`
  );
}

async function fetchWasmSource(
  options: NextCurveInstantiateOptions
): Promise<WebWasmInitSource> {
  const fetchImpl = options.fetch ?? (globalThis as any).fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "Cannot fetch the pbcurve WebAssembly file: globalThis.fetch is missing. Pass a custom fetch implementation via Curve.create(cfg, { wasmUrl, fetch })."
    );
  }

  const resolvedUrl = resolveWasmUrl(options.wasmUrl);

  const response = await fetchImpl(resolvedUrl, options.requestInit);

  if (!response) {
    throw new Error(
      `Fetching the pbcurve WebAssembly file at ${resolvedUrl} returned no response`
    );
  }

  if (response.ok === false) {
    const status =
      typeof response.status === "number"
        ? `${response.status} ${response.statusText ?? ""}`.trim()
        : "unknown status";
    throw new Error(
      `Failed to fetch the pbcurve WebAssembly file at ${resolvedUrl}: ${status}`
    );
  }

  return response;
}

async function ensureWasmInitialized(
  options: NextCurveInstantiateOptions
): Promise<CurveWasmModule> {
  const module = await loadWasmModule();
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const source = await fetchWasmSource(options);
        await module.default(source as WebWasmInitSource);
      } catch (error) {
        wasmInitPromise = null;
        throw error;
      }
    })();
  }

  await wasmInitPromise;
  return module;
}

export const Curve = createCurveClass<WasmCurve, NextCurveInstantiateOptions>({
  async instantiate(cfg, options) {
    if (!options || !options.wasmUrl) {
      throw new Error(
        "Curve.create(cfg, { wasmUrl }) requires a URL that resolves to curve_wasm_bg.wasm in your public assets."
      );
    }
    const module = await ensureWasmInitialized(options);
    return new module.WasmCurve(
      u128ToString(cfg.total_supply),
      u128ToString(cfg.sell_amount),
      u128ToString(cfg.vt),
      u128ToString(cfg.mc_target_sats)
    );
  },
});

export type ICurve = InstanceType<typeof Curve>;
