import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase.js'

function DraftPage({ currentUser }) {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', displayRoomCode),
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
        setErrorMessage('Could not load the draft room.')
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [displayRoomCode])

  const isRoomPlayer = Boolean(room?.players?.[currentUser?.uid])
  const currentUsername = room?.players?.[currentUser?.uid]?.username
  const opponentUid =
    room?.hostUid === currentUser?.uid ? room?.guestUid : room?.hostUid
  const yourTeamCount = room?.teams?.[currentUser?.uid]?.length ?? 0
  const opponentTeamCount = room?.teams?.[opponentUid]?.length ?? 0
  const draftStateMissing = Boolean(
    room?.status === 'draft' && !room?.draft,
  )

  return (
    <main className="page-shell draft-page-shell">
      <section className="draft-container">
        <header className="draft-header">
          <div>
            <p className="eyebrow">Room {displayRoomCode}</p>
            <h1>Draft Arena</h1>
            <p className="draft-coming-soon">
              Pok&eacute;ball choices coming next
            </p>
          </div>

          <div className="draft-room-code">
            <span>Room Code</span>
            <strong>{displayRoomCode}</strong>
          </div>
        </header>

        {isLoading && (
          <div className="draft-state-panel">Loading draft state...</div>
        )}

        {!isLoading && errorMessage && (
          <div className="draft-state-panel draft-state-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!isLoading && draftStateMissing && (
          <div className="draft-state-panel draft-state-error" role="alert">
            Draft state not initialized.
          </div>
        )}

        {!isLoading && room?.draft && isRoomPlayer && (
          <section className="draft-state-panel">
            <div className="draft-round-heading">
              <div>
                <span>Current Round</span>
                <strong>
                  {room.draft.currentRound} / {room.draft.totalRounds}
                </strong>
              </div>
              <div>
                <span>Round Name</span>
                <strong>{room.draft.roundName}</strong>
              </div>
              <div>
                <span>Phase</span>
                <strong>{room.draft.phase}</strong>
              </div>
            </div>

            <div className="draft-team-summary">
              <div>
                <span>Your Trainer</span>
                <strong>{currentUsername}</strong>
              </div>
              <div>
                <span>Your Team</span>
                <strong>{yourTeamCount} / 6</strong>
              </div>
              <div>
                <span>Opponent Team</span>
                <strong>{opponentTeamCount} / 6</strong>
              </div>
            </div>

            <p className="draft-placeholder-message">
              Pok&eacute;ball choices coming next
            </p>
          </section>
        )}

        {!isLoading && room?.draft && !isRoomPlayer && (
          <div className="draft-state-panel draft-state-error" role="alert">
            You are not a player in this room.
          </div>
        )}

        <Link className="back-link draft-back-link" to={`/room/${displayRoomCode}`}>
          &larr; Back to Lobby
        </Link>
      </section>
    </main>
  )
}

export default DraftPage
