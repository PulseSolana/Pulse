import { createLogger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import type { OnChainTransaction, MovementType, FlowMetrics } from "../lib/types.js";

const logger = createLogger("helius");

interface HeliusEnhancedTx {
  signature: string;
  timestamp: number;
  slot: number;
  type: string;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
    symbol?: string;
  }>;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

interface JupiterPriceResponse {
  data?: Record<string, { price?: number; mintSymbol?: string }>;
}

const STABLECOIN_PAR_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYyM2q6x1r7Di5ur7KbyN1Ns",
]);
const SOL_MINT = "So11111111111111111111111111111111111111112";
const priceCache = new Map<string, { priceUsd: number; symbol: string; expiresAt: number }>();

function classifyType(heliusType: string): MovementType {
  const type = heliusType.toUpperCase();
  if (type.includes("SWAP")) return "swap";
  if (type.includes("UNSTAKE")) return "unstake";
  if (type.includes("STAKE")) return "stake";
  return "transfer";
}

async function fetchQuotes(mints: string[]): Promise<Map<string, { priceUsd: number; symbol: string }>> {
  const quotes = new Map<string, { priceUsd: number; symbol: string }>();
  const now = Date.now();
  const missing = mints.filter((mint) => {
    const cached = priceCache.get(mint);
    if (cached && cached.expiresAt > now) {
      quotes.set(mint, { priceUsd: cached.priceUsd, symbol: cached.symbol });
      return false;
    }
    return !STABLECOIN_PAR_MINTS.has(mint);
  });

  for (const mint of mints) {
    if (STABLECOIN_PAR_MINTS.has(mint)) {
      quotes.set(mint, {
        priceUsd: 1,
        symbol: mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" ? "USDC" : "USDT",
      });
    }
  }

  if (missing.length === 0) return quotes;

  try {
    const res = await fetch(`${config.JUPITER_PRICE_API}?ids=${missing.join(",")}`);
    if (!res.ok) return quotes;

    const data = (await res.json()) as JupiterPriceResponse;
    for (const mint of missing) {
      const item = data.data?.[mint];
      if (!item?.price) continue;
      const quote = {
        priceUsd: item.price,
        symbol: item.mintSymbol ?? mint.slice(0, 6),
      };
      priceCache.set(mint, { ...quote, expiresAt: now + 120_000 });
      quotes.set(mint, quote);
    }
  } catch (err) {
    logger.debug("Failed to refresh Jupiter prices", err);
  }

  return quotes;
}

function buildFlowMetrics(tx: OnChainTransaction, observed: OnChainTransaction[]): FlowMetrics {
  const recent30s = observed.filter(
    (candidate) =>
      candidate.tokenMint === tx.tokenMint &&
      Math.abs(candidate.timestamp - tx.timestamp) <= 30_000,
  );
  const recent2m = observed.filter(
    (candidate) =>
      candidate.tokenMint === tx.tokenMint &&
      Math.abs(candidate.timestamp - tx.timestamp) <= 120_000,
  );
  const total30s = recent30s.reduce((sum, candidate) => sum + candidate.amountUsd, 0);
  const signed30s = recent30s.reduce((sum, candidate) => {
    const direction = candidate.type === "unstake" ? -1 : 1;
    return sum + candidate.amountUsd * direction;
  }, 0);
  const uniqueWallets = new Set(recent2m.map((candidate) => candidate.wallet)).size;
  const uniqueCounterparties = new Set(
    recent2m.flatMap((candidate) => [candidate.wallet, candidate.counterparty].filter(Boolean) as string[]),
  ).size;
  const avgAmount2m =
    recent2m.length > 0
      ? recent2m.reduce((sum, candidate) => sum + candidate.amountUsd, 0) / recent2m.length
      : tx.amountUsd;
  const breadthFactor = Math.max(1, Math.min(4, uniqueWallets));
  const activityFactor = Math.max(1, Math.min(6, recent2m.length));
  const depthProxy = Math.max(config.MIN_TOPBOOK_DEPTH_USD, total30s * 0.45);
  const slippageProxy = (tx.amountUsd / Math.max(depthProxy, 1)) * 100;

  return {
    tradeImbalance30s: Number((total30s > 0 ? signed30s / total30s : 0).toFixed(3)),
    uniqueBuyersAccel2m: Number(
      Math.min(1.8, (uniqueWallets / Math.max(1, recent2m.length)) * 1.4).toFixed(3),
    ),
    liquidityDelta1m: Number(
      Math.max(-1, Math.min(1, (tx.amountUsd - avgAmount2m) / Math.max(avgAmount2m, 1))).toFixed(3),
    ),
    walletEntropy5m: Number(
      Math.min(0.95, Math.max(0.2, 0.25 + breadthFactor * 0.1 + uniqueCounterparties * 0.02)).toFixed(3),
    ),
    slippagePressure30s: Number(Math.max(4, Math.min(60, slippageProxy)).toFixed(2)),
    topbookDepthUsd: Number(depthProxy.toFixed(0)),
    provenance: "proxy",
    confidence: Number(
      Math.min(0.9, 0.45 + breadthFactor * 0.08 + Math.min(activityFactor, 4) * 0.05).toFixed(2),
    ),
  };
}

export async function fetchRecentLargeTransactions(
  minUsd: number,
  limit = 100,
): Promise<OnChainTransaction[]> {
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/transactions?api-key=${config.HELIUS_API_KEY}&limit=${limit}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: { types: ["TRANSFER", "SWAP", "STAKE_SOL", "UNSTAKE_SOL"] } }),
      },
    );

    if (!res.ok) throw new Error(`Helius API ${res.status}`);
    const txs: HeliusEnhancedTx[] = await res.json();
    const results: OnChainTransaction[] = [];
    const pricedMints = new Set<string>();

    for (const tx of txs) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint) pricedMints.add(transfer.mint);
      }
    }
    pricedMints.add(SOL_MINT);

    const quotes = await fetchQuotes([...pricedMints]);

    for (const tx of txs) {
      const movementType = classifyType(tx.type);

      for (const transfer of tx.tokenTransfers) {
        const quote = quotes.get(transfer.mint);
        if (!quote) continue;

        const amountUsd = transfer.tokenAmount * quote.priceUsd;
        if (amountUsd < minUsd) continue;

        results.push({
          signature: tx.signature,
          wallet: transfer.fromUserAccount,
          type: movementType,
          tokenMint: transfer.mint,
          tokenSymbol: transfer.symbol ?? quote.symbol,
          amountRaw: transfer.tokenAmount,
          amountUsd,
          pricingSource: STABLECOIN_PAR_MINTS.has(transfer.mint) ? "stablecoin-par" : "jupiter",
          timestamp: tx.timestamp * 1000,
          slot: tx.slot,
          counterparty: transfer.toUserAccount,
          flowMetrics: {
            tradeImbalance30s: 0,
            uniqueBuyersAccel2m: 0,
            liquidityDelta1m: 0,
            walletEntropy5m: 0,
            slippagePressure30s: 0,
            topbookDepthUsd: config.MIN_TOPBOOK_DEPTH_USD,
            provenance: "proxy",
            confidence: 0,
          },
        });
      }

      for (const native of tx.nativeTransfers) {
        const amountRaw = native.amount / 1e9;
        const solQuote = quotes.get(SOL_MINT);
        const amountUsd = amountRaw * (solQuote?.priceUsd ?? 0);
        if (amountUsd < minUsd) continue;

        results.push({
          signature: tx.signature,
          wallet: native.fromUserAccount,
          type: "transfer",
          tokenMint: SOL_MINT,
          tokenSymbol: "SOL",
          amountRaw,
          amountUsd,
          pricingSource: "jupiter",
          timestamp: tx.timestamp * 1000,
          slot: tx.slot,
          counterparty: native.toUserAccount,
          flowMetrics: {
            tradeImbalance30s: 0,
            uniqueBuyersAccel2m: 0,
            liquidityDelta1m: 0,
            walletEntropy5m: 0,
            slippagePressure30s: 0,
            topbookDepthUsd: config.MIN_TOPBOOK_DEPTH_USD,
            provenance: "proxy",
            confidence: 0,
          },
        });
      }
    }

    for (const tx of results) {
      tx.flowMetrics = buildFlowMetrics(tx, results);
    }

    return results;
  } catch (err) {
    logger.error("Failed to fetch transactions", err);
    return [];
  }
}

export async function getAddressLabels(addresses: string[]): Promise<Record<string, string>> {
  const knownLabels: Record<string, string> = {
    "5tzFkiKscfRcs488N1ynCeg6gRGFPFqEvHLBSf2jEVHi": "Binance Hot Wallet",
    "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ": "Alameda Research",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Jump Trading",
  };

  return Object.fromEntries(
    addresses
      .filter((address) => knownLabels[address])
      .map((address) => [address, knownLabels[address]]),
  );
}
