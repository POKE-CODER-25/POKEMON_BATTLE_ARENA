import { calculateRawTypeBonus } from './typeChart.js'

// This file currently handles base score and raw type bonus.
// It does not yet handle traits, form changes, final outcome effects,
// winner calculation, Master Round, or Firestore.

export const createInitialBattleState = ({
  pokemon,
  opponent,
  roundNumber,
  trainerScore = 0,
  opponentScore = 0,
  battlefieldEffects = [],
}) => {
  // Accepted now for API stability; battlefield scoring is implemented later.
  void battlefieldEffects

  const baseScore = pokemon.score
  const typeBonus = calculateRawTypeBonus(pokemon.types, opponent.types)
  const logs = [`Base score: ${baseScore}`]

  if (typeBonus > 0) {
    logs.push(`Type bonus: +${typeBonus}`)
  }

  return {
    pokemon,
    opponent,
    roundNumber,
    trainerScore,
    opponentScore,
    baseScore,
    battlefieldBonus: 0,
    passiveBonus: 0,
    typeBonus,
    traitBonus: 0,
    formBonus: 0,
    finalScore: baseScore + typeBonus,
    logs,
  }
}

export const calculateBasicBattleScore = ({
  pokemon,
  opponent,
  roundNumber,
  trainerScore = 0,
  opponentScore = 0,
  battlefieldEffects = [],
}) =>
  createInitialBattleState({
    pokemon,
    opponent,
    roundNumber,
    trainerScore,
    opponentScore,
    battlefieldEffects,
  })

export const calculateBasicBattlePair = ({
  pokemonA,
  pokemonB,
  roundNumber,
  playerAScore = 0,
  playerBScore = 0,
  battlefieldEffectsA = [],
  battlefieldEffectsB = [],
}) => ({
  playerA: calculateBasicBattleScore({
    pokemon: pokemonA,
    opponent: pokemonB,
    roundNumber,
    trainerScore: playerAScore,
    opponentScore: playerBScore,
    battlefieldEffects: battlefieldEffectsA,
  }),
  playerB: calculateBasicBattleScore({
    pokemon: pokemonB,
    opponent: pokemonA,
    roundNumber,
    trainerScore: playerBScore,
    opponentScore: playerAScore,
    battlefieldEffects: battlefieldEffectsB,
  }),
})

// Example: Sceptile vs Swampert gives Sceptile +10.
// Example: Charizard vs Venusaur gives Charizard +5.
// Example: Charizard vs Mamoswine gives Charizard +0.
