import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { joinRoom } from '../services/roomService.js'

function JoinRoom({
  currentUser,
  userProfile,
  onManualNavigation,
}) {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleJoinRoom(event) {
    event.preventDefault()
    onManualNavigation?.()
    setIsJoining(true)
    setErrorMessage('')

    try {
      const normalizedRoomCode = await joinRoom(
        roomCode,
        currentUser,
        userProfile,
      )
      navigate(`/room/${normalizedRoomCode}`)
    } catch (error) {
      setErrorMessage(error.message || 'Could not join the room. Please try again.')
    } finally {
      setIsJoining(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="game-card placeholder-card">
        <div className="page-icon" aria-hidden="true">#</div>
        <p className="eyebrow">Trainer Lobby</p>
        <h1>Join Room</h1>
        <p className="subtitle">Enter the 6-character code from the host.</p>

        <form className="join-room-form" onSubmit={handleJoinRoom}>
          <label htmlFor="room-code">Room Code</label>
          <input
            id="room-code"
            name="roomCode"
            type="text"
            value={roomCode}
            onChange={(event) => {
              setRoomCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              )
            }}
            placeholder="ABC123"
            maxLength={6}
            autoComplete="off"
            disabled={isJoining}
          />

          <button
            className="game-button game-button-primary"
            type="submit"
            disabled={isJoining}
          >
            {isJoining ? 'Joining Room...' : 'Join Room'}
          </button>
        </form>

        <div className="room-error" role="alert" aria-live="polite">
          {errorMessage}
        </div>

        <Link
          className="back-link room-back-link"
          to="/"
          onClick={onManualNavigation}
        >
          &larr; Back to Home
        </Link>
      </section>
      <footer className="site-footer">
        Fan-made Pok&eacute;mon Draft Strategy Game
      </footer>
    </main>
  )
}

export default JoinRoom
