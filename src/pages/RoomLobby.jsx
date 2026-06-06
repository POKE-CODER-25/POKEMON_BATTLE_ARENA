import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase.js'

function RoomLobby() {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
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

  const hasGuest = Boolean(room?.guestUid)

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

        {!isLoading && errorMessage && (
          <div className="room-error lobby-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!isLoading && room && (
          <>
            <div className="player-list">
              <div className="player-row">
                <span>Host</span>
                <strong>{room.hostUsername}</strong>
              </div>
              <div className="player-row">
                <span>Guest</span>
                <strong>{room.guestUsername || 'Waiting...'}</strong>
              </div>
            </div>

            <p className={`waiting-message ${hasGuest ? 'opponent-joined' : ''}`}>
              <span className="status-dot" />
              {hasGuest ? 'Opponent joined!' : 'Waiting for opponent...'}
            </p>
          </>
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
