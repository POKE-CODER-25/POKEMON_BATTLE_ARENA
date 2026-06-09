import { calculateRawTypeBonus } from './typeChart.js'
import { resolvePassiveTraitBonus } from './passiveTraitResolver.js'
import { applyBattlefieldEffects } from './battlefieldEffectsEngine.js'

// This file currently handles base score, raw type bonus, and the passive
// trait layer. Complex traits will be added later.
// It does not yet handle form changes, final outcome effects, winner
// calculation, full Master Round resolution, or Firestore.

export const createInitialBattleState = ({
  pokemon,
  opponent,
  roundNumber,
  trainerScore = 0,
  opponentScore = 0,
  battlefieldEffects = [],
}) => {
  // Applied by calculateBasicBattleScore after passive bonuses are resolved.
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
    battlefieldPenalty: 0,
    passiveBonus: 0,
    typeBonus,
    traitBonus: 0,
    protectedTraitBonus: 0,
    appliedTraits: [],
    traitBonusEntries: [],
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
  isMasterRound = false,
}) => {
  const battleState = createInitialBattleState({
    pokemon,
    opponent,
    roundNumber,
    trainerScore,
    opponentScore,
    battlefieldEffects,
  })
  const passiveResult = resolvePassiveTraitBonus({
    pokemon,
    opponent,
    roundNumber,
    trainerScore,
    opponentScore,
    isMasterRound,
  })
  const battlefieldResult = applyBattlefieldEffects({
    pokemon,
    effects: battlefieldEffects,
  })

  return {
    ...battleState,
    battlefieldBonus: battlefieldResult.battlefieldBonus,
    battlefieldPenalty: battlefieldResult.battlefieldPenalty,
    passiveBonus: passiveResult.bonus,
    traitBonus: passiveResult.manipulatableTraitBonus,
    protectedTraitBonus: passiveResult.protectedTraitBonus,
    appliedTraits: passiveResult.appliedTraits,
    traitBonusEntries: passiveResult.traitBonusEntries,
    finalScore:
      battleState.finalScore +
      passiveResult.bonus +
      battlefieldResult.battlefieldBonus -
      battlefieldResult.battlefieldPenalty,
    logs: [
      ...battleState.logs,
      ...passiveResult.logs,
      ...battlefieldResult.logs,
    ],
  }
}

export const calculateBasicBattlePair = ({
  pokemonA,
  pokemonB,
  roundNumber,
  playerAScore = 0,
  playerBScore = 0,
  battlefieldEffectsA = [],
  battlefieldEffectsB = [],
  isMasterRound = false,
}) => ({
  playerA: calculateBasicBattleScore({
    pokemon: pokemonA,
    opponent: pokemonB,
    roundNumber,
    trainerScore: playerAScore,
    opponentScore: playerBScore,
    battlefieldEffects: battlefieldEffectsA,
    isMasterRound,
  }),
  playerB: calculateBasicBattleScore({
    pokemon: pokemonB,
    opponent: pokemonA,
    roundNumber,
    trainerScore: playerBScore,
    opponentScore: playerAScore,
    battlefieldEffects: battlefieldEffectsB,
    isMasterRound,
  }),
})

// Example: Sceptile vs Swampert gives Sceptile +10.
// Example: Charizard vs Venusaur gives Charizard +5.
// Example: Charizard vs Mamoswine gives Charizard +0.
