const SIDES = {
  PLAYER_A: 'PLAYER_A',
  PLAYER_B: 'PLAYER_B',
  TIE: 'TIE',
}

const COMEBACK_TRAITS = {
  Moltres: {
    name: 'Eternal Flame',
    chance: 0.5,
    scoreBonus: 3,
  },
  'Ho-Oh': {
    name: 'Sacred Rebirth',
    chance: 0.5,
    scoreBonus: 5,
  },
}

// This resolver only handles Moltres, Ho-Oh, and Dialga.
// Other complex traits are implemented later.
// Master Round, Firestore, and UI behavior are not handled here.

export const isPokemon = (state, name) => state?.pokemon?.name === name

export const recalculateWinner = (playerAState, playerBState) => {
  if (playerAState.finalScore > playerBState.finalScore) {
    return SIDES.PLAYER_A
  }

  if (playerBState.finalScore > playerAState.finalScore) {
    return SIDES.PLAYER_B
  }

  return SIDES.TIE
}

const cloneState = (state) => ({
  ...state,
  logs: [...(state.logs || [])],
})

const getOppositeSide = (side) =>
  side === SIDES.PLAYER_A ? SIDES.PLAYER_B : SIDES.PLAYER_A

const getStateForSide = (side, playerAState, playerBState) =>
  side === SIDES.PLAYER_A ? playerAState : playerBState

export const resolveFinalOutcomeTraits = ({
  playerAState,
  playerBState,
  currentWinnerSide,
  roundNumber,
  randomFn = Math.random,
}) => {
  void roundNumber

  const nextPlayerAState = cloneState(playerAState)
  const nextPlayerBState = cloneState(playerBState)
  const logs = []
  const appliedEffects = []
  const usedTraits = new Set()
  let winnerSide = currentWinnerSide

  while (winnerSide !== SIDES.TIE) {
    const losingSide = getOppositeSide(winnerSide)
    const losingState = getStateForSide(
      losingSide,
      nextPlayerAState,
      nextPlayerBState,
    )
    const comebackTrait = COMEBACK_TRAITS[losingState.pokemon?.name]
    const isDialga = isPokemon(losingState, 'Dialga')

    if (comebackTrait) {
      const traitKey = `${losingSide}:${comebackTrait.name}`

      if (usedTraits.has(traitKey)) {
        break
      }

      usedTraits.add(traitKey)
      const succeeded = randomFn() < comebackTrait.chance
      const message = succeeded
        ? `${comebackTrait.name} activated.`
        : `${comebackTrait.name} failed.`

      logs.push(message)
      losingState.logs.push(message)
      appliedEffects.push({
        side: losingSide,
        pokemon: losingState.pokemon,
        trait: comebackTrait.name,
        succeeded,
        scoreBonus: succeeded ? comebackTrait.scoreBonus : 0,
      })

      if (!succeeded) {
        break
      }

      losingState.finalScore += comebackTrait.scoreBonus
      winnerSide = recalculateWinner(nextPlayerAState, nextPlayerBState)
      continue
    }

    if (isDialga) {
      const traitKey = `${losingSide}:Time Warp`

      if (usedTraits.has(traitKey)) {
        break
      }

      usedTraits.add(traitKey)
      const succeeded = randomFn() < 0.4
      const message = succeeded
        ? 'Time Warp reversed the battle.'
        : 'Time Warp failed.'

      logs.push(message)
      losingState.logs.push(message)
      appliedEffects.push({
        side: losingSide,
        pokemon: losingState.pokemon,
        trait: 'Time Warp',
        succeeded,
        scoreBonus: 0,
      })

      if (!succeeded) {
        break
      }

      winnerSide = losingSide

      // Time Warp is final.
      // No additional final outcome traits may activate.
      break
    }

    
    break
  }

  return {
    playerAState: nextPlayerAState,
    playerBState: nextPlayerBState,
    winnerSide,
    logs,
    appliedEffects,
  }
}
