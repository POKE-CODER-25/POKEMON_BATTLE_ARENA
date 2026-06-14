import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RoomPresence from '../components/RoomPresence.jsx'
import SurrenderControl from '../components/SurrenderControl.jsx'
import { db } from '../firebase.js'
import {
  leavePreGameRoom,
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

function RoomLobby({
  currentUser,
  onRoomLeft,
  onManualNavigation,
}) {
  const { roomCode = '' } = useParams()
  const navigate = useNavigate()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

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

  useEffect(() => {
    if (room?.status === 'draft') {
      navigate(`/draft/${displayRoomCode}`, { replace: true })
    }

    if (room?.status === 'battle_setup') {
      navigate(`/battle/${displayRoomCode}`, { replace: true })
    }
  }, [displayRoomCode, navigate, room?.status])

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

  async function handleLeaveRoom() {
    if (pendingAction) {
      return
    }

    onManualNavigation?.()
    setPendingAction('leave')
    setErrorMessage('')

    try {
      await leavePreGameRoom({
        roomCode: displayRoomCode,
        playerUid: currentUser.uid,
      })
      onRoomLeft?.()
      navigate('/', {
        replace: true,
        state: { skipRoomResume: true },
      })
    } catch (error) {
      setErrorMessage(
        error.message || 'Could not leave the room. Please try again.',
      )
      setPendingAction('')
    }
  }

  async function handleCopyRoomCode() {
    try {
      await navigator.clipboard.writeText(displayRoomCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 1600)
    } catch {
      setErrorMessage('Could not copy the room code.')
    }
  }

  const hasGuest = Boolean(room?.guestUid)
  const hostReady = Boolean(room?.players?.[room?.hostUid]?.ready)
  const guestReady = Boolean(room?.players?.[room?.guestUid]?.ready)
  const bothReady = Boolean(hasGuest && hostReady && guestReady)
  const currentPlayer = room?.players?.[currentUser?.uid]
  const isHost = room?.hostUid === currentUser?.uid
  const draftStarted = room?.status === 'draft'
  const opponentUid = isHost ? room?.guestUid : room?.hostUid
  const opponentPresence = room?.presence?.[opponentUid]
  const opponentLeft =
    room?.status === 'closed' ||
    room?.players?.[opponentUid]?.active === false ||
    ['left', 'surrendered', 'afk_lost'].includes(opponentPresence?.status)
  const isActionPending = Boolean(pendingAction)

  return (
    <main className="page-shell">
      <div className="arena-stage" aria-hidden="true">
        <span className="arena-line arena-line-left" />
        <span className="arena-line arena-line-right" />
        <span className="arena-circle" />
      </div>

      <section className="game-card lobby-card premium-lobby-card">
        <div className="pokeball small-pokeball" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">Multiplayer Lobby</p>
        <h1 className="lobby-title">Arena Ready</h1>
        <div className="room-code-panel">
          <span>Room Code</span>
          <div className="room-code">{displayRoomCode}</div>
          <button
            className="room-copy-button"
            type="button"
            onClick={handleCopyRoomCode}
          >
            {codeCopied ? 'Copied' : 'Copy Code'}
          </button>
        </div>

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

            {!draftStarted && !opponentLeft && (
              <p className={`waiting-message ${bothReady ? 'opponent-joined' : ''}`}>
                <span className="status-dot" />
                {bothReady
                  ? 'Both trainers are ready!'
                  : hasGuest
                    ? 'Opponent joined!'
                    : 'Waiting for opponent...'}
              </p>
            )}

            {!draftStarted && opponentLeft && (
              <p className="waiting-message">
                Opponent left the room.
              </p>
            )}

            {draftStarted && (
              <div className="lobby-actions">
                <p className="waiting-message opponent-joined">
                  <span className="status-dot" />
                  Draft started!
                </p>
                <Link
                  className="game-button game-button-primary"
                  to={`/draft/${displayRoomCode}`}
                >
                  Enter Draft
                </Link>
              </div>
            )}

            {currentPlayer && !draftStarted && !opponentLeft && (
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

            {currentPlayer && !draftStarted && (
              <div className="lobby-actions">
                <button
                  className="game-button"
                  type="button"
                  onClick={handleLeaveRoom}
                  disabled={isActionPending}
                >
                  {pendingAction === 'leave'
                    ? 'Leaving...'
                    : 'Back to Home'}
                </button>
              </div>
            )}
          </>
        )}

        {!isLoading && errorMessage && (
          <div className="room-error lobby-error" role="alert" aria-live="polite">
            {errorMessage}
          </div>
        )}

      </section>

      {currentPlayer && (
        <>
          <RoomPresence
            roomCode={displayRoomCode}
            room={room}
            currentUser={currentUser}
          />
          <SurrenderControl
            roomCode={displayRoomCode}
            currentUser={currentUser}
            username={currentPlayer.username}
            hidden={!draftStarted || room?.status === 'closed'}
            onRoomLeft={onRoomLeft}
            onManualNavigation={onManualNavigation}
          />
        </>
      )}

      <footer className="site-footer">Pok&eacute;mon Battle Cards</footer>
    </main>
  )
}

export default RoomLobby
