export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type MovementType = "accumulation" | "distribution" | "transfer" | "swap" | "stake" | "unstake";

export interface WalletProfile {
  address: string;
  label?: string;                // e.g. "Binance Hot Wallet", "Jump Trading"
  tags: string[];               // ["cex", "mm", "whale", "dev"]
  firstSeen: number;
  totalVolumeUsd: number;
  alertCount: number;
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
}

export interface WhaleAlert {
  id: string;
  severity: AlertSeverity;
  type: MovementType;
  wallet: string;
  walletLabel?: string;
  tokenSymbol: string;
  amountUsd: number;
  interpretation: string;       // Claude's reasoning
  actionSignal: "bullish" | "bearish" | "neutral";
  confidence: number;
  timestamp: number;
  txSignature: string;
}

export interface WalletCluster {
  id: string;
  wallets: string[];
  label: string;
  totalVolumeUsd24h: number;
  netFlowUsd24h: number;        // positive = accumulating
  dominantBehavior: MovementType;
}

export interface MarketIntelReport {
  generatedAt: number;
  alertsAnalyzed: number;
  dominantSignal: "bullish" | "bearish" | "neutral" | "mixed";
  keyMovements: WhaleAlert[];
  summary: string;
  watchlist: string[];          // tokens to watch
}
