const MEGA_FORMS = {
  Charizard: 'Mega Charizard X',
  Blastoise: 'Mega Blastoise',
  Venusaur: 'Mega Venusaur',
  Sceptile: 'Mega Sceptile',
  Swampert: 'Mega Swampert',
  Blaziken: 'Mega Blaziken',
}

const GOD_KILLER_FORMS = {
  Rayquaza: 'Mega Rayquaza',
  Necrozma: 'Ultra Necrozma',
}

// This resolver only handles Mega Evolution, Ash Greninja, God Killer, and
// Sleeping Monster. It does not decide winners, update Firestore, animate
// transformations, or select Master Round Pokemon.

export const cloneBattleState = (state) => ({
  ...state,
  logs: [...(state.logs || [])],
  protectedBonuses: [...(state.protectedBonuses || [])],
})

export const applyProtectedFormBonus = (
  state,
  { source, amount, reason, transformedForm },
) => ({
  ...state,
  formBonus: (state.formBonus || 0) + amount,
  finalScore: state.finalScore + amount,
  transformedForm,
  protectedBonuses: [
    ...(state.protectedBonuses || []),
    {
      source,
      amount,
      reason,
    },
  ],
})

export const isMegaEligible = (pokemonName) =>
  Object.hasOwn(MEGA_FORMS, pokemonName)

export const isGreninja = (pokemonName) => pokemonName === 'Greninja'

export const isGodKillerEligible = (pokemonName) =>
  Object.hasOwn(GOD_KILLER_FORMS, pokemonName)

export const isSnorlax = (pokemonName) => pokemonName === 'Snorlax'

const resolveStateFormChange = ({
  state,
  trainerScore,
  isMasterRound,
  randomFn,
  side,
  logs,
  appliedEffects,
}) => {
  const pokemonName = state.pokemon?.name

  if (isMegaEligible(pokemonName)) {
    const succeeded = randomFn() < 0.5
    const message = succeeded
      ? `${pokemonName} Mega Evolved.`
      : `${pokemonName} failed to Mega Evolve.`
    let nextState = state

    if (succeeded) {
      nextState = applyProtectedFormBonus(state, {
        source: 'Mega Evolution',
        amount: 3,
        reason: message,
        transformedForm: MEGA_FORMS[pokemonName],
      })
    }

    nextState.logs.push(message)
    logs.push(message)
    appliedEffects.push({
      side,
      pokemon: state.pokemon,
      source: 'Mega Evolution',
      applied: succeeded,
      amount: succeeded ? 3 : 0,
      transformedForm: succeeded ? MEGA_FORMS[pokemonName] : null,
    })
    return nextState
  }

  if (isGreninja(pokemonName)) {
    const succeeded = randomFn() < 0.5
    const message = succeeded
      ? 'Greninja transformed into Ash Greninja.'
      : 'Greninja failed to become Ash Greninja.'
    const amount = 3 + trainerScore
    let nextState = state

    if (succeeded) {
      nextState = applyProtectedFormBonus(state, {
        source: 'Ash Greninja',
        amount,
        reason: message,
        transformedForm: 'Ash Greninja',
      })
    }

    nextState.logs.push(message)
    logs.push(message)
    appliedEffects.push({
      side,
      pokemon: state.pokemon,
      source: 'Ash Greninja',
      applied: succeeded,
      amount: succeeded ? amount : 0,
      transformedForm: succeeded ? 'Ash Greninja' : null,
    })
    return nextState
  }

  if (isGodKillerEligible(pokemonName)) {
    const succeeded = randomFn() < 0.5
    const transformedForm = GOD_KILLER_FORMS[pokemonName]
    const message = succeeded
      ? `God Killer awakened ${transformedForm}.`
      : 'God Killer failed.'
    let nextState = state

    if (succeeded) {
      nextState = applyProtectedFormBonus(state, {
        source: 'God Killer',
        amount: 20,
        reason: message,
        transformedForm,
      })
    }

    nextState.logs.push(message)
    logs.push(message)
    appliedEffects.push({
      side,
      pokemon: state.pokemon,
      source: 'God Killer',
      applied: succeeded,
      amount: succeeded ? 20 : 0,
      transformedForm: succeeded ? transformedForm : null,
    })
    return nextState
  }

  if (isSnorlax(pokemonName)) {
    const succeeded = randomFn() < 0.1
    const message = succeeded
      ? 'Sleeping Monster awakened.'
      : 'Sleeping Monster stayed asleep.'
    const amount = isMasterRound ? 25 : 20
    let nextState = state

    if (succeeded) {
      nextState = applyProtectedFormBonus(state, {
        source: 'Sleeping Monster',
        amount,
        reason: message,
        transformedForm: 'Gigantamax Snorlax',
      })
    }

    nextState.logs.push(message)
    logs.push(message)
    appliedEffects.push({
      side,
      pokemon: state.pokemon,
      source: 'Sleeping Monster',
      applied: succeeded,
      amount: succeeded ? amount : 0,
      transformedForm: succeeded ? 'Gigantamax Snorlax' : null,
    })
    return nextState
  }

  return state
}

export const resolveFormChanges = ({
  playerAState,
  playerBState,
  isMasterRound = false,
  playerAScore = 0,
  playerBScore = 0,
  randomFn = Math.random,
}) => {
  const logs = []
  const appliedEffects = []
  const nextPlayerAState = resolveStateFormChange({
    state: cloneBattleState(playerAState),
    trainerScore: playerAScore,
    isMasterRound,
    randomFn,
    side: 'PLAYER_A',
    logs,
    appliedEffects,
  })
  const nextPlayerBState = resolveStateFormChange({
    state: cloneBattleState(playerBState),
    trainerScore: playerBScore,
    isMasterRound,
    randomFn,
    side: 'PLAYER_B',
    logs,
    appliedEffects,
  })

  return {
    playerAState: nextPlayerAState,
    playerBState: nextPlayerBState,
    logs,
    appliedEffects,
  }
}
