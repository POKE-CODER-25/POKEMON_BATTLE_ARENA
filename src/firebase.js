import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const environmentConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Object.values(environmentConfig).every(Boolean)

// Non-secret local fallbacks let the setup screen render before .env is added.
const firebaseConfig = isFirebaseConfigured
  ? environmentConfig
  : {
      apiKey: 'firebase-config-required',
      authDomain: 'firebase-config-required.firebaseapp.com',
      projectId: 'firebase-config-required',
      storageBucket: 'firebase-config-required.firebasestorage.app',
      messagingSenderId: '000000000000',
      appId: '1:000000000000:web:firebase-config-required',
    }

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
