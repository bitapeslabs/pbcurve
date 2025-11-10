import * as curveWasm from "../native/pkg/curve_wasm";
import {
  IPbCurveConfig,
  IPbCurveMintResult,
  IPbCurveSnapshot,
  PbCurveWrapperErrorType,
  PbCurveResult,
} from "./types";
import { Ok, Err } from "./boxed";

/**
 * Utility — safely extract an error message from an unknown thrown value.
 */
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Convert a bigint to its decimal string representation for the wasm boundary.
 */
function u128ToString(v: bigint): string {
  return v.toString(10);
}

/** Type alias for the instantiated wasm curve class. */
type WasmCurve = typeof curveWasm.WasmCurve extends { new (...args: any): any }
  ? InstanceType<typeof curveWasm.WasmCurve>
  : never;

/** Raw snapshot type coming directly from wasm (stringified numbers). */
type RawWasmCurveSnapshot = curveWasm.WasmCurveSnapshot;
/** Raw mint result type coming directly from wasm (stringified numbers). */
type RawMintResult = curveWasm.MintResult;

/**
 * High-level TypeScript wrapper around the Rust `Curve` class.
 *
 * Provides type-safe BigInt-based access to all curve operations and
 * returns results using the project's standardized `BoxedResponse` pattern.
 *
 * This wrapper is designed for **NodeJS** and uses the `wasm-pack build --target nodejs`
 * output, which initializes automatically on import (no explicit async init needed).
 */
export class Curve {
  private inner: WasmCurve;

  private constructor(inner: WasmCurve) {
    this.inner = inner;
  }

  /**
   * Create a new `Curve` instance from a fully-typed BigInt configuration.
   *
   * @param cfg - Configuration object defining the curve parameters.
   * @returns A boxed response containing either a constructed `Curve` instance
   *          or an error (`CurveCreateError`) if initialization fails.
   *
   * Typical usage:
   * ```ts
   * const curveRes = await Curve.create({
   *   total_supply: 1_000_000_000_000n,
   *   sell_amount: 500_000_000_000n,
   *   vt: 10_000_000n,
   *   mc_target_sats: 21_000_000_000_000_000n,
   * });
   * const curve = curveRes.expect("failed to create curve");
   * ```
   */
  static async create(cfg: IPbCurveConfig): Promise<PbCurveResult<Curve>> {
    try {
      const InnerCtor = curveWasm.WasmCurve;
      const inner = new InnerCtor(
        u128ToString(cfg.total_supply),
        u128ToString(cfg.sell_amount),
        u128ToString(cfg.vt),
        u128ToString(cfg.mc_target_sats)
      ) as WasmCurve;

      return Ok<Curve, PbCurveWrapperErrorType>(new Curve(inner));
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to construct curve: ${toErrorMessage(e)}`,
        "CurveCreateError"
      );
    }
  }

  /**
   * Capture a snapshot of the curve at a specific token sale step.
   *
   * @param step - The number of tokens sold so far (BigInt).
   * @returns A boxed `IPbCurveSnapshot` containing `x`, `y`, and `step`
   *          as BigInts, or a `CurveSnapshotError` if the operation fails.
   *
   * The snapshot gives you the instantaneous state of the bonding curve
   * (reserves and position) for analytical or visualization purposes.
   */
  snapshot(step: bigint): PbCurveResult<IPbCurveSnapshot> {
    try {
      const snap: RawWasmCurveSnapshot = this.inner.snapshot(
        u128ToString(step)
      );

      const result: IPbCurveSnapshot = {
        step: BigInt(snap.step),
        x: BigInt(snap.x),
        y: BigInt(snap.y),
      };

      return Ok<IPbCurveSnapshot, PbCurveWrapperErrorType>(result);
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to snapshot curve at step=${step.toString()}: ${toErrorMessage(
          e
        )}`,
        "CurveSnapshotError"
      );
    }
  }

  /**
   * Compute the **total sats raised** if the entire sellable window were sold.
   *
   * This corresponds to the difference between the starting and final X
   * reserves on the curve (`X_final - X0` in the bonding-curve model).
   *
   * @returns Boxed BigInt result (sats) or `CurveFinalMcError` on failure.
   */
  totalRaiseSats(): PbCurveResult<bigint> {
    try {
      const value = BigInt(this.inner.total_raise_sats());
      return Ok<bigint, PbCurveWrapperErrorType>(value);
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to compute total raise: ${toErrorMessage(e)}`,
        "CurveFinalMcError"
      );
    }
  }

  /**
   * Compute the **final fully-diluted market cap (FDV)** in sats
   * assuming the full curve is sold out.
   *
   * This uses the relationship:
   * ```
   * MC_final ≈ (X0 * Y0 / vt²) * total_supply
   * ```
   *
   * @returns Boxed BigInt FDV or `CurveFinalMcError` if calculation fails.
   */
  finalMcSats(): PbCurveResult<bigint> {
    try {
      const value = BigInt(this.inner.final_mc_sats());
      return Ok<bigint, PbCurveWrapperErrorType>(value);
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to compute final MC: ${toErrorMessage(e)}`,
        "CurveFinalMcError"
      );
    }
  }

  /**
   * Calculate **progress** as a 0–100 integer percentage at a given step.
   *
   * Internally uses:
   * ```
   * progress = (step * 100) / total_supply
   * ```
   *
   * @param step - Current token sale step (BigInt).
   * @returns Boxed BigInt percentage (0–100) or `CurveProgressError` on failure.
   */
  progressAtStep(step: bigint): PbCurveResult<bigint> {
    try {
      const value = BigInt(this.inner.progress_at_step(u128ToString(step)));
      return Ok<bigint, PbCurveWrapperErrorType>(value);
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to compute progress at step=${step.toString()}: ${toErrorMessage(
          e
        )}`,
        "CurveProgressError"
      );
    }
  }

  /**
   * Simulate a **batch of mint operations** (e.g. multiple buyers)
   * to compute resulting token outputs for each provided sats amount.
   *
   * @param mints - Array of sats-in values as BigInts.
   * @returns Boxed array of results, each containing:
   *          - `startStep` (BigInt)
   *          - `tokensOut` (BigInt)
   *
   * Useful for quickly previewing an entire mint sequence or replaying
   * curve state evolution over time.
   */
  simulateMints(mints: bigint[]): PbCurveResult<IPbCurveMintResult[]> {
    try {
      const raw: RawMintResult[] = this.inner.simulate_mints(
        mints.map(u128ToString)
      );

      const mapped: IPbCurveMintResult[] = raw.map((r) => ({
        startStep: BigInt(r.start_step),
        tokensOut: BigInt(r.tokens_out),
      }));

      return Ok<IPbCurveMintResult[], PbCurveWrapperErrorType>(mapped);
    } catch (e) {
      return Err<PbCurveWrapperErrorType>(
        `Failed to simulate mints: ${toErrorMessage(e)}`,
        "CurveSimulateMintsError"
      );
    }
  }
}
