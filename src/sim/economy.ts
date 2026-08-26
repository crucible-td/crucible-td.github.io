/**
 * You are paid for breaking layers.
 *
 * Every layer carries its own bounty (see STATES), so a Crystal pays out five
 * times on its way down -- shell, two cores, two remnants -- and a bare Slag
 * pays once. Depth of enemy, not number of enemies, is what makes a round
 * lucrative, which is what lets later rounds fund the towers they demand.
 */
export const ECONOMY = {
  startGold: 120,
  startLives: 20,
  /**
   * Clearing a round. The one income stream that does not scale with how much
   * walked down the lane, and therefore the game's difficulty dial: it decides
   * how much board the player owns by the last round. Bounties alone would let
   * a bigger round pay for the towers that beat it.
   */
  roundClearBonus: (round: number): number => 14 + round * 3,
} as const;
