// src/wasm.rs

use crate::curve::{Curve, CurveConfig, CurveError};
use wasm_bindgen::prelude::*;

impl CurveError {
    fn to_js(self) -> JsValue {
        JsError::new(&format!("CurveError::{:?}", self)).into()
    }
}

fn parse_u128_dec(s: &str) -> Result<u128, JsValue> {
    s.parse::<u128>()
        .map_err(|_| JsError::new(&format!("Invalid u128 decimal: {s}")).into())
}

#[wasm_bindgen]
pub struct WasmCurve {
    inner: Curve,
}

// 👇 This attribute tells wasm-bindgen to clone non-Copy fields (like String)
// when generating JS getters for the public fields.
#[wasm_bindgen(getter_with_clone)]
pub struct WasmCurveSnapshot {
    pub step: String,
    pub x: String,
    pub y: String,
}

#[wasm_bindgen(getter_with_clone)]
pub struct MintResult {
    pub start_step: String,
    pub tokens_out: String,
}

#[wasm_bindgen]
impl WasmCurve {
    /// Constructor exposed to JS.
    ///
    /// All params are decimal strings representing u128.
    #[wasm_bindgen(constructor)]
    pub fn new(
        total_supply: String,
        sell_amount: String,
        vt: String,
        mc_target_sats: String,
    ) -> Result<WasmCurve, JsValue> {
        let cfg = CurveConfig {
            total_supply: parse_u128_dec(&total_supply)?,
            sell_amount: parse_u128_dec(&sell_amount)?,
            vt: parse_u128_dec(&vt)?,
            mc_target_sats: parse_u128_dec(&mc_target_sats)?,
        };

        let inner = Curve::new(cfg).map_err(|e| e.to_js())?;
        Ok(WasmCurve { inner })
    }

    /// Snapshot at given step (step as decimal string).
    pub fn snapshot(&self, step: String) -> Result<WasmCurveSnapshot, JsValue> {
        let step_u = parse_u128_dec(&step)?;
        let snap = self.inner.snapshot(step_u).map_err(|e| e.to_js())?;

        Ok(WasmCurveSnapshot {
            step: snap.step.to_string(),
            x: snap.x.to_string(),
            y: snap.y.to_string(),
        })
    }

    /// Total raise in sats, as decimal string (u128).
    pub fn total_raise_sats(&self) -> String {
        self.inner.total_raise_sats().to_string()
    }

    /// Final MC in sats, as decimal string (u128).
    pub fn final_mc_sats(&self) -> Result<String, JsValue> {
        let v = self.inner.final_mc_sats().map_err(|e| e.to_js())?;
        Ok(v.to_string())
    }

    /// Progress at given step, as decimal string.
    pub fn progress_at_step(&self, step: String) -> Result<String, JsValue> {
        let step_u = parse_u128_dec(&step)?;
        Ok(self.inner.progress_at_step(step_u).to_string())
    }

    /// Simulate a batch of mints.
    ///
    /// `mints` is an array of decimal-string u128 sats_in values.
    pub fn simulate_mints(&self, mints: Box<[String]>) -> Result<Box<[MintResult]>, JsValue> {
        let mut parsed: Vec<u128> = Vec::with_capacity(mints.len());
        for s in mints.iter() {
            parsed.push(parse_u128_dec(s)?);
        }

        let res = self.inner.simulate_mints(&parsed).map_err(|e| e.to_js())?;
        let mut out: Vec<MintResult> = Vec::with_capacity(res.len());

        for (start_step, tokens_out) in res.into_iter() {
            out.push(MintResult {
                start_step: start_step.to_string(),
                tokens_out: tokens_out.to_string(),
            });
        }

        Ok(out.into_boxed_slice())
    }
}
