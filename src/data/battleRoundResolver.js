import { calculateBasicBattlePair } from './battleScoreCalculator.js'
import { resolveFormChanges } from './formChangeResolver.js'
import { resolveCoreTraitConflicts } from './coreTraitConflictResolver.js'
import { resolveAdvancedTraitInteractions } from './advancedTraitInteractionResolver.js'
import {
  RESULT_TYPES,
  resolveNormalRoundWinner,
  resolveScoreWinner,
} from './winnerResolver.js'
import { resolveFinalOutcomeTraits } from './finalOutcomeTraitResolver.js'
import { resolveMasterRoundTie } from './masterPriorityEngine.js'
import { createFutureRoundEffects } from './battlefieldEffectsEngine.js'

const SIDES = {
  PLAYER_A: 'PLAYER_A',
  PLAYER_B: 'PLAYER_B',
}

// This resolver is pure. It does not save to Firestore, update UI, know room
// IDs, or manage battle flow. It only resolves one battle round.

const getOppositeSide = (side) =>
  side === SIDES.PLAYER_A ? SIDES.PLAYER_B : SIDES.PLAYER_A

const createWinnerResult = ({
  winnerSide,
  playerAState,
  playerBState,
  reason,
}) => {
  const playerAWon = winnerSide === SIDES.PLAYER_A

  return {
    resultType: playerAWon
      ? RESULT_TYPES.PLAYER_A_WIN
      : RESULT_TYPES.PLAYER_B_WIN,
    winnerSide,
    winnerPokemon: playerAWon
      ? playerAState.pokemon
      : playerBState.pokemon,
    loserPokemon: playerAWon
      ? playerBState.pokemon
      : playerAState.pokemon,
    pointAwardedTo: winnerSide,
    reason,
    logs: [reason],
  }
}

const resolveMasterRoundWinner = (playerAState, playerBState) => {
  const scoreWinner = resolveScoreWinner(playerAState, playerBState)

  if (scoreWinner !== RESULT_TYPES.TIE) {
    const winnerState =
      scoreWinner === SIDES.PLAYER_A ? playerAState : playerBState

    return createWinnerResult({
      winnerSide: scoreWinner,
      playerAState,
      playerBState,
      reason: `${winnerState.pokemon.name} wins the Master Round with the higher final score.`,
    })
  }

  const priorityResult = resolveMasterRoundTie(
    playerAState.pokemon,
    playerBState.pokemon,
  )

  if (priorityResult.resultType === RESULT_TYPES.TRUE_WARRIORS) {
    return {
      resultType: RESULT_TYPES.TRUE_WARRIORS,
      winnerSide: null,
      winnerPokemon: null,
      loserPokemon: null,
      pointAwardedTo: null,
      reason: priorityResult.reason,
      logs: [priorityResult.reason],
      pokemonAPriority: priorityResult.pokemonAPriority,
      pokemonBPriority: priorityResult.pokemonBPriority,
    }
  }

  const winnerSide =
    priorityResult.winner === playerAState.pokemon
      ? SIDES.PLAYER_A
      : SIDES.PLAYER_B

  return {
    ...createWinnerResult({
      winnerSide,
      playerAState,
      playerBState,
      reason: priorityResult.reason,
    }),
    pokemonAPriority: priorityResult.pokemonAPriority,
    pokemonBPriority: priorityResult.pokemonBPriority,
  }
}

const routeFutureEffects = ({
  winnerSide,
  winnerPokemon,
  loserPokemon,
}) => {
  const futureEffectsA = []
  const futureEffectsB = []
  const effects = createFutureRoundEffects({
    winnerPokemon,
    loserPokemon,
  })

  effects.forEach((effect) => {
    const sourceIsWinner =
      effect.sourcePokemon?.id === winnerPokemon?.id
    const sourceSide = sourceIsWinner
      ? winnerSide
      : getOppositeSide(winnerSide)
    const targetSide =
      effect.target === 'ALLY'
        ? sourceSide
        : getOppositeSide(sourceSide)

    if (targetSide === SIDES.PLAYER_A) {
      futureEffectsA.push(effect)
    } else {
      futureEffectsB.push(effect)
    }
  })

  return { futureEffectsA, futureEffectsB }
}

const combineLogs = (...logGroups) => {
  const seen = new Set()

  return logGroups.flat().filter((log) => {
    if (seen.has(log)) {
      return false
    }

    seen.add(log)
    return true
  })
}

export const resolveBattleRound = ({
  pokemonA,
  pokemonB,
  roundNumber,
  playerAScore = 0,
  playerBScore = 0,
  battlefieldEffectsA = [],
  battlefieldEffectsB = [],
  teamA = [],
  teamB = [],
  isMasterRound = false,
  randomFn = Math.random,
}) => {
  const basicPair = calculateBasicBattlePair({
    pokemonA,
    pokemonB,
    roundNumber,
    playerAScore,
    playerBScore,
    battlefieldEffectsA,
    battlefieldEffectsB,
    isMasterRound,
  })
  const formResult = resolveFormChanges({
    playerAState: basicPair.playerA,
    playerBState: basicPair.playerB,
    isMasterRound,
    playerAScore,
    playerBScore,
    randomFn,
  })
  const coreResult = resolveCoreTraitConflicts({
    playerAState: formResult.playerAState,
    playerBState: formResult.playerBState,
  })
  const advancedResult = resolveAdvancedTraitInteractions({
    playerAState: coreResult.playerAState,
    playerBState: coreResult.playerBState,
    teamA,
    teamB,
    isMasterRound,
    randomFn,
  })

  let playerAState = advancedResult.playerAState
  let playerBState = advancedResult.playerBState
  const rawScoreWinner = resolveScoreWinner(playerAState, playerBState)
  let winnerResult = isMasterRound
    ? resolveMasterRoundWinner(playerAState, playerBState)
    : resolveNormalRoundWinner({
        playerAState,
        playerBState,
        roundNumber,
        playerAScore,
        playerBScore,
      })
  let finalOutcomeLogs = []
  let finalOutcomeEffects = []

  if (!isMasterRound && rawScoreWinner !== RESULT_TYPES.TIE) {
    const finalOutcomeResult = resolveFinalOutcomeTraits({
      playerAState,
      playerBState,
      currentWinnerSide: rawScoreWinner,
      roundNumber,
      randomFn,
    })
    const timeWarpEffect = finalOutcomeResult.appliedEffects.find(
      (effect) => effect.trait === 'Time Warp' && effect.succeeded,
    )

    playerAState = finalOutcomeResult.playerAState
    playerBState = finalOutcomeResult.playerBState
    finalOutcomeLogs = finalOutcomeResult.logs
    finalOutcomeEffects = finalOutcomeResult.appliedEffects

    if (timeWarpEffect) {
      winnerResult = createWinnerResult({
        winnerSide: finalOutcomeResult.winnerSide,
        playerAState,
        playerBState,
        reason: 'Time Warp reversed the battle.',
      })
    } else {
      winnerResult = resolveNormalRoundWinner({
        playerAState,
        playerBState,
        roundNumber,
        playerAScore,
        playerBScore,
      })
    }
  }

  let futureEffectsA = []
  let futureEffectsB = []

  if (winnerResult.winnerSide) {
    const routedEffects = routeFutureEffects({
      winnerSide: winnerResult.winnerSide,
      winnerPokemon: winnerResult.winnerPokemon,
      loserPokemon: winnerResult.loserPokemon,
    })
    futureEffectsA = routedEffects.futureEffectsA
    futureEffectsB = routedEffects.futureEffectsB
  }

  return {
    playerAState,
    playerBState,
    winnerResult,
    futureEffectsA,
    futureEffectsB,
    logs: combineLogs(
      playerAState.logs,
      playerBState.logs,
      formResult.logs,
      coreResult.logs,
      advancedResult.logs,
      finalOutcomeLogs,
      winnerResult.logs,
    ),
    appliedEffects: [
      ...formResult.appliedEffects,
      ...coreResult.appliedEffects,
      ...advancedResult.appliedEffects,
      ...finalOutcomeEffects,
    ],
  }
}
