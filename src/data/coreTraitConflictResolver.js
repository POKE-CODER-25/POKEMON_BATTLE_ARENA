import { isTraitProtected } from './traitPriorityEngine.js'

const MANIPULATION_POKEMON = new Set(['Mewtwo', 'Necrozma', 'Xerneas'])

const getTraitNames = (state) =>
  (state.pokemon?.traits || []).flatMap(({ name }) =>
    name.split(' + ').map((traitName) => traitName.trim()),
  )

const hasProtectedTraitComponent = (state) => {
  const traitNames = getTraitNames(state)
  const traitEffects = state.pokemon?.traitEffects || []

  return (
    traitNames.some(
      (traitName) =>
        isTraitProtected(traitName) ||
        traitName.startsWith('Mega Evolution'),
    ) ||
    traitEffects.some(
      (effect) =>
        effect.includes('Mega Evolution grants protected') ||
        effect.includes('Ash Form grants protected'),
    )
  )
}

// This file only resolves core trait conflicts.
// It does not decide winners, roll random traits, handle final outcome traits,
// or apply form changes.

export const cloneBattleState = (state) => ({
  ...state,
  logs: [...(state.logs || [])],
  appliedTraits: [...(state.appliedTraits || [])],
})

export const isPokemon = (state, name) => state?.pokemon?.name === name

export const isProtectedFromTraitManipulation = (state) => {
  if (isPokemon(state, 'Zamazenta')) {
    return true
  }

  if (state.pokemon?.priority <= 1) {
    return true
  }

  const activeTraitNames = [
    ...(state.appliedTraits || []),
    ...(state.activeTraits || []),
  ]

  if (activeTraitNames.some(isTraitProtected)) {
    return true
  }

  if (isPokemon(state, 'Necrozma')) {
    return false
  }

  return hasProtectedTraitComponent(state)
}

export const canModifyTraitBonus = (state) =>
  state.traitBonus > 0 &&
  !isPokemon(state, 'Lucario') &&
  !isPokemon(state, 'Zamazenta') &&
  !isProtectedFromTraitManipulation(state)

export const adjustTraitBonus = (state, amount) => ({
  ...state,
  traitBonus: (state.traitBonus || 0) + amount,
  finalScore: state.finalScore + amount,
})

const attemptMewtwoDisable = ({
  mewtwoSide,
  mewtwoState,
  opponentState,
  logs,
  appliedEffects,
}) => {
  if (isProtectedFromTraitManipulation(opponentState)) {
    const message = `Psychic Suppression could not disable ${opponentState.pokemon.name}.`
    logs.push(message)
    mewtwoState.logs.push(message)
    appliedEffects.push({
      side: mewtwoSide,
      sourcePokemon: mewtwoState.pokemon,
      targetPokemon: opponentState.pokemon,
      trait: 'Psychic Suppression',
      applied: false,
    })
    return opponentState
  }

  const message = `Psychic Suppression disabled ${opponentState.pokemon.name}'s trait.`
  logs.push(message)
  mewtwoState.logs.push(message)
  appliedEffects.push({
    side: mewtwoSide,
    sourcePokemon: mewtwoState.pokemon,
    targetPokemon: opponentState.pokemon,
    trait: 'Psychic Suppression',
    applied: true,
  })

  return {
    ...opponentState,
    traitDisabled: true,
    disabledBy: 'Mewtwo',
  }
}

const transferTraitBonus = ({
  sourceSide,
  sourceState,
  targetState,
  logs,
  appliedEffects,
}) => {
  const traitName = isPokemon(sourceState, 'Necrozma')
    ? 'Light Devourer'
    : 'Aura of Life'

  if (sourceState.traitDisabled) {
    return { sourceState, targetState, applied: false }
  }

  if (!canModifyTraitBonus(targetState)) {
    if (targetState.traitBonus > 0) {
      const message = `${traitName} could not modify ${targetState.pokemon.name}'s protected trait bonus.`
      logs.push(message)
      sourceState.logs.push(message)
      appliedEffects.push({
        side: sourceSide,
        sourcePokemon: sourceState.pokemon,
        targetPokemon: targetState.pokemon,
        trait: traitName,
        applied: false,
      })
    }

    return { sourceState, targetState, applied: false }
  }

  const transferredBonus = targetState.traitBonus
  const nextSourceState = adjustTraitBonus(sourceState, transferredBonus)
  const nextTargetState = adjustTraitBonus(targetState, -transferredBonus)
  const message = `${traitName} transferred +${transferredBonus} trait bonus from ${targetState.pokemon.name}.`

  logs.push(message)
  nextSourceState.logs.push(message)
  appliedEffects.push({
    side: sourceSide,
    sourcePokemon: sourceState.pokemon,
    targetPokemon: targetState.pokemon,
    trait: traitName,
    applied: true,
    transferredBonus,
  })

  return {
    sourceState: nextSourceState,
    targetState: nextTargetState,
    applied: true,
  }
}

export const resolveCoreTraitConflicts = ({
  playerAState,
  playerBState,
}) => {
  let nextPlayerAState = cloneBattleState(playerAState)
  let nextPlayerBState = cloneBattleState(playerBState)
  const logs = []
  const appliedEffects = []

  if (isPokemon(nextPlayerAState, 'Mewtwo')) {
    nextPlayerBState = attemptMewtwoDisable({
      mewtwoSide: 'PLAYER_A',
      mewtwoState: nextPlayerAState,
      opponentState: nextPlayerBState,
      logs,
      appliedEffects,
    })
  }

  if (isPokemon(nextPlayerBState, 'Mewtwo')) {
    nextPlayerAState = attemptMewtwoDisable({
      mewtwoSide: 'PLAYER_B',
      mewtwoState: nextPlayerBState,
      opponentState: nextPlayerAState,
      logs,
      appliedEffects,
    })
  }

  const manipulators = [
    { side: 'PLAYER_A', state: nextPlayerAState },
    { side: 'PLAYER_B', state: nextPlayerBState },
  ]
    .filter(({ state }) => MANIPULATION_POKEMON.has(state.pokemon?.name))
    .filter(({ state }) => !isPokemon(state, 'Mewtwo'))
    .sort(
      (entryA, entryB) =>
        entryA.state.pokemon.priority - entryB.state.pokemon.priority,
    )

  for (const manipulator of manipulators) {
    const sourceIsPlayerA = manipulator.side === 'PLAYER_A'
    const sourceState = sourceIsPlayerA
      ? nextPlayerAState
      : nextPlayerBState
    const targetState = sourceIsPlayerA
      ? nextPlayerBState
      : nextPlayerAState
    const result = transferTraitBonus({
      sourceSide: manipulator.side,
      sourceState,
      targetState,
      logs,
      appliedEffects,
    })

    if (!result.applied) {
      continue
    }

    if (sourceIsPlayerA) {
      nextPlayerAState = result.sourceState
      nextPlayerBState = result.targetState
    } else {
      nextPlayerBState = result.sourceState
      nextPlayerAState = result.targetState
    }

    break
  }

  return {
    playerAState: nextPlayerAState,
    playerBState: nextPlayerBState,
    logs,
    appliedEffects,
  }
}
