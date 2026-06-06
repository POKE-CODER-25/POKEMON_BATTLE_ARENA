import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { pokemonPool } from '../data/pokemonPool.js'
import { db } from '../firebase.js'

const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5

export const DRAFT_ROUND_NAMES = {
  1: 'Starters',
  2: 'Support 1',
  3: 'Fan Favourites',
  4: 'Pseudo Legendaries',
  5: 'Legendaries/Mythicals',
  6: 'Support 2',
}

const ROUND_CATEGORIES = {
  2: ['Competitive Pick', 'Wildcard'],
  3: ['Fan Favorite'],
  4: ['Pseudo-Legendary'],
  5: ['Legendary'],
  6: ['Competitive Pick', 'Wildcard'],
}

const STARTER_POOLS = {
  Fire: [
    { id: 6, name: 'Charizard', types: ['Fire', 'Flying'] },
    { id: 257, name: 'Blaziken', types: ['Fire', 'Fighting'] },
    { id: 392, name: 'Infernape', types: ['Fire', 'Fighting'] },
    { id: 727, name: 'Incineroar', types: ['Fire', 'Dark'] },
    { id: 500, name: 'Emboar', types: ['Fire', 'Fighting'] },
    { id: 815, name: 'Cinderace', types: ['Fire'] },
  ],
  Water: [
    { id: 9, name: 'Blastoise', types: ['Water'] },
    { id: 260, name: 'Swampert', types: ['Water', 'Ground'] },
    { id: 395, name: 'Empoleon', types: ['Water', 'Steel'] },
    { id: 658, name: 'Greninja', types: ['Water', 'Dark'] },
    { id: 818, name: 'Inteleon', types: ['Water'] },
    { id: 503, name: 'Samurott', types: ['Water'] },
    { id: 730, name: 'Primarina', types: ['Water', 'Fairy'] },
  ],
  Grass: [
    { id: 3, name: 'Venusaur', types: ['Grass', 'Poison'] },
    { id: 254, name: 'Sceptile', types: ['Grass'] },
    { id: 812, name: 'Rillaboom', types: ['Grass'] },
    { id: 724, name: 'Decidueye', types: ['Grass', 'Ghost'] },
    { id: 389, name: 'Torterra', types: ['Grass', 'Ground'] },
  ],
}

const artwork = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

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

function generateStarterOptions() {
  const hostOptions = []
  const guestOptions = []

  Object.entries(STARTER_POOLS).forEach(([element, pool]) => {
    const [hostPokemon, guestPokemon] = shuffle(pool)
    hostOptions.push({
      ...hostPokemon,
      element,
      sprite: artwork(hostPokemon.id),
    })
    guestOptions.push({
      ...guestPokemon,
      element,
      sprite: artwork(guestPokemon.id),
    })
  })

  return {
    hostOptions: shuffle(hostOptions),
    guestOptions: shuffle(guestOptions),
  }
}

function generateCategoryOptions(round) {
  const categories = ROUND_CATEGORIES[round]
  const roundPool = shuffle(
    pokemonPool.filter((pokemon) => categories.includes(pokemon.category)),
  )

  if (roundPool.length < 6) {
    throw new Error(`Not enough Pokemon configured for round ${round}.`)
  }

  return {
    hostOptions: roundPool.slice(0, 3),
    guestOptions: roundPool.slice(3, 6),
  }
}

function generateRoundOptions(round) {
  return round === 1
    ? generateStarterOptions()
    : generateCategoryOptions(round)
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

function setRoundOptionDocuments(
  transaction,
  roomReference,
  room,
  round,
) {
  const { hostOptions, guestOptions } = generateRoundOptions(round)
  const timestamp = serverTimestamp()

  transaction.set(
    doc(roomReference, 'draftOptions', room.hostUid),
    createOptionDocument(room.hostUid, round, hostOptions, timestamp),
  )
  transaction.set(
    doc(roomReference, 'draftOptions', room.guestUid),
    createOptionDocument(room.guestUid, round, guestOptions, timestamp),
  )

  console.info(`Generated Round ${round} options for room ${room.roomCode}`)
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
      updatedAt: serverTimestamp(),
    })
  })

  return normalizedRoomCode
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

    transaction.update(roomReference, {
      status: 'draft',
      draft: {
        currentRound: 1,
        totalRounds: 6,
        phase: 'round_intro',
        roundName: DRAFT_ROUND_NAMES[1],
        completedPlayers: [],
        optionsInitialized: true,
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
      updatedAt: timestamp,
    })
    transaction.set(doc(roomReference, 'draftTeams', room.guestUid), {
      uid: room.guestUid,
      picks: [],
      updatedAt: timestamp,
    })
    setRoundOptionDocuments(transaction, roomReference, room, 1)
  })
}

export async function ensureRoundOneStarterOptions(roomCode, currentUser) {
  if (!currentUser) {
    throw new Error('You must be logged in to generate draft options.')
  }

  const roomReference = doc(db, 'rooms', roomCode.trim().toUpperCase())

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    const room = roomSnapshot.data()

    if (
      room.hostUid !== currentUser.uid ||
      room.status !== 'draft' ||
      room.draft?.currentRound !== 1 ||
      room.draft?.optionsInitialized ||
      room.draft?.starterOptionsInitialized
    ) {
      return false
    }

    setRoundOptionDocuments(transaction, roomReference, room, 1)
    transaction.update(roomReference, {
      'draft.optionsInitialized': true,
      'draft.updatedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return true
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
  const privateTeamReference = doc(
    roomReference,
    'draftTeams',
    currentUser.uid,
  )

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const optionsSnapshot = await transaction.get(optionsReference)
    const privateTeamSnapshot = await transaction.get(privateTeamReference)

    if (!roomSnapshot.exists()) {
      throw new Error('Room not found')
    }

    if (!optionsSnapshot.exists()) {
      throw new Error('Draft options are not ready.')
    }

    const room = roomSnapshot.data()
    const optionData = optionsSnapshot.data()
    const currentRound = room.draft?.currentRound

    if (!room.players?.[currentUser.uid]) {
      throw new Error('You are not a player in this room.')
    }

    if (room.status !== 'draft' || !currentRound) {
      throw new Error('Draft selection is no longer active.')
    }

    if (optionData.round !== currentRound) {
      throw new Error('These options belong to a different round.')
    }

    if (optionData.locked) {
      return optionData.selectedPokemon
    }

    const selectedPokemon = optionData.options?.[selectedIndex]

    if (!selectedPokemon) {
      throw new Error('Invalid Pokeball choice.')
    }

    const currentTeam = room.teams?.[currentUser.uid] || []
    const privatePicks = privateTeamSnapshot.exists()
      ? privateTeamSnapshot.data().picks || []
      : []
    const completedPlayers = room.draft?.completedPlayers || []
    const nextCompletedPlayers = completedPlayers.includes(currentUser.uid)
      ? completedPlayers
      : [...completedPlayers, currentUser.uid]
    const bothPlayersCompleted =
      nextCompletedPlayers.includes(room.hostUid) &&
      nextCompletedPlayers.includes(room.guestUid)
    const timestamp = serverTimestamp()

    transaction.set(privateTeamReference, {
      uid: currentUser.uid,
      picks: [
        ...privatePicks,
        {
          ...selectedPokemon,
          round: currentRound,
          roundName: room.draft.roundName,
        },
      ],
      updatedAt: timestamp,
    })

    const roomUpdates = {
      [`teams.${currentUser.uid}`]: [
        ...currentTeam,
        { round: currentRound, locked: true },
      ],
      'draft.completedPlayers': nextCompletedPlayers,
      'draft.updatedAt': timestamp,
      updatedAt: timestamp,
    }

    if (!bothPlayersCompleted) {
      transaction.update(optionsReference, {
        selectedPokemon,
        selectedIndex,
        locked: true,
        lockedAt: timestamp,
      })
      transaction.update(roomReference, roomUpdates)
      return selectedPokemon
    }

    if (currentRound === room.draft.totalRounds) {
      transaction.update(optionsReference, {
        selectedPokemon,
        selectedIndex,
        locked: true,
        lockedAt: timestamp,
      })
      transaction.update(roomReference, {
        ...roomUpdates,
        status: 'draft_complete',
        'draft.phase': 'draft_complete',
        'draft.completedAt': timestamp,
      })
      return selectedPokemon
    }

    const nextRound = currentRound + 1
    setRoundOptionDocuments(transaction, roomReference, room, nextRound)
    transaction.update(roomReference, {
      ...roomUpdates,
      'draft.currentRound': nextRound,
      'draft.roundName': DRAFT_ROUND_NAMES[nextRound],
      'draft.phase': 'round_intro',
      'draft.completedPlayers': [],
      'draft.optionsInitialized': true,
    })

    return selectedPokemon
  })
}
