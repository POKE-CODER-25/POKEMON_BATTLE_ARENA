import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createRoom } from '../services/roomService.js'

function CreateRoom({
  currentUser,
  userProfile,
  onManualNavigation,
}) {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleCreateRoom() {
    onManualNavigation?.()
    setIsCreating(true)
    setErrorMessage('')

    try {
      const roomCode = await createRoom(currentUser, userProfile)
      console.info(`Room created successfully: ${roomCode}`)
      navigate(`/room/${roomCode}`)
    } catch (error) {
      console.error('Room creation failed:', error)
      setErrorMessage(error.message || 'Could not create a room. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="game-card placeholder-card">
        <div className="page-icon" aria-hidden="true">+</div>
        <p className="eyebrow">Trainer Lobby</p>
        <h1>Create Room</h1>
        <p className="subtitle">
          Start a private arena and invite another trainer.
        </p>

        <div className="room-action">
          <button
            className="game-button game-button-primary"
            type="button"
            onClick={handleCreateRoom}
            disabled={isCreating}
          >
            {isCreating ? 'Creating Room...' : 'Create Room'}
          </button>
        </div>

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

export default CreateRoom
