import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { surrenderRoom } from '../services/roomService.js'

function SurrenderControl({
  roomCode,
  currentUser,
  username,
  hidden = false,
  onRoomLeft,
  onManualNavigation,
}) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (hidden) {
    return null
  }

  async function handleConfirm() {
    if (isSubmitting) {
      return
    }

    onManualNavigation?.()
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await surrenderRoom({
        roomCode,
        playerUid: currentUser.uid,
        username,
      })
      onRoomLeft?.()
      navigate('/', {
        replace: true,
        state: { skipRoomResume: true },
      })
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not surrender this room.',
      )
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        className="surrender-button"
        type="button"
        onClick={() => {
          setErrorMessage('')
          setIsOpen(true)
        }}
      >
        Surrender
      </button>

      {isOpen && (
        <div className="surrender-modal-backdrop" role="presentation">
          <section
            className="surrender-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="surrender-title"
          >
            <h2 id="surrender-title">Surrender Room?</h2>
            <p>
              Are you sure? You will be declared as the loser of this
              room.
            </p>
            <div>
              <button
                className="game-button game-button-primary"
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirm}
              >
                {isSubmitting ? 'Surrendering...' : 'Yes'}
              </button>
              <button
                className="game-button"
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsOpen(false)}
              >
                No
              </button>
            </div>
            {errorMessage && (
              <p className="battle-lock-error" role="alert">
                {errorMessage}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}

export default SurrenderControl
