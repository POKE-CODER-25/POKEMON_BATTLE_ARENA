import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  BrowserRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { auth } from './firebase.js'
import AuthPage from './pages/AuthPage.jsx'
import BattleArena from './pages/BattleArena.jsx'
import CreateRoom from './pages/CreateRoom.jsx'
import DraftPage from './pages/DraftPage.jsx'
import Home from './pages/Home.jsx'
import JoinRoom from './pages/JoinRoom.jsx'
import RoomLobby from './pages/RoomLobby.jsx'
import { findActiveRoomForUser } from './services/roomService.js'
import {
  getOrCreateUserProfile,
  getUsernameFromUser,
} from './services/userProfile.js'

const ROOM_ROUTE_PATTERN = /^\/(?:room|draft|battle)\/[^/]+\/?$/i

function AutoResume({ currentUser, manualNavigationRef }) {
  const location = useLocation()
  const navigate = useNavigate()
  const skipRoomResume = Boolean(location.state?.skipRoomResume)

  useEffect(() => {
    let cancelled = false
    const pathname = location.pathname
    const isRoomRoute = ROOM_ROUTE_PATTERN.test(pathname)

    if (isRoomRoute) {
      if (import.meta.env.DEV) {
        console.log('[resume] skipped because route is room route')
      }
      return () => {
        cancelled = true
      }
    }

    if (
      !currentUser ||
      pathname !== '/' ||
      skipRoomResume
    ) {
      return () => {
        cancelled = true
      }
    }

    if (manualNavigationRef.current) {
      if (import.meta.env.DEV) {
        console.log('[resume] skipped because manual navigation')
      }
      return () => {
        cancelled = true
      }
    }

    async function resumeActiveRoom() {
      const resumedRoom = await findActiveRoomForUser(currentUser.uid)

      if (
        cancelled ||
        manualNavigationRef.current ||
        window.location.pathname !== '/'
      ) {
        if (import.meta.env.DEV && manualNavigationRef.current) {
          console.log('[resume] skipped because manual navigation')
        }
        return
      }

      if (resumedRoom) {
        if (import.meta.env.DEV) {
          console.log('[resume] found active room', resumedRoom.roomCode)
        }
        navigate(resumedRoom.route, { replace: true })
      }
    }

    resumeActiveRoom().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [
    currentUser,
    location.pathname,
    manualNavigationRef,
    navigate,
    skipRoomResume,
  ])

  return null
}

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const manualNavigationRef = useRef(false)

  function markManualNavigation() {
    manualNavigationRef.current = true
  }

  useEffect(() => {
    let authRequestId = 0

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const requestId = ++authRequestId
      setUser(currentUser)

      if (!currentUser) {
        manualNavigationRef.current = false
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
      <AutoResume
        currentUser={user}
        manualNavigationRef={manualNavigationRef}
      />
      <Routes>
        <Route
          path="/"
          element={
            <Home
              username={userProfile?.username || 'trainer'}
              onManualNavigation={markManualNavigation}
            />
          }
        />
        <Route
          path="/create-room"
          element={
            <CreateRoom
              currentUser={user}
              userProfile={userProfile}
              onManualNavigation={markManualNavigation}
            />
          }
        />
        <Route
          path="/join-room"
          element={
            <JoinRoom
              currentUser={user}
              userProfile={userProfile}
              onManualNavigation={markManualNavigation}
            />
          }
        />
        <Route
          path="/room/:roomCode"
          element={
            <RoomLobby
              currentUser={user}
              onRoomLeft={markManualNavigation}
              onManualNavigation={markManualNavigation}
            />
          }
        />
        <Route
          path="/draft/:roomCode"
          element={
            <DraftPage
              currentUser={user}
              onRoomLeft={markManualNavigation}
              onManualNavigation={markManualNavigation}
            />
          }
        />
        <Route
          path="/battle/:roomCode"
          element={
            <BattleArena
              currentUser={user}
              onRoomLeft={markManualNavigation}
              onManualNavigation={markManualNavigation}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
