import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { auth } from './firebase.js'
import AuthPage from './pages/AuthPage.jsx'
import CreateRoom from './pages/CreateRoom.jsx'
import DraftPage from './pages/DraftPage.jsx'
import Home from './pages/Home.jsx'
import JoinRoom from './pages/JoinRoom.jsx'
import RoomLobby from './pages/RoomLobby.jsx'
import {
  getOrCreateUserProfile,
  getUsernameFromUser,
} from './services/userProfile.js'

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let authRequestId = 0

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const requestId = ++authRequestId
      setUser(currentUser)

      if (!currentUser) {
        setUserProfile(null)
        setAuthLoading(false)
        return
      }

      try {
        const profile = await getOrCreateUserProfile(currentUser)

        if (requestId === authRequestId) {
          setUserProfile(profile)
        }
      } catch {
        if (requestId === authRequestId) {
          setUserProfile({
            uid: currentUser.uid,
            username: getUsernameFromUser(currentUser),
            displayName: getUsernameFromUser(currentUser),
          })
        }
      } finally {
        if (requestId === authRequestId) {
          setAuthLoading(false)
        }
      }
    }, () => {
      setUser(null)
      setUserProfile(null)
      setAuthLoading(false)
    })

    return () => {
      authRequestId += 1
      unsubscribe()
    }
  }, [])

  if (authLoading) {
    return (
      <main className="page-shell">
        <section className="game-card loading-card" aria-live="polite">
          <div className="pokeball small-pokeball" aria-hidden="true">
            <span />
          </div>
          <p className="eyebrow">Loading Arena</p>
          <p className="subtitle">Checking trainer session...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Home username={userProfile?.username || 'trainer'} />}
        />
        <Route
          path="/create-room"
          element={<CreateRoom currentUser={user} userProfile={userProfile} />}
        />
        <Route
          path="/join-room"
          element={<JoinRoom currentUser={user} userProfile={userProfile} />}
        />
        <Route
          path="/room/:roomCode"
          element={<RoomLobby currentUser={user} />}
        />
        <Route
          path="/draft/:roomCode"
          element={<DraftPage currentUser={user} />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
