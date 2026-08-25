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
  goldPerTransmute: 1,
  /** Paid on a plain kill (chipped Ore, dissolved Vapor, stamped Slag). */
  goldPerKill: 1,
  /**
   * Clearing a wave. Scales so later waves fund later towers -- but gently.
   *
   * This is the game's difficulty dial, and it is the only one that works.
   * Per-transmute income scales with how much walks down the lane, so making a
   * wave bigger also pays for the towers that beat it: wave size alone cannot
   * create pressure, and raising counts on waves 8-10 measurably did not. The
   * clear bonus is the one income stream that does not scale with wave size,
   * so it decides how much board the player owns by wave 10 -- 20 + wave * 5
   * funded seventeen towers and a flawless run, and this funds fourteen.
   */
  waveClearBonus: (wave: number): number => 15 + wave * 2,
} as const;
