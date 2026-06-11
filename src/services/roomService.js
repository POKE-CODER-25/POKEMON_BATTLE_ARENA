import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import {
  fanFavouriteAPool,
  fanFavouriteBPool,
  legendaryPools,
  pseudoLegendaryPool,
  starterPools,
  supportPool,
} from '../data/draftPools.js'
import { resolveBattleRound } from '../data/battleRoundResolver.js'
import { getJirachiCopyableTraits } from '../data/advancedTraitInteractionResolver.js'
import { DRAFT_ROUND_NAMES } from '../data/draftTeamStructure.js'
import { createMasterRoundOptions } from '../data/masterRoundSelector.js'
import { allBattlePokemon } from '../data/pokemonBattleData.js'
import { db } from '../firebase.js'

const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5
const TOTAL_DRAFT_ROUNDS = 6
const RECONNECT_TIMEOUT_MS = 2 * 60 * 1000

export { DRAFT_ROUND_NAMES }

const RESUMABLE_ROOM_STATUSES = new Set([
  'draft',
  'battle_setup',
])

function getTimestampMillis(value) {
  if (typeof value?.toMillis === 'function') {
    return value.toMillis()
  }

  return 0
}

function getResumeRoute(roomCode, room) {
  if (['waiting', 'ready'].includes(room.status)) {
    return `/room/${roomCode}`
  }

  if (['draft', 'battle_ready'].includes(room.status)) {
    return `/draft/${roomCode}`
  }

  return `/battle/${roomCode}`
}

const NON_RESUMABLE_PRESENCE_STATUSES = new Set([
  'left',
  'surrendered',
  'afk_lost',
])

function isRoomClosed(room) {
  return room.status === 'closed' || room.roomStatus === 'closed'
}

async function closeRoomIfBothPlayersReturned(roomCode) {
  const roomReference = doc(db, 'rooms', roomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  await runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists() || !battleStateSnapshot.exists()) {
      return
    }

    const room = roomSnapshot.data()
    const returnedHome =
      battleStateSnapshot.data().postMatch?.returnedHome ?? {}
    const bothReturnedHome =
      Boolean(returnedHome[room.hostUid]) &&
      Boolean(returnedHome[room.guestUid])

    if (bothReturnedHome && !isRoomClosed(room)) {
      transaction.update(roomReference, {
        status: 'closed',
        updatedAt: serverTimestamp(),
      })
    }
  })
}

export async function findActiveRoomForUser(playerUid) {
  if (!playerUid) {
    return null
  }

  const roomsReference = collection(db, 'rooms')
  const [hostRoomsSnapshot, guestRoomsSnapshot] = await Promise.all([
    getDocs(query(roomsReference, where('hostUid', '==', playerUid))),
    getDocs(query(roomsReference, where('guestUid', '==', playerUid))),
  ])
  const roomSnapshots = new Map()

  ;[...hostRoomsSnapshot.docs, ...guestRoomsSnapshot.docs].forEach(
    (roomSnapshot) => {
      roomSnapshots.set(roomSnapshot.id, roomSnapshot)
    },
  )

  const candidates = [...roomSnapshots.values()]
    .map((roomSnapshot) => ({
      roomCode: roomSnapshot.id,
      room: roomSnapshot.data(),
    }))
    .filter(({ room }) => !isRoomClosed(room))
    .filter(({ room }) => RESUMABLE_ROOM_STATUSES.has(room.status))
    .filter(({ room }) => Boolean(room.players?.[playerUid]))
    .filter(({ room }) => room.players[playerUid].active !== false)
    .filter(
      ({ room }) =>
        !NON_RESUMABLE_PRESENCE_STATUSES.has(
          room.presence?.[playerUid]?.status,
        ),
    )
    .sort(
      (candidateA, candidateB) =>
        getTimestampMillis(candidateB.room.updatedAt) -
        getTimestampMillis(candidateA.room.updatedAt),
    )

  for (const candidate of candidates) {
    const battleStateSnapshot = await getDoc(
      doc(db, 'rooms', candidate.roomCode, 'battle', 'state'),
    )
    const battleState = battleStateSnapshot.exists()
      ? battleStateSnapshot.data()
      : null
    const returnedHome = Boolean(
      battleState?.postMatch?.returnedHome?.[playerUid],
    )
    const currentPlayerSurrendered =
      battleState?.surrender?.surrenderedBy === playerUid
    const bothReturnedHome =
      Boolean(
        battleState?.postMatch?.returnedHome?.[candidate.room.hostUid],
      ) &&
      Boolean(
        battleState?.postMatch?.returnedHome?.[candidate.room.guestUid],
      )

    if (bothReturnedHome) {
      await closeRoomIfBothPlayersReturned(candidate.roomCode)
    }

    if (returnedHome || currentPlayerSurrendered) {
      continue
    }

    return {
      roomCode: candidate.roomCode,
      route: getResumeRoute(candidate.roomCode, candidate.room),
      status: candidate.room.status,
    }
  }

  return null
}

function shuffle(items) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ]
  }

  return shuffled
}

function generateInitialStarterOptions() {
  const hostOptions = []
  const guestOptions = []

  Object.entries(starterPools).forEach(([element, pool]) => {
    const [hostPokemon, guestPokemon] = shuffle(pool)
    hostOptions.push({ ...hostPokemon, element })
    guestOptions.push({ ...guestPokemon, element })
  })

  return {
    hostOptions: shuffle(hostOptions),
    guestOptions: shuffle(guestOptions),
  }
}

function getRolePool(pool, role) {
  const parity = role === 'host' ? 0 : 1
  return pool.filter((_, index) => index % 2 === parity)
}

function chooseFromPool(pool, excludedIds, count = 3) {
  const available = pool.filter((pokemon) => !excludedIds.has(pokemon.id))

  if (available.length < count) {
    throw new Error('Not enough Pokemon remain for this draft round.')
  }

  return shuffle(available).slice(0, count)
}

function generateLegendaryOptions(role, pickedIds) {
  const options = ['S', 'A', 'B'].map((tier) => {
    const rolePool = getRolePool(legendaryPools[tier], role)
    return chooseFromPool(rolePool, pickedIds, 1)[0]
  })

  return shuffle(options)
}

function generatePlayerOptions(round, draftTeam, role) {
  const pickedIds = new Set((draftTeam.picks || []).map((pick) => pick.id))

  if (round === 5) {
    return generateLegendaryOptions(role, pickedIds)
  }

  const roundPools = {
    2: supportPool,
    3: fanFavouriteAPool,
    4: pseudoLegendaryPool,
    6: fanFavouriteBPool,
  }

  return chooseFromPool(
    getRolePool(roundPools[round], role),
    pickedIds,
  )
}

function createOptionDocument(uid, round, options, timestamp) {
  return {
    uid,
    round,
    options,
    selectedPokemon: null,
    selectedIndex: null,
    locked: false,
    createdAt: timestamp,
  }
}

export function generateRoomCode() {
  let roomCode = ''

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)
    roomCode += ROOM_CODE_CHARACTERS[randomIndex]
  }

  return roomCode
}

export async function createRoom(currentUser, userProfile) {
  if (!currentUser) {
    throw new Error('You must be logged in to create a room.')
  }

  const username = userProfile?.username?.trim()

  if (!userProfile) {
    throw new Error('Your trainer profile is not available.')
  }

  if (!username) {
    throw new Error('Your trainer profile is missing a username.')
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const roomCode = generateRoomCode()
    const roomReference = doc(db, 'rooms', roomCode)

    const wasCreated = await runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomReference)

      if (roomSnapshot.exists()) {
        return false
      }

      const timestamp = serverTimestamp()

      transaction.set(roomReference, {
        roomCode,
        status: 'waiting',
        hostUid: currentUser.uid,
        hostUsername: username,
        guestUid: null,
        guestUsername: null,
        players: {
          [currentUser.uid]: {
            uid: currentUser.uid,
            username,
            role: 'host',
            ready: false,
            joinedAt: timestamp,
          },
        },
        presence: {
          [currentUser.uid]: {
            status: 'online',
            lastSeen: timestamp,
            reconnectDeadline: null,
          },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      return true
    })

    if (wasCreated) {
      return roomCode
    }
  }

  throw new Error('Could not generate a unique room code. Please try again.')
}

export async function joinRoom(roomCode, currentUser, userProfile) {
  const normalizedRoomCode = roomCode.trim().toUpperCase()

  if (!normalizedRoomCode) {
    throw new Error('Enter a room code.')
  }

  if (!currentUser) {
    throw new Error('You must be logged in to join a room.')
  }

  const username = userProfile?.username?.trim()

  if (!userProfile) {
    throw new Error('Your trainer profile is not available.')
  }

  if (!username) {
    throw new Error('Your trainer profile is missing a username.')
  }

  const roomReference = doc(db, 'rooms', normalizedRoomCode)

  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()

    if (room.status !== 'waiting') {
      throw new Error('Room already started')
    }

    if (room.hostUid === currentUser.uid) {
      throw new Error('You cannot join your own room as a guest')
    }

    if (room.guestUid) {
      throw new Error('Room is full')
    }

    transaction.update(roomReference, {
      guestUid: currentUser.uid,
      guestUsername: username,
      [`players.${currentUser.uid}`]: {
        uid: currentUser.uid,
        username,
        role: 'guest',
        ready: false,
        joinedAt: serverTimestamp(),
      },
      [`presence.${currentUser.uid}`]: {
        status: 'online',
        lastSeen: serverTimestamp(),
        reconnectDeadline: null,
      },
      updatedAt: serverTimestamp(),
    })
  })

  return normalizedRoomCode
}

export async function leavePreGameRoom({ roomCode, playerUid }) {
  if (!roomCode || !playerUid) {
    throw new Error('Room and player are required to leave the lobby.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (!['waiting', 'ready', 'closed'].includes(room.status)) {
      throw new Error('This room has already started.')
    }

    const timestamp = serverTimestamp()

    transaction.update(roomReference, {
      status: 'closed',
      [`players.${playerUid}.active`]: false,
      [`players.${playerUid}.ready`]: false,
      [`presence.${playerUid}`]: {
        status: 'left',
        lastSeen: timestamp,
        reconnectDeadline: null,
      },
      updatedAt: timestamp,
    })

    return 'closed'
  })
}

export async function markPlayerOnline({ roomCode, playerUid }) {
  if (!roomCode || !playerUid) {
    return
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())

  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      return
    }

    const room = roomSnapshot.data()
    const presenceStatus = room.presence?.[playerUid]?.status

    if (
      room.status === 'closed' ||
      room.players?.[playerUid]?.active === false ||
      ['left', 'surrendered', 'afk_lost'].includes(presenceStatus)
    ) {
      return
    }

    transaction.update(roomReference, {
      [`presence.${playerUid}`]: {
        status: 'online',
        lastSeen: serverTimestamp(),
        reconnectDeadline: null,
      },
    })
  })
}

export async function markPlayerReconnecting({ roomCode, playerUid }) {
  if (!roomCode || !playerUid) {
    return
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())
  const now = Date.now()

  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      return
    }

    const room = roomSnapshot.data()
    const presenceStatus = room.presence?.[playerUid]?.status

    if (
      room.status === 'closed' ||
      room.players?.[playerUid]?.active === false ||
      ['left', 'surrendered', 'afk_lost'].includes(presenceStatus)
    ) {
      return
    }

    transaction.update(roomReference, {
      [`presence.${playerUid}`]: {
        status: 'reconnecting',
        lastSeen: Timestamp.fromMillis(now),
        reconnectDeadline: Timestamp.fromMillis(
          now + RECONNECT_TIMEOUT_MS,
        ),
      },
    })
  })
}

export async function finalizeAfkWin({
  roomCode,
  winnerUid,
  afkPlayerUid,
}) {
  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.exists()
      ? battleStateSnapshot.data()
      : null

    if (
      !room.players?.[winnerUid] ||
      !room.players?.[afkPlayerUid]
    ) {
      throw new Error('AFK player data is invalid.')
    }

    if (battleState?.phase === 'match_over') {
      return false
    }

    if (
      room.players[afkPlayerUid].active === false ||
      battleState?.surrender?.surrenderedBy === afkPlayerUid ||
      battleState?.postMatch?.returnedHome?.[afkPlayerUid]
    ) {
      return false
    }

    const winnerPresence = room.presence?.[winnerUid]
    const afkPresence = room.presence?.[afkPlayerUid]
    const deadlineMillis = getTimestampMillis(
      afkPresence?.reconnectDeadline,
    )

    if (
      winnerPresence?.status !== 'online' ||
      afkPresence?.status !== 'reconnecting' ||
      !deadlineMillis ||
      deadlineMillis > Date.now()
    ) {
      return false
    }

    const timestamp = serverTimestamp()
    const nextBattleState = battleState ?? createInitialBattleState(
      timestamp,
      room.hostUid,
      room.guestUid,
    )

    transaction.update(roomReference, {
      status: 'battle_setup',
      [`presence.${afkPlayerUid}`]: {
        ...afkPresence,
        status: 'afk_lost',
        reconnectDeadline: null,
      },
      updatedAt: timestamp,
    })
    transaction.set(battleStateReference, {
      ...nextBattleState,
      phase: 'match_over',
      matchWinnerUid: winnerUid,
      matchOverReason: 'Opponent was AFK for more than 2 minutes.',
      pendingCelebiWish: null,
      updatedAt: timestamp,
    })

    return true
  })
}

export async function togglePlayerReady(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to change ready status.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())

  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const currentPlayer = room.players?.[currentUser.uid]

    if (!currentPlayer) {
      throw new Error('You are not a player in this room.')
    }

    if (!['waiting', 'ready'].includes(room.status)) {
      throw new Error('Ready status cannot be changed after the draft starts.')
    }

    const nextReady = !currentPlayer.ready
    const hostReady =
      room.hostUid === currentUser.uid
        ? nextReady
        : Boolean(room.players?.[room.hostUid]?.ready)
    const guestReady =
      room.guestUid === currentUser.uid
        ? nextReady
        : Boolean(room.players?.[room.guestUid]?.ready)

    transaction.update(roomReference, {
      [`players.${currentUser.uid}.ready`]: nextReady,
      status: room.guestUid && hostReady && guestReady ? 'ready' : 'waiting',
      updatedAt: serverTimestamp(),
    })
  })
}

export async function startDraft(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to start the draft.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())

  await runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const hostReady = Boolean(room.players?.[room.hostUid]?.ready)
    const guestReady = Boolean(room.players?.[room.guestUid]?.ready)

    if (room.hostUid !== currentUser.uid) {
      throw new Error('Only the host can start the draft.')
    }

    if (room.status !== 'ready' || !hostReady || !guestReady) {
      throw new Error('Both trainers must be ready before starting the draft.')
    }

    const timestamp = serverTimestamp()
    const { hostOptions, guestOptions } = generateInitialStarterOptions()

    transaction.update(roomReference, {
      status: 'draft',
      draft: {
        totalRounds: TOTAL_DRAFT_ROUNDS,
        phase: 'active',
        completedPlayers: [],
        startedAt: timestamp,
        updatedAt: timestamp,
      },
      teams: {
        [room.hostUid]: [],
        [room.guestUid]: [],
      },
      updatedAt: timestamp,
    })
    transaction.set(doc(roomReference, 'draftTeams', room.hostUid), {
      uid: room.hostUid,
      picks: [],
      currentRound: 1,
      completed: false,
      updatedAt: timestamp,
    })
    transaction.set(doc(roomReference, 'draftTeams', room.guestUid), {
      uid: room.guestUid,
      picks: [],
      currentRound: 1,
      completed: false,
      updatedAt: timestamp,
    })
    transaction.set(
      doc(roomReference, 'draftOptions', room.hostUid),
      createOptionDocument(room.hostUid, 1, hostOptions, timestamp),
    )
    transaction.set(
      doc(roomReference, 'draftOptions', room.guestUid),
      createOptionDocument(room.guestUid, 1, guestOptions, timestamp),
    )

    console.info(`Generated Round 1 options for room ${room.roomCode}`)
  })
}

export async function lockDraftPick(roomCode, currentUser, selectedIndex) {
  if (!currentUser) {
    throw new Error('You must be logged in to choose a Pokemon.')
  }

  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 2) {
    throw new Error('Invalid Pokeball choice.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())
  const optionsReference = doc(
    roomReference,
    'draftOptions',
    currentUser.uid,
  )
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    currentUser.uid,
  )

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const optionsSnapshot = await transaction.get(optionsReference)
    const draftTeamSnapshot = await transaction.get(draftTeamReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!optionsSnapshot.exists() || !draftTeamSnapshot.exists()) {
      throw new Error('Draft state is not ready.')
    }

    const room = roomSnapshot.data()
    const optionData = optionsSnapshot.data()
    const draftTeam = draftTeamSnapshot.data()

    if (!room.players?.[currentUser.uid]) {
      throw new Error('You are not a player in this room.')
    }

    if (room.status !== 'draft' || draftTeam.completed) {
      throw new Error('Draft selection is no longer active.')
    }

    if (optionData.round !== draftTeam.currentRound) {
      throw new Error('These options belong to a different round.')
    }

    if (optionData.locked) {
      return optionData.selectedPokemon
    }

    const selectedPokemon = optionData.options?.[selectedIndex]

    if (!selectedPokemon) {
      throw new Error('Invalid Pokeball choice.')
    }

    if (draftTeam.picks.some((pick) => pick.id === selectedPokemon.id)) {
      throw new Error('This Pokemon is already on your team.')
    }

    const timestamp = serverTimestamp()
    const nextPicks = [
      ...draftTeam.picks,
      {
        ...selectedPokemon,
        round: draftTeam.currentRound,
        roundName: DRAFT_ROUND_NAMES[draftTeam.currentRound],
      },
    ]
    const currentTeamMarkers = room.teams?.[currentUser.uid] || []

    transaction.update(optionsReference, {
      selectedPokemon,
      selectedIndex,
      locked: true,
      lockedAt: timestamp,
    })
    transaction.update(draftTeamReference, {
      picks: nextPicks,
      updatedAt: timestamp,
    })
    transaction.update(roomReference, {
      [`teams.${currentUser.uid}`]: [
        ...currentTeamMarkers,
        { round: draftTeam.currentRound, locked: true },
      ],
      'draft.updatedAt': timestamp,
      updatedAt: timestamp,
    })

    return selectedPokemon
  })
}

export async function advancePlayerDraft(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to continue drafting.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())
  const optionsReference = doc(
    roomReference,
    'draftOptions',
    currentUser.uid,
  )
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    currentUser.uid,
  )

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const optionsSnapshot = await transaction.get(optionsReference)
    const draftTeamSnapshot = await transaction.get(draftTeamReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!optionsSnapshot.exists() || !draftTeamSnapshot.exists()) {
      throw new Error('Draft state is not ready.')
    }

    const room = roomSnapshot.data()
    const optionData = optionsSnapshot.data()
    const draftTeam = draftTeamSnapshot.data()

    if (room.status !== 'draft' || draftTeam.completed) {
      throw new Error('Draft progression is no longer active.')
    }

    if (!optionData.locked || optionData.round !== draftTeam.currentRound) {
      throw new Error('Choose a Pokeball before continuing.')
    }

    if (draftTeam.picks.length >= TOTAL_DRAFT_ROUNDS) {
      throw new Error('Your team is already complete.')
    }

    const nextRound = draftTeam.currentRound + 1
    const role = room.hostUid === currentUser.uid ? 'host' : 'guest'
    const nextOptions = generatePlayerOptions(nextRound, draftTeam, role)
    const timestamp = serverTimestamp()

    transaction.set(
      optionsReference,
      createOptionDocument(
        currentUser.uid,
        nextRound,
        nextOptions,
        timestamp,
      ),
    )
    transaction.update(draftTeamReference, {
      currentRound: nextRound,
      updatedAt: timestamp,
    })
    transaction.update(roomReference, {
      'draft.updatedAt': timestamp,
      updatedAt: timestamp,
    })

    console.info(
      `Generated Round ${nextRound} options for player ${currentUser.uid}`,
    )
    return nextRound
  })
}

export async function completePlayerDraft(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to finish drafting.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    currentUser.uid,
  )
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const draftTeamSnapshot = await transaction.get(draftTeamReference)
    const battleStateSnapshot = await transaction.get(battleStateReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!draftTeamSnapshot.exists()) {
      throw new Error('Draft team not found.')
    }

    const room = roomSnapshot.data()
    const draftTeam = draftTeamSnapshot.data()

    if (draftTeam.picks.length !== TOTAL_DRAFT_ROUNDS) {
      throw new Error('Complete all six picks before continuing.')
    }

    if (draftTeam.completed) {
      return room.status
    }

    const completedPlayers = room.draft?.completedPlayers || []
    const nextCompletedPlayers = completedPlayers.includes(currentUser.uid)
      ? completedPlayers
      : [...completedPlayers, currentUser.uid]
    const bothCompleted =
      nextCompletedPlayers.includes(room.hostUid) &&
      nextCompletedPlayers.includes(room.guestUid)
    const timestamp = serverTimestamp()

    transaction.update(draftTeamReference, {
      completed: true,
      updatedAt: timestamp,
    })
    transaction.update(roomReference, {
      status: bothCompleted ? 'battle_setup' : 'draft',
      'draft.completedPlayers': nextCompletedPlayers,
      'draft.phase': bothCompleted ? 'complete' : 'active',
      'draft.updatedAt': timestamp,
      updatedAt: timestamp,
    })

    if (bothCompleted && !battleStateSnapshot.exists()) {
      transaction.set(
        battleStateReference,
        createInitialBattleState(timestamp, room.hostUid, room.guestUid),
      )
    } else if (bothCompleted) {
      const backfill = getBattleStateBackfill(
        battleStateSnapshot.data(),
        room,
      )

      if (Object.keys(backfill).length > 0) {
        transaction.update(battleStateReference, {
          ...backfill,
          updatedAt: timestamp,
        })
      }
    }

    return bothCompleted ? 'battle_setup' : 'draft'
  })
}

export async function markPlayerBattleReady(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to enter the battle arena.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const battleStateSnapshot = await transaction.get(battleStateReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()

    if (!room.players?.[currentUser.uid]) {
      throw new Error('You are not a player in this room.')
    }

    if (!['battle_ready', 'battle_setup'].includes(room.status)) {
      throw new Error('The battle-ready screen is not active.')
    }

    if (room.status === 'battle_setup') {
      const timestamp = serverTimestamp()

      if (!battleStateSnapshot.exists()) {
        transaction.set(
          battleStateReference,
          createInitialBattleState(timestamp, room.hostUid, room.guestUid),
        )
      } else {
        const backfill = getBattleStateBackfill(
          battleStateSnapshot.data(),
          room,
        )

        if (Object.keys(backfill).length > 0) {
          transaction.update(battleStateReference, {
            ...backfill,
            updatedAt: timestamp,
          })
        }
      }

      return 'battle_setup'
    }

    const isHost = room.hostUid === currentUser.uid
    const hostReady = isHost
      ? true
      : Boolean(room.battleReady?.hostReady)
    const guestReady = isHost
      ? Boolean(room.battleReady?.guestReady)
      : true
    const bothReady = hostReady && guestReady
    const timestamp = serverTimestamp()

    transaction.update(roomReference, {
      status: bothReady ? 'battle_setup' : 'battle_ready',
      battleReady: {
        hostReady,
        guestReady,
      },
      updatedAt: timestamp,
    })

    if (bothReady && !battleStateSnapshot.exists()) {
      transaction.set(
        battleStateReference,
        createInitialBattleState(timestamp, room.hostUid, room.guestUid),
      )
    } else if (bothReady) {
      const backfill = getBattleStateBackfill(
        battleStateSnapshot.data(),
        room,
      )

      if (Object.keys(backfill).length > 0) {
        transaction.update(battleStateReference, {
          ...backfill,
          updatedAt: timestamp,
        })
      }
    }

    return bothReady ? 'battle_setup' : 'battle_ready'
  })
}

function getBattleStateBackfill(battleState, room) {
  const backfill = {}

  if (battleState.currentRound === undefined) {
    backfill.currentRound = battleState.round ?? 1
  }

  if (!battleState.selections) {
    backfill.selections = {}
  }

  if (!battleState.usedPokemon) {
    backfill.usedPokemon = {
      [room.hostUid]: battleState.hostUsedPokemon ?? [],
      [room.guestUid]: battleState.guestUsedPokemon ?? [],
    }
  }

  if (!battleState.playerScores) {
    backfill.playerScores = {
      [room.hostUid]: battleState.hostScore ?? 0,
      [room.guestUid]: battleState.guestScore ?? 0,
    }
  }

  if (!battleState.roundResults) {
    backfill.roundResults = []
  }

  if (!battleState.roundContinue) {
    backfill.roundContinue = {}
  }

  if (!battleState.jirachiCopies) {
    backfill.jirachiCopies = {}
  }

  if (!battleState.celebiWishes) {
    backfill.celebiWishes = {}
  }

  if (battleState.pendingCelebiWish === undefined) {
    backfill.pendingCelebiWish = null
  }

  if (battleState.surrender === undefined) {
    backfill.surrender = null
  }

  if (!battleState.postMatch) {
    backfill.postMatch = {
      playAgainRequests: {},
      returnedHome: {},
      status: 'idle',
    }
  }

  if (battleState.matchWinnerUid === undefined) {
    backfill.matchWinnerUid = null
  }

  if (battleState.matchOverReason === undefined) {
    backfill.matchOverReason = null
  }

  if (!battleState.phase) {
    backfill.phase = 'choose_pokemon'
  }

  return backfill
}

export async function lockBattlePokemon(roomCode, playerUid, pokemon) {
  if (!playerUid) {
    throw new Error('You must be logged in to lock a fighter.')
  }

  if (!pokemon?.id || !pokemon?.name) {
    throw new Error('Choose a valid Pokemon before locking.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    playerUid,
  )

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot, draftTeamSnapshot] =
      await Promise.all([
        transaction.get(roomReference),
        transaction.get(battleStateReference),
        transaction.get(draftTeamReference),
      ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    if (!draftTeamSnapshot.exists()) {
      throw new Error('Draft team not found.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const draftTeam = draftTeamSnapshot.data()

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (room.status !== 'battle_setup') {
      throw new Error('The battle arena is not ready for selection.')
    }

    if ((battleState.phase ?? 'choose_pokemon') !== 'choose_pokemon') {
      throw new Error('Pokemon selection is closed for this round.')
    }

    if (battleState.selections?.[playerUid]) {
      throw new Error('Your fighter is already locked for this round.')
    }

    const selectedPokemon = (draftTeam.picks ?? []).find(
      (teamPokemon) => String(teamPokemon.id) === String(pokemon.id),
    )

    if (!selectedPokemon) {
      throw new Error('That Pokemon is not part of your drafted team.')
    }

    const isHost = room.hostUid === playerUid
    const legacyUsedPokemon = isHost
      ? battleState.hostUsedPokemon
      : battleState.guestUsedPokemon
    const usedPokemon =
      battleState.usedPokemon?.[playerUid] ?? legacyUsedPokemon ?? []
    const isAlreadyUsed = usedPokemon.some((usedPokemonEntry) => {
      const usedPokemonId =
        typeof usedPokemonEntry === 'object'
          ? usedPokemonEntry?.id ?? usedPokemonEntry?.pokemonId
          : usedPokemonEntry

      return String(usedPokemonId) === String(selectedPokemon.id)
    })

    if (isAlreadyUsed) {
      throw new Error('That Pokemon has already battled.')
    }

    const timestamp = serverTimestamp()
    const backfill = getBattleStateBackfill(battleState, room)

    delete backfill.selections

    transaction.update(battleStateReference, {
      ...backfill,
      [`selections.${playerUid}`]: {
        pokemonId: selectedPokemon.id,
        pokemonName: selectedPokemon.name,
        lockedAt: timestamp,
      },
      updatedAt: timestamp,
    })

    return selectedPokemon.id
  })
}

export async function saveJirachiCopy({
  roomCode,
  playerUid,
  sourcePokemonId,
  traitName,
}) {
  if (!playerUid || !traitName) {
    throw new Error('Choose a valid teammate trait for Jirachi.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    playerUid,
  )

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot, draftTeamSnapshot] =
      await Promise.all([
        transaction.get(roomReference),
        transaction.get(battleStateReference),
        transaction.get(draftTeamReference),
      ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    if (!draftTeamSnapshot.exists()) {
      throw new Error('Draft team not found.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const team = draftTeamSnapshot.data().picks ?? []

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (!team.some((pokemon) => pokemon.name === 'Jirachi')) {
      throw new Error('Jirachi is not part of your drafted team.')
    }

    if (battleState.phase === 'match_over') {
      throw new Error('Jirachi selection is closed.')
    }

    if (battleState.jirachiCopies?.[playerUid]) {
      throw new Error("Jirachi's copied trait is already locked.")
    }

    const selectedTrait = getJirachiCopyableTraits(team).find(
      (option) =>
        String(option.sourcePokemon?.id) === String(sourcePokemonId) &&
        option.traitName === traitName,
    )

    if (!selectedTrait) {
      throw new Error('That trait cannot be copied by Jirachi.')
    }

    const timestamp = serverTimestamp()
    const savedCopy = {
      sourcePokemonId: selectedTrait.sourcePokemon.id,
      sourcePokemonName: selectedTrait.sourcePokemonName,
      traitName: selectedTrait.traitName,
      normalBonus: selectedTrait.normalBonus ?? null,
      masterRoundBonus: selectedTrait.masterRoundBonus ?? null,
      selectedAt: timestamp,
    }

    transaction.update(battleStateReference, {
      jirachiCopies: {
        ...(battleState.jirachiCopies ?? {}),
        [playerUid]: savedCopy,
      },
      updatedAt: timestamp,
    })

    return savedCopy
  })
}

function getPokemonId(entry) {
  return typeof entry === 'object'
    ? entry?.id ?? entry?.pokemonId
    : entry
}

function findAvailableCelebiWishTargets({
  team,
  usedPokemon,
  existingWishes,
}) {
  const usedIds = new Set(
    usedPokemon.map((entry) => String(getPokemonId(entry))),
  )
  const blessedIds = new Set(
    existingWishes.map((wish) => String(wish.targetPokemonId)),
  )

  return team.filter(
    (pokemon) =>
      pokemon.name !== 'Celebi' &&
      !usedIds.has(String(pokemon.id)) &&
      !blessedIds.has(String(pokemon.id)),
  )
}

export async function assignCelebiWish({
  roomCode,
  playerUid,
  targetPokemonId,
}) {
  if (!playerUid || targetPokemonId === undefined) {
    throw new Error('Choose a valid Pokemon for Celebi Future Wish.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    playerUid,
  )

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot, draftTeamSnapshot] =
      await Promise.all([
        transaction.get(roomReference),
        transaction.get(battleStateReference),
        transaction.get(draftTeamReference),
      ])

    if (
      !roomSnapshot.exists() ||
      !battleStateSnapshot.exists() ||
      !draftTeamSnapshot.exists()
    ) {
      throw new Error('Celebi Future Wish data is unavailable.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const pendingWish = battleState.pendingCelebiWish

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (pendingWish?.playerUid !== playerUid) {
      throw new Error('Celebi Future Wish is not pending for you.')
    }

    const existingWishes =
      battleState.celebiWishes?.[playerUid] ?? []
    const validTargets = findAvailableCelebiWishTargets({
      team: draftTeamSnapshot.data().picks ?? [],
      usedPokemon: battleState.usedPokemon?.[playerUid] ?? [],
      existingWishes,
    })
    const target = validTargets.find(
      (pokemon) => String(pokemon.id) === String(targetPokemonId),
    )

    if (!target) {
      throw new Error('That Pokemon cannot receive Celebi Future Wish.')
    }

    const wish = {
      targetPokemonId: target.id,
      targetPokemonName: target.name,
      amount: pendingWish.amount ?? 10,
      grantedAtRound: pendingWish.roundWon,
      consumed: false,
      sourcePokemonName: 'Celebi',
    }

    transaction.update(battleStateReference, {
      celebiWishes: {
        ...(battleState.celebiWishes ?? {}),
        [playerUid]: [...existingWishes, wish],
      },
      pendingCelebiWish: null,
      updatedAt: serverTimestamp(),
    })

    return wish
  })
}

export async function dismissCelebiWish({ roomCode, playerUid }) {
  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')
  const draftTeamReference = doc(
    roomReference,
    'draftTeams',
    playerUid,
  )

  return runTransaction(db, async (transaction) => {
    const [battleStateSnapshot, draftTeamSnapshot] = await Promise.all([
      transaction.get(battleStateReference),
      transaction.get(draftTeamReference),
    ])

    if (!battleStateSnapshot.exists() || !draftTeamSnapshot.exists()) {
      throw new Error('Celebi Future Wish data is unavailable.')
    }

    const battleState = battleStateSnapshot.data()

    if (battleState.pendingCelebiWish?.playerUid !== playerUid) {
      throw new Error('Celebi Future Wish is not pending for you.')
    }

    const validTargets = findAvailableCelebiWishTargets({
      team: draftTeamSnapshot.data().picks ?? [],
      usedPokemon: battleState.usedPokemon?.[playerUid] ?? [],
      existingWishes: battleState.celebiWishes?.[playerUid] ?? [],
    })

    if (validTargets.length > 0) {
      throw new Error('A valid Pokemon remains for Celebi Future Wish.')
    }

    transaction.update(battleStateReference, {
      pendingCelebiWish: null,
      updatedAt: serverTimestamp(),
    })

    return true
  })
}

export async function requestPlayAgain({ roomCode, playerUid }) {
  if (!playerUid) {
    throw new Error('You must be logged in to request another game.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists() || !battleStateSnapshot.exists()) {
      throw new Error('Match state is unavailable.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const opponentUid =
      room.hostUid === playerUid ? room.guestUid : room.hostUid

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (battleState.phase !== 'match_over') {
      throw new Error('Play Again is only available after the match.')
    }

    if (battleState.surrender) {
      throw new Error('Play Again is unavailable after a surrender.')
    }

    if (
      !opponentUid ||
      battleState.postMatch?.returnedHome?.[opponentUid] ||
      room.players?.[opponentUid]?.active === false
    ) {
      throw new Error('Your opponent has left the room.')
    }

    if (battleState.postMatch?.status === 'resetting') {
      return 'resetting'
    }

    const playAgainRequests = {
      ...(battleState.postMatch?.playAgainRequests ?? {}),
      [playerUid]: true,
    }
    const bothRequested =
      Boolean(playAgainRequests[room.hostUid]) &&
      Boolean(playAgainRequests[room.guestUid])
    const timestamp = serverTimestamp()

    if (!bothRequested) {
      transaction.update(battleStateReference, {
        postMatch: {
          playAgainRequests,
          returnedHome: {
            ...(battleState.postMatch?.returnedHome ?? {}),
          },
          status: 'waiting_for_opponent',
        },
        updatedAt: timestamp,
      })

      return 'waiting_for_opponent'
    }

    const { hostOptions, guestOptions } =
      generateInitialStarterOptions()

    transaction.update(roomReference, {
      status: 'draft',
      draft: {
        totalRounds: TOTAL_DRAFT_ROUNDS,
        phase: 'active',
        completedPlayers: [],
        startedAt: timestamp,
        updatedAt: timestamp,
      },
      teams: {
        [room.hostUid]: [],
        [room.guestUid]: [],
      },
      battleReady: {
        hostReady: false,
        guestReady: false,
      },
      [`players.${room.hostUid}.ready`]: false,
      [`players.${room.guestUid}.ready`]: false,
      [`players.${room.hostUid}.active`]: true,
      [`players.${room.guestUid}.active`]: true,
      presence: {
        [room.hostUid]: {
          status: 'online',
          lastSeen: timestamp,
          reconnectDeadline: null,
        },
        [room.guestUid]: {
          status: 'online',
          lastSeen: timestamp,
          reconnectDeadline: null,
        },
      },
      updatedAt: timestamp,
    })
    transaction.set(
      doc(roomReference, 'draftTeams', room.hostUid),
      {
        uid: room.hostUid,
        picks: [],
        currentRound: 1,
        completed: false,
        updatedAt: timestamp,
      },
    )
    transaction.set(
      doc(roomReference, 'draftTeams', room.guestUid),
      {
        uid: room.guestUid,
        picks: [],
        currentRound: 1,
        completed: false,
        updatedAt: timestamp,
      },
    )
    transaction.set(
      doc(roomReference, 'draftOptions', room.hostUid),
      createOptionDocument(room.hostUid, 1, hostOptions, timestamp),
    )
    transaction.set(
      doc(roomReference, 'draftOptions', room.guestUid),
      createOptionDocument(room.guestUid, 1, guestOptions, timestamp),
    )
    transaction.set(
      battleStateReference,
      createInitialBattleState(
        timestamp,
        room.hostUid,
        room.guestUid,
      ),
    )

    return 'resetting'
  })
}

export async function returnHomeAfterMatch({ roomCode, playerUid }) {
  if (!playerUid) {
    throw new Error('You must be logged in to leave the room.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists() || !battleStateSnapshot.exists()) {
      throw new Error('Match state is unavailable.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (battleState.phase !== 'match_over') {
      throw new Error('Return Home is only available after the match.')
    }

    const timestamp = serverTimestamp()
    const returnedHome = {
      ...(battleState.postMatch?.returnedHome ?? {}),
      [playerUid]: true,
    }
    const bothReturnedHome =
      Boolean(returnedHome[room.hostUid]) &&
      Boolean(returnedHome[room.guestUid])

    transaction.update(roomReference, {
      ...(bothReturnedHome ? { status: 'closed' } : {}),
      [`players.${playerUid}.active`]: false,
      [`presence.${playerUid}`]: {
        status: 'left',
        lastSeen: timestamp,
        reconnectDeadline: null,
      },
      updatedAt: timestamp,
    })
    transaction.update(battleStateReference, {
      postMatch: {
        playAgainRequests: {},
        returnedHome,
        status: 'opponent_left',
      },
      updatedAt: timestamp,
    })

    return true
  })
}

export async function surrenderRoom({
  roomCode,
  playerUid,
  username,
}) {
  if (!playerUid) {
    throw new Error('You must be logged in to surrender.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const opponentUid =
      room.hostUid === playerUid ? room.guestUid : room.hostUid

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (
      !opponentUid ||
      room.players?.[opponentUid]?.active === false ||
      battleStateSnapshot.data()?.postMatch?.returnedHome?.[opponentUid]
    ) {
      return 'opponent_left'
    }

    const battleState = battleStateSnapshot.exists()
      ? battleStateSnapshot.data()
      : createInitialBattleState(
          serverTimestamp(),
          room.hostUid,
          room.guestUid,
        )

    if (battleState.phase === 'match_over') {
      return 'match_over'
    }

    const timestamp = serverTimestamp()
    const surrenderState = {
      surrenderedBy: playerUid,
      winnerUid: opponentUid,
      surrenderedAt: timestamp,
    }
    const nextBattleState = {
      ...battleState,
      phase: 'match_over',
      matchWinnerUid: opponentUid,
      matchOverReason: `${username || room.players[playerUid].username} surrendered.`,
      surrender: surrenderState,
      pendingCelebiWish: null,
      postMatch: {
        playAgainRequests: {},
        returnedHome: {},
        status: 'idle',
      },
      updatedAt: timestamp,
    }

    transaction.update(roomReference, {
      status: 'battle_setup',
      [`players.${playerUid}.active`]: false,
      [`presence.${playerUid}`]: {
        status: 'surrendered',
        lastSeen: timestamp,
        reconnectDeadline: null,
      },
      updatedAt: timestamp,
    })

    if (battleStateSnapshot.exists()) {
      transaction.set(battleStateReference, nextBattleState)
    } else {
      transaction.set(battleStateReference, nextBattleState)
    }

    return 'surrendered'
  })
}

function serializeMasterRoundOptions(options) {
  return options.map((pokemon) => ({
    pokemonId: pokemon.id,
    pokemonName: pokemon.name,
  }))
}

function findMasterRoundPokemon(selection) {
  if (!selection) {
    return null
  }

  return (
    allBattlePokemon.find(
      (pokemon) => String(pokemon.id) === String(selection.pokemonId),
    ) ??
    allBattlePokemon.find(
      (pokemon) => pokemon.name === selection.pokemonName,
    )
  )
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

export async function initializeMasterRoundOptions(roomCode) {
  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const hostTeamReference = doc(
      roomReference,
      'draftTeams',
      room.hostUid,
    )
    const guestTeamReference = doc(
      roomReference,
      'draftTeams',
      room.guestUid,
    )
    const [battleStateSnapshot, hostTeamSnapshot, guestTeamSnapshot] =
      await Promise.all([
        transaction.get(battleStateReference),
        transaction.get(hostTeamReference),
        transaction.get(guestTeamReference),
      ])

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    if (!hostTeamSnapshot.exists() || !guestTeamSnapshot.exists()) {
      throw new Error('Both draft teams are required for Master Round.')
    }

    const battleState = battleStateSnapshot.data()
    const existingOptions = battleState.masterRound?.options

    if (
      existingOptions?.[room.hostUid] &&
      existingOptions?.[room.guestUid]
    ) {
      return false
    }

    if (battleState.phase !== 'master_round_pending') {
      throw new Error('Master Round options are not available yet.')
    }

    const hostOptions = createMasterRoundOptions(
      hostTeamSnapshot.data().picks ?? [],
    )
    const guestOptions = createMasterRoundOptions(
      guestTeamSnapshot.data().picks ?? [],
    )

    if (
      hostOptions.candidates.length !== 3 ||
      guestOptions.candidates.length !== 3
    ) {
      throw new Error('Each trainer needs three Master Round options.')
    }

    const timestamp = serverTimestamp()

    transaction.update(battleStateReference, {
      masterRound: {
        options: {
          [room.hostUid]: serializeMasterRoundOptions(
            hostOptions.candidates,
          ),
          [room.guestUid]: serializeMasterRoundOptions(
            guestOptions.candidates,
          ),
        },
        hiddenOptions: {
          [room.hostUid]: serializeMasterRoundOptions(
            hostOptions.hiddenOptions,
          ),
          [room.guestUid]: serializeMasterRoundOptions(
            guestOptions.hiddenOptions,
          ),
        },
        selections: {
          [room.hostUid]: null,
          [room.guestUid]: null,
        },
        phase: 'choose_master_pokeball',
      },
      updatedAt: timestamp,
    })

    return true
  })
}

export async function lockMasterRoundPokemon({
  roomCode,
  playerUid,
  pokemonId,
}) {
  if (!playerUid || pokemonId === undefined || pokemonId === null) {
    throw new Error('Choose a valid Master Round Pokeball.')
  }

  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (
      battleState.phase !== 'master_round_pending' ||
      battleState.masterRound?.phase !== 'choose_master_pokeball'
    ) {
      throw new Error('Master Round selection is not open.')
    }

    if (battleState.masterRound?.selections?.[playerUid]) {
      throw new Error('Your Master Round Pokemon is already locked.')
    }

    const selectedPokemon = (
      battleState.masterRound?.hiddenOptions?.[playerUid] ?? []
    ).find(
      (pokemon) => String(pokemon.pokemonId) === String(pokemonId),
    )

    if (!selectedPokemon) {
      throw new Error('That Pokeball is not a valid Master Round option.')
    }

    const timestamp = serverTimestamp()

    transaction.update(battleStateReference, {
      [`masterRound.selections.${playerUid}`]: {
        pokemonId: selectedPokemon.pokemonId,
        pokemonName: selectedPokemon.pokemonName,
        selectedAt: timestamp,
      },
      updatedAt: timestamp,
    })

    return selectedPokemon.pokemonId
  })
}

export async function resolveAndSaveMasterRound(roomCode) {
  const normalizedRoomCode = roomCode.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()
    const playerAUid = room.hostUid
    const playerBUid = room.guestUid
    const playerATeamReference = doc(
      roomReference,
      'draftTeams',
      playerAUid,
    )
    const playerBTeamReference = doc(
      roomReference,
      'draftTeams',
      playerBUid,
    )
    const [
      battleStateSnapshot,
      playerATeamSnapshot,
      playerBTeamSnapshot,
    ] = await Promise.all([
      transaction.get(battleStateReference),
      transaction.get(playerATeamReference),
      transaction.get(playerBTeamReference),
    ])

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    if (!playerATeamSnapshot.exists() || !playerBTeamSnapshot.exists()) {
      throw new Error('Both draft teams are required for Master Round.')
    }

    const battleState = battleStateSnapshot.data()

    if (battleState.masterRound?.result) {
      return battleState.masterRound.result
    }

    if (battleState.phase !== 'master_round_pending') {
      throw new Error('Master Round is not ready to resolve.')
    }

    const playerASelection =
      battleState.masterRound?.selections?.[playerAUid]
    const playerBSelection =
      battleState.masterRound?.selections?.[playerBUid]

    if (!playerASelection || !playerBSelection) {
      throw new Error('Both trainers must select a Master Pokeball.')
    }

    const playerAMasterPokemon =
      findMasterRoundPokemon(playerASelection)
    const playerBMasterPokemon =
      findMasterRoundPokemon(playerBSelection)

    if (!playerAMasterPokemon || !playerBMasterPokemon) {
      throw new Error('A selected Master Round Pokemon was not found.')
    }

    const playerAScore =
      battleState.playerScores?.[playerAUid] ??
      battleState.hostScore ??
      0
    const playerBScore =
      battleState.playerScores?.[playerBUid] ??
      battleState.guestScore ??
      0
    const battleResult = resolveBattleRound({
      pokemonA: playerAMasterPokemon,
      pokemonB: playerBMasterPokemon,
      roundNumber: 7,
      playerAScore,
      playerBScore,
      teamA: playerATeamSnapshot.data().picks ?? [],
      teamB: playerBTeamSnapshot.data().picks ?? [],
      jirachiCopyA: battleState.jirachiCopies?.[playerAUid] ?? null,
      jirachiCopyB: battleState.jirachiCopies?.[playerBUid] ?? null,
      isMasterRound: true,
      randomFn: createSeededRandom(
        `${normalizedRoomCode}:master:${playerASelection.pokemonId}:${playerBSelection.pokemonId}`,
      ),
    })
    const { winnerResult } = battleResult
    const winnerUid =
      winnerResult.resultType === 'PLAYER_A_WIN'
        ? playerAUid
        : winnerResult.resultType === 'PLAYER_B_WIN'
          ? playerBUid
          : null
    const matchOverReason =
      winnerResult.resultType === 'TRUE_WARRIORS'
        ? 'Both trainers are True Warriors.'
        : winnerResult.reason
    const createdAt = Timestamp.now()
    const savedResult = {
      playerAUid,
      playerBUid,
      playerAPokemon: {
        pokemonId: playerAMasterPokemon.id,
        pokemonName: playerAMasterPokemon.name,
      },
      playerBPokemon: {
        pokemonId: playerBMasterPokemon.id,
        pokemonName: playerBMasterPokemon.name,
      },
      playerAFinalScore: battleResult.playerAState.finalScore,
      playerBFinalScore: battleResult.playerBState.finalScore,
      resultType: winnerResult.resultType,
      winnerUid,
      winnerPokemon: winnerResult.winnerPokemon
        ? {
            pokemonId: winnerResult.winnerPokemon.id,
            pokemonName: winnerResult.winnerPokemon.name,
          }
        : null,
      reason: winnerResult.reason,
      logs: battleResult.logs,
      createdAt,
    }

    transaction.update(battleStateReference, {
      'masterRound.result': savedResult,
      phase: 'match_over',
      matchWinnerUid: winnerUid,
      matchOverReason,
      updatedAt: serverTimestamp(),
    })

    return savedResult
  })
}

export async function saveBattleRoundResult({
  roomId,
  battleResult,
  currentRound,
  playerAUid,
  playerBUid,
}) {
  if (!roomId || !battleResult || !playerAUid || !playerBUid) {
    throw new Error('Battle result data is incomplete.')
  }

  const normalizedRoomCode = roomId.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const roundNumber = Number(currentRound)

    if (
      room.hostUid !== playerAUid ||
      room.guestUid !== playerBUid
    ) {
      throw new Error('Battle player order does not match this room.')
    }

    if (
      (battleState.currentRound ?? battleState.round ?? 1) !==
      roundNumber
    ) {
      throw new Error('This battle round is no longer current.')
    }

    const roundResults = battleState.roundResults ?? []
    const existingResult = roundResults.find(
      (result) => result.roundNumber === roundNumber,
    )
    const currentUsedPokemon = battleState.usedPokemon ?? {
      [playerAUid]: battleState.hostUsedPokemon ?? [],
      [playerBUid]: battleState.guestUsedPokemon ?? [],
    }

    if (existingResult) {
      if (
        battleState.masterRound?.result ||
        battleState.phase === 'match_over'
      ) {
        return {
          saved: false,
          result: existingResult,
        }
      }

      const playerScores = {
        [playerAUid]:
          battleState.playerScores?.[playerAUid] ??
          battleState.hostScore ??
          0,
        [playerBUid]:
          battleState.playerScores?.[playerBUid] ??
          battleState.guestScore ??
          0,
      }
      const matchState = getPostRoundMatchState({
        playerAScore: playerScores[playerAUid],
        playerBScore: playerScores[playerBUid],
        playerAUid,
        playerBUid,
      })
      const playerAUsedPokemon = appendUniquePokemonId(
        currentUsedPokemon[playerAUid] ?? [],
        existingResult.playerAPokemon?.pokemonId ??
          existingResult.playerAPokemon?.id,
      )
      const playerBUsedPokemon = appendUniquePokemonId(
        currentUsedPokemon[playerBUid] ?? [],
        existingResult.playerBPokemon?.pokemonId ??
          existingResult.playerBPokemon?.id,
      )
      const usageChanged =
        playerAUsedPokemon.length !==
          (currentUsedPokemon[playerAUid]?.length ?? 0) ||
        playerBUsedPokemon.length !==
          (currentUsedPokemon[playerBUid]?.length ?? 0)
      const matchStateChanged =
        battleState.phase !== matchState.phase ||
        battleState.matchWinnerUid !== matchState.matchWinnerUid ||
        battleState.matchOverReason !== matchState.matchOverReason

      if (usageChanged || matchStateChanged) {
        transaction.update(battleStateReference, {
          ...(usageChanged
            ? {
                usedPokemon: {
                  ...currentUsedPokemon,
                  [playerAUid]: playerAUsedPokemon,
                  [playerBUid]: playerBUsedPokemon,
                },
              }
            : {}),
          ...matchState,
          updatedAt: serverTimestamp(),
        })
      }

      return {
        saved: false,
        result: existingResult,
      }
    }

    if ((battleState.phase ?? 'choose_pokemon') !== 'choose_pokemon') {
      throw new Error('Normal round result saving is closed.')
    }

    const playerASelection = battleState.selections?.[playerAUid]
    const playerBSelection = battleState.selections?.[playerBUid]

    if (!playerASelection || !playerBSelection) {
      throw new Error('Both trainers must lock before saving the round.')
    }

    const playerAPokemon = battleResult.playerAState?.pokemon
    const playerBPokemon = battleResult.playerBState?.pokemon

    if (
      String(playerAPokemon?.id) !==
        String(playerASelection.pokemonId) ||
      String(playerBPokemon?.id) !==
        String(playerBSelection.pokemonId)
    ) {
      throw new Error('Battle result does not match the locked fighters.')
    }

    const pointAwardedTo =
      battleResult.winnerResult?.pointAwardedTo ?? null
    const playerScores = {
      [playerAUid]:
        battleState.playerScores?.[playerAUid] ??
        battleState.hostScore ??
        0,
      [playerBUid]:
        battleState.playerScores?.[playerBUid] ??
        battleState.guestScore ??
        0,
    }

    if (pointAwardedTo === 'PLAYER_A' || pointAwardedTo === 'BOTH') {
      playerScores[playerAUid] += 1
    }

    if (pointAwardedTo === 'PLAYER_B' || pointAwardedTo === 'BOTH') {
      playerScores[playerBUid] += 1
    }

    const winnerUid =
      battleResult.winnerResult?.winnerSide === 'PLAYER_A'
        ? playerAUid
        : battleResult.winnerResult?.winnerSide === 'PLAYER_B'
          ? playerBUid
          : null
    const savedResult = {
      roundNumber,
      playerAUid,
      playerBUid,
      playerAPokemon: {
        pokemonId: playerAPokemon.id,
        pokemonName: playerAPokemon.name,
      },
      playerBPokemon: {
        pokemonId: playerBPokemon.id,
        pokemonName: playerBPokemon.name,
      },
      playerAFinalScore: battleResult.playerAState.finalScore,
      playerBFinalScore: battleResult.playerBState.finalScore,
      winnerUid,
      pointAwardedTo,
      resultType: battleResult.winnerResult.resultType,
      reason: battleResult.winnerResult.reason,
      logs: battleResult.logs,
      createdAt: Timestamp.now(),
    }
    const usedPokemon = {
      ...currentUsedPokemon,
      [playerAUid]: appendUniquePokemonId(
        currentUsedPokemon[playerAUid] ?? [],
        playerAPokemon.id,
      ),
      [playerBUid]: appendUniquePokemonId(
        currentUsedPokemon[playerBUid] ?? [],
        playerBPokemon.id,
      ),
    }
    const matchState = getPostRoundMatchState({
      playerAScore: playerScores[playerAUid],
      playerBScore: playerScores[playerBUid],
      playerAUid,
      playerBUid,
    })
    const celebiWishes = {
      ...(battleState.celebiWishes ?? {}),
    }
    const consumeWish = (playerUid, pokemonId) => {
      let consumed = false

      celebiWishes[playerUid] = (
        celebiWishes[playerUid] ?? []
      ).map((wish) => {
        if (
          consumed ||
          wish.consumed ||
          String(wish.targetPokemonId) !== String(pokemonId)
        ) {
          return wish
        }

        consumed = true
        return {
          ...wish,
          consumed: true,
          consumedAtRound: roundNumber,
        }
      })
    }

    consumeWish(playerAUid, playerAPokemon.id)
    consumeWish(playerBUid, playerBPokemon.id)

    const celebiWinnerUid =
      winnerUid &&
      battleResult.winnerResult?.resultType !== 'TIE' &&
      battleResult.winnerResult?.winnerPokemon?.name === 'Celebi'
        ? winnerUid
        : null
    const pendingCelebiWish =
      !battleState.pendingCelebiWish &&
      celebiWinnerUid &&
      roundNumber < 6 &&
      matchState.phase === 'round_result'
        ? {
            playerUid: celebiWinnerUid,
            sourcePokemonId:
              battleResult.winnerResult.winnerPokemon.id,
            sourcePokemonName: 'Celebi',
            roundWon: roundNumber,
            amount: 10,
          }
        : battleState.pendingCelebiWish ?? null

    transaction.update(battleStateReference, {
      roundResults: [...roundResults, savedResult],
      playerScores,
      usedPokemon,
      celebiWishes,
      pendingCelebiWish,
      ...matchState,
      updatedAt: serverTimestamp(),
    })

    return {
      saved: true,
      result: savedResult,
    }
  })
}

export async function continueBattleRound({
  roomId,
  playerUid,
  expectedRound,
}) {
  if (!roomId || !playerUid) {
    throw new Error('Battle continue data is incomplete.')
  }

  const normalizedRoomCode = roomId.trim().toUpperCase()
  const roomReference = doc(db, 'rooms', normalizedRoomCode)
  const battleStateReference = doc(roomReference, 'battle', 'state')

  return runTransaction(db, async (transaction) => {
    const [roomSnapshot, battleStateSnapshot] = await Promise.all([
      transaction.get(roomReference),
      transaction.get(battleStateReference),
    ])

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!battleStateSnapshot.exists()) {
      throw new Error('Battle state is not initialized.')
    }

    const room = roomSnapshot.data()
    const battleState = battleStateSnapshot.data()
    const roundNumber = Number(expectedRound)
    const currentRound =
      battleState.currentRound ?? battleState.round ?? 1

    if (!room.players?.[playerUid]) {
      throw new Error('You are not a player in this room.')
    }

    if (currentRound > roundNumber) {
      return {
        advanced: true,
        currentRound,
      }
    }

    if (currentRound !== roundNumber) {
      throw new Error('This battle round is no longer current.')
    }

    if (roundNumber >= 6) {
      throw new Error('Normal rounds are already complete.')
    }

    if (battleState.phase !== 'round_result') {
      throw new Error('Normal round continuation is not available.')
    }

    if (battleState.pendingCelebiWish) {
      throw new Error('Celebi Future Wish must be resolved first.')
    }

    const roundResultExists = (battleState.roundResults ?? []).some(
      (result) => result.roundNumber === roundNumber,
    )

    if (!roundResultExists) {
      throw new Error('The current round result has not been saved.')
    }

    const roundContinue = {
      ...(battleState.roundContinue ?? {}),
      [playerUid]: true,
    }
    const bothPlayersContinued =
      Boolean(roundContinue[room.hostUid]) &&
      Boolean(roundContinue[room.guestUid])
    const timestamp = serverTimestamp()

    if (bothPlayersContinued) {
      const nextRound = roundNumber + 1

      transaction.update(battleStateReference, {
        currentRound: nextRound,
        round: nextRound,
        selections: {},
        roundContinue: {},
        phase: 'choose_pokemon',
        updatedAt: timestamp,
      })

      return {
        advanced: true,
        currentRound: nextRound,
      }
    }

    transaction.update(battleStateReference, {
      roundContinue,
      updatedAt: timestamp,
    })

    return {
      advanced: false,
      currentRound: roundNumber,
    }
  })
}

function getPostRoundMatchState({
  playerAScore,
  playerBScore,
  playerAUid,
  playerBUid,
}) {
  if (playerAScore >= 4) {
    return {
      phase: 'match_over',
      matchWinnerUid: playerAUid,
      matchOverReason: 'Player A reached 4 points.',
    }
  }

  if (playerBScore >= 4) {
    return {
      phase: 'match_over',
      matchWinnerUid: playerBUid,
      matchOverReason: 'Player B reached 4 points.',
    }
  }

  if (playerAScore === 3 && playerBScore === 3) {
    return {
      phase: 'master_round_pending',
      matchWinnerUid: null,
      matchOverReason: null,
    }
  }

  return {
    phase: 'round_result',
    matchWinnerUid: null,
    matchOverReason: null,
  }
}

function appendUniquePokemonId(usedPokemon, pokemonId) {
  const alreadyUsed = usedPokemon.some((entry) => {
    const usedPokemonId =
      typeof entry === 'object' ? entry?.id ?? entry?.pokemonId : entry

    return String(usedPokemonId) === String(pokemonId)
  })

  return alreadyUsed ? usedPokemon : [...usedPokemon, pokemonId]
}

function createInitialBattleState(timestamp, hostUid, guestUid) {
  return {
    currentRound: 1,
    round: 1,
    maxNormalRounds: 6,
    tiebreakRound: 7,
    hostScore: 0,
    guestScore: 0,
    hostUsedPokemon: [],
    guestUsedPokemon: [],
    hostSubmittedPokemon: null,
    guestSubmittedPokemon: null,
    phase: 'choose_pokemon',
    selections: {},
    usedPokemon: {
      [hostUid]: [],
      [guestUid]: [],
    },
    roundResults: [],
    roundContinue: {},
    jirachiCopies: {},
    celebiWishes: {},
    pendingCelebiWish: null,
    surrender: null,
    postMatch: {
      playAgainRequests: {},
      returnedHome: {},
      status: 'idle',
    },
    matchWinnerUid: null,
    matchOverReason: null,
    playerScores: {
      [hostUid]: 0,
      [guestUid]: 0,
    },
    winner: null,
    isTieBreaker: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
