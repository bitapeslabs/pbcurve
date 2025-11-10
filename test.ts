// src/index.ts
import { Curve } from "./src";

async function main() {
  const cfg = {
    total_supply: 1_000_000_000_000n,
    sell_amount: 500_000_000_000n,
    vt: 10_000_000n,
    mc_target_sats: 21_000_000_000_000_000n,
  };

  const curveRes = await Curve.create(cfg);
  const curve = curveRes.expect("failed to create curve");

  const snapRes = curve.snapshot(0n);
  const snap = snapRes.expect("snapshot failed");

  console.log("x0 =", snap.x.toString());
  console.log("y0 =", snap.y.toString());
}

main().catch(console.error);
