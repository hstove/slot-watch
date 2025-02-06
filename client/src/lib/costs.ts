export const MAINNET_COST_LIMITS = {
  writeLength: 15_000_000,
  writeCount: 15_000,
  readLength: 100_000_000,
  readCount: 15_000,
  runtime: 5_000_000_000,
};

export type BlockCost = typeof MAINNET_COST_LIMITS;

export const ZERO_COST: BlockCost = {
  writeLength: 0,
  writeCount: 0,
  readLength: 0,
  readCount: 0,
  runtime: 0,
} as const;

export function costLimitsUsed(cost: BlockCost) {
  return {
    writeLength: cost.writeLength / MAINNET_COST_LIMITS.writeLength,
    writeCount: cost.writeCount / MAINNET_COST_LIMITS.writeCount,
    readLength: cost.readLength / MAINNET_COST_LIMITS.readLength,
    readCount: cost.readCount / MAINNET_COST_LIMITS.readCount,
    runtime: cost.runtime / MAINNET_COST_LIMITS.runtime,
  };
}
