import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { auth } from './firebase.js'
import AuthPage from './pages/AuthPage.jsx'
import CreateRoom from './pages/CreateRoom.jsx'
import Home from './pages/Home.jsx'
import JoinRoom from './pages/JoinRoom.jsx'
import {
  getOrCreateUserProfile,
  getUsernameFromUser,
} from './services/userProfile.js'

function App() {
  const [user, setUser] = useState(null)
  const [username, setUsername] = useState('')
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let authRequestId = 0

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const requestId = ++authRequestId
      setUser(currentUser)

      if (!currentUser) {
        setUsername('')
        setAuthLoading(false)
        return
      }

      try {
        const profile = await getOrCreateUserProfile(currentUser)

        if (requestId === authRequestId) {
          setUsername(profile.username || getUsernameFromUser(currentUser))
        }
      } catch {
        if (requestId === authRequestId) {
          setUsername(getUsernameFromUser(currentUser))
        }
      } finally {
        if (requestId === authRequestId) {
          setAuthLoading(false)
        }
      }
    }, () => {
      setUser(null)
      setUsername('')
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
        <Route path="/" element={<Home username={username} />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/join-room" element={<JoinRoom />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
