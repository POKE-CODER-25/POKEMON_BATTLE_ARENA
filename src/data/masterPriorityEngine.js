import { POKEMON_CATEGORIES } from './battleConstants'

export const MASTER_PRIORITY_ORDER = {
  S_LEGEND: 1,
  A_LEGEND: 2,
  B_LEGEND: 3,
  PSEUDO: 4,
  STARTER: 5,
  FAN_FAVOURITE_A: 6,
  FAN_FAVOURITE_B: 7,
  SUPPORT: 8,
}

// Master Priority is used ONLY during Master Round ties.
// It does NOT affect normal rounds or normal battle score.
// It does NOT replace trait priority: Trait Priority resolves trait conflicts,
// while Master Priority resolves Master Round ties.
export const getMasterPriority = (pokemon) => {
  if (pokemon.category === POKEMON_CATEGORIES.FAN_FAVOURITE) {
    return MASTER_PRIORITY_ORDER[pokemon.draftGroup] ?? 99
  }

  return MASTER_PRIORITY_ORDER[pokemon.category] ?? 99
}

export const resolveMasterRoundTie = (pokemonA, pokemonB) => {
  const pokemonAPriority = getMasterPriority(pokemonA)
  const pokemonBPriority = getMasterPriority(pokemonB)

  if (pokemonAPriority === pokemonBPriority) {
    return {
      resultType: 'TRUE_WARRIORS',
      winner: null,
      reason: 'Both Pokémon belong to the same Master Priority category.',
      pokemonAPriority,
      pokemonBPriority,
    }
  }

  const winner =
    pokemonAPriority < pokemonBPriority ? pokemonA : pokemonB

  return {
    resultType: 'WINNER',
    winner,
    reason: `${winner.name} has the higher Master Priority.`,
    pokemonAPriority,
    pokemonBPriority,
  }
}

// Example: Garchomp vs Lucario
// Pseudo priority 4 beats Fan Favourite A priority 6. Garchomp wins.
//
// Example: Lucario vs Snorlax
// Both Fan Favourite A. True Warriors.
//
// Example: Charizard vs Infernape
// Both Starters. True Warriors.
//
// Example: Rayquaza vs Necrozma
// Both S Legends. True Warriors.
//
// Example: Fan Favourite A vs Fan Favourite B
// Fan Favourite A wins.
