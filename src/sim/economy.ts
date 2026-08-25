/**
 * You are paid for processing, not for killing.
 *
 * Gold is awarded per state change, so long refining chains out-earn one-shot
 * kills and the wallet teaches the strategy without a tutorial.
 */
export const ECONOMY = {
  startGold: 120,
  startLives: 20,
  /** Paid on every transmute -- the core income stream. */
  goldPerTransmute: 2,
  /** Paid on a plain kill (chipped Ore, dissolved Vapor, stamped Slag). */
  goldPerKill: 1,
  /** Clearing a wave. Scales so later waves fund later towers. */
  waveClearBonus: (wave: number): number => 20 + wave * 5,
} as const;
