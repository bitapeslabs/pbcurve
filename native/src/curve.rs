// src/lib.rs

use core::convert::TryInto;
use uint::construct_uint;

construct_uint! {
    /// Minimal fixed-width 256-bit integer used for precise intermediate math.
    pub struct U256(4);
}

/// Basic integer type for amounts (sats, token base units).

#[derive(Debug, Clone, Copy)]
pub enum CurveError {
    InvalidConfig,
    OutOfRange,
    ZeroInput,
    ExceedsPool,
}

fn mul_u256(a: U256, b: U256) -> Result<U256, CurveError> {
    let (res, overflow) = a.overflowing_mul(b);
    if overflow {
        Err(CurveError::InvalidConfig)
    } else {
        Ok(res)
    }
}

fn narrow_u256(value: U256) -> Result<u128, CurveError> {
    let mut buf = [0u8; 32];
    value.to_big_endian(&mut buf);
    let (hi, lo) = buf.split_at(16);
    if hi.iter().any(|&b| b != 0) {
        Err(CurveError::InvalidConfig)
    } else {
        Ok(u128::from_be_bytes(lo.try_into().expect("slice sized to 16 bytes")))
    }
}

/// Config for the curve:
/// - total_supply: total token supply total_supply
/// - sell_amount: tokens sold over the bonding curve sellable_tokens
/// - vt: virtual token reserves vt
/// - mc_target_sats: desired final fully diluted market cap (in sats)
#[derive(Debug, Clone, Copy)]
pub struct CurveConfig {
    pub total_supply: u128,   // total_supply
    pub sell_amount: u128,    // sellable_tokens
    pub vt: u128,             // vt
    pub mc_target_sats: u128, // final FDV target in sats
}

/// sellable_tokensnapshot of the curve at a given step.
#[derive(Debug, Clone, Copy)]
pub struct CurveSnapshot {
    pub step: u128, // how many tokens have been sold along the curve
    pub x: u128,    // sats-side conceptual reserves
    pub y: u128,    // token-side reserves (vt + remaining real)
}

impl CurveSnapshot {
    /// Price as a fraction X / Y (sats per token base unit).
    #[inline]
    pub fn price_num(&self) -> u128 {
        self.x
    }

    #[inline]
    pub fn price_den(&self) -> u128 {
        self.y
    }
}

/// CPMM with virtual token reserves.
///
/// Invariant: X * Y = k
/// Where:
///   - X is sats-side (conceptual) reserves
///   - Y is token-side reserves = vt + (sellable_tokens - step)
///
/// X0 is derived from desired final FDV:
///   MC_final_sats ≈ (X0 * Y0 / vt^2) * total_supply
///   => X0 ≈ mc_target_sats * vt^2 / (Y0 * total_supply)
#[derive(Debug, Clone)]
pub struct Curve {
    // Immutable config
    pub total_supply: u128, // total_supply
    pub sell_amount: u128,  // sellable_tokens
    pub vt: u128,           // vt

    // Derived
    pub y0: u128, // Y0 = vt + sellable_tokens
    pub x0: u128, // X0 (conceptual sats-side reserve)
    pub k: u128,  // invariant: k = X0 * Y0
}

impl Curve {
    /// Construct from FDV target.
    pub fn new(cfg: CurveConfig) -> Result<Self, CurveError> {
        let total_supply = cfg.total_supply;
        let sellable_tokens = cfg.sell_amount;
        let vt = cfg.vt;
        let mc = cfg.mc_target_sats;

        if total_supply == 0 || sellable_tokens == 0 || vt == 0 || mc == 0 {
            return Err(CurveError::InvalidConfig);
        }

        // Y0 = vt + sellable_tokens
        let y0 = vt
            .checked_add(sellable_tokens)
            .ok_or(CurveError::InvalidConfig)?;

        // X0 ≈ mc_target_sats * vt^2 / (Y0 * total_supply)
        let vt_sq = mul_u256(U256::from(vt), U256::from(vt))?;
        let num = mul_u256(U256::from(mc), vt_sq)?;
        let den = mul_u256(U256::from(y0), U256::from(total_supply))?;
        if den.is_zero() {
            return Err(CurveError::InvalidConfig);
        }

        let x0 = narrow_u256(num / den)?;
        if x0 == 0 {
            return Err(CurveError::InvalidConfig);
        }

        let k = narrow_u256(mul_u256(U256::from(x0), U256::from(y0))?)?;

        Ok(Self {
            total_supply,
            sell_amount: sellable_tokens,
            vt,
            y0,
            x0,
            k,
        })
    }

    /// Max step (i.e. sellable_tokens).
    #[inline]
    pub fn max_step(&self) -> u128 {
        self.sell_amount
    }

    /// Internal: Y(step) = vt + (sellable_tokens - step)
    fn y_at(&self, step: u128) -> Result<u128, CurveError> {
        if step > self.sell_amount {
            return Err(CurveError::OutOfRange);
        }
        let remaining = self
            .sell_amount
            .checked_sub(step)
            .ok_or(CurveError::OutOfRange)?;
        let y = self
            .vt
            .checked_add(remaining)
            .ok_or(CurveError::InvalidConfig)?;
        Ok(y)
    }

    /// Internal: X = floor(k / Y)
    fn x_from_y(&self, y: u128) -> u128 {
        self.k / y
    }

    /// Get the curve state (X, Y, step) at a given step.
    pub fn snapshot(&self, step: u128) -> Result<CurveSnapshot, CurveError> {
        let y = self.y_at(step)?;
        let x = self.x_from_y(y);
        Ok(CurveSnapshot { step, x, y })
    }

    /// Buy tokens with sats at a given step.
    ///
    /// Inputs:
    ///   - step: current step (0..sellable_tokens)
    ///   - sats_in: sats the user pays now
    ///
    /// Returns:
    ///   - new_step: updated step after purchase
    ///   - tokens_out: tokens received
    pub fn mint(&self, step: u128, sats_in: u128) -> Result<(u128, u128), CurveError> {
        if sats_in == 0 {
            return Err(CurveError::ZeroInput);
        }

        let y = self.y_at(step)?;
        let x = self.x_from_y(y);

        // New X'
        let x2 = x.checked_add(sats_in).ok_or(CurveError::InvalidConfig)?;

        // New Y' = floor(k / X'), but never below vt (don't touch virtual)
        let y_raw = self.k / x2;
        let y_prime = if y_raw < self.vt { self.vt } else { y_raw };

        // total_supplyokens out = Y - Y'
        let dy = y.saturating_sub(y_prime);

        // New step = step + tokens_out, clamped to sellable_tokens
        let new_step = (step.saturating_add(dy)).min(self.sell_amount);
        Ok((new_step, dy))
    }

    pub fn asset_out_given_quote_in(
        &self,
        step: u128,
        quote_in: u128,
    ) -> Result<u128, CurveError> {
        let (_, tokens_out) = self.mint(step, quote_in)?;
        Ok(tokens_out)
    }

    pub fn quote_in_given_asset_out(
        &self,
        step: u128,
        asset_out: u128,
    ) -> Result<u128, CurveError> {
        if asset_out == 0 {
            return Ok(0);
        }

        let y = self.y_at(step)?;
        let max_tokens = y.saturating_sub(self.vt);
        if asset_out > max_tokens {
            return Err(CurveError::ExceedsPool);
        }

        let x = self.x_from_y(y);
        let x_final = self.k / self.vt;
        let max_quote = x_final
            .checked_sub(x)
            .ok_or(CurveError::InvalidConfig)?;
        if max_quote == 0 {
            return Err(CurveError::ExceedsPool);
        }

        let mut lo = 1u128;
        let mut hi = max_quote;

        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let out = self.asset_out_given_quote_in(step, mid)?;
            if out >= asset_out {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }

        Ok(lo)
    }

    //Simulates the entire curve stack in wasm so node can cal this uber fast vroom vroom
    pub fn simulate_mints(&self, mints: &[u128]) -> Result<Vec<(u128, u128)>, CurveError> {
        let mut current_step: u128 = 0;
        let mut results = Vec::with_capacity(mints.len());

        for &mint in mints {
            let (new_step, tokens_out) = self.mint(current_step, mint)?;
            results.push((current_step, tokens_out));
            current_step = new_step;
        }

        Ok(results)
    }

    /// Total sats raised up to a specific step.
    pub fn cumulative_quote_to_step(&self, step: u128) -> Result<u128, CurveError> {
        let snap = self.snapshot(step)?;
        Ok(snap.x.saturating_sub(self.x0))
    }

    /// Helper: total sats raised if we sell the full window [0 -> sellable_tokens].
    /// total_supplyhis is "curve-native": X_final - X0, where X_final = floor(k / vt).
    pub fn total_raise_sats(&self) -> u128 {
        let x_final = self.k / self.vt;
        x_final.saturating_sub(self.x0)
    }

    /// Helper: total sats raised if we sell the full window [0 -> sellable_tokens].
    /// total_supplyhis is "curve-native": X_final - X0, where X_final = floor(k / vt).
    pub fn final_mc_sats(&self) -> Result<u128, CurveError> {
        let vt_sq = self
            .vt
            .checked_mul(self.vt)
            .ok_or(CurveError::InvalidConfig)?;
        let p_final = self.k / vt_sq;

        Ok(p_final.saturating_mul(self.total_supply))
    }

    pub fn progress_at_step(&self, step: u128) -> u128 {
        step.saturating_mul(100u128) / self.total_supply
    }

    pub fn avg_progess(&self, steps: &[u128]) -> u128 {
        let product: u128 = steps.iter().copied().product();
        let sum: u128 = steps.iter().copied().sum();
        product / sum
    }
}
