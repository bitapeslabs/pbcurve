import * as curveWasm from "../native/pkg/curve_wasm";
import { createCurveClass } from "./bindings";
import { u128ToString } from "./utils";
export type {
  IPbCurveConfig,
  IPbCurveMintResult,
  IPbCurveSnapshot,
  PbCurveResult,
  PbCurveWrapperErrorType,
} from "./types";

type WasmCurve = typeof curveWasm.WasmCurve extends { new (...args: any): any }
  ? InstanceType<typeof curveWasm.WasmCurve>
  : never;

export const Curve = createCurveClass<WasmCurve>({
  async instantiate(cfg) {
    const InnerCtor = curveWasm.WasmCurve;
    return new InnerCtor(
      u128ToString(cfg.total_supply),
      u128ToString(cfg.sell_amount),
      u128ToString(cfg.vt),
      u128ToString(cfg.mc_target_sats)
    ) as WasmCurve;
  },
});

export type ICurve = InstanceType<typeof Curve>;
