import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import BattleStage from '../components/BattleStage.jsx'
import RoomPresence from '../components/RoomPresence.jsx'
import SurrenderControl from '../components/SurrenderControl.jsx'
import { resolveBattleRound } from '../data/battleRoundResolver.js'
import { getJirachiCopyableTraits } from '../data/advancedTraitInteractionResolver.js'
import { allBattlePokemon } from '../data/pokemonBattleData.js'
import {
  getDisplayPokemonImage,
  getNormalPokemonImage,
  getPokemonName,
  getTransformationFormForPokemon,
} from '../data/transformationAssets.js'
import {
  getDraftPickLabel,
  getOrderedDraftPicks,
} from '../data/draftTeamStructure.js'
import { db } from '../firebase.js'
import {
  assignCelebiWish,
  continueBattleRound,
  dismissCelebiWish,
  initializeMasterRoundOptions,
  lockBattlePokemon,
  lockMasterRoundPokemon,
  requestPlayAgain,
  resolveAndSaveMasterRound,
  returnHomeAfterMatch,
  saveJirachiCopy,
  saveBattleRoundResult,
} from '../services/roomService.js'

const ROUND_WINS_NEEDED = 4
const EMPTY_BATTLEFIELD_EFFECTS = []
const REVEALED_BATTLE_PHASES = new Set([
  'reveal',
  'score_breakdown',
  'round_result',
])
const FINALIZED_ROUND_PHASES = new Set([
  'round_result',
  'master_round_pending',
  'match_over',
])

const BATTLE_PHASE_LABELS = {
  choose_pokemon: 'Choose Pokemon',
  round_result: 'Round Result',
  master_round_pending: 'Master Round Pending',
  match_over: 'Match Over',
}

function getTransformationEvents({
  appliedEffects = [],
  logs = [],
  playerAPokemon,
  playerBPokemon,
}) {
  const events = []
  const eventKeys = new Set()
  const battlePokemon = [playerAPokemon, playerBPokemon]

  const addEvent = (event) => {
    const key = `${event.type}:${event.pokemonName.toLowerCase()}`

    if (!eventKeys.has(key)) {
      eventKeys.add(key)
      events.push(event)
    }
  }

  appliedEffects.forEach((effect) => {
    const source = String(effect?.source ?? '')
    const trait = String(effect?.trait ?? '')
    const transformedForm = String(effect?.transformedForm ?? '')
    const isMegaEvolution =
      source.toLowerCase().includes('mega evolution') ||
      trait.toLowerCase().includes('mega evolution')
    const isBattleBond =
      source.toLowerCase().includes('ash greninja') ||
      source.toLowerCase().includes('battle bond') ||
      trait.toLowerCase().includes('ash greninja') ||
      trait.toLowerCase().includes('battle bond') ||
      transformedForm.toLowerCase() === 'ash greninja'

    if (!isMegaEvolution && !isBattleBond) {
      return
    }

    const pokemon =
      effect.pokemon ??
      effect.sourcePokemon ??
      (effect.side === 'PLAYER_A'
        ? playerAPokemon
        : playerBPokemon)

    addEvent({
      type: isMegaEvolution ? 'mega' : 'battle-bond',
      pokemon,
      pokemonName: getPokemonName(pokemon),
      image: getNormalPokemonImage(pokemon),
      succeeded: Boolean(effect.applied),
      transformedForm:
        effect.transformedForm ??
        (effect.applied
          ? getTransformationFormForPokemon(pokemon)
          : null),
    })
  })

  logs.forEach((log) => {
    const megaSuccessMatch = log.match(/^(.+?) Mega Evolved\.?$/i)
    const megaFailureMatch = log.match(
      /^(.+?) failed to Mega Evolve\.?$/i,
    )
    const battleBondSuccessMatch = log.match(
      /^(.+?) transformed into Ash Greninja\.?$/i,
    )
    const battleBondFailureMatch = log.match(
      /^(.+?) failed to become Ash Greninja\.?$/i,
    )
    const match =
      megaSuccessMatch ??
      megaFailureMatch ??
      battleBondSuccessMatch ??
      battleBondFailureMatch

    if (!match) {
      return
    }

    const pokemonName = match[1]
    const pokemon = battlePokemon.find(
      (candidate) =>
        getPokemonName(candidate).toLowerCase() ===
        pokemonName.toLowerCase(),
    )

    addEvent({
      type:
        megaSuccessMatch || megaFailureMatch
          ? 'mega'
          : 'battle-bond',
      pokemon,
      pokemonName,
      image: getNormalPokemonImage(pokemon),
      succeeded: Boolean(
        megaSuccessMatch || battleBondSuccessMatch,
      ),
      transformedForm:
        megaSuccessMatch || battleBondSuccessMatch
          ? getTransformationFormForPokemon(pokemon)
          : null,
    })
  })

  return events
}

function findSelectedPokemon(selection, team = []) {
  if (!selection) {
    return null
  }

  const matchesSelection = (pokemon) =>
    String(pokemon.id) === String(selection.pokemonId) ||
    pokemon.name === selection.pokemonName

  return team.find(matchesSelection) ?? allBattlePokemon.find(matchesSelection)
}

function createSeededRandom(seedValue) {
  let seed = 2166136261

  for (let index = 0; index < seedValue.length; index += 1) {
    seed ^= seedValue.charCodeAt(index)
    seed = Math.imul(seed, 16777619)
  }

  return () => {
    seed += 0x6d2b79f5
    let value = seed
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function RoundScoreRow({ label, score }) {
  return (
    <div className="round-score-row">
      <span>{label}</span>
      <div
        className="round-score-dots"
        aria-label={`${label}: ${score} of ${ROUND_WINS_NEEDED} rounds won`}
      >
        {Array.from({ length: ROUND_WINS_NEEDED }, (_, index) => (
          <span
            className={index < score ? 'is-won' : ''}
            key={`${label}-round-${index + 1}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

function BattleArena({
  currentUser,
  onRoomLeft,
  onManualNavigation,
}) {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [battleState, setBattleState] = useState(null)
  const [draftTeam, setDraftTeam] = useState(null)
  const [roomLoading, setRoomLoading] = useState(true)
  const [battleLoading, setBattleLoading] = useState(true)
  const [teamLoading, setTeamLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedPokemonId, setSelectedPokemonId] = useState(null)
  const [isLockingFighter, setIsLockingFighter] = useState(false)
  const [lockErrorMessage, setLockErrorMessage] = useState('')
  const [roundSaveError, setRoundSaveError] = useState('')
  const [isContinuingRound, setIsContinuingRound] = useState(false)
  const [continueErrorMessage, setContinueErrorMessage] = useState('')
  const [isLockingMasterRound, setIsLockingMasterRound] =
    useState(false)
  const [masterRoundError, setMasterRoundError] = useState('')
  const [isSavingJirachiCopy, setIsSavingJirachiCopy] = useState(false)
  const [jirachiCopyError, setJirachiCopyError] = useState('')
  const [isSavingCelebiWish, setIsSavingCelebiWish] = useState(false)
  const [celebiWishError, setCelebiWishError] = useState('')
  const [postMatchAction, setPostMatchAction] = useState('')
  const [postMatchError, setPostMatchError] = useState('')
  const [countdownValue, setCountdownValue] = useState(null)
  const [countdownCompletedRound, setCountdownCompletedRound] =
    useState(null)
  const [transformationCinematicIndex, setTransformationCinematicIndex] =
    useState(null)
  const [
    transformationCinematicCompletedRound,
    setTransformationCinematicCompletedRound,
  ] = useState(null)
  const masterRoundInitializationRef = useRef(false)
  const masterRoundResolutionRef = useRef(false)

  useEffect(() => {
    return onSnapshot(
      doc(db, 'rooms', displayRoomCode),
      (snapshot) => {
        if (!snapshot.exists()) {
          setRoom(null)
          setErrorMessage('Room not found')
        } else {
          setRoom(snapshot.data())
          setErrorMessage('')
        }

        setRoomLoading(false)
      },
      () => {
        setErrorMessage('Could not load the battle room.')
        setRoomLoading(false)
      },
    )
  }, [displayRoomCode])

  useEffect(() => {
    if (room?.status === 'draft') {
      navigate(`/draft/${displayRoomCode}`, { replace: true })
    }
  }, [displayRoomCode, navigate, room?.status])

  useEffect(() => {
    return onSnapshot(
      doc(db, 'rooms', displayRoomCode, 'battle', 'state'),
      (snapshot) => {
        setBattleState(snapshot.exists() ? snapshot.data() : null)
        setBattleLoading(false)
      },
      () => {
        setErrorMessage('Could not load the battle state.')
        setBattleLoading(false)
      },
    )
  }, [displayRoomCode])

  useEffect(() => {
    if (!currentUser?.uid) {
      return undefined
    }

    return onSnapshot(
      doc(
        db,
        'rooms',
        displayRoomCode,
        'draftTeams',
        currentUser.uid,
      ),
      (snapshot) => {
        setDraftTeam(snapshot.exists() ? snapshot.data() : null)
        setTeamLoading(false)
      },
      () => {
        setErrorMessage('Could not load your private team.')
        setTeamLoading(false)
      },
    )
  }, [currentUser?.uid, displayRoomCode])

  const isLoading = roomLoading || battleLoading || teamLoading
  const isRoomPlayer = Boolean(room?.players?.[currentUser?.uid])
  const isHost = room?.hostUid === currentUser?.uid
  const opponentUid = isHost ? room?.guestUid : room?.hostUid
  const currentRound = battleState?.currentRound ?? battleState?.round ?? 1
  const hostScore =
    battleState?.playerScores?.[room?.hostUid] ??
    battleState?.hostScore ??
    0
  const guestScore =
    battleState?.playerScores?.[room?.guestUid] ??
    battleState?.guestScore ??
    0
  const yourScore = isHost ? hostScore : guestScore
  const opponentScore = isHost ? guestScore : hostScore
  const orderedDraftPicks = useMemo(
    () => getOrderedDraftPicks(draftTeam?.picks),
    [draftTeam?.picks],
  )
  const hasJirachi = orderedDraftPicks.some(
    (pokemon) => pokemon.name === 'Jirachi',
  )
  const jirachiCopyOptions = useMemo(
    () => getJirachiCopyableTraits(orderedDraftPicks),
    [orderedDraftPicks],
  )
  const jirachiCopy =
    battleState?.jirachiCopies?.[currentUser?.uid] ?? null
  const pendingCelebiWish = battleState?.pendingCelebiWish ?? null
  const celebiBlessedPokemonIds = useMemo(
    () =>
      new Set(
        (
          battleState?.celebiWishes?.[currentUser?.uid] ?? []
        ).map((wish) => String(wish.targetPokemonId)),
      ),
    [battleState?.celebiWishes, currentUser?.uid],
  )
  const currentPlayerSelection =
    battleState?.selections?.[currentUser?.uid] ?? null
  const opponentHasLocked = Boolean(
    opponentUid && battleState?.selections?.[opponentUid],
  )
  const currentPlayerHasLocked = Boolean(currentPlayerSelection)
  const bothPlayersLocked = currentPlayerHasLocked && opponentHasLocked
  const hostSelection = bothPlayersLocked
    ? battleState.selections[room.hostUid]
    : null
  const guestSelection = bothPlayersLocked
    ? battleState.selections[room.guestUid]
    : null
  const activeSelectedPokemonId =
    currentPlayerSelection?.pokemonId ?? selectedPokemonId
  const legacyUsedPokemon = isHost
    ? battleState?.hostUsedPokemon
    : battleState?.guestUsedPokemon
  const usedPokemonIds = useMemo(() => {
    const usedPokemon =
      battleState?.usedPokemon?.[currentUser?.uid] ??
      legacyUsedPokemon ??
      []

    return new Set(
      usedPokemon.map((entry) =>
        String(
          typeof entry === 'object'
            ? entry?.id ?? entry?.pokemonId
            : entry,
        ),
      ),
    )
  }, [
    battleState?.usedPokemon,
    currentUser?.uid,
    legacyUsedPokemon,
  ])
  const selectedPokemon = orderedDraftPicks.find(
    (pokemon) => String(pokemon.id) === String(activeSelectedPokemonId),
  )
  const selectedPokemonIsUsed = selectedPokemon
    ? usedPokemonIds.has(String(selectedPokemon.id))
    : false
  const validCelebiWishTargets = orderedDraftPicks.filter(
    (pokemon) =>
      pokemon.name !== 'Celebi' &&
      !usedPokemonIds.has(String(pokemon.id)) &&
      String(pokemon.id) !== String(activeSelectedPokemonId) &&
      !celebiBlessedPokemonIds.has(String(pokemon.id)),
  )
  const selectionIsOpen =
    (battleState?.phase ?? 'choose_pokemon') === 'choose_pokemon'
  const battlePhase = battleState?.phase ?? 'choose_pokemon'
  const battlePhaseLabel =
    BATTLE_PHASE_LABELS[battlePhase] ?? 'Choose Pokemon'
  const masterRoundOptions =
    battleState?.masterRound?.hiddenOptions?.[currentUser?.uid] ?? []
  const masterRoundSelection =
    battleState?.masterRound?.selections?.[currentUser?.uid] ?? null
  const opponentMasterRoundSelection =
    battleState?.masterRound?.selections?.[opponentUid] ?? null
  const bothMasterRoundPlayersSelected = Boolean(
    masterRoundSelection && opponentMasterRoundSelection,
  )
  const masterRoundResult = battleState?.masterRound?.result ?? null
  const postMatch = battleState?.postMatch ?? {
    playAgainRequests: {},
    returnedHome: {},
    status: 'idle',
  }
  const opponentReturnedHome = Boolean(
    !battleState?.surrender &&
      opponentUid &&
      (postMatch.returnedHome?.[opponentUid] ||
        room?.players?.[opponentUid]?.active === false),
  )
  const currentPlayerRequestedPlayAgain = Boolean(
    postMatch.playAgainRequests?.[currentUser?.uid],
  )
  const isSurrenderMatch = Boolean(battleState?.surrender)
  const opponentSurrendered =
    battleState?.surrender?.surrenderedBy === opponentUid
  const isMasterRoundPending =
    !masterRoundResult &&
    (battlePhase === 'master_round_pending' ||
      battleState?.masterRound?.phase === 'choose_master_pokeball')
  const hostBattlefieldEffects =
    battleState?.battlefieldEffects?.[room?.hostUid] ??
    EMPTY_BATTLEFIELD_EFFECTS
  const guestBattlefieldEffects =
    battleState?.battlefieldEffects?.[room?.guestUid] ??
    EMPTY_BATTLEFIELD_EFFECTS
  const hostPokemon = bothPlayersLocked
    ? findSelectedPokemon(
        hostSelection,
        isHost ? orderedDraftPicks : [],
      )
    : null
  const guestPokemon = bothPlayersLocked
    ? findSelectedPokemon(
        guestSelection,
        isHost ? [] : orderedDraftPicks,
      )
    : null
  const canonicalBattleResult = useMemo(() => {
    if (!bothPlayersLocked || !hostPokemon || !guestPokemon) {
      return null
    }

    return resolveBattleRound({
      pokemonA: hostPokemon,
      pokemonB: guestPokemon,
      roundNumber: currentRound,
      playerAScore: hostScore,
      playerBScore: guestScore,
      battlefieldEffectsA: hostBattlefieldEffects,
      battlefieldEffectsB: guestBattlefieldEffects,
      teamA: [],
      teamB: [],
      jirachiCopyA:
        battleState?.jirachiCopies?.[room?.hostUid] ?? null,
      jirachiCopyB:
        battleState?.jirachiCopies?.[room?.guestUid] ?? null,
      celebiWishA:
        (
          battleState?.celebiWishes?.[room?.hostUid] ?? []
        ).find(
          (wish) =>
            !wish.consumed &&
            String(wish.targetPokemonId) ===
              String(hostSelection.pokemonId),
        ) ?? null,
      celebiWishB:
        (
          battleState?.celebiWishes?.[room?.guestUid] ?? []
        ).find(
          (wish) =>
            !wish.consumed &&
            String(wish.targetPokemonId) ===
              String(guestSelection.pokemonId),
        ) ?? null,
      isMasterRound: false,
      randomFn: createSeededRandom(
        `${displayRoomCode}:${currentRound}:${hostSelection.pokemonId}:${guestSelection.pokemonId}`,
      ),
    })
  }, [
    battleState?.jirachiCopies,
    battleState?.celebiWishes,
    bothPlayersLocked,
    currentRound,
    displayRoomCode,
    guestBattlefieldEffects,
    guestPokemon,
    guestSelection,
    hostBattlefieldEffects,
    hostPokemon,
    hostSelection,
    hostScore,
    guestScore,
    room?.guestUid,
    room?.hostUid,
  ])
  const savedRoundResult = battleState?.roundResults?.find(
    (result) => result.roundNumber === currentRound,
  )
  const currentPlayerContinued = Boolean(
    battleState?.roundContinue?.[currentUser?.uid],
  )
  const savedPlayerAPokemonId =
    savedRoundResult?.playerAPokemon?.pokemonId ??
    savedRoundResult?.playerAPokemon?.id
  const savedPlayerBPokemonId =
    savedRoundResult?.playerBPokemon?.pokemonId ??
    savedRoundResult?.playerBPokemon?.id
  const savedRoundUsageComplete = Boolean(
    savedRoundResult &&
      (battleState?.usedPokemon?.[room?.hostUid] ?? []).some(
        (entry) =>
          String(
            typeof entry === 'object'
              ? entry?.id ?? entry?.pokemonId
              : entry,
          ) === String(savedPlayerAPokemonId),
      ) &&
      (battleState?.usedPokemon?.[room?.guestUid] ?? []).some(
        (entry) =>
          String(
            typeof entry === 'object'
              ? entry?.id ?? entry?.pokemonId
              : entry,
          ) === String(savedPlayerBPokemonId),
      ),
  )
  const expectedSavedPhase =
    hostScore >= 4 || guestScore >= 4
      ? 'match_over'
      : hostScore === 3 && guestScore === 3
        ? 'master_round_pending'
        : 'round_result'
  const savedRoundStateFinalized =
    Boolean(masterRoundResult && battlePhase === 'match_over') ||
    (savedRoundUsageComplete &&
      FINALIZED_ROUND_PHASES.has(battlePhase) &&
      battlePhase === expectedSavedPhase)
  const previewPlayerAState = canonicalBattleResult?.playerAState
  const previewPlayerBState = canonicalBattleResult?.playerBState
  const currentUserIsPlayerA = room?.hostUid === currentUser?.uid
  const revealedYourPokemon = savedRoundResult
    ? currentUserIsPlayerA
      ? savedRoundResult.playerAPokemon
      : savedRoundResult.playerBPokemon
    : currentUserIsPlayerA
      ? previewPlayerAState?.pokemon
      : previewPlayerBState?.pokemon
  const revealedOpponentPokemon = savedRoundResult
    ? currentUserIsPlayerA
      ? savedRoundResult.playerBPokemon
      : savedRoundResult.playerAPokemon
    : currentUserIsPlayerA
      ? previewPlayerBState?.pokemon
      : previewPlayerAState?.pokemon
  const revealedYourScore = savedRoundResult
    ? currentUserIsPlayerA
      ? savedRoundResult.playerAFinalScore
      : savedRoundResult.playerBFinalScore
    : currentUserIsPlayerA
      ? previewPlayerAState?.finalScore
      : previewPlayerBState?.finalScore
  const revealedOpponentScore = savedRoundResult
    ? currentUserIsPlayerA
      ? savedRoundResult.playerBFinalScore
      : savedRoundResult.playerAFinalScore
    : currentUserIsPlayerA
      ? previewPlayerBState?.finalScore
      : previewPlayerAState?.finalScore
  const revealReason =
    savedRoundResult?.reason ?? canonicalBattleResult?.winnerResult.reason
  const revealLogs = useMemo(
    () => savedRoundResult?.logs ?? canonicalBattleResult?.logs ?? [],
    [canonicalBattleResult?.logs, savedRoundResult?.logs],
  )
  const hasRevealData = Boolean(
    revealedYourPokemon &&
      revealedOpponentPokemon &&
      revealReason,
  )
  const transformationEvents = useMemo(
    () =>
      getTransformationEvents({
        appliedEffects: canonicalBattleResult?.appliedEffects,
        logs: revealLogs,
        playerAPokemon:
          savedRoundResult?.playerAPokemon ??
          canonicalBattleResult?.playerAState?.pokemon,
        playerBPokemon:
          savedRoundResult?.playerBPokemon ??
          canonicalBattleResult?.playerBState?.pokemon,
      }),
    [
      canonicalBattleResult,
      revealLogs,
      savedRoundResult?.playerAPokemon,
      savedRoundResult?.playerBPokemon,
    ],
  )
  const battleStageReady = Boolean(
    bothPlayersLocked &&
      savedRoundResult &&
      hasRevealData &&
      !isMasterRoundPending &&
      !masterRoundResult &&
      battlePhase !== 'match_over',
  )
  const isBattleCountdownActive =
    battleStageReady && countdownValue !== null
  const transformationCinematicRequired =
    transformationEvents.length > 0
  const successfulTransformationByPokemon = useMemo(() => {
    const transformations = new Map()

    transformationEvents.forEach((event) => {
      if (!event.succeeded || !event.transformedForm) {
        return
      }

      const pokemonId =
        event.pokemon?.id ?? event.pokemon?.pokemonId
      const key = pokemonId
        ? `id:${pokemonId}`
        : `name:${event.pokemonName.toLowerCase()}`

      transformations.set(key, event)
    })

    return transformations
  }, [transformationEvents])
  const getSuccessfulTransformation = (pokemon) => {
    const pokemonId = pokemon?.id ?? pokemon?.pokemonId
    const key = pokemonId
      ? `id:${pokemonId}`
      : `name:${getPokemonName(pokemon).toLowerCase()}`

    return successfulTransformationByPokemon.get(key) ?? null
  }
  const yourTransformation =
    getSuccessfulTransformation(revealedYourPokemon)
  const opponentTransformation =
    getSuccessfulTransformation(revealedOpponentPokemon)
  const transformationCinematicCompleted =
    !transformationCinematicRequired ||
    transformationCinematicCompletedRound === currentRound
  const activeTransformationEvent =
    transformationCinematicIndex === null
      ? null
      : transformationEvents[transformationCinematicIndex] ?? null
  const isTransformationCinematicActive = Boolean(
    battleStageReady &&
      countdownCompletedRound === currentRound &&
      !transformationCinematicCompleted &&
      activeTransformationEvent,
  )
  const showBattleStage =
    battleStageReady &&
    countdownCompletedRound === currentRound &&
    !isBattleCountdownActive &&
    transformationCinematicCompleted &&
    !isTransformationCinematicActive
  const yourMasterPokemon = currentUserIsPlayerA
    ? masterRoundResult?.playerAPokemon
    : masterRoundResult?.playerBPokemon
  const opponentMasterPokemon = currentUserIsPlayerA
    ? masterRoundResult?.playerBPokemon
    : masterRoundResult?.playerAPokemon
  const yourMasterFinalScore = currentUserIsPlayerA
    ? masterRoundResult?.playerAFinalScore
    : masterRoundResult?.playerBFinalScore
  const opponentMasterFinalScore = currentUserIsPlayerA
    ? masterRoundResult?.playerBFinalScore
    : masterRoundResult?.playerAFinalScore

  useEffect(() => {
    if (
      !battleStageReady ||
      countdownCompletedRound === currentRound
    ) {
      return undefined
    }

    const timers = [
      window.setTimeout(() => setCountdownValue('3'), 0),
      window.setTimeout(() => setCountdownValue('2'), 700),
      window.setTimeout(() => setCountdownValue('1'), 1400),
      window.setTimeout(() => setCountdownValue('GO!'), 2100),
      window.setTimeout(() => {
        setCountdownCompletedRound(currentRound)
        setCountdownValue(null)
      }, 2700),
    ]

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [battleStageReady, countdownCompletedRound, currentRound])

  useEffect(() => {
    if (
      !battleStageReady ||
      countdownCompletedRound !== currentRound ||
      !transformationCinematicRequired ||
      transformationCinematicCompletedRound === currentRound
    ) {
      return undefined
    }

    const timers = transformationEvents.map((_, index) =>
      window.setTimeout(
        () => setTransformationCinematicIndex(index),
        index * 2100,
      ),
    )

    timers.push(
      window.setTimeout(() => {
        setTransformationCinematicCompletedRound(currentRound)
        setTransformationCinematicIndex(null)
      }, transformationEvents.length * 2100),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    battleStageReady,
    countdownCompletedRound,
    currentRound,
    transformationCinematicCompletedRound,
    transformationCinematicRequired,
    transformationEvents,
  ])

  useEffect(() => {
    if (
      !bothPlayersLocked ||
      !canonicalBattleResult ||
      savedRoundStateFinalized ||
      !room?.hostUid ||
      !room?.guestUid
    ) {
      return undefined
    }

    let isActive = true

    saveBattleRoundResult({
      roomId: displayRoomCode,
      battleResult: canonicalBattleResult,
      currentRound,
      playerAUid: room.hostUid,
      playerBUid: room.guestUid,
    }).catch((error) => {
      if (isActive) {
        setRoundSaveError(
          error instanceof Error
            ? error.message
            : 'Could not save the round result.',
        )
      }
    })

    return () => {
      isActive = false
    }
  }, [
    bothPlayersLocked,
    canonicalBattleResult,
    currentRound,
    displayRoomCode,
    room?.guestUid,
    room?.hostUid,
    savedRoundStateFinalized,
  ])

  useEffect(() => {
    const options = battleState?.masterRound?.options
    const hasBothPlayersOptions = Boolean(
      room?.hostUid &&
        room?.guestUid &&
        options?.[room.hostUid] &&
        options?.[room.guestUid],
    )

    if (
      battlePhase !== 'master_round_pending' ||
      hasBothPlayersOptions ||
      masterRoundInitializationRef.current ||
      !room?.hostUid ||
      !room?.guestUid
    ) {
      return undefined
    }

    let isActive = true
    masterRoundInitializationRef.current = true

    initializeMasterRoundOptions(displayRoomCode)
      .then(() => {
        if (isActive) {
          setMasterRoundError('')
        }
      })
      .catch((error) => {
        if (isActive) {
          setMasterRoundError(
            error instanceof Error
              ? error.message
              : 'Could not prepare Master Round options.',
          )
        }
      })
      .finally(() => {
        masterRoundInitializationRef.current = false
      })

    return () => {
      isActive = false
    }
  }, [
    battlePhase,
    battleState?.jirachiCopies,
    battleState?.masterRound?.options,
    displayRoomCode,
    room?.guestUid,
    room?.hostUid,
  ])

  useEffect(() => {
    if (
      battlePhase !== 'master_round_pending' ||
      !bothMasterRoundPlayersSelected ||
      masterRoundResult ||
      masterRoundResolutionRef.current ||
      !room?.hostUid ||
      !room?.guestUid
    ) {
      return undefined
    }

    let isActive = true
    masterRoundResolutionRef.current = true

    resolveAndSaveMasterRound(displayRoomCode)
      .then(() => {
        if (isActive) {
          setMasterRoundError('')
        }
      })
      .catch((error) => {
        if (isActive) {
          setMasterRoundError(
            error instanceof Error
              ? error.message
              : 'Could not resolve the Master Round.',
          )
        }
      })
      .finally(() => {
        masterRoundResolutionRef.current = false
      })

    return () => {
      isActive = false
    }
  }, [
    battlePhase,
    bothMasterRoundPlayersSelected,
    displayRoomCode,
    masterRoundResult,
    room?.guestUid,
    room?.hostUid,
  ])

  async function handleLockFighter() {
    if (
      !selectedPokemon ||
      selectedPokemonIsUsed ||
      currentPlayerHasLocked ||
      isLockingFighter
    ) {
      return
    }

    setIsLockingFighter(true)
    setLockErrorMessage('')

    try {
      await lockBattlePokemon(
        displayRoomCode,
        currentUser.uid,
        selectedPokemon,
      )
    } catch (error) {
      setLockErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not lock this fighter.',
      )
    } finally {
      setIsLockingFighter(false)
    }
  }

  async function handleContinueRound() {
    if (
      !savedRoundResult ||
      currentRound >= 6 ||
      currentPlayerContinued ||
      battlePhase !== 'round_result' ||
      pendingCelebiWish ||
      isContinuingRound
    ) {
      return
    }

    setIsContinuingRound(true)
    setContinueErrorMessage('')

    try {
      await continueBattleRound({
        roomId: displayRoomCode,
        playerUid: currentUser.uid,
        expectedRound: currentRound,
      })
    } catch (error) {
      setContinueErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not continue to the next round.',
      )
    } finally {
      setIsContinuingRound(false)
    }
  }

  async function handleAssignCelebiWish(pokemon) {
    if (!pokemon || isSavingCelebiWish) {
      return
    }

    setIsSavingCelebiWish(true)
    setCelebiWishError('')

    try {
      await assignCelebiWish({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
        targetPokemonId: pokemon.id,
      })
    } catch (error) {
      setCelebiWishError(
        error instanceof Error
          ? error.message
          : 'Could not assign Celebi Future Wish.',
      )
    } finally {
      setIsSavingCelebiWish(false)
    }
  }

  async function handleDismissCelebiWish() {
    if (isSavingCelebiWish) {
      return
    }

    setIsSavingCelebiWish(true)
    setCelebiWishError('')

    try {
      await dismissCelebiWish({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
    } catch (error) {
      setCelebiWishError(
        error instanceof Error
          ? error.message
          : 'Could not clear Celebi Future Wish.',
      )
    } finally {
      setIsSavingCelebiWish(false)
    }
  }

  async function handleMasterRoundSelection(option) {
    if (
      masterRoundSelection ||
      isLockingMasterRound ||
      !option?.pokemonId
    ) {
      return
    }

    setIsLockingMasterRound(true)
    setMasterRoundError('')

    try {
      await lockMasterRoundPokemon({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
        pokemonId: option.pokemonId,
      })
    } catch (error) {
      setMasterRoundError(
        error instanceof Error
          ? error.message
          : 'Could not lock the Master Round Pokemon.',
      )
    } finally {
      setIsLockingMasterRound(false)
    }
  }

  async function handleJirachiCopy(option) {
    if (jirachiCopy || isSavingJirachiCopy || !option) {
      return
    }

    setIsSavingJirachiCopy(true)
    setJirachiCopyError('')

    try {
      await saveJirachiCopy({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
        sourcePokemonId: option.sourcePokemon.id,
        traitName: option.traitName,
      })
    } catch (error) {
      setJirachiCopyError(
        error instanceof Error
          ? error.message
          : 'Could not save Jirachi copy selection.',
      )
    } finally {
      setIsSavingJirachiCopy(false)
    }
  }

  async function handlePlayAgain() {
    if (
      postMatchAction ||
      currentPlayerRequestedPlayAgain ||
      opponentReturnedHome
    ) {
      return
    }

    onManualNavigation?.()
    setPostMatchAction('play-again')
    setPostMatchError('')

    try {
      await requestPlayAgain({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
    } catch (error) {
      setPostMatchError(
        error instanceof Error
          ? error.message
          : 'Could not request another game.',
      )
    } finally {
      setPostMatchAction('')
    }
  }

  async function handleReturnHome() {
    if (postMatchAction) {
      return
    }

    onManualNavigation?.()
    setPostMatchAction('return-home')
    setPostMatchError('')

    try {
      await returnHomeAfterMatch({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
      onRoomLeft?.()
      navigate('/', {
        replace: true,
        state: { skipRoomResume: true },
      })
    } catch (error) {
      setPostMatchError(
        error instanceof Error
          ? error.message
          : 'Could not leave the room.',
      )
      setPostMatchAction('')
    }
  }

  const opponentPokemon =
    battleState &&
    REVEALED_BATTLE_PHASES.has(battleState.phase)
      ? isHost
        ? battleState.guestSubmittedPokemon
        : battleState.hostSubmittedPokemon
      : null
  const previewPokemonA = orderedDraftPicks[0]
  const previewPokemonB = opponentPokemon ?? orderedDraftPicks[1]
  useMemo(() => {
    if (!import.meta.env.DEV || !previewPokemonA || !previewPokemonB) {
      return null
    }

    return resolveBattleRound({
      pokemonA: previewPokemonA,
      pokemonB: previewPokemonB,
      roundNumber: battleState?.round || 1,
      playerAScore: yourScore,
      playerBScore: opponentScore,
      teamA: orderedDraftPicks,
      teamB: opponentPokemon ? [opponentPokemon] : orderedDraftPicks,
      isMasterRound: false,
    })
  }, [
    battleState?.round,
    opponentPokemon,
    opponentScore,
    orderedDraftPicks,
    previewPokemonA,
    previewPokemonB,
    yourScore,
  ])

  return (
    <main className="page-shell draft-page-shell battle-arena-page">
      <section className="draft-container battle-arena-container">
        <header className="draft-header battle-arena-header">
          <div>
            <p className="eyebrow">Trainer Showdown</p>
            <h1>&#9876; Battle Arena</h1>
            <p className="draft-coming-soon">
              Round {currentRound} Begins &mdash; Choose Your
              Pok&eacute;mon
            </p>
          </div>

          <div className="draft-room-code">
            <span>Room Code</span>
            <strong>{displayRoomCode}</strong>
          </div>
        </header>

        {isLoading && (
          <div className="draft-state-panel">Loading battle state...</div>
        )}

        {!isLoading && errorMessage && (
          <div className="draft-state-panel draft-state-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!isLoading && room && !isRoomPlayer && (
          <div className="draft-state-panel draft-state-error" role="alert">
            You are not a player in this room.
          </div>
        )}

        {!isLoading &&
          room &&
          isRoomPlayer &&
          room.status !== 'battle_setup' && (
            <div className="draft-state-panel draft-state-error" role="alert">
              This battle is not ready yet.
            </div>
          )}

        {!isLoading &&
          room?.status === 'battle_setup' &&
          isRoomPlayer &&
          !battleState && (
            <div className="draft-state-panel draft-state-error" role="alert">
              Battle state is not initialized.
            </div>
          )}

        {!isLoading && battleState && isRoomPlayer && (
          <>
            <section className="draft-state-panel battle-state-panel">
              <div className="draft-round-heading">
                <div>
                  <span>Round</span>
                  <strong>
                    {currentRound} / {battleState.maxNormalRounds}
                  </strong>
                </div>
                <div>
                  <span>Trainer Score</span>
                  <strong>
                    {yourScore} - {opponentScore}
                  </strong>
                </div>
                <div>
                  <span>Battle Phase</span>
                  <strong>{battlePhaseLabel}</strong>
                </div>
              </div>

              <div className="round-score">
                <h2>&#9876; Round Score</h2>
                <RoundScoreRow label="You" score={yourScore} />
                <RoundScoreRow label="Opponent" score={opponentScore} />
              </div>
            </section>

            {hasJirachi && (
              <section className="draft-state-panel jirachi-copy-panel">
                <p className="eyebrow">Jirachi Wish Maker</p>
                <h2>Choose one teammate trait for Jirachi to copy.</h2>

                {jirachiCopy ? (
                  <p>
                    Wish Maker locked: <strong>{jirachiCopy.traitName}</strong>{' '}
                    from {jirachiCopy.sourcePokemonName}.
                  </p>
                ) : jirachiCopyOptions.length > 0 ? (
                  <div className="jirachi-copy-options">
                    {jirachiCopyOptions.map((option) => (
                      <button
                        className="game-button"
                        type="button"
                        key={`${option.sourcePokemon.id}-${option.traitName}`}
                        disabled={isSavingJirachiCopy}
                        onClick={() => handleJirachiCopy(option)}
                      >
                        {option.sourcePokemonName}: {option.traitName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No teammate traits are available for Wish Maker.</p>
                )}

                {jirachiCopyError && (
                  <p className="battle-lock-error" role="alert">
                    {jirachiCopyError}
                  </p>
                )}
              </section>
            )}

            {pendingCelebiWish?.playerUid === currentUser.uid && (
              <section className="draft-state-panel celebi-wish-panel">
                <p className="eyebrow">Celebi Future Wish</p>
                <h2>
                  Celebi won this round. Choose one unused teammate to
                  receive +10.
                </h2>

                {validCelebiWishTargets.length > 0 ? (
                  <div className="celebi-wish-options">
                    {validCelebiWishTargets.map((pokemon) => (
                      <button
                        className="game-button"
                        type="button"
                        key={pokemon.id}
                        disabled={isSavingCelebiWish}
                        onClick={() =>
                          handleAssignCelebiWish(pokemon)
                        }
                      >
                        {pokemon.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <p>No valid Pok&eacute;mon remain for Celebi&apos;s wish.</p>
                    <button
                      className="game-button"
                      type="button"
                      disabled={isSavingCelebiWish}
                      onClick={handleDismissCelebiWish}
                    >
                      Dismiss Future Wish
                    </button>
                  </>
                )}

                {celebiWishError && (
                  <p className="battle-lock-error" role="alert">
                    {celebiWishError}
                  </p>
                )}
              </section>
            )}

            {battlePhase === 'match_over' && (
              <section className="draft-state-panel match-status-panel">
                <p className="eyebrow">Match Over</p>
                <h2>
                  {opponentSurrendered
                    ? 'Opponent surrendered. You won the match.'
                    : battleState.matchWinnerUid === currentUser.uid
                      ? 'You won the match!'
                    : battleState.matchWinnerUid
                      ? 'You lost the match.'
                      : masterRoundResult?.resultType ===
                          'TRUE_WARRIORS'
                        ? 'True Warriors — the match ends in legendary honor.'
                        : 'The match ended without a winner.'}
                </h2>
                <p>
                  <strong>Final Score:</strong> {yourScore} -{' '}
                  {opponentScore}
                </p>
                <p>
                  <strong>Reason:</strong>{' '}
                  {battleState.matchOverReason}
                </p>

                <div className="post-match-actions">
                  {opponentReturnedHome ? (
                    <p>Opponent left the room.</p>
                  ) : currentPlayerRequestedPlayAgain ? (
                    <p>Play Again requested. Waiting for opponent...</p>
                  ) : null}

                  <div>
                    {!opponentReturnedHome && (
                      <button
                        className="game-button game-button-primary"
                        type="button"
                        disabled={
                          isSurrenderMatch ||
                          Boolean(postMatchAction) ||
                          currentPlayerRequestedPlayAgain
                        }
                        onClick={handlePlayAgain}
                      >
                        {postMatchAction === 'play-again'
                          ? 'Requesting...'
                          : 'Play Again'}
                      </button>
                    )}
                    <button
                      className="game-button"
                      type="button"
                      disabled={Boolean(postMatchAction)}
                      onClick={handleReturnHome}
                    >
                      {postMatchAction === 'return-home'
                        ? 'Leaving...'
                        : 'Return Home'}
                    </button>
                  </div>

                  {postMatchError && (
                    <p className="battle-lock-error" role="alert">
                      {postMatchError}
                    </p>
                  )}
                </div>
              </section>
            )}

            {masterRoundResult && (
              <section className="draft-state-panel battle-reveal-preview">
                <p className="eyebrow">MASTER ROUND RESULT</p>

                <div className="battle-reveal-fighters">
                  <div>
                    <span>Your Master Pok&eacute;mon</span>
                    <strong>{yourMasterPokemon?.pokemonName}</strong>
                    <small>
                      Final Score: {yourMasterFinalScore}
                    </small>
                  </div>
                  <div>
                    <span>Opponent Master Pok&eacute;mon</span>
                    <strong>{opponentMasterPokemon?.pokemonName}</strong>
                    <small>
                      Final Score: {opponentMasterFinalScore}
                    </small>
                  </div>
                </div>

                <p>
                  <strong>Result:</strong>{' '}
                  {masterRoundResult.reason ?? 'Result unavailable.'}
                </p>
                <strong>Logs:</strong>
                <ul>
                  {(masterRoundResult.logs ?? []).map((log, index) => (
                    <li key={`${index}-${log}`}>{log}</li>
                  ))}
                </ul>
              </section>
            )}

            {isMasterRoundPending && (
              <section className="draft-state-panel master-round-panel">
                <p className="eyebrow">MASTER ROUND</p>
                <h2>
                  Score tied 3 - 3. Choose one hidden Pok&eacute;ball.
                </h2>

                {!masterRoundSelection &&
                  masterRoundOptions.length === 3 && (
                  <div className="master-round-pokeballs">
                    {masterRoundOptions.map((option, index) => (
                      <button
                        className="master-round-pokeball"
                        type="button"
                        key={`${option.pokemonId}-${index}`}
                        disabled={isLockingMasterRound}
                        aria-label={`Choose hidden Pokeball ${index + 1}`}
                        onClick={() =>
                          handleMasterRoundSelection(option)
                        }
                      >
                        <span aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}

                {!masterRoundSelection &&
                  masterRoundOptions.length !== 3 && (
                  <p>Preparing Master Round Pok&eacute;balls...</p>
                )}

                {bothMasterRoundPlayersSelected ? (
                  <p>
                    Both trainers selected. Master Round reveal ready.
                  </p>
                ) : masterRoundSelection ? (
                  <p>
                    Master Round Pok&eacute;mon locked. Waiting for
                    opponent...
                  </p>
                ) : null}

                {masterRoundError && (
                  <p className="battle-lock-error" role="alert">
                    {masterRoundError}
                  </p>
                )}
              </section>
            )}

            {!isMasterRoundPending &&
              !showBattleStage &&
              !isBattleCountdownActive && (
              <section className="battle-arena-summary">
                <div className="battle-arena-your-team">
                  <div className="battle-section-heading">
                    <div>
                      <p className="eyebrow">Battle Preparation</p>
                      <h2>Choose Your Fighter</h2>
                    </div>
                  </div>

                  <div className="battle-usage-strip">
                    <span>Used Pok&eacute;mon</span>
                    <div
                      className="battle-usage-slots"
                      role="img"
                      aria-label={`${usedPokemonIds.size} of 6 Pokemon used`}
                    >
                      {Array.from({ length: 6 }, (_, index) => (
                        <span
                          className={`battle-usage-ball ${
                            index < usedPokemonIds.size ? 'is-used' : ''
                          }`}
                          key={`battle-usage-${index + 1}`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="battle-selection-grid">
                    {orderedDraftPicks.map((pokemon) => {
                      const isUsed = usedPokemonIds.has(
                        String(pokemon.id),
                      )
                      const isSelected =
                        String(pokemon.id) ===
                        String(activeSelectedPokemonId)

                      return (
                        <button
                          className={`battle-selection-card ${
                            isSelected ? 'is-selected' : ''
                          } ${isUsed ? 'is-used' : ''}`}
                          type="button"
                          key={pokemon.id}
                          disabled={
                            isUsed ||
                            currentPlayerHasLocked ||
                            isLockingFighter ||
                            isBattleCountdownActive ||
                            !selectionIsOpen
                          }
                          aria-pressed={isSelected}
                          onClick={() => {
                            setSelectedPokemonId(pokemon.id)
                            setLockErrorMessage('')
                          }}
                        >
                          <img
                            src={pokemon.sprite}
                            alt={pokemon.name}
                            width="120"
                            height="120"
                          />
                          <strong>{pokemon.name}</strong>
                          <small>{getDraftPickLabel(pokemon)}</small>
                          <div className="battle-type-list">
                            {pokemon.types.map((type) => (
                              <span key={type}>{type}</span>
                            ))}
                          </div>
                          <small>
                            {isUsed
                              ? 'Used'
                              : isSelected
                                ? 'Selected'
                                : 'Available'}
                          </small>
                        </button>
                      )
                    })}
                  </div>

                  <div className="battle-lock-area">
                    <button
                      className="game-button game-button-primary"
                      type="button"
                      disabled={
                        !selectedPokemon ||
                        selectedPokemonIsUsed ||
                        currentPlayerHasLocked ||
                        isLockingFighter ||
                        isBattleCountdownActive ||
                        !selectionIsOpen
                      }
                      onClick={handleLockFighter}
                    >
                      {isLockingFighter ? 'Locking...' : 'Lock Fighter'}
                    </button>

                    {bothPlayersLocked ? (
                      <div className="battle-fighter-ready">
                        <span
                          className="battle-ready-indicator"
                          aria-hidden="true"
                        />
                        <strong>&#10003; Fighter Locked</strong>
                        <span>Battle reveal ready.</span>
                      </div>
                    ) : currentPlayerHasLocked ? (
                      <div className="battle-fighter-ready">
                        <span
                          className="battle-ready-indicator"
                          aria-hidden="true"
                        />
                        <strong>&#10003; Fighter Locked</strong>
                        <span>Waiting For Opponent...</span>
                      </div>
                    ) : (
                      <p>Select Fighter</p>
                    )}

                    {lockErrorMessage && (
                      <p className="battle-lock-error" role="alert">
                        {lockErrorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {(showBattleStage || isBattleCountdownActive) && (
              <BattleStage
                roundNumber={currentRound}
                yourTrainerScore={yourScore}
                opponentTrainerScore={opponentScore}
                yourPokemon={revealedYourPokemon}
                opponentPokemon={revealedOpponentPokemon}
                yourFinalScore={revealedYourScore}
                opponentFinalScore={revealedOpponentScore}
                yourTransformation={yourTransformation}
                opponentTransformation={opponentTransformation}
                winnerPokemon={savedRoundResult?.winnerPokemon}
                resultText={revealReason}
                logs={revealLogs}
                showContinue={
                  Boolean(savedRoundResult) &&
                  battlePhase === 'round_result' &&
                  currentRound < 6
                }
                continueDisabled={
                  isContinuingRound || Boolean(pendingCelebiWish)
                }
                continueLabel={
                  isContinuingRound
                    ? 'Continuing...'
                    : pendingCelebiWish
                      ? 'Resolve Celebi Future Wish'
                      : 'Continue to Next Round'
                }
                currentPlayerContinued={
                  Boolean(savedRoundResult) &&
                  battlePhase === 'round_result' &&
                  currentPlayerContinued
                }
                onContinue={handleContinueRound}
                statusMessage={
                  savedRoundResult &&
                  battlePhase === 'round_result' &&
                  currentRound === 6
                    ? 'Normal rounds complete.'
                    : ''
                }
                errorMessages={[
                  roundSaveError,
                  continueErrorMessage,
                ]}
                countdownBackdrop={isBattleCountdownActive}
              />
            )}

          </>
        )}

      </section>

      {isBattleCountdownActive && battlePhase !== 'match_over' && (
        <div
          className={`battle-countdown-overlay ${
            countdownValue === '1' ? 'is-one' : ''
          } ${countdownValue === 'GO!' ? 'is-go' : ''}`}
          role="status"
          aria-live="assertive"
          aria-label={`Battle starts in ${countdownValue}`}
        >
          <div
            className={`battle-countdown-value ${
              countdownValue === '3'
                ? 'is-three'
                : countdownValue === '2'
                  ? 'is-two'
                  : countdownValue === '1'
                    ? 'is-one'
                    : 'is-go'
            }`}
            key={countdownValue}
            aria-hidden="true"
          >
            {countdownValue}
          </div>
        </div>
      )}

      {isTransformationCinematicActive &&
        battlePhase !== 'match_over' && (
        <div
          className={`mega-cinematic-overlay ${
            activeTransformationEvent.succeeded
              ? 'is-success'
              : 'is-failure'
          } ${
            activeTransformationEvent.type === 'battle-bond'
              ? 'is-battle-bond'
              : 'is-mega'
          }`}
          role="status"
          aria-live="assertive"
          aria-label={`${activeTransformationEvent.type === 'battle-bond' ? 'Battle Bond' : 'Mega Evolution'} ${activeTransformationEvent.succeeded ? 'succeeded' : 'failed'} for ${activeTransformationEvent.pokemonName}`}
          key={`${currentRound}-${transformationCinematicIndex}`}
        >
          <div className="mega-cinematic-energy" aria-hidden="true" />
          <p className="mega-cinematic-title">
            {activeTransformationEvent.type === 'battle-bond'
              ? 'Battle Bond'
              : 'Mega Evolution'}
          </p>
          <div className="mega-cinematic-pokemon">
            {activeTransformationEvent.image && (
              <>
                <img
                  className="mega-cinematic-normal-form"
                  src={activeTransformationEvent.image}
                  alt=""
                  width="320"
                  height="320"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
                {activeTransformationEvent.succeeded && (
                  <img
                    className="mega-cinematic-transformed-form"
                    src={getDisplayPokemonImage(
                      activeTransformationEvent.pokemon,
                      activeTransformationEvent,
                    )}
                    alt=""
                    width="320"
                    height="320"
                    onError={(event) => {
                      if (
                        activeTransformationEvent.image &&
                        event.currentTarget.src !==
                          activeTransformationEvent.image
                      ) {
                        event.currentTarget.src =
                          activeTransformationEvent.image
                      } else {
                        event.currentTarget.hidden = true
                      }
                    }}
                  />
                )}
              </>
            )}
            {activeTransformationEvent.succeeded && (
              <span className="mega-cinematic-form-name">
                {activeTransformationEvent.transformedForm ??
                  (activeTransformationEvent.type === 'battle-bond'
                    ? 'Ash Greninja'
                    : 'Mega Form')}
              </span>
            )}
          </div>
          <div className="mega-cinematic-name">
            <strong>
              {activeTransformationEvent.pokemonName}
            </strong>
            {activeTransformationEvent.transformedForm && (
              <span>
                {activeTransformationEvent.transformedForm}
              </span>
            )}
          </div>
          <strong className="mega-cinematic-status">
            {activeTransformationEvent.type === 'battle-bond'
              ? activeTransformationEvent.succeeded
                ? 'Ash-Greninja Awakened'
                : 'Battle Bond Failed'
              : activeTransformationEvent.succeeded
                ? 'Mega Evolution Success'
                : 'Mega Evolution Failed'}
          </strong>
        </div>
      )}

      {isRoomPlayer && (
        <>
          <RoomPresence
            roomCode={displayRoomCode}
            room={room}
            currentUser={currentUser}
            matchOver={battlePhase === 'match_over'}
          />
          <SurrenderControl
            roomCode={displayRoomCode}
            currentUser={currentUser}
            username={room?.players?.[currentUser.uid]?.username}
            hidden={battlePhase === 'match_over'}
            onRoomLeft={onRoomLeft}
            onManualNavigation={onManualNavigation}
          />
        </>
      )}
    </main>
  )
}

export default BattleArena
