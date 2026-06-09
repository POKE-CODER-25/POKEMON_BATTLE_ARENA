export const RESULT_TYPES = {
  PLAYER_A_WIN: 'PLAYER_A_WIN',
  PLAYER_B_WIN: 'PLAYER_B_WIN',
  TIE: 'TIE',
  TRUE_WARRIORS: 'TRUE_WARRIORS',
}

const SIDES = {
  PLAYER_A: 'PLAYER_A',
  PLAYER_B: 'PLAYER_B',
  BOTH: 'BOTH',
}

// This file resolves normal round winners only.
// Master Round tie handling happens separately.
// Final outcome traits such as Dialga, Moltres, and Ho-Oh are not implemented.
// This resolver assumes finalScore is already calculated.

export const isVictini = (pokemon) => pokemon?.name === 'Victini'

export const resolveScoreWinner = (playerAState, playerBState) => {
  if (playerAState.finalScore > playerBState.finalScore) {
    return SIDES.PLAYER_A
  }

  if (playerBState.finalScore > playerAState.finalScore) {
    return SIDES.PLAYER_B
  }

  return RESULT_TYPES.TIE
}

const createWinResult = ({
  winnerSide,
  playerAState,
  playerBState,
  reason,
}) => {
  const playerAWon = winnerSide === SIDES.PLAYER_A
  const winnerPokemon = playerAWon
    ? playerAState.pokemon
    : playerBState.pokemon
  const loserPokemon = playerAWon
    ? playerBState.pokemon
    : playerAState.pokemon

  return {
    resultType: playerAWon
      ? RESULT_TYPES.PLAYER_A_WIN
      : RESULT_TYPES.PLAYER_B_WIN,
    winnerSide,
    winnerPokemon,
    loserPokemon,
    pointAwardedTo: winnerSide,
    reason,
    logs: [reason],
  }
}

const createTieResult = ({ pointAwardedTo, reason }) => ({
  resultType: RESULT_TYPES.TIE,
  winnerSide: null,
  winnerPokemon: null,
  loserPokemon: null,
  pointAwardedTo,
  reason,
  logs: [reason],
})

export const resolveNormalRoundWinner = ({
  playerAState,
  playerBState,
  roundNumber,
  playerAScore = 0,
  playerBScore = 0,
}) => {
  const scoreWinner = resolveScoreWinner(playerAState, playerBState)

  if (scoreWinner !== RESULT_TYPES.TIE) {
    const winnerState =
      scoreWinner === SIDES.PLAYER_A ? playerAState : playerBState

    return createWinResult({
      winnerSide: scoreWinner,
      playerAState,
      playerBState,
      reason: `${winnerState.pokemon.name} wins with the higher final score.`,
    })
  }

  const playerAIsVictini = isVictini(playerAState.pokemon)
  const playerBIsVictini = isVictini(playerBState.pokemon)

  if (playerAIsVictini !== playerBIsVictini) {
    const winnerSide = playerAIsVictini
      ? SIDES.PLAYER_A
      : SIDES.PLAYER_B

    return createWinResult({
      winnerSide,
      playerAState,
      playerBState,
      reason: 'Victini wins the tied battle with Victory Star.',
    })
  }

  if (roundNumber === 1) {
    return createTieResult({
      pointAwardedTo: SIDES.BOTH,
      reason: 'Round 1 tie gives both trainers 1 point.',
    })
  }

  if (playerAScore < playerBScore) {
    return createTieResult({
      pointAwardedTo: SIDES.PLAYER_A,
      reason: 'The tied round point goes to the currently trailing player.',
    })
  }

  if (playerBScore < playerAScore) {
    return createTieResult({
      pointAwardedTo: SIDES.PLAYER_B,
      reason: 'The tied round point goes to the currently trailing player.',
    })
  }

  return createTieResult({
    pointAwardedTo: SIDES.BOTH,
    reason: 'The trainers are level, so both receive the tied round point.',
  })
}
