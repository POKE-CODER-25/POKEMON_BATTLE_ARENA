import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase.js'
import {
  startDraft,
  togglePlayerReady,
} from '../services/roomService.js'

function ReadyStatus({ isReady }) {
  return (
    <span className={`ready-status ${isReady ? 'is-ready' : ''}`}>
      {isReady ? 'Ready' : 'Not Ready'}
    </span>
  )
}

function RoomLobby({ currentUser }) {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const roomReference = doc(db, 'rooms', displayRoomCode)

    const unsubscribe = onSnapshot(
      roomReference,
      (roomSnapshot) => {
        if (!roomSnapshot.exists()) {
          setRoom(null)
          setErrorMessage('Room not found')
          setIsLoading(false)
          return
        }

        setRoom(roomSnapshot.data())
        setErrorMessage('')
        setIsLoading(false)
      },
      () => {
        setRoom(null)
        setErrorMessage('Could not load the room. Please try again.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [displayRoomCode])

  async function handleReadyToggle() {
    setPendingAction('ready')
    setErrorMessage('')

    try {
      await togglePlayerReady(displayRoomCode, currentUser)
    } catch (error) {
      setErrorMessage(
        error.message || 'Could not update ready status. Please try again.',
      )
    } finally {
      setPendingAction('')
    }
  }

  async function handleStartDraft() {
    setPendingAction('draft')
    setErrorMessage('')

    try {
      await startDraft(displayRoomCode, currentUser)
    } catch (error) {
      setErrorMessage(
        error.message || 'Could not start the draft. Please try again.',
      )
    } finally {
      setPendingAction('')
    }
  }

  const hasGuest = Boolean(room?.guestUid)
  const hostReady = Boolean(room?.players?.[room?.hostUid]?.ready)
  const guestReady = Boolean(room?.players?.[room?.guestUid]?.ready)
  const bothReady = Boolean(hasGuest && hostReady && guestReady)
  const currentPlayer = room?.players?.[currentUser?.uid]
  const isHost = room?.hostUid === currentUser?.uid
  const draftStarted = room?.status === 'draft'
  const isActionPending = Boolean(pendingAction)

  return (
    <main className="page-shell">
      <div className="arena-stage" aria-hidden="true">
        <span className="arena-line arena-line-left" />
        <span className="arena-line arena-line-right" />
        <span className="arena-circle" />
      </div>

      <section className="game-card lobby-card">
        <div className="pokeball small-pokeball" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">Pok&eacute;mon Draft Arena Lobby</p>
        <h1 className="lobby-title">Room Code</h1>
        <div className="room-code">{displayRoomCode}</div>

        {isLoading && <p className="waiting-message">Loading room...</p>}

        {!isLoading && room && (
          <>
            <div className="player-list">
              <div className="player-row">
                <div>
                  <span>Host</span>
                  <strong>{room.hostUsername}</strong>
                </div>
                <ReadyStatus isReady={hostReady} />
              </div>
              <div className="player-row">
                <div>
                  <span>Guest</span>
                  <strong>{room.guestUsername || 'Waiting...'}</strong>
                </div>
                {hasGuest && <ReadyStatus isReady={guestReady} />}
              </div>
            </div>

            {!draftStarted && (
              <p className={`waiting-message ${bothReady ? 'opponent-joined' : ''}`}>
                <span className="status-dot" />
                {bothReady
                  ? 'Both trainers are ready!'
                  : hasGuest
                    ? 'Opponent joined!'
                    : 'Waiting for opponent...'}
              </p>
            )}

            {draftStarted && (
              <p className="waiting-message opponent-joined">
                <span className="status-dot" />
                Draft started!
              </p>
            )}

            {currentPlayer && !draftStarted && (
              <div className="lobby-actions">
                <button
                  className={`game-button ${
                    currentPlayer.ready
                      ? 'game-button-secondary'
                      : 'game-button-primary'
                  }`}
                  type="button"
                  onClick={handleReadyToggle}
                  disabled={isActionPending}
                >
                  {pendingAction === 'ready'
                    ? 'Updating...'
                    : currentPlayer.ready
                      ? 'Not Ready'
                      : 'Ready'}
                </button>

                {bothReady && isHost && (
                  <button
                    className="game-button game-button-primary"
                    type="button"
                    onClick={handleStartDraft}
                    disabled={isActionPending}
                  >
                    {pendingAction === 'draft' ? 'Starting Draft...' : 'Start Draft'}
                  </button>
                )}

                {bothReady && !isHost && (
                  <p className="host-waiting-message">Waiting for host...</p>
                )}
              </div>
            )}
          </>
        )}

        {!isLoading && errorMessage && (
          <div className="room-error lobby-error" role="alert" aria-live="polite">
            {errorMessage}
          </div>
        )}

        <Link className="back-link" to="/">&larr; Back to Home</Link>
      </section>

      <footer className="site-footer">
        Fan-made Pok&eacute;mon Draft Strategy Game
      </footer>
    </main>
  )
}

export default RoomLobby
