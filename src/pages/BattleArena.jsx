import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate, useParams } from 'react-router-dom'
import BattleStage from '../components/BattleStage.jsx'
import RoomPresence from '../components/RoomPresence.jsx'
import SurrenderControl from '../components/SurrenderControl.jsx'
import { resolveBattleRound } from '../data/battleRoundResolver.js'
import { getJirachiCopyableTraits } from '../data/advancedTraitInteractionResolver.js'
import { allBattlePokemon } from '../data/pokemonBattleData.js'
import { getBattleArena } from '../data/battleArenas.js'
import { createFighterAnalysis } from '../data/battlePresentation.js'
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
  assignJirachiBlessing,
  continueBattleRound,
  dismissCelebiWish,
  dismissJirachiWish,
  initializeMasterRoundOptions,
  lockBattlePokemon,
  lockMasterRoundPokemon,
  markMasterRoundActivationReady,
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
  playerATransformedForm,
  playerBTransformedForm,
  isMasterRound = false,
}) {
  const events = []
  const eventKeys = new Set()
  const battlePokemon = [playerAPokemon, playerBPokemon]
  const getEventType = (source, transformedForm) => {
    const normalizedSource = source.toLowerCase()
    const normalizedForm = transformedForm.toLowerCase()

    if (
      normalizedSource.includes('ash greninja') ||
      normalizedSource.includes('battle bond') ||
      normalizedForm === 'ash greninja'
    ) {
      return 'battle-bond'
    }

    if (
      normalizedSource.includes('god killer') ||
      normalizedForm === 'mega rayquaza' ||
      normalizedForm === 'ultra necrozma'
    ) {
      return 'god-killer'
    }

    if (
      normalizedSource.includes('sleeping monster') ||
      normalizedForm === 'gigantamax snorlax'
    ) {
      return 'sleeping-monster'
    }

    return 'mega'
  }
  const getFallbackAmount = (type, pokemon) => {
    if (type === 'battle-bond') {
      return isMasterRound ? 6 : 3
    }

    if (type === 'god-killer') {
      return 20
    }

    if (type === 'sleeping-monster') {
      return isMasterRound ? 25 : 20
    }

    return getTransformationFormForPokemon(pokemon) ? 3 : 0
  }

  const addEvent = (event) => {
    const key = `${event.type}:${event.pokemonName.toLowerCase()}`

    if (!eventKeys.has(key)) {
      eventKeys.add(key)
      events.push({
        ...event,
        amount:
          Number(event.amount) ||
          (event.succeeded
            ? getFallbackAmount(event.type, event.pokemon)
            : 0),
      })
    }
  }

  appliedEffects.forEach((effect) => {
    const source = String(effect?.source ?? '')
    const trait = String(effect?.trait ?? '')
    const transformedForm = String(effect?.transformedForm ?? '')
    const effectIdentity = `${source} ${trait} ${transformedForm}`.toLowerCase()
    const isTransformation = [
      'mega evolution',
      'ash greninja',
      'battle bond',
      'god killer',
      'sleeping monster',
      'mega rayquaza',
      'ultra necrozma',
      'gigantamax snorlax',
    ].some((identity) => effectIdentity.includes(identity))

    if (!isTransformation) {
      return
    }

    const pokemon =
      effect.pokemon ??
      effect.sourcePokemon ??
      (effect.side === 'PLAYER_A'
        ? playerAPokemon
        : playerBPokemon)

    addEvent({
      type: getEventType(`${source} ${trait}`, transformedForm),
      pokemon,
      pokemonName: getPokemonName(pokemon),
      image: getNormalPokemonImage(pokemon),
      succeeded: Boolean(effect.applied),
      amount: effect.amount,
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
    const godKillerSuccessMatch = log.match(
      /^God Killer awakened (Mega Rayquaza|Ultra Necrozma)\.?$/i,
    )
    const godKillerFailureMatch = log.match(/^God Killer failed\.?$/i)
    const sleepingMonsterSuccessMatch = log.match(
      /^Sleeping Monster awakened\.?$/i,
    )
    const sleepingMonsterFailureMatch = log.match(
      /^Sleeping Monster stayed asleep\.?$/i,
    )
    const match =
      megaSuccessMatch ??
      megaFailureMatch ??
      battleBondSuccessMatch ??
      battleBondFailureMatch ??
      godKillerSuccessMatch ??
      godKillerFailureMatch ??
      sleepingMonsterSuccessMatch ??
      sleepingMonsterFailureMatch

    if (!match) {
      return
    }

    const transformedForm = godKillerSuccessMatch?.[1] ?? null
    const expectedPokemonName =
      transformedForm === 'Mega Rayquaza'
        ? 'Rayquaza'
        : transformedForm === 'Ultra Necrozma'
          ? 'Necrozma'
          : sleepingMonsterSuccessMatch ||
              sleepingMonsterFailureMatch
            ? 'Snorlax'
            : null
    const pokemonName =
      megaSuccessMatch?.[1] ??
      megaFailureMatch?.[1] ??
      battleBondSuccessMatch?.[1] ??
      battleBondFailureMatch?.[1] ??
      expectedPokemonName
    const eligibleGodKillers = battlePokemon.filter((candidate) =>
      ['Rayquaza', 'Necrozma'].includes(getPokemonName(candidate)),
    )
    const pokemon =
      battlePokemon.find(
        (candidate) =>
          getPokemonName(candidate).toLowerCase() ===
          pokemonName?.toLowerCase(),
      ) ??
      (godKillerFailureMatch
        ? eligibleGodKillers.find(
            (candidate) =>
              !eventKeys.has(
                `god-killer:${getPokemonName(candidate).toLowerCase()}`,
              ),
          )
        : null)

    if (!pokemon) {
      return
    }

    const type =
      battleBondSuccessMatch || battleBondFailureMatch
        ? 'battle-bond'
        : godKillerSuccessMatch || godKillerFailureMatch
          ? 'god-killer'
          : sleepingMonsterSuccessMatch ||
              sleepingMonsterFailureMatch
            ? 'sleeping-monster'
            : 'mega'
    const succeeded = Boolean(
      megaSuccessMatch ||
      battleBondSuccessMatch ||
      godKillerSuccessMatch ||
      sleepingMonsterSuccessMatch,
    )

    addEvent({
      type,
      pokemon,
      pokemonName: getPokemonName(pokemon),
      image: getNormalPokemonImage(pokemon),
      succeeded,
      transformedForm:
        succeeded
          ? transformedForm ??
            getTransformationFormForPokemon(pokemon)
          : null,
    })
  })

  ;[
    [playerAPokemon, playerATransformedForm],
    [playerBPokemon, playerBTransformedForm],
  ].forEach(([pokemon, transformedForm]) => {
    if (!pokemon || !transformedForm) {
      return
    }

    addEvent({
      type: getEventType('', transformedForm),
      pokemon,
      pokemonName: getPokemonName(pokemon),
      image: getNormalPokemonImage(pokemon),
      succeeded: true,
      transformedForm,
    })
  })

  return events
}

function getTransformationPresentation(event) {
  const presentations = {
    'battle-bond': {
      title: 'Battle Bond',
      activated: 'Battle Bond Activated',
      failed: 'Battle Bond Failed',
      success: 'Ash-Greninja Awakened',
      bonus: 'Battle Bond Bonus',
    },
    'god-killer': {
      title: '\u2694 God Killer Awakening \u2694',
      activated: 'God Killer Awakening',
      failed: 'God Killer Failed',
      success: 'God Killer Awakened',
      bonus: 'God Killer Awakened',
    },
    'sleeping-monster': {
      title: 'Sleeping Monster',
      activated: 'Sleeping Monster Awakened',
      failed: 'Sleeping Monster Stayed Asleep',
      success: 'Gigantamax Awakened',
      bonus: 'G-Max Bonus',
    },
    mega: {
      title: 'Mega Evolution',
      activated: 'Mega Evolution Activated',
      failed: 'Mega Evolution Failed',
      success: 'Mega Evolution Success',
      bonus: 'Mega Bonus',
    },
  }

  return presentations[event?.type] ?? presentations.mega
}

function addTransformationAnalysisCard(cards, event) {
  if (
    !event?.succeeded ||
    !event.amount ||
    cards.some((card) => card.id === 'transformation')
  ) {
    return cards
  }

  const baseCardIndex = cards.findIndex((card) => card.id === 'base')
  const insertIndex = baseCardIndex >= 0 ? baseCardIndex + 1 : 0
  const transformationCard = {
    id: 'transformation',
    label: getTransformationPresentation(event).bonus,
    icon: '\u2726',
    value: event.amount,
  }

  return [
    ...cards.slice(0, insertIndex),
    transformationCard,
    ...cards.slice(insertIndex),
  ]
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

function isSamePokemonSelection(pokemon, selection) {
  const pokemonId = pokemon?.id ?? pokemon?.pokemonId
  const selectionId = selection?.id ?? selection?.pokemonId

  if (pokemonId && selectionId) {
    return String(pokemonId) === String(selectionId)
  }

  return getPokemonName(pokemon) === getPokemonName(selection)
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

function getSuccessfulTransformationFromLogs(pokemon, logs = []) {
  const pokemonName = getPokemonName(pokemon)

  if (
    logs.some((log) =>
      new RegExp(`^${pokemonName} Mega Evolved\\.?$`, 'i').test(log),
    )
  ) {
    return getTransformationFormForPokemon(pokemon)
  }

  if (
    pokemonName === 'Greninja' &&
    logs.some((log) =>
      /Greninja transformed into Ash Greninja\.?/i.test(log),
    )
  ) {
    return 'Ash Greninja'
  }

  if (
    pokemonName === 'Snorlax' &&
    logs.some((log) => /Sleeping Monster awakened\.?/i.test(log))
  ) {
    return 'Gigantamax Snorlax'
  }

  if (pokemonName === 'Rayquaza' || pokemonName === 'Necrozma') {
    const godKillerLog = logs.find((log) =>
      /^God Killer awakened .+\.?$/i.test(log),
    )

    return (
      godKillerLog?.match(/^God Killer awakened (.+?)\.?$/i)?.[1] ??
      null
    )
  }

  return null
}

function getMatchMvp({
  roundResults = [],
  masterRoundResult,
  matchWinnerUid,
  currentUserUid,
}) {
  const results = [
    ...roundResults.map((result) => ({
      result,
      order: Number(result.roundNumber) || 0,
      isMasterRound: false,
    })),
    ...(masterRoundResult
      ? [
          {
            result: masterRoundResult,
            order: 7,
            isMasterRound: true,
          },
        ]
      : []),
  ]
  const candidates = results.flatMap(
    ({ result, order, isMasterRound }) => [
      {
        pokemon: result.playerAPokemon,
        score: Number(result.playerAFinalScore) || 0,
        playerUid: result.playerAUid,
        logs: result.logs ?? [],
        order,
        isMasterRound,
      },
      {
        pokemon: result.playerBPokemon,
        score: Number(result.playerBFinalScore) || 0,
        playerUid: result.playerBUid,
        logs: result.logs ?? [],
        order,
        isMasterRound,
      },
    ],
  )

  candidates.sort((candidateA, candidateB) => {
    const scoreDifference = candidateB.score - candidateA.score

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    const candidateAWonMatch = candidateA.playerUid === matchWinnerUid
    const candidateBWonMatch = candidateB.playerUid === matchWinnerUid

    if (candidateAWonMatch !== candidateBWonMatch) {
      return candidateAWonMatch ? -1 : 1
    }

    return candidateB.order - candidateA.order
  })

  const mvp = candidates[0]

  if (!mvp?.pokemon) {
    return null
  }

  const transformedForm = getSuccessfulTransformationFromLogs(
    mvp.pokemon,
    mvp.logs,
  )

  return {
    ...mvp,
    transformedForm,
    displayName: transformedForm ?? getPokemonName(mvp.pokemon),
    image: getDisplayPokemonImage(mvp.pokemon, transformedForm),
    ownership:
      mvp.playerUid === currentUserUid ? 'YOU' : 'OPPONENT',
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
  const [pendingMasterRoundOption, setPendingMasterRoundOption] =
    useState(null)
  const [
    completedMasterSelectionPortalKey,
    setCompletedMasterSelectionPortalKey,
  ] = useState(null)
  const [masterRoundError, setMasterRoundError] = useState('')
  const [isActivatingMasterRound, setIsActivatingMasterRound] =
    useState(false)
  const [
    completedMasterRoundPortalKey,
    setCompletedMasterRoundPortalKey,
  ] = useState(null)
  const [isSavingJirachiCopy, setIsSavingJirachiCopy] = useState(false)
  const [jirachiCopyError, setJirachiCopyError] = useState('')
  const [isSavingCelebiWish, setIsSavingCelebiWish] = useState(false)
  const [celebiWishError, setCelebiWishError] = useState('')
  const [pendingCelebiWishTarget, setPendingCelebiWishTarget] =
    useState(null)
  const [grantedCelebiWish, setGrantedCelebiWish] = useState(null)
  const [isSavingJirachiBlessing, setIsSavingJirachiBlessing] =
    useState(false)
  const [jirachiBlessingError, setJirachiBlessingError] = useState('')
  const [pendingJirachiBlessingTarget, setPendingJirachiBlessingTarget] =
    useState(null)
  const [grantedJirachiBlessing, setGrantedJirachiBlessing] =
    useState(null)
  const [completedJirachiAwakeningKey, setCompletedJirachiAwakeningKey] =
    useState(null)
  const [postMatchAction, setPostMatchAction] = useState('')
  const [postMatchError, setPostMatchError] = useState('')
  const [viewedMatchResultKey, setViewedMatchResultKey] =
    useState(null)
  const [countdownValue, setCountdownValue] = useState(null)
  const [countdownCompletedRound, setCountdownCompletedRound] =
    useState(null)
  const [
    completedMasterRoundAnnouncementKey,
    setCompletedMasterRoundAnnouncementKey,
  ] = useState(null)
  const [transformationCinematicIndex, setTransformationCinematicIndex] =
    useState(null)
  const [battleEntranceStep, setBattleEntranceStep] = useState(0)
  const [battleTeamsVisible, setBattleTeamsVisible] = useState(false)
  const [activeAnalysisSide, setActiveAnalysisSide] = useState(null)
  const [battleNotification, setBattleNotification] = useState(null)
  const [revealedScoreSides, setRevealedScoreSides] = useState([])
  const [transformedSides, setTransformedSides] = useState([])
  const [showScoreComparison, setShowScoreComparison] =
    useState(false)
  const [showBattleWinner, setShowBattleWinner] = useState(false)
  const [showVictoryCelebration, setShowVictoryCelebration] =
    useState(false)
  const [presentationCompletedRound, setPresentationCompletedRound] =
    useState(null)
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
  const pendingJirachiWish = battleState?.pendingJirachiWish ?? null
  const jirachiAwakeningKey = pendingJirachiWish
    ? `${pendingJirachiWish.playerUid}:${pendingJirachiWish.roundWon}`
    : null
  const isJirachiAwakeningActive = Boolean(
    pendingJirachiWish?.playerUid === currentUser?.uid &&
      completedJirachiAwakeningKey !== jirachiAwakeningKey,
  )
  const celebiBlessedPokemonIds = useMemo(
    () =>
      new Set(
        (
          battleState?.celebiWishes?.[currentUser?.uid] ?? []
        ).map((wish) => String(wish.targetPokemonId)),
      ),
    [battleState?.celebiWishes, currentUser?.uid],
  )
  const jirachiBlessedPokemonIds = useMemo(
    () =>
      new Set(
        (
          battleState?.jirachiBlessings?.[currentUser?.uid] ?? []
        ).map((blessing) => String(blessing.targetPokemonId)),
      ),
    [battleState?.jirachiBlessings, currentUser?.uid],
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
      !celebiBlessedPokemonIds.has(String(pokemon.id)) &&
      !jirachiBlessedPokemonIds.has(String(pokemon.id)),
  )
  const validJirachiBlessingTargets = orderedDraftPicks.filter(
    (pokemon) =>
      pokemon.name !== 'Jirachi' &&
      !usedPokemonIds.has(String(pokemon.id)) &&
      String(pokemon.id) !== String(activeSelectedPokemonId) &&
      !jirachiBlessedPokemonIds.has(String(pokemon.id)) &&
      !celebiBlessedPokemonIds.has(String(pokemon.id)),
  )

  useEffect(() => {
    if (!isJirachiAwakeningActive || !jirachiAwakeningKey) {
      return undefined
    }

    const timer = window.setTimeout(
      () => setCompletedJirachiAwakeningKey(jirachiAwakeningKey),
      2500,
    )

    return () => window.clearTimeout(timer)
  }, [isJirachiAwakeningActive, jirachiAwakeningKey])
  const selectionIsOpen =
    (battleState?.phase ?? 'choose_pokemon') === 'choose_pokemon'
  const battlePhase = battleState?.phase ?? 'choose_pokemon'
  const battlePhaseLabel =
    BATTLE_PHASE_LABELS[battlePhase] ?? 'Choose Pokemon'
  const battleArena = getBattleArena(battleState?.arenaId)
  const battleArenaStyle = {
    '--battle-arena-image': `url("${battleArena.image}")`,
  }
  const masterRoundOptions =
    battleState?.masterRound?.hiddenOptions?.[currentUser?.uid] ?? []
  const masterRoundSelection =
    battleState?.masterRound?.selections?.[currentUser?.uid] ?? null
  const opponentMasterRoundSelection =
    battleState?.masterRound?.selections?.[opponentUid] ?? null
  const bothMasterRoundPlayersSelected = Boolean(
    masterRoundSelection && opponentMasterRoundSelection,
  )
  const masterSelectionPortalKey = bothMasterRoundPlayersSelected
    ? [
        masterRoundSelection.pokemonId,
        opponentMasterRoundSelection.pokemonId,
      ].join(':')
    : null
  const masterSelectionPortalComplete =
    !bothMasterRoundPlayersSelected ||
    completedMasterSelectionPortalKey === masterSelectionPortalKey
  const isMasterSelectionPortalActive =
    bothMasterRoundPlayersSelected &&
    !masterSelectionPortalComplete
  const masterRoundResult = battleState?.masterRound?.result ?? null
  const bothRoundPlayersContinued = Boolean(
    room?.hostUid &&
      room?.guestUid &&
      battleState?.roundContinue?.[room.hostUid] &&
      battleState?.roundContinue?.[room.guestUid],
  )
  const masterRoundActivationReadyByUid =
    battleState?.masterRound?.activationReady ?? {}
  const currentPlayerMasterRoundReady = Boolean(
    masterRoundActivationReadyByUid[currentUser?.uid],
  )
  const bothPlayersMasterRoundReady = Boolean(
    room?.hostUid &&
      room?.guestUid &&
      masterRoundActivationReadyByUid[room.hostUid] &&
      masterRoundActivationReadyByUid[room.guestUid],
  )
  const masterRoundActivationKey = [
    battleState?.createdAt?.seconds ?? '',
    battleState?.createdAt?.nanoseconds ?? '',
    currentRound,
  ].join(':')
  const masterRoundPortalComplete =
    completedMasterRoundPortalKey === masterRoundActivationKey ||
    battleState?.masterRound?.phase === 'choose_master_pokeball'
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
  const masterRoundSelectionReady =
    !masterRoundResult &&
    (battleState?.masterRound?.phase === 'choose_master_pokeball' ||
      (battlePhase === 'master_round_pending' &&
        bothRoundPlayersContinued &&
        bothPlayersMasterRoundReady &&
        masterRoundPortalComplete))
  const isMasterRoundPending = masterRoundSelectionReady
  const isMasterRoundActivationScreen = Boolean(
    !masterRoundResult &&
      battlePhase === 'master_round_pending' &&
      bothRoundPlayersContinued &&
      !masterRoundPortalComplete,
  )
  const isMasterRoundPortalActive =
    isMasterRoundActivationScreen && bothPlayersMasterRoundReady
  const isMasterRoundWorld = Boolean(
    isMasterRoundActivationScreen ||
      isMasterRoundPending ||
      isMasterSelectionPortalActive ||
      (masterRoundResult && hostScore === 3 && guestScore === 3),
  )
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
      jirachiBlessingA:
        (
          battleState?.jirachiBlessings?.[room?.hostUid] ?? []
        ).find(
          (blessing) =>
            !blessing.consumed &&
            String(blessing.targetPokemonId) ===
              String(hostSelection.pokemonId),
        ) ?? null,
      jirachiBlessingB:
        (
          battleState?.jirachiBlessings?.[room?.guestUid] ?? []
        ).find(
          (blessing) =>
            !blessing.consumed &&
            String(blessing.targetPokemonId) ===
              String(guestSelection.pokemonId),
        ) ?? null,
      isMasterRound: false,
      randomFn: createSeededRandom(
        `${displayRoomCode}:${currentRound}:${hostSelection.pokemonId}:${guestSelection.pokemonId}`,
      ),
    })
  }, [
    battleState?.jirachiCopies,
    battleState?.jirachiBlessings,
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
  const isTiedNormalRoundAwaitingContinue = Boolean(
    savedRoundResult &&
      !masterRoundResult &&
      battlePhase === 'master_round_pending' &&
      hostScore === 3 &&
      guestScore === 3 &&
      !bothRoundPlayersContinued,
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
  const hasFinalNormalRoundResult = Boolean(
    savedRoundResult &&
      battlePhase === 'match_over' &&
      (hostScore >= ROUND_WINS_NEEDED ||
        guestScore >= ROUND_WINS_NEEDED),
  )
  const hasFinalBattleResult = Boolean(
    masterRoundResult || hasFinalNormalRoundResult,
  )
  const finalBattleResult = masterRoundResult ?? savedRoundResult
  const finalBattleResultKey = hasFinalBattleResult
    ? [
        masterRoundResult ? 'master' : 'round',
        finalBattleResult?.roundNumber ?? currentRound,
        finalBattleResult?.createdAt?.seconds ?? '',
        finalBattleResult?.createdAt?.nanoseconds ?? '',
        finalBattleResult?.resultType ?? '',
      ].join(':')
    : null
  const showFinalMatchScreen =
    battlePhase === 'match_over' &&
    (!hasFinalBattleResult ||
      viewedMatchResultKey === finalBattleResultKey)
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
        appliedEffects:
          masterRoundResult?.appliedEffects ??
          canonicalBattleResult?.appliedEffects,
        logs: masterRoundResult?.logs ?? revealLogs,
        playerAPokemon:
          masterRoundResult?.playerAPokemon ??
          savedRoundResult?.playerAPokemon ??
          canonicalBattleResult?.playerAState?.pokemon,
        playerBPokemon:
          masterRoundResult?.playerBPokemon ??
          savedRoundResult?.playerBPokemon ??
          canonicalBattleResult?.playerBState?.pokemon,
        playerATransformedForm:
          masterRoundResult?.playerATransformedForm ??
          masterRoundResult?.playerAState?.transformedForm,
        playerBTransformedForm:
          masterRoundResult?.playerBTransformedForm ??
          masterRoundResult?.playerBState?.transformedForm,
        isMasterRound: Boolean(masterRoundResult),
      }),
    [
      canonicalBattleResult,
      masterRoundResult,
      revealLogs,
      savedRoundResult?.playerAPokemon,
      savedRoundResult?.playerBPokemon,
    ],
  )
  const battleStageReady = Boolean(
    masterRoundResult
      ? battlePhase === 'match_over' &&
          masterSelectionPortalComplete
      : bothPlayersLocked &&
          savedRoundResult &&
          hasRevealData &&
          !isMasterRoundActivationScreen &&
          !masterRoundSelectionReady,
  )
  const isMasterRoundBattle = Boolean(
    masterRoundResult && hostScore === 3 && guestScore === 3,
  )
  const masterRoundAnnouncementKey = masterRoundResult
    ? [
        masterRoundResult.createdAt?.seconds ?? '',
        masterRoundResult.createdAt?.nanoseconds ?? '',
        masterRoundResult.playerAPokemon?.pokemonId ?? '',
        masterRoundResult.playerBPokemon?.pokemonId ?? '',
      ].join(':')
    : null
  const battleStageKey = masterRoundResult
    ? `master:${masterRoundAnnouncementKey}`
    : currentRound
  const isMasterRoundAnnouncementActive =
    battleStageReady &&
    isMasterRoundBattle &&
    completedMasterRoundAnnouncementKey !==
      masterRoundAnnouncementKey
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
  const getTransformationKey = (pokemon) => {
    const pokemonId = pokemon?.id ?? pokemon?.pokemonId

    return pokemonId
      ? `id:${pokemonId}`
      : `name:${getPokemonName(pokemon).toLowerCase()}`
  }
  const getTransformationEvent = (pokemon) => {
    const pokemonId = pokemon?.id ?? pokemon?.pokemonId

    return (
      transformationEvents.find((event) => {
        const eventPokemonId =
          event.pokemon?.id ?? event.pokemon?.pokemonId

        return pokemonId && eventPokemonId
          ? String(pokemonId) === String(eventPokemonId)
          : event.pokemonName.toLowerCase() ===
              getPokemonName(pokemon).toLowerCase()
      }) ?? null
    )
  }
  const transformationYourPokemon = currentUserIsPlayerA
    ? masterRoundResult?.playerAPokemon ?? revealedYourPokemon
    : masterRoundResult?.playerBPokemon ?? revealedYourPokemon
  const transformationOpponentPokemon = currentUserIsPlayerA
    ? masterRoundResult?.playerBPokemon ?? revealedOpponentPokemon
    : masterRoundResult?.playerAPokemon ?? revealedOpponentPokemon
  const yourTransformationEvent = getTransformationEvent(
    transformationYourPokemon,
  )
  const opponentTransformationEvent = getTransformationEvent(
    transformationOpponentPokemon,
  )
  const yourTransformation = successfulTransformationByPokemon.get(
    getTransformationKey(transformationYourPokemon),
  )
  const opponentTransformation = successfulTransformationByPokemon.get(
    getTransformationKey(transformationOpponentPokemon),
  )
  const revealedWinnerPokemon = savedRoundResult
    ? savedRoundResult.resultType === 'PLAYER_A_WIN'
      ? savedRoundResult.playerAPokemon
      : savedRoundResult.resultType === 'PLAYER_B_WIN'
        ? savedRoundResult.playerBPokemon
        : null
    : canonicalBattleResult?.winnerResult?.winnerPokemon ?? null
  const yourTeamSlots = useMemo(() => {
    const slots = orderedDraftPicks.slice(0, 6).map((pokemon) => {
      const active = isSamePokemonSelection(
        pokemon,
        revealedYourPokemon,
      )

      return {
        pokemon,
        active,
        used: !active && usedPokemonIds.has(String(pokemon.id)),
        unknown: false,
      }
    })

    while (slots.length < 6) {
      slots.push({
        pokemon: null,
        active: false,
        used: false,
        unknown: true,
      })
    }

    return slots
  }, [orderedDraftPicks, revealedYourPokemon, usedPokemonIds])
  const opponentTeamSlots = useMemo(() => {
    const revealed = []
    const revealedIds = new Set()
    const roundResults = battleState?.roundResults ?? []

    roundResults.forEach((result) => {
      const pokemon =
        result.playerAUid === opponentUid
          ? result.playerAPokemon
          : result.playerBUid === opponentUid
            ? result.playerBPokemon
            : null
      const pokemonId = pokemon?.pokemonId ?? pokemon?.id

      if (!pokemon || revealedIds.has(String(pokemonId))) {
        return
      }

      revealedIds.add(String(pokemonId))
      revealed.push({
        pokemon,
        active: isSamePokemonSelection(
          pokemon,
          revealedOpponentPokemon,
        ),
        used: !isSamePokemonSelection(
          pokemon,
          revealedOpponentPokemon,
        ),
        unknown: false,
      })
    })

    while (revealed.length < 6) {
      revealed.push({
        pokemon: null,
        active: false,
        used: false,
        unknown: true,
      })
    }

    return revealed.slice(0, 6)
  }, [
    battleState?.roundResults,
    opponentUid,
    revealedOpponentPokemon,
  ])
  const activeTransformationEvent =
    transformationCinematicIndex === null
      ? null
      : transformationEvents[transformationCinematicIndex] ?? null
  const isTransformationCinematicActive = Boolean(
    battleStageReady &&
      countdownCompletedRound === battleStageKey &&
      activeTransformationEvent,
  )
  const showBattleStage =
    battleStageReady &&
    countdownCompletedRound === battleStageKey &&
    !isBattleCountdownActive
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
  const currentPlayerWonMatch =
    opponentSurrendered ||
    battleState?.matchWinnerUid === currentUser?.uid
  const currentPlayerLostMatch = Boolean(
    battleState?.matchWinnerUid &&
      battleState.matchWinnerUid !== currentUser?.uid,
  )
  const matchMvp = useMemo(
    () =>
      getMatchMvp({
        roundResults: battleState?.roundResults ?? [],
        masterRoundResult,
        matchWinnerUid: battleState?.matchWinnerUid ?? null,
        currentUserUid: currentUser?.uid,
      }),
    [
      battleState?.matchWinnerUid,
      battleState?.roundResults,
      currentUser?.uid,
      masterRoundResult,
    ],
  )
  const finalMatchTitle = currentPlayerWonMatch
    ? 'Victory'
    : currentPlayerLostMatch
      ? 'Defeat'
      : 'Match Complete'
  const finalMatchMessage = currentPlayerWonMatch
    ? 'You won the match!'
    : currentPlayerLostMatch
      ? 'You lost the match.'
      : masterRoundResult?.resultType === 'TRUE_WARRIORS'
        ? 'The match ends in legendary honor.'
        : 'The match ended without a winner.'
  const battleStageYourPokemon =
    yourMasterPokemon ?? revealedYourPokemon
  const battleStageOpponentPokemon =
    opponentMasterPokemon ?? revealedOpponentPokemon
  const battleStageYourScore =
    yourMasterFinalScore ?? revealedYourScore
  const battleStageOpponentScore =
    opponentMasterFinalScore ?? revealedOpponentScore
  const battleStageWinnerPokemon =
    masterRoundResult?.winnerPokemon ?? revealedWinnerPokemon
  const battleStageResultText =
    masterRoundResult?.reason ?? revealReason
  const battleStageLogs = masterRoundResult?.logs ?? revealLogs
  const battleStageYourState = masterRoundResult
    ? null
    : currentUserIsPlayerA
      ? canonicalBattleResult?.playerAState
      : canonicalBattleResult?.playerBState
  const battleStageOpponentState = masterRoundResult
    ? null
    : currentUserIsPlayerA
      ? canonicalBattleResult?.playerBState
      : canonicalBattleResult?.playerAState
  const fullBattleStageYourPokemon =
    findSelectedPokemon(battleStageYourPokemon, allBattlePokemon) ??
    battleStageYourPokemon
  const fullBattleStageOpponentPokemon =
    findSelectedPokemon(
      battleStageOpponentPokemon,
      allBattlePokemon,
    ) ?? battleStageOpponentPokemon
  const yourBattleAnalysis = useMemo(
    () =>
      addTransformationAnalysisCard(
        createFighterAnalysis({
          state: battleStageYourState,
          pokemon: fullBattleStageYourPokemon,
          finalScore: battleStageYourScore,
          logs: battleStageLogs,
          playerIndex: currentUserIsPlayerA ? 0 : 1,
        }),
        yourTransformationEvent,
      ),
    [
      battleStageLogs,
      battleStageYourScore,
      battleStageYourState,
      currentUserIsPlayerA,
      fullBattleStageYourPokemon,
      yourTransformationEvent,
    ],
  )
  const opponentBattleAnalysis = useMemo(
    () =>
      addTransformationAnalysisCard(
        createFighterAnalysis({
          state: battleStageOpponentState,
          pokemon: fullBattleStageOpponentPokemon,
          finalScore: battleStageOpponentScore,
          logs: battleStageLogs,
          playerIndex: currentUserIsPlayerA ? 1 : 0,
        }),
        opponentTransformationEvent,
      ),
    [
      battleStageLogs,
      battleStageOpponentScore,
      battleStageOpponentState,
      currentUserIsPlayerA,
      fullBattleStageOpponentPokemon,
      opponentTransformationEvent,
    ],
  )

  useEffect(() => {
    if (
      !battleStageReady ||
      !isMasterRoundBattle ||
      completedMasterRoundAnnouncementKey ===
        masterRoundAnnouncementKey
    ) {
      return undefined
    }

    const timer = window.setTimeout(
      () =>
        setCompletedMasterRoundAnnouncementKey(
          masterRoundAnnouncementKey,
        ),
      2800,
    )

    return () => window.clearTimeout(timer)
  }, [
    battleStageReady,
    completedMasterRoundAnnouncementKey,
    isMasterRoundBattle,
    masterRoundAnnouncementKey,
  ])

  useEffect(() => {
    if (
      !battleStageReady ||
      isMasterRoundAnnouncementActive ||
      countdownCompletedRound === battleStageKey
    ) {
      return undefined
    }

    const timers = isMasterRoundBattle
      ? [
          window.setTimeout(() => setCountdownValue('3'), 0),
          window.setTimeout(() => setCountdownValue('2'), 800),
          window.setTimeout(() => setCountdownValue('1'), 1600),
          window.setTimeout(() => {
            setCountdownCompletedRound(battleStageKey)
            setCountdownValue(null)
          }, 2400),
        ]
      : [
          window.setTimeout(() => setCountdownValue('3'), 0),
          window.setTimeout(() => setCountdownValue('2'), 700),
          window.setTimeout(() => setCountdownValue('1'), 1400),
          window.setTimeout(() => setCountdownValue('GO!'), 2100),
          window.setTimeout(() => {
            setCountdownCompletedRound(battleStageKey)
            setCountdownValue(null)
          }, 2700),
        ]

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    battleStageKey,
    battleStageReady,
    countdownCompletedRound,
    isMasterRoundAnnouncementActive,
    isMasterRoundBattle,
  ])

  useEffect(() => {
    if (
      !battleStageReady ||
      countdownCompletedRound !== battleStageKey ||
      presentationCompletedRound === battleStageKey
    ) {
      return undefined
    }

    const timers = []
    const schedule = (callback, delay) => {
      timers.push(window.setTimeout(callback, delay))
    }
    const getTransformationIndex = (pokemon) =>
      transformationEvents.findIndex((event) =>
        isSamePokemonSelection(event.pokemon, pokemon),
      )
    const analyses = [
      {
        side: 'your',
        pokemon: battleStageYourPokemon,
        cards: yourBattleAnalysis,
      },
      {
        side: 'opponent',
        pokemon: battleStageOpponentPokemon,
        cards: opponentBattleAnalysis,
      },
    ]

    schedule(() => {
      setBattleEntranceStep(0)
      setBattleTeamsVisible(false)
      setActiveAnalysisSide(null)
      setBattleNotification(null)
      setRevealedScoreSides([])
      setTransformedSides([])
      setShowScoreComparison(false)
      setShowBattleWinner(false)
      setShowVictoryCelebration(false)
      setTransformationCinematicIndex(null)
    }, 0)

    schedule(() => setBattleEntranceStep(1), isMasterRoundBattle ? 350 : 250)
    schedule(() => setBattleEntranceStep(2), isMasterRoundBattle ? 1250 : 1000)
    schedule(() => setBattleTeamsVisible(true), 1750)

    let cursor = isMasterRoundBattle ? 2250 : 2450
    const notificationDuration = 1050
    const notificationGap = 160
    analyses.forEach(({ side, pokemon, cards }) => {
      const transformationIndex = transformationCinematicRequired
        ? getTransformationIndex(pokemon)
        : -1
      const baseCard = cards.find((card) => card.id === 'base')
      const remainingCards = cards.filter(
        (card) =>
          card.id !== 'base' &&
          (!isMasterRoundBattle || card.id !== 'final'),
      )

      schedule(() => setActiveAnalysisSide(side), cursor)

      if (baseCard) {
        schedule(
          () =>
            setBattleNotification({
              ...baseCard,
              side,
              key: `${side}-base`,
            }),
          cursor,
        )
        schedule(() => setBattleNotification(null), cursor + 900)
        cursor += notificationDuration + notificationGap
      }

      if (transformationIndex >= 0) {
        const event = transformationEvents[transformationIndex]
        const transformationPresentation =
          getTransformationPresentation(event)
        const transformationDuration =
          event.type === 'god-killer'
            ? event.succeeded
              ? 3600
              : 2800
            : 1600
        schedule(
          () =>
            setBattleNotification({
              id: 'transformation-activation',
              icon: '\u26a1',
              label: event.succeeded
                ? transformationPresentation.activated
                : transformationPresentation.failed,
              side,
              key: `${side}-transformation-activation`,
            }),
          cursor,
        )
        schedule(() => setBattleNotification(null), cursor + 900)
        cursor += notificationDuration
        schedule(
          () => setTransformationCinematicIndex(transformationIndex),
          cursor,
        )
        schedule(() => {
          setTransformationCinematicIndex(null)
          if (event.succeeded) {
            setTransformedSides((current) => [...current, side])
          }
        }, cursor + transformationDuration)
        cursor += transformationDuration + notificationGap

        if (event.type === 'god-killer' && !event.succeeded) {
          schedule(
            () =>
              setBattleNotification({
                id: 'god-killer-failure',
                icon: '\u26a0',
                label: 'God Killer Failed',
                side,
                key: `${side}-god-killer-failure`,
              }),
            cursor,
          )
          schedule(() => setBattleNotification(null), cursor + 1050)
          cursor += notificationDuration + notificationGap
        }
      }

      remainingCards.forEach((card) => {
        schedule(
          () =>
            setBattleNotification({
              ...card,
              side,
              key: `${side}-${card.id}`,
            }),
          cursor,
        )

        if (card.id === 'final') {
          schedule(
            () =>
              setRevealedScoreSides((current) => [
                ...current,
                side,
              ]),
            cursor,
          )
        }

        schedule(() => setBattleNotification(null), cursor + 900)
        cursor += notificationDuration + notificationGap
      })

      schedule(() => setActiveAnalysisSide(null), cursor)
      cursor += 350
    })

    if (isMasterRoundBattle) {
      schedule(
        () => setRevealedScoreSides(['your']),
        cursor,
      )
      cursor += 850
      schedule(
        () => setRevealedScoreSides(['your', 'opponent']),
        cursor,
      )
      cursor += 1850
    }

    schedule(() => setShowScoreComparison(true), cursor)
    cursor += 2400
    schedule(() => setShowBattleWinner(true), cursor)
    schedule(() => setShowVictoryCelebration(true), cursor + 900)
    cursor += 2600
    schedule(
      () => setPresentationCompletedRound(battleStageKey),
      cursor,
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [
    battleStageReady,
    battleStageKey,
    battleStageOpponentPokemon,
    battleStageYourPokemon,
    countdownCompletedRound,
    opponentBattleAnalysis,
    presentationCompletedRound,
    transformationCinematicRequired,
    transformationEvents,
    yourBattleAnalysis,
    isMasterRoundBattle,
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
    if (
      !isMasterRoundPortalActive ||
      completedMasterRoundPortalKey === masterRoundActivationKey
    ) {
      return undefined
    }

    const timer = window.setTimeout(
      () =>
        setCompletedMasterRoundPortalKey(
          masterRoundActivationKey,
        ),
      2600,
    )

    return () => window.clearTimeout(timer)
  }, [
    completedMasterRoundPortalKey,
    isMasterRoundPortalActive,
    masterRoundActivationKey,
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
      !bothRoundPlayersContinued ||
      !bothPlayersMasterRoundReady ||
      !masterRoundPortalComplete ||
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
    bothRoundPlayersContinued,
    bothPlayersMasterRoundReady,
    displayRoomCode,
    masterRoundPortalComplete,
    room?.guestUid,
    room?.hostUid,
  ])

  useEffect(() => {
    if (
      !isMasterSelectionPortalActive ||
      completedMasterSelectionPortalKey === masterSelectionPortalKey
    ) {
      return undefined
    }

    const timer = window.setTimeout(
      () =>
        setCompletedMasterSelectionPortalKey(
          masterSelectionPortalKey,
        ),
      2600,
    )

    return () => window.clearTimeout(timer)
  }, [
    completedMasterSelectionPortalKey,
    isMasterSelectionPortalActive,
    masterSelectionPortalKey,
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
    const continuingToMasterRound =
      battlePhase === 'master_round_pending' &&
      hostScore === 3 &&
      guestScore === 3

    if (
      !savedRoundResult ||
      (currentRound >= 6 && !continuingToMasterRound) ||
      currentPlayerContinued ||
      (battlePhase !== 'round_result' &&
        !continuingToMasterRound) ||
      pendingCelebiWish ||
      pendingJirachiWish ||
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

  async function handleMasterRoundActivation() {
    if (
      currentPlayerMasterRoundReady ||
      isActivatingMasterRound ||
      !isMasterRoundActivationScreen
    ) {
      return
    }

    setIsActivatingMasterRound(true)
    setMasterRoundError('')

    try {
      await markMasterRoundActivationReady({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
    } catch (error) {
      setMasterRoundError(
        error instanceof Error
          ? error.message
          : 'Could not activate the Master Round.',
      )
    } finally {
      setIsActivatingMasterRound(false)
    }
  }

  async function handleAssignCelebiWish(pokemon) {
    if (!pokemon || isSavingCelebiWish) {
      return
    }

    setIsSavingCelebiWish(true)
    setCelebiWishError('')

    try {
      const wish = await assignCelebiWish({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
        targetPokemonId: pokemon.id,
      })
      setPendingCelebiWishTarget(null)
      setGrantedCelebiWish({
        pokemon,
        amount: wish?.amount ?? 10,
      })

      window.setTimeout(() => {
        setGrantedCelebiWish(null)
      }, 2700)
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

  async function handleAssignJirachiBlessing(pokemon) {
    if (!pokemon || isSavingJirachiBlessing) {
      return
    }

    setIsSavingJirachiBlessing(true)
    setJirachiBlessingError('')

    try {
      const blessing = await assignJirachiBlessing({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
        targetPokemonId: pokemon.id,
      })
      setPendingJirachiBlessingTarget(null)
      setGrantedJirachiBlessing({
        pokemon,
        amount: blessing?.amount ?? 5,
      })

      window.setTimeout(() => {
        setGrantedJirachiBlessing(null)
      }, 2700)
    } catch (error) {
      setJirachiBlessingError(
        error instanceof Error
          ? error.message
          : 'Could not grant Jirachi Divine Blessing.',
      )
    } finally {
      setIsSavingJirachiBlessing(false)
    }
  }

  async function handleDismissJirachiWish() {
    if (isSavingJirachiBlessing) {
      return
    }

    setIsSavingJirachiBlessing(true)
    setJirachiBlessingError('')

    try {
      await dismissJirachiWish({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
    } catch (error) {
      setJirachiBlessingError(
        error instanceof Error
          ? error.message
          : 'Could not clear Jirachi Wish Maker.',
      )
    } finally {
      setIsSavingJirachiBlessing(false)
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

  function handleMasterRoundOptionClick(option) {
    if (
      masterRoundSelection ||
      isLockingMasterRound ||
      !option?.pokemonId
    ) {
      return
    }

    setPendingMasterRoundOption(option)
    setMasterRoundError('')
  }

  async function handleConfirmMasterRoundSelection() {
    if (!pendingMasterRoundOption) {
      return
    }

    const option = pendingMasterRoundOption
    setPendingMasterRoundOption(null)
    await handleMasterRoundSelection(option)
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
    <main
      className={`page-shell draft-page-shell battle-arena-page ${
        isMasterRoundWorld ? 'is-master-world' : ''
      }`}
      style={battleArenaStyle}
    >
      {isMasterRoundWorld && (
        <div className="master-world-particles" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <i
              key={index}
              style={{
                '--world-particle-index': index,
                '--world-particle-delay': `${(index % 8) * 140}ms`,
              }}
            />
          ))}
        </div>
      )}
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

            {hasJirachi &&
              !pendingCelebiWish &&
              !pendingJirachiWish &&
              battlePhase === 'choose_pokemon' && (
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
                <div className="celebi-wish-atmosphere" aria-hidden="true">
                  <span className="celebi-time-circle" />
                  {Array.from({ length: 12 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
                <header className="celebi-wish-header">
                  <div className="celebi-wish-source">
                    <img
                      src={getNormalPokemonImage({
                        id: pendingCelebiWish.sourcePokemonId,
                      })}
                      alt="Celebi"
                      width="150"
                      height="150"
                    />
                  </div>
                  <div>
                    <p className="eyebrow">Ancient Forest Magic</p>
                    <h2>Celebi Future Wish</h2>
                    <p>
                      Choose one unused Pok&eacute;mon to receive +10 power.
                    </p>
                  </div>
                </header>

                {validCelebiWishTargets.length > 0 ? (
                  <div className="celebi-wish-options">
                    {validCelebiWishTargets.map((pokemon) => (
                      <button
                        className="celebi-wish-card"
                        type="button"
                        key={pokemon.id}
                        disabled={isSavingCelebiWish}
                        onClick={() => setPendingCelebiWishTarget(pokemon)}
                      >
                        <img
                          src={getNormalPokemonImage(pokemon)}
                          alt=""
                          width="140"
                          height="140"
                        />
                        <strong>{pokemon.name}</strong>
                        <span>Base Power {pokemon.score}</span>
                        <b>+10 Future Wish</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="celebi-wish-empty">
                    <strong>No future target available.</strong>
                    <button
                      className="game-button"
                      type="button"
                      disabled={isSavingCelebiWish}
                      onClick={handleDismissCelebiWish}
                    >
                      Continue
                    </button>
                  </div>
                )}

                {celebiWishError && (
                  <p className="battle-lock-error" role="alert">
                    {celebiWishError}
                  </p>
                )}

                {pendingCelebiWishTarget && (
                  <div
                    className="celebi-wish-confirm-backdrop"
                    role="presentation"
                  >
                    <div
                      className="celebi-wish-confirm"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="celebi-wish-confirm-title"
                    >
                      <span aria-hidden="true">&#10023;</span>
                      <h3 id="celebi-wish-confirm-title">
                        Grant Future Wish to{' '}
                        {pendingCelebiWishTarget.name}?
                      </h3>
                      <p>This Pok&eacute;mon will receive +10 power.</p>
                      <div>
                        <button
                          className="game-button game-button-primary"
                          type="button"
                          disabled={isSavingCelebiWish}
                          onClick={() =>
                            handleAssignCelebiWish(
                              pendingCelebiWishTarget,
                            )
                          }
                        >
                          {isSavingCelebiWish
                            ? 'Granting...'
                            : 'Grant Wish'}
                        </button>
                        <button
                          className="game-button"
                          type="button"
                          disabled={isSavingCelebiWish}
                          onClick={() =>
                            setPendingCelebiWishTarget(null)
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {pendingJirachiWish?.playerUid === currentUser.uid &&
              !isJirachiAwakeningActive && (
              <section className="draft-state-panel jirachi-wish-panel">
                <div className="jirachi-wish-stars" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
                <header className="jirachi-wish-header">
                  <div className="jirachi-wish-source">
                    <span className="jirachi-constellation-ring" />
                    <img
                      src={getNormalPokemonImage({
                        id: pendingJirachiWish.sourcePokemonId,
                      })}
                      alt="Jirachi"
                      width="150"
                      height="150"
                    />
                  </div>
                  <div>
                    <p className="eyebrow">Celestial Destiny</p>
                    <h2>Jirachi Wish Maker</h2>
                    <p>
                      Choose one unused Pok&eacute;mon to receive a Divine
                      Blessing.
                    </p>
                  </div>
                </header>

                {validJirachiBlessingTargets.length > 0 ? (
                  <div className="jirachi-wish-options">
                    {validJirachiBlessingTargets.map((pokemon) => (
                      <button
                        className="jirachi-wish-card"
                        type="button"
                        key={pokemon.id}
                        disabled={isSavingJirachiBlessing}
                        onClick={() =>
                          setPendingJirachiBlessingTarget(pokemon)
                        }
                      >
                        <img
                          src={getNormalPokemonImage(pokemon)}
                          alt=""
                          width="140"
                          height="140"
                        />
                        <strong>{pokemon.name}</strong>
                        <span>Base Power {pokemon.score}</span>
                        <b>Divine Blessing +5 Power</b>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="jirachi-wish-empty">
                    <strong>No worthy wish remains.</strong>
                    <button
                      className="game-button"
                      type="button"
                      disabled={isSavingJirachiBlessing}
                      onClick={handleDismissJirachiWish}
                    >
                      Continue
                    </button>
                  </div>
                )}

                {jirachiBlessingError && (
                  <p className="battle-lock-error" role="alert">
                    {jirachiBlessingError}
                  </p>
                )}

                {pendingJirachiBlessingTarget && (
                  <div
                    className="jirachi-wish-confirm-backdrop"
                    role="presentation"
                  >
                    <div
                      className="jirachi-wish-confirm"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="jirachi-wish-confirm-title"
                    >
                      <span aria-hidden="true">&#10022;</span>
                      <h3 id="jirachi-wish-confirm-title">
                        Grant Divine Blessing to{' '}
                        {pendingJirachiBlessingTarget.name}?
                      </h3>
                      <p>This Pok&eacute;mon will receive +5 power.</p>
                      <div>
                        <button
                          className="game-button game-button-primary"
                          type="button"
                          disabled={isSavingJirachiBlessing}
                          onClick={() =>
                            handleAssignJirachiBlessing(
                              pendingJirachiBlessingTarget,
                            )
                          }
                        >
                          {isSavingJirachiBlessing
                            ? 'Granting...'
                            : 'Grant Wish'}
                        </button>
                        <button
                          className="game-button"
                          type="button"
                          disabled={isSavingJirachiBlessing}
                          onClick={() =>
                            setPendingJirachiBlessingTarget(null)
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {showFinalMatchScreen && (
              <section
                className={`champion-result-screen battle-arena-final-panel ${
                  currentPlayerWonMatch
                    ? 'is-victory'
                    : currentPlayerLostMatch
                      ? 'is-defeat'
                      : 'is-draw'
                } ${masterRoundResult ? 'is-master-finale' : ''}`}
              >
                <div className="champion-result-particles" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>

                <header className="champion-result-header">
                  <p>
                    {masterRoundResult
                      ? 'Master Round Decided the Match'
                      : 'Champion Decided'}
                  </p>
                  <h2>{finalMatchTitle}</h2>
                  <strong>{finalMatchMessage}</strong>
                </header>

                <div className="champion-result-score">
                  <span>You</span>
                  <div>
                    <small>Final Score</small>
                    <strong>
                      {yourScore} <b>-</b> {opponentScore}
                    </strong>
                  </div>
                  <span>Opponent</span>
                </div>

                {matchMvp && (
                  <div className="champion-mvp-card">
                    <div
                      className="champion-mvp-spotlight"
                      aria-hidden="true"
                    />
                    <div className="champion-mvp-art">
                      {matchMvp.image && (
                        <img
                          src={matchMvp.image}
                          alt={matchMvp.displayName}
                          width="280"
                          height="280"
                          onError={(event) => {
                            const fallbackImage = getNormalPokemonImage(
                              matchMvp.pokemon,
                            )

                            if (
                              fallbackImage &&
                              event.currentTarget.src !== fallbackImage
                            ) {
                              event.currentTarget.src = fallbackImage
                              return
                            }

                            event.currentTarget.hidden = true
                          }}
                        />
                      )}
                    </div>
                    <div className="champion-mvp-details">
                      <span>Match MVP</span>
                      <strong>{matchMvp.displayName}</strong>
                      <small>
                        {matchMvp.ownership}
                        {' / '}
                        {matchMvp.isMasterRound
                          ? 'Master Round'
                          : `Round ${matchMvp.order}`}
                      </small>
                      <b>
                        <span>Final Score</span>
                        {matchMvp.score}
                      </b>
                    </div>
                  </div>
                )}

                <div className="champion-match-summary">
                  <div>
                    <span>Rounds Won By You</span>
                    <strong>{yourScore}</strong>
                  </div>
                  <div>
                    <span>Rounds Won By Opponent</span>
                    <strong>{opponentScore}</strong>
                  </div>
                  <div>
                    <span>Final Reason</span>
                    <strong>
                      {battleState.matchOverReason ??
                        masterRoundResult?.reason ??
                        'Match complete.'}
                    </strong>
                  </div>
                </div>
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

            {isMasterRoundActivationScreen && (
              <section
                className={`master-round-activation-screen ${
                  currentPlayerMasterRoundReady
                    ? 'is-player-ready'
                    : ''
                } ${
                  isMasterRoundPortalActive ? 'is-portal-active' : ''
                }`}
                aria-labelledby="master-round-activation-title"
              >
                <div
                  className="master-round-activation-particles"
                  aria-hidden="true"
                >
                  {Array.from({ length: 18 }, (_, index) => (
                    <i
                      key={index}
                      style={{
                        '--activation-index': index,
                        '--activation-delay': `${(index % 6) * 120}ms`,
                      }}
                    />
                  ))}
                </div>
                <div
                  className="master-round-portal"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>

                <header className="master-round-activation-header">
                  <span aria-hidden="true">&#9876;</span>
                  <div>
                    <p>Final Showdown Begins</p>
                    <h2 id="master-round-activation-title">
                      Master Round Triggered
                    </h2>
                    <strong>
                      The battle has reached 3 - 3.
                    </strong>
                  </div>
                  <span aria-hidden="true">&#9876;</span>
                </header>

                <button
                  className="master-round-activation-button"
                  type="button"
                  disabled={
                    currentPlayerMasterRoundReady ||
                    isActivatingMasterRound
                  }
                  onClick={handleMasterRoundActivation}
                >
                  <span>Master Round</span>
                  <i aria-hidden="true" />
                </button>

                <div
                  className="master-round-activation-status"
                  role="status"
                  aria-live="polite"
                >
                  {isMasterRoundPortalActive ? (
                    <>
                      <strong>Portal Opening</strong>
                      <span>Entering the final battlefield...</span>
                    </>
                  ) : currentPlayerMasterRoundReady ? (
                    <>
                      <strong>You Are Ready</strong>
                      <span>Waiting for opponent...</span>
                    </>
                  ) : (
                    <>
                      <strong>
                        {isActivatingMasterRound
                          ? 'Charging...'
                          : 'Enter the Final Showdown'}
                      </strong>
                      <span>
                        Both trainers must activate the Master Round.
                      </span>
                    </>
                  )}
                </div>

                {masterRoundError && (
                  <p className="battle-lock-error" role="alert">
                    {masterRoundError}
                  </p>
                )}
              </section>
            )}

            {(isMasterRoundPending ||
              isMasterSelectionPortalActive) && (
              <section
                className={`master-selection-arena ${
                  masterRoundSelection ? 'is-locked' : ''
                } ${
                  isMasterSelectionPortalActive
                    ? 'is-portal-active'
                    : ''
                }`}
                aria-labelledby="master-selection-title"
              >
                <div
                  className="master-selection-flames"
                  aria-hidden="true"
                >
                  {Array.from({ length: 20 }, (_, index) => (
                    <i
                      key={index}
                      style={{
                        '--flame-index': index,
                        '--flame-delay': `${(index % 7) * 110}ms`,
                      }}
                    />
                  ))}
                </div>
                <div
                  className="master-selection-portal"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>

                <header className="master-selection-header">
                  <p>Final Destiny</p>
                  <h2 id="master-selection-title">
                    Master Round Selection
                  </h2>
                  <strong>
                    Only one choice decides the match.
                  </strong>
                </header>

                {!masterRoundSelection &&
                  masterRoundOptions.length === 3 && (
                  <div className="master-selection-pokeballs">
                    {masterRoundOptions.map((option, index) => (
                      <button
                        className="master-selection-pokeball"
                        type="button"
                        key={`${option.pokemonId}-${index}`}
                        disabled={isLockingMasterRound}
                        aria-label={`Choose hidden Pokeball ${index + 1}`}
                        onClick={() =>
                          handleMasterRoundOptionClick(option)
                        }
                      >
                        <span aria-hidden="true">
                          <i />
                        </span>
                        <small>Destiny {index + 1}</small>
                      </button>
                    ))}
                  </div>
                )}

                {!masterRoundSelection &&
                  masterRoundOptions.length !== 3 && (
                  <p className="master-selection-preparing">
                    Preparing final destiny Pok&eacute;balls...
                  </p>
                )}

                {masterRoundSelection && (
                  <div className="master-selection-locked">
                    <div className="master-selection-locked-choices">
                      {masterRoundOptions.map((option, index) => (
                        <div
                          className={`master-selection-locked-ball ${
                            String(option.pokemonId) ===
                            String(masterRoundSelection.pokemonId)
                              ? 'is-selected'
                              : 'is-dimmed'
                          }`}
                          key={`${option.pokemonId}-${index}-locked`}
                          aria-hidden="true"
                        >
                          <span />
                        </div>
                      ))}
                    </div>
                    <strong>
                      {isMasterSelectionPortalActive
                        ? 'Destinies Aligned'
                        : 'Final Choice Locked'}
                    </strong>
                    <span>
                      {isMasterSelectionPortalActive
                        ? 'Entering the Master Round...'
                        : 'Waiting for opponent...'}
                    </span>
                  </div>
                )}

                {masterRoundError && (
                  <p className="battle-lock-error" role="alert">
                    {masterRoundError}
                  </p>
                )}
              </section>
            )}

            {pendingMasterRoundOption && (
              <div
                className="master-selection-confirm-backdrop"
                role="presentation"
              >
                <section
                  className="master-selection-confirm"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="master-selection-confirm-title"
                >
                  <span aria-hidden="true">&#9876;</span>
                  <p>Final Destiny</p>
                  <h2 id="master-selection-confirm-title">
                    Are You Sure?
                  </h2>
                  <strong>This choice decides the match.</strong>
                  <div>
                    <button
                      className="master-selection-confirm-button"
                      type="button"
                      disabled={isLockingMasterRound}
                      onClick={handleConfirmMasterRoundSelection}
                    >
                      {isLockingMasterRound
                        ? 'Locking...'
                        : 'Confirm Destiny'}
                    </button>
                    <button
                      className="master-selection-cancel-button"
                      type="button"
                      disabled={isLockingMasterRound}
                      onClick={() =>
                        setPendingMasterRoundOption(null)
                      }
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              </div>
            )}

            {!isMasterRoundPending &&
              !isMasterRoundActivationScreen &&
              !isMasterSelectionPortalActive &&
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

            {(showBattleStage ||
              isBattleCountdownActive ||
              isMasterRoundAnnouncementActive) &&
              !showFinalMatchScreen && (
              <BattleStage
                roundNumber={masterRoundResult ? 'Master' : currentRound}
                yourTrainerScore={yourScore}
                opponentTrainerScore={opponentScore}
                yourPokemon={battleStageYourPokemon}
                opponentPokemon={battleStageOpponentPokemon}
                yourFinalScore={battleStageYourScore}
                opponentFinalScore={battleStageOpponentScore}
                yourTransformation={
                  !transformedSides.includes('your')
                    ? null
                    : yourTransformation
                }
                opponentTransformation={
                  !transformedSides.includes('opponent')
                    ? null
                    : opponentTransformation
                }
                winnerPokemon={battleStageWinnerPokemon}
                resultText={battleStageResultText}
                logs={battleStageLogs}
                yourTeamSlots={
                  isMasterRoundBattle ? [] : yourTeamSlots
                }
                opponentTeamSlots={
                  isMasterRoundBattle ? [] : opponentTeamSlots
                }
                arena={battleArena}
                masterRound={isMasterRoundBattle}
                showContinue={
                  hasFinalBattleResult ||
                  isTiedNormalRoundAwaitingContinue ||
                  (Boolean(savedRoundResult) &&
                    battlePhase === 'round_result' &&
                    currentRound < 6)
                }
                continueDisabled={
                  isContinuingRound ||
                  Boolean(pendingCelebiWish) ||
                  Boolean(pendingJirachiWish)
                }
                continueLabel={
                  hasFinalBattleResult
                    ? 'View Match Result'
                    : isContinuingRound
                    ? 'Continuing...'
                    : pendingCelebiWish
                      ? 'Resolve Celebi Future Wish'
                      : pendingJirachiWish
                        ? 'Resolve Jirachi Wish Maker'
                      : isTiedNormalRoundAwaitingContinue
                        ? 'Continue?'
                      : 'Continue to Next Round'
                }
                currentPlayerContinued={
                  Boolean(savedRoundResult) &&
                  !hasFinalBattleResult &&
                  (battlePhase === 'round_result' ||
                    isTiedNormalRoundAwaitingContinue) &&
                  currentPlayerContinued
                }
                onContinue={
                  hasFinalBattleResult
                    ? () =>
                        setViewedMatchResultKey(finalBattleResultKey)
                    : handleContinueRound
                }
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
                countdownBackdrop={
                  isBattleCountdownActive ||
                  isMasterRoundAnnouncementActive
                }
                entranceStep={battleEntranceStep}
                teamsVisible={battleTeamsVisible}
                activeAnalysisSide={activeAnalysisSide}
                notification={battleNotification}
                revealedScoreSides={revealedScoreSides}
                showScoreComparison={showScoreComparison}
                showWinner={showBattleWinner}
                showVictoryCelebration={showVictoryCelebration}
                presentationComplete={
                  presentationCompletedRound === battleStageKey
                }
              />
            )}

          </>
        )}

      </section>

      {isBattleCountdownActive && (
        <div
          className={`battle-countdown-overlay ${
            countdownValue === '1' ? 'is-one' : ''
          } ${countdownValue === 'GO!' ? 'is-go' : ''} ${
            isMasterRoundBattle ? 'is-master-round' : ''
          }`}
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

      {isMasterRoundAnnouncementActive && (
        <div
          className={`master-round-announcement is-${battleArena.id}`}
          role="status"
          aria-live="assertive"
          aria-label="Master Round. Final showdown."
        >
          <div className="master-round-announcement-energy" />
          <span aria-hidden="true">&#9876;</span>
          <div>
            <small>Final Showdown</small>
            <strong>Master Round</strong>
          </div>
          <span aria-hidden="true">&#9876;</span>
        </div>
      )}

      {isJirachiAwakeningActive && (
        <div
          className="jirachi-awakening-cinematic"
          role="status"
          aria-live="assertive"
          aria-label="Jirachi Wish Maker awakened"
        >
          <div className="jirachi-cosmic-ring" aria-hidden="true" />
          <div className="jirachi-cinematic-stars" aria-hidden="true">
            {Array.from({ length: 20 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <img
            src={getNormalPokemonImage({ id: 385 })}
            alt=""
            width="280"
            height="280"
          />
          <strong>Wish Maker Awakened</strong>
        </div>
      )}

      {grantedCelebiWish && (
        <div
          className="celebi-wish-cinematic"
          role="status"
          aria-live="assertive"
          aria-label={`Future Wish granted to ${grantedCelebiWish.pokemon.name}`}
        >
          <div className="celebi-wish-cinematic-circle" aria-hidden="true" />
          <div className="celebi-wish-cinematic-particles" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="celebi-wish-cinematic-pokemon">
            <img
              className="is-celebi"
              src={getNormalPokemonImage({ id: 251 })}
              alt=""
              width="230"
              height="230"
            />
            <span aria-hidden="true" />
            <img
              className="is-target"
              src={getNormalPokemonImage(grantedCelebiWish.pokemon)}
              alt={grantedCelebiWish.pokemon.name}
              width="280"
              height="280"
            />
          </div>
          <div className="celebi-wish-cinematic-copy">
            <span>Future Wish Granted</span>
            <strong>+{grantedCelebiWish.amount} Power</strong>
            <small>{grantedCelebiWish.pokemon.name}</small>
          </div>
        </div>
      )}

      {grantedJirachiBlessing && (
        <div
          className="jirachi-blessing-cinematic"
          role="status"
          aria-live="assertive"
          aria-label={`Divine Blessing granted to ${grantedJirachiBlessing.pokemon.name}`}
        >
          <div className="jirachi-cosmic-ring" aria-hidden="true" />
          <div className="jirachi-cinematic-stars" aria-hidden="true">
            {Array.from({ length: 20 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="jirachi-blessing-pokemon">
            <img
              className="is-jirachi"
              src={getNormalPokemonImage({ id: 385 })}
              alt=""
              width="230"
              height="230"
            />
            <span aria-hidden="true" />
            <img
              className="is-target"
              src={getNormalPokemonImage(
                grantedJirachiBlessing.pokemon,
              )}
              alt={grantedJirachiBlessing.pokemon.name}
              width="280"
              height="280"
            />
          </div>
          <div className="jirachi-blessing-copy">
            <span>Divine Blessing Granted</span>
            <strong>+{grantedJirachiBlessing.amount} Power</strong>
            <small>{grantedJirachiBlessing.pokemon.name}</small>
          </div>
        </div>
      )}

      {isTransformationCinematicActive &&
        !showFinalMatchScreen && (
          <div
            className={`mega-cinematic-overlay ${
              activeTransformationEvent.succeeded
                ? 'is-success'
                : 'is-failure'
            } is-${activeTransformationEvent.type} ${
              activeTransformationEvent.type === 'god-killer'
                ? activeTransformationEvent.pokemonName === 'Rayquaza'
                  ? 'is-emerald-god'
                  : 'is-light-devourer'
                : ''
            } ${
              isMasterRoundBattle ? 'is-master-round' : ''
            }`}
            role="status"
            aria-live="assertive"
            aria-label={`${getTransformationPresentation(activeTransformationEvent).title} ${activeTransformationEvent.succeeded ? 'succeeded' : 'failed'} for ${activeTransformationEvent.pokemonName}`}
            key={`${battleStageKey}-${transformationCinematicIndex}`}
          >
            {activeTransformationEvent.type === 'god-killer' && (
              <>
                <div
                  className="god-killer-distortion"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </div>
                <div className="god-killer-cracks" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
                <div className="god-killer-storm" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
              </>
            )}
            <div className="mega-cinematic-energy" aria-hidden="true" />
            <p className="mega-cinematic-title">
              {
                getTransformationPresentation(
                  activeTransformationEvent,
                ).title
              }
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
            {activeTransformationEvent.type === 'god-killer' &&
              !activeTransformationEvent.succeeded && (
                <span className="god-killer-rejection">
                  {activeTransformationEvent.pokemonName === 'Necrozma'
                    ? 'Divine Ascension Failed'
                    : 'God Killer Rejected'}
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
            {activeTransformationEvent.succeeded
              ? getTransformationPresentation(
                  activeTransformationEvent,
                ).success
              : getTransformationPresentation(
                  activeTransformationEvent,
                ).failed}
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
