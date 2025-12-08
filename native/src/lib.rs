// src/lib.rs

// Core curve math (no wasm, pure Rust).
mod wasm;
pub use crate::wasm::{MintResult, WasmCurve, WasmCurveSnapshot};
pub use pbcurve::{Curve, CurveConfig, CurveError, CurveSnapshot};
