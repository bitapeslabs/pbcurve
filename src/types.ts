import { BoxedResponse } from "./boxed";

export interface IPbCurveSnapshot {
  step: bigint;
  x: bigint;
  y: bigint;
}

/** Result of a single mint simulation in BigInt form. */
export interface IPbCurveMintResult {
  startStep: bigint;
  tokensOut: bigint;
}

/** BigInt-based configuration mirroring Rust `CurveConfig`. */
export interface IPbCurveConfig {
  total_supply: bigint;
  sell_amount: bigint;
  vt: bigint;
  mc_target_sats: bigint;
}

/**
 * Error family for the curve wrapper.
 * These are the only errorType values this module will ever emit.
 */
export type PbCurveWrapperErrorType =
  | "CurveWasmInitError"
  | "CurveCreateError"
  | "CurveSnapshotError"
  | "CurveFinalMcError"
  | "CurveProgressError"
  | "CurveSimulateMintsError";

export type PbCurveResult<T> = BoxedResponse<T, PbCurveWrapperErrorType>;
