// src/lib.rs

// Core curve math (no wasm, pure Rust).
mod curve;
mod wasm;
pub use crate::curve::{Curve, CurveConfig, CurveError, CurveSnapshot};
pub use crate::wasm::{MintResult, WasmCurve, WasmCurveSnapshot};
