export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type MovementType = "accumulation" | "distribution" | "transfer" | "swap" | "stake" | "unstake";
export type PulseRegime = "bullish" | "neutral" | "cooldown";

export interface FlowSourceProfile {
  address: string;
  label?: string;
  tags: string[];
  firstSeen: number;
  totalVolumeUsd: number;
  alertCount: number;
}

export interface FlowMetrics {
  tradeImbalance30s: number;
  uniqueBuyersAccel2m: number;
  liquidityDelta1m: number;
  walletEntropy5m: number;
  slippagePressure30s: number;
  topbookDepthUsd: number;
}

export interface OnChainTransaction {
  signature: string;
  wallet: string;
  type: MovementType;
  tokenMint: string;
  tokenSymbol: string;
  amountUsd: number;
  timestamp: number;
  slot: number;
  counterparty?: string;
  flowMetrics: FlowMetrics;
}

export interface PulseAlert {
  id: string;
  severity: AlertSeverity;
  regime: PulseRegime;
  type: MovementType;
  wallet: string;
  walletLabel?: string;
  tokenSymbol: string;
  amountUsd: number;
  pulseScore: number;
  trailingPulseScore: number;
  interpretation: string;
  actionSignal: "bullish" | "bearish" | "neutral";
  confidence: number;
  timestamp: number;
  txSignature: string;
}

export interface MarketPulseCluster {
  id: string;
  wallets: string[];
  label: string;
  totalVolumeUsd24h: number;
  netFlowUsd24h: number;
  dominantBehavior: MovementType;
}

export interface PulseReport {
  generatedAt: number;
  alertsAnalyzed: number;
  dominantRegime: PulseRegime;
  dominantSignal: "bullish" | "bearish" | "neutral" | "mixed";
  keyMovements: PulseAlert[];
  summary: string;
  watchlist: string[];
}
