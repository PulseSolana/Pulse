import { describe, it, expect } from "vitest";
import { classifySeverity, buildRawAlert, calculatePulseScore, deduplicateAlerts, detectRegime, groupByWallet } from "../src/analysis/classifier.js";
import type { OnChainTransaction, PulseAlert } from "../src/lib/types.js";

const baseTx: OnChainTransaction = {
  signature: "sig1111111111111111111111111111111111111111111",
  wallet: "Wallet111111111111111111111111111111111111111",
  type: "transfer",
  tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  tokenSymbol: "USDC",
  amountUsd: 500000,
  timestamp: Date.now(),
  slot: 300000000,
  flowMetrics: {
    tradeImbalance30s: 0.9,
    uniqueBuyersAccel2m: 0.8,
    liquidityDelta1m: -0.3,
    walletEntropy5m: 0.76,
    slippagePressure30s: 12,
    topbookDepthUsd: 180000,
  },
};

describe("calculatePulseScore", () => {
  it("rewards broad positive flow with manageable slippage", () => {
    expect(calculatePulseScore(baseTx.flowMetrics)).toBeGreaterThan(0.5);
  });
});

describe("detectRegime", () => {
  it("enters bullish when pulse and trailing score confirm", () => {
    expect(detectRegime(1.4, 0.5)).toBe("bullish");
  });

  it("falls into cooldown on negative flow", () => {
    expect(detectRegime(-0.3, -0.1)).toBe("cooldown");
  });

  it("stays out of bullish when confirmation is still weak", () => {
    expect(detectRegime(1.2, 0.1)).not.toBe("bullish");
  });
});

describe("classifySeverity", () => {
  it("returns medium for $100k-$999k", () => {
    expect(classifySeverity(500_000)).toBe("medium");
  });

  it("returns high for $1M-$4.9M", () => {
    expect(classifySeverity(2_000_000)).toBe("high");
  });

  it("returns critical for $5M+", () => {
    expect(classifySeverity(10_000_000)).toBe("critical");
  });

  it("returns low for sub-threshold", () => {
    expect(classifySeverity(50_000)).toBe("low");
  });

  it("upgrades severity when pulse is unusually strong", () => {
    expect(classifySeverity(250_000, 1.5)).toBe("high");
  });
});

describe("buildRawAlert", () => {
  it("builds alert with pulse metadata from tx", () => {
    const alert = buildRawAlert(baseTx, "Test Venue");
    expect(alert.severity).toBe("medium");
    expect(alert.walletLabel).toBe("Test Venue");
    expect(alert.tokenSymbol).toBe("USDC");
    expect(alert.amountUsd).toBe(500000);
    expect(alert.txSignature).toBe(baseTx.signature);
    expect(alert.pulseScore).toBeGreaterThan(0);
  });

  it("sets neutral defaults for uninterpreted alert", () => {
    const alert = buildRawAlert(baseTx);
    expect(alert.actionSignal).toBe("neutral");
    expect(alert.confidence).toBe(0);
    expect(alert.interpretation).toBe("");
  });
});

describe("deduplicateAlerts", () => {
  it("filters out already-seen signatures", () => {
    const seen = new Set<string>(["sig1111111111111111111111111111111111111111111"]);
    const alerts: PulseAlert[] = [{ ...buildRawAlert(baseTx), id: "1" }];
    expect(deduplicateAlerts(alerts, seen)).toHaveLength(0);
  });

  it("passes through new signatures", () => {
    const seen = new Set<string>();
    const alerts: PulseAlert[] = [{ ...buildRawAlert(baseTx), id: "1" }];
    expect(deduplicateAlerts(alerts, seen)).toHaveLength(1);
  });
});

describe("groupByWallet", () => {
  it("groups multiple txs from same wallet", () => {
    const txs = [baseTx, { ...baseTx, signature: "sig2222222222222222222222222222222222222222222" }];
    const grouped = groupByWallet(txs);
    expect(grouped.get(baseTx.wallet)?.length).toBe(2);
  });

  it("separates txs from different wallets", () => {
    const txs = [baseTx, { ...baseTx, wallet: "Wallet222222222222222222222222222222222222222", signature: "sig2" }];
    const grouped = groupByWallet(txs);
    expect(grouped.size).toBe(2);
  });
});
