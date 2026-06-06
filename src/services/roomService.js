import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'

const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5

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

  if (!userProfile) {
    throw new Error('Your trainer profile is not available.')
  }

  const username = userProfile.username?.trim()

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
