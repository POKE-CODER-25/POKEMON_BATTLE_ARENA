import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth, isFirebaseConfigured } from '../firebase.js'
import { createUserProfile } from '../services/userProfile.js'

const EMAIL_DOMAIN = 'pokemonarena.local'

function normalizeUsername(value) {
  return value.toLowerCase().replace(/\s/g, '')
}

function validateCredentials(username, password) {
  if (username.length < 3) {
    return 'Username must be at least 3 characters.'
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return 'Username can only use letters, numbers, and underscores.'
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters.'
  }

  return ''
}

function getAuthErrorMessage(error, mode) {
  const messages = {
    'auth/email-already-in-use': 'That username is already taken.',
    'auth/invalid-credential': 'Incorrect username or password.',
    'auth/user-not-found': 'Incorrect username or password.',
    'auth/wrong-password': 'Incorrect username or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-api-key': 'Firebase is not configured correctly.',
    'auth/operation-not-allowed': 'Username and password login is not enabled.',
    'permission-denied': 'Firestore blocked the account profile. Check its rules.',
  }

  return messages[error.code] || `Could not ${mode}. Please try again.`
}

function AuthPage() {
  const [usernameInput, setUsernameInput] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingAction, setLoadingAction] = useState('')

  async function handleAuth(action) {
    setErrorMessage('')

    const username = normalizeUsername(usernameInput)
    const validationError = validateCredentials(username, password)

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    if (!isFirebaseConfigured) {
      setErrorMessage('Add your Firebase web config to the .env file first.')
      return
    }

    const email = `${username}@${EMAIL_DOMAIN}`
    setLoadingAction(action)

    try {
      if (action === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
        return
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      )

      try {
        await createUserProfile(credential.user, username)
        await updateProfile(credential.user, { displayName: username })
      } catch (profileError) {
        try {
          await deleteUser(credential.user)
        } catch {
          // Keep the original profile error for the player-facing message.
        }
        throw profileError
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, action))
    } finally {
      setLoadingAction('')
    }
  }

  const isLoading = Boolean(loadingAction)

  return (
    <main className="page-shell">
      <div className="arena-stage" aria-hidden="true">
        <span className="arena-line arena-line-left" />
        <span className="arena-line arena-line-right" />
        <span className="arena-circle" />
      </div>

      <section className="game-card auth-card">
        <div className="pokeball auth-pokeball" aria-hidden="true">
          <span />
        </div>

        <p className="eyebrow">Trainer Account</p>
        <h1 className="auth-title">
          Pok&eacute;mon <span>Draft Arena</span>
        </h1>
        <p className="auth-subtitle">
          Sign in or create a trainer account to enter the arena.
        </p>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleAuth('login')
          }}
        >
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            placeholder="trainer_name"
            autoComplete="username"
            maxLength={24}
            disabled={isLoading}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            autoComplete="current-password"
            disabled={isLoading}
          />

          <div className="auth-error" role="alert" aria-live="polite">
            {errorMessage}
          </div>

          <div className="auth-actions">
            <button
              className="game-button game-button-primary"
              type="submit"
              disabled={isLoading}
            >
              {loadingAction === 'login' ? 'Logging In...' : 'Login'}
            </button>
            <button
              className="game-button game-button-secondary"
              type="button"
              onClick={() => handleAuth('sign up')}
              disabled={isLoading}
            >
              {loadingAction === 'sign up' ? 'Creating Account...' : 'Sign Up'}
            </button>
          </div>
        </form>
      </section>

      <footer className="site-footer">
        Fan-made Pok&eacute;mon Draft Strategy Game
      </footer>
    </main>
  )
}

export default AuthPage
