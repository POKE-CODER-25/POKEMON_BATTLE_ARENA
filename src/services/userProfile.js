import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'

export function getUsernameFromUser(user) {
  return user.displayName || user.email?.split('@')[0] || 'trainer'
}

export async function createUserProfile(user, username) {
  const profile = {
    uid: user.uid,
    username,
    displayName: username,
    wins: 0,
    losses: 0,
    totalMatches: 0,
    createdAt: serverTimestamp(),
  }

  await setDoc(doc(db, 'users', user.uid), profile)
  return { ...profile, createdAt: null }
}

export async function getOrCreateUserProfile(user) {
  const profileReference = doc(db, 'users', user.uid)
  const profileSnapshot = await getDoc(profileReference)

  if (profileSnapshot.exists()) {
    return profileSnapshot.data()
  }

  return createUserProfile(user, getUsernameFromUser(user))
}
