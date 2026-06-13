import {
  adjustTraitBonus,
  canModifyTraitBonus,
  cloneBattleState,
  isPokemon,
  isProtectedFromTraitManipulation,
} from './coreTraitConflictResolver.js'

// This resolver only handles advanced trait interactions.
// It does not handle form changes, Snorlax awakening, winner determination,
// or Firestore updates.

export const canSuppressTrait = (state) =>
  !isProtectedFromTraitManipulation(state)

export const canStealTraitBonus = (state) => canModifyTraitBonus(state)

const attemptSuppression = ({
  sourceSide,
  sourceState,
  targetState,
  randomFn,
  logs,
  appliedEffects,
}) => {
  if (sourceState.traitDisabled) {
    return targetState
  }

  const isDarkrai = isPokemon(sourceState, 'Darkrai')
  const traitName = isDarkrai ? 'Endless Nightmare' : 'Lunar Blessing'
  const roll = randomFn()
  const rollSucceeded = isDarkrai ? roll >= 0.4 : roll < 0.5
  const mutuallyImmune =
    (isDarkrai && isPokemon(targetState, 'Cresselia')) ||
    (!isDarkrai && isPokemon(targetState, 'Darkrai'))
  const applied =
    rollSucceeded && !mutuallyImmune && canSuppressTrait(targetState)
  const message = isDarkrai
    ? applied
      ? 'Endless Nightmare suppressed opponent trait.'
      : 'Opponent resisted Endless Nightmare.'
    : applied
      ? 'Lunar Blessing caused opponent trait to fail.'
      : 'Lunar Blessing failed.'

  logs.push(message)
  sourceState.logs.push(message)
  appliedEffects.push({
    side: sourceSide,
    sourcePokemon: sourceState.pokemon,
    targetPokemon: targetState.pokemon,
    trait: traitName,
    applied,
    roll,
  })

  if (!applied) {
    return targetState
  }

  return {
    ...targetState,
    traitDisabled: true,
    disabledBy: sourceState.pokemon.name,
  }
}

const stealTraitBonus = ({
  sourceSide,
  sourceState,
  targetState,
  logs,
  appliedEffects,
}) => {
  if (
    sourceState.traitDisabled ||
    !isPokemon(sourceState, 'Gengar') ||
    !canStealTraitBonus(targetState)
  ) {
    return { sourceState, targetState }
  }

  const stolenBonus = Math.min(3, targetState.traitBonus)
  const nextSourceState = adjustTraitBonus(sourceState, stolenBonus)
  const nextTargetState = adjustTraitBonus(targetState, -stolenBonus)
  const message = `Shadow Trickster stole ${stolenBonus} trait points from ${targetState.pokemon.name}.`

  logs.push(message)
  nextSourceState.logs.push(message)
  appliedEffects.push({
    side: sourceSide,
    sourcePokemon: sourceState.pokemon,
    targetPokemon: targetState.pokemon,
    trait: 'Shadow Trickster',
    applied: true,
    stolenBonus,
  })

  return {
    sourceState: nextSourceState,
    targetState: nextTargetState,
  }
}

export const resolveAdvancedTraitInteractions = ({
  playerAState,
  playerBState,
  randomFn = Math.random,
}) => {
  let nextPlayerAState = cloneBattleState(playerAState)
  let nextPlayerBState = cloneBattleState(playerBState)
  const logs = []
  const appliedEffects = []

  if (isPokemon(nextPlayerAState, 'Darkrai')) {
    nextPlayerBState = attemptSuppression({
      sourceSide: 'PLAYER_A',
      sourceState: nextPlayerAState,
      targetState: nextPlayerBState,
      randomFn,
      logs,
      appliedEffects,
    })
  }

  if (isPokemon(nextPlayerBState, 'Darkrai')) {
    nextPlayerAState = attemptSuppression({
      sourceSide: 'PLAYER_B',
      sourceState: nextPlayerBState,
      targetState: nextPlayerAState,
      randomFn,
      logs,
      appliedEffects,
    })
  }

  if (isPokemon(nextPlayerAState, 'Cresselia')) {
    nextPlayerBState = attemptSuppression({
      sourceSide: 'PLAYER_A',
      sourceState: nextPlayerAState,
      targetState: nextPlayerBState,
      randomFn,
      logs,
      appliedEffects,
    })
  }

  if (isPokemon(nextPlayerBState, 'Cresselia')) {
    nextPlayerAState = attemptSuppression({
      sourceSide: 'PLAYER_B',
      sourceState: nextPlayerBState,
      targetState: nextPlayerAState,
      randomFn,
      logs,
      appliedEffects,
    })
  }

  const playerAGengarResult = stealTraitBonus({
    sourceSide: 'PLAYER_A',
    sourceState: nextPlayerAState,
    targetState: nextPlayerBState,
    logs,
    appliedEffects,
  })
  nextPlayerAState = playerAGengarResult.sourceState
  nextPlayerBState = playerAGengarResult.targetState

  const playerBGengarResult = stealTraitBonus({
    sourceSide: 'PLAYER_B',
    sourceState: nextPlayerBState,
    targetState: nextPlayerAState,
    logs,
    appliedEffects,
  })
  nextPlayerBState = playerBGengarResult.sourceState
  nextPlayerAState = playerBGengarResult.targetState

  return {
    playerAState: nextPlayerAState,
    playerBState: nextPlayerBState,
    logs,
    appliedEffects,
  }
}
