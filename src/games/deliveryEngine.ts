import { createGameRounds, type GameRound, type GameWord } from './engine'

/** A finite recognition schedule that inherits the shared strict word/round boundary. */
export function createDeliverySchedule(
  words: readonly GameWord[] | unknown,
  seed: number,
  rounds = 20,
): readonly GameRound[] {
  return createGameRounds(words, seed, rounds)
}
