<div align="center">

# Pulse

**Short-horizon order-flow pulse engine for Solana.**
Scores aggressive flow, buyer breadth, and liquidity migration before a burst becomes obvious on the chart.

[![Build](https://img.shields.io/github/actions/workflow/status/PulseSolana/Pulse/ci.yml?branch=main&style=flat-square&label=Build)](https://github.com/PulseSolana/Pulse/actions)
![License](https://img.shields.io/badge/license-MIT-blue)
[![Built with Claude Agent SDK](https://img.shields.io/badge/Built%20with-Claude%20Agent%20SDK-cc7800?style=flat-square)](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square)](https://www.typescriptlang.org/)

</div>

---

Most Solana scanners tell you that a large trade happened. That is not enough. A real continuation setup depends on whether aggressive flow is broadening across wallets, whether liquidity is being consumed faster than it refills, and whether there is still enough topbook depth to exit without getting trapped.

`Pulse` ingests recent Helius transactions, derives short-horizon flow metrics, and asks a Claude agent to validate whether the current burst looks like a durable momentum pulse or a shallow false break. The output is a pulse-aware alert stream with regime context, confidence, and a watchlist of names where flow is compounding.
The engine is intentionally stricter on thin books where a signal can look strong but still be hard to exit.

`DETECT -> SCORE -> VALIDATE -> REGIME -> REPORT`

---

Quant Dashboard • Terminal Output • At a Glance • Operating Surfaces • How It Works • Example Output • Technical Spec • Risk Controls • Quick Start

## At a Glance

- `Use case`: short-horizon Solana flow detection before the chart becomes obvious
- `Primary input`: trade imbalance, buyer acceleration, liquidity migration, wallet entropy, slippage pressure
- `Primary failure mode`: mistaking a shallow burst for real continuation
- `Best for`: operators who need to know whether aggressive flow is compounding or already decaying

## Quant Dashboard

![Pulse Dashboard](assets/preview-dashboard.svg)

## Terminal Output

![Pulse Terminal](assets/preview-terminal.svg)

## Operating Surfaces

- `Quant Dashboard`: shows composite pulse, regime state, and component breakdown
- `Pulse Ladder`: tracks whether a name is building, active, cooling down, or fading
- `Validation Loop`: asks the agent whether the pulse still looks tradeable after the first move
- `Terminal Output`: prints the actual names worth watching with action-ready context

## What Pulse Is Actually Solving

The hard part of short-horizon Solana trading is not noticing that activity increased. The hard part is noticing whether that activity is becoming more tradeable or less tradeable as it accelerates.

Pulse exists to make that distinction explicit. It is not trying to be a generic volume monitor. It is trying to answer whether a burst still has enough breadth and enough exit quality to matter.

## How It Works

Pulse follows a five-step loop:

1. ingest recent Solana transaction flow for the tracked symbols
2. derive the short-horizon components that make a burst meaningful
3. combine those components into a composite pulse score with regime logic
4. validate the score against slippage and topbook depth so the move is still executable
5. rank the surviving names into a pulse report the operator can actually use

That sequence matters because size alone is not a reliable signal. The board is designed to promote compounding flow and demote shallow optical bursts.

## What A Good Pulse Looks Like

- trade imbalance is expanding, not just flickering
- buyer participation is broadening instead of staying concentrated
- liquidity is still refilling as the move develops
- slippage pressure is low enough that exits still look realistic

If those conditions break, the score should cool down quickly.

## Example Output

```text
PULSE // FLOW ALERT

[HIGH] BONK
pulse score        1.34
regime             bullish
buyer accel        strong
liq delta          positive
slippage pressure  12 bps

operator note: flow is broadening and depth still looks exitable
```

## Technical Spec

Pulse builds a short-horizon composite score from five flow components:

`Pulse_t = 0.30 * z(trade_imbalance_30s) + 0.25 * z(unique_buyers_accel_2m) + 0.20 * z(liquidity_delta_1m) + 0.15 * z(wallet_entropy_5m - 0.5) - 0.10 * z(slippage_pressure_30s)`

Where:

- `trade_imbalance_30s` measures directional aggression in the most recent burst window
- `unique_buyers_accel_2m` rewards broadening participation instead of one-wallet prints
- `liquidity_delta_1m` measures how quickly liquidity is disappearing or refilling
- `wallet_entropy_5m` penalizes overly concentrated flow
- `slippage_pressure_30s` penalizes setups that look good on paper but are hard to exit cleanly

Regime classification uses hysteresis so Pulse does not flap between states:

- enter `bullish` when `pulseScore >= 1.25` and `trailingPulseScore >= 0.40`
- remain `bullish` until `pulseScore < 0.60`
- mark `cooldown` when either pulse or trailing confirmation drops below zero

Execution-quality guardrails:

- reject high-conviction pulses when `topbookDepthUsd < MIN_TOPBOOK_DEPTH_USD`
- cap conviction when `slippagePressure30s > MAX_SLIPPAGE_PRESSURE_BPS`
- increase re-entry delay as realized volatility expands relative to `VOLATILITY_BASELINE_BPS`

Severity is not just size-based. A mid-sized burst can still rank `high` if the pulse score is extreme and breadth confirms continuation.

## Risk Controls

- `depth filter`: rejects bursts that are too thin to exit cleanly
- `slippage cap`: prevents high-scoring but untradeable setups from being promoted
- `regime hysteresis`: reduces flapping between bullish and cooldown states
- `re-entry delay`: slows the engine down when volatility expands too quickly

Pulse is intentionally strict because a fast signal without exit quality is usually worse than no signal at all.

## Architecture

```text
Helius transaction feed
  -> flow metric enrichment
  -> pulse score + regime model
  -> Claude validation loop
  -> rolling pulse report
```

## Quick Start

```bash
git clone https://github.com/PulseSolana/Pulse
cd Pulse && bun install
cp .env.example .env
bun run dev
```

## Configuration

```bash
ANTHROPIC_API_KEY=sk-ant-...
HELIUS_API_KEY=...
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
ALERT_THRESHOLD_USD=75000
BULLISH_PULSE_THRESHOLD=1.25
MIN_TOPBOOK_DEPTH_USD=25000
MAX_SLIPPAGE_PRESSURE_BPS=32
SCAN_INTERVAL_MS=30000
```

## Legitimacy Notes

- Planned commit sequence: [`docs/commit-sequence.md`](docs/commit-sequence.md)
- Draft engineering issues: [`docs/issue-drafts.md`](docs/issue-drafts.md)

## License

MIT

---

*catch the burst before the breakout looks obvious.*
