import {
  IPbCurveConfig,
  IPbCurveMintResult,
  IPbCurveSnapshot,
  PbCurveResult,
  PbCurveWrapperErrorType,
} from "./types";
import { Ok, Err } from "bxrs";
import { toErrorMessage, u128ToString } from "./utils";

export interface CurveWasmSnapshot {
  step: string;
  x: string;
  y: string;
}

export interface CurveWasmMintResult {
  start_step: string;
  tokens_out: string;
}

export interface CurveWasmLike {
  snapshot(step: string): CurveWasmSnapshot;
  total_raise_sats(): string;
  final_mc_sats(): string;
  progress_at_step(step: string): string;
  asset_out_given_quote_in(step: string, quote_in: string): string;
  quote_in_given_asset_out(step: string, asset_out: string): string;
  cumulative_quote_to_step(step: string): string;
  simulate_mints(mints: string[]): CurveWasmMintResult[];
}

export interface CurveFactoryDeps<
  Inner extends CurveWasmLike,
  Extra = void
> {
  instantiate(cfg: IPbCurveConfig, extra?: Extra): Promise<Inner>;
}

export function createCurveClass<
  Inner extends CurveWasmLike,
  Extra = void
>(deps: CurveFactoryDeps<Inner, Extra>) {
  class CurveImpl {
    readonly #inner: Inner;

    constructor(inner: Inner) {
      this.#inner = inner;
    }

    static async create(
      cfg: IPbCurveConfig,
      extra?: Extra
    ): Promise<PbCurveResult<CurveImpl>> {
      try {
        const inner = await deps.instantiate(cfg, extra);
        return Ok<CurveImpl, PbCurveWrapperErrorType>(new CurveImpl(inner));
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to construct curve: ${toErrorMessage(e)}`,
          "CurveCreateError"
        );
      }
    }

    snapshot(step: bigint): PbCurveResult<IPbCurveSnapshot> {
      try {
        const snap = this.#inner.snapshot(u128ToString(step));

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

    totalRaiseSats(): PbCurveResult<bigint> {
      try {
        const value = BigInt(this.#inner.total_raise_sats());
        return Ok<bigint, PbCurveWrapperErrorType>(value);
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to compute total raise: ${toErrorMessage(e)}`,
          "CurveFinalMcError"
        );
      }
    }

    cumulativeQuoteToStep(step: bigint): PbCurveResult<bigint> {
      try {
        const value = BigInt(
          this.#inner.cumulative_quote_to_step(u128ToString(step))
        );
        return Ok<bigint, PbCurveWrapperErrorType>(value);
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to compute cumulative quote at step=${step.toString()}: ${toErrorMessage(
            e
          )}`,
          "CurveCumulativeQuoteError"
        );
      }
    }

    finalMcSats(): PbCurveResult<bigint> {
      try {
        const value = BigInt(this.#inner.final_mc_sats());
        return Ok<bigint, PbCurveWrapperErrorType>(value);
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to compute final MC: ${toErrorMessage(e)}`,
          "CurveFinalMcError"
        );
      }
    }

    progressAtStep(step: bigint): PbCurveResult<bigint> {
      try {
        const value = BigInt(this.#inner.progress_at_step(u128ToString(step)));
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

    assetOutGivenQuoteIn(
      step: bigint,
      quoteIn: bigint
    ): PbCurveResult<bigint> {
      try {
        const value = BigInt(
          this.#inner.asset_out_given_quote_in(
            u128ToString(step),
            u128ToString(quoteIn)
          )
        );
        return Ok<bigint, PbCurveWrapperErrorType>(value);
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to compute assetOut at step=${step.toString()} for quoteIn=${quoteIn.toString()}: ${toErrorMessage(
            e
          )}`,
          "CurveAssetOutError"
        );
      }
    }

    quoteInGivenAssetOut(
      step: bigint,
      baseOut: bigint
    ): PbCurveResult<bigint> {
      try {
        const value = BigInt(
          this.#inner.quote_in_given_asset_out(
            u128ToString(step),
            u128ToString(baseOut)
          )
        );
        return Ok<bigint, PbCurveWrapperErrorType>(value);
      } catch (e) {
        return Err<PbCurveWrapperErrorType>(
          `Failed to compute quoteIn at step=${step.toString()} for baseOut=${baseOut.toString()}: ${toErrorMessage(
            e
          )}`,
          "CurveQuoteInError"
        );
      }
    }

    simulateMints(mints: bigint[]): PbCurveResult<IPbCurveMintResult[]> {
      try {
        const raw = this.#inner.simulate_mints(mints.map(u128ToString));

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

  return CurveImpl;
}
