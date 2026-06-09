import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import {
  fanFavouriteAPool,
  fanFavouriteBPool,
  legendaryPools,
  pseudoLegendaryPool,
  starterPools,
  supportPool,
} from '../data/draftPools.js'
import { DRAFT_ROUND_NAMES } from '../data/draftTeamStructure.js'
import { db } from '../firebase.js'

const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5
const TOTAL_DRAFT_ROUNDS = 6

export { DRAFT_ROUND_NAMES }

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

  return runTransaction(db, async (transaction) => {
    const roomSnapshot = await transaction.get(roomReference)
    const draftTeamSnapshot = await transaction.get(draftTeamReference)

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
      status: bothCompleted ? 'battle_ready' : 'draft',
      'draft.completedPlayers': nextCompletedPlayers,
      'draft.phase': bothCompleted ? 'complete' : 'active',
      ...(bothCompleted
        ? {
            battleReady: {
              hostReady: false,
              guestReady: false,
            },
          }
        : {}),
      'draft.updatedAt': timestamp,
      updatedAt: timestamp,
    })

    return bothCompleted ? 'battle_ready' : 'draft'
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
          ? usedPokemonEntry?.id
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
