# Pulse Issue Drafts

## Pulse score spikes on one-wallet bursts with no supporting breadth

The current burst detector can still overrate a move when one wallet fans out orders across multiple fresh pairs. Add a concentration penalty before a high pulse score can promote into `bullish`.

## Need depth-aware decay after the first impulse leg

We hold bullish regime too long when the first burst prints cleanly but refill depth disappears two scans later. Add a decay term tied to `topbookDepthUsd / amountUsd`.

Backlog note: replay both issues on BONK and WIF burst days before changing production thresholds.
