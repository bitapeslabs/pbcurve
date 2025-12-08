// src/index.ts
import { Curve } from "./src";
export const DECIMALS = 10n ** 8n;

async function main() {
  const cfg = {
    total_supply: 1_000_000_000n * DECIMALS,
    sell_amount: 720_000_000n * DECIMALS,
    vt: 250_000_000n * DECIMALS,
    mc_target_sats: 70_000_000n * DECIMALS,
  };

  const curveRes = await Curve.create(cfg);
  const curve = curveRes.expect("failed to create curve");

  const snapRes = curve.snapshot(0n);
  const snap = snapRes.expect("snapshot failed");

  console.log("x0 =", snap.x.toString());
  console.log("y0 =", snap.y.toString());
  let initMcSats = curve
    .mcSatsAtStep(2176851576513508n)
    .expect("mc sats failed");
  console.log("mcSats at step 0 =", Number(initMcSats));
  let cum = curve
    .cumulativeQuoteToStep(720_000_000n * DECIMALS)
    .expect("cumulative quote failed");
  console.log("cumulative quote to step 720M =", (cum / DECIMALS).toString());
  console.log(curve.finalMcSats());
}

main().catch(console.error);
