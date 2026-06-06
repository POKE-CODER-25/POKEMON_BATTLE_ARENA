import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase.js'
import {
  ensureRoundOneStarterOptions,
  lockDraftPick,
} from '../services/roomService.js'

function ClosedPokeball() {
  return (
    <div className="draft-pokeball" aria-hidden="true">
      <span />
    </div>
  )
}

function DraftPage({ currentUser }) {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [starterOptions, setStarterOptions] = useState([])
  const [lockedSelection, setLockedSelection] = useState(null)
  const [pendingSelectedIndex, setPendingSelectedIndex] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectionError, setSelectionError] = useState('')

  useEffect(() => {
    return onSnapshot(
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
  }, [displayRoomCode])

  useEffect(() => {
    if (
      room?.status !== 'draft' ||
      room?.draft?.currentRound !== 1 ||
      !currentUser?.uid
    ) {
      return
    }

    ensureRoundOneStarterOptions(displayRoomCode, currentUser).catch((error) => {
      setErrorMessage(error.message || 'Could not initialize starter options.')
    })
  }, [currentUser, displayRoomCode, room?.draft?.currentRound, room?.status])

  useEffect(() => {
    if (!currentUser?.uid) {
      return undefined
    }

    return onSnapshot(
      doc(
        db,
        'rooms',
        displayRoomCode,
        'draftOptions',
        currentUser.uid,
      ),
      (optionsSnapshot) => {
        if (!optionsSnapshot.exists()) {
          setStarterOptions([])
          setOptionsLoading(true)
          return
        }

        const optionData = optionsSnapshot.data()
        const options = optionData.options || []

        setStarterOptions(options)
        setLockedSelection(
          optionData.locked
            ? {
                selectedIndex: optionData.selectedIndex,
                selectedPokemon: optionData.selectedPokemon,
              }
            : null,
        )
        setPendingSelectedIndex(null)
        setSelectionError('')
        setOptionsLoading(false)
        console.info(
          `Received ${options.length} private starter options for room ${displayRoomCode}`,
        )
      },
      () => {
        setOptionsLoading(false)
        setErrorMessage('Could not load your starter options.')
      },
    )
  }, [currentUser?.uid, displayRoomCode])

  async function handleStarterPick(selectedIndex) {
    if (lockedSelection || pendingSelectedIndex !== null) {
      return
    }

    setSelectionError('')
    setPendingSelectedIndex(selectedIndex)

    try {
      await lockDraftPick(
        displayRoomCode,
        currentUser,
        selectedIndex,
      )
    } catch (error) {
      setPendingSelectedIndex(null)
      setSelectionError(
        error.message || 'Could not lock your starter choice.',
      )
    }
  }

  const isRoomPlayer = Boolean(room?.players?.[currentUser?.uid])
  const currentUsername = room?.players?.[currentUser?.uid]?.username
  const opponentUid =
    room?.hostUid === currentUser?.uid ? room?.guestUid : room?.hostUid
  const yourTeamCount = room?.teams?.[currentUser?.uid]?.length ?? 0
  const opponentTeamCount = room?.teams?.[opponentUid]?.length ?? 0
  const draftStateMissing = Boolean(room?.status === 'draft' && !room?.draft)
  const selectedIndex =
    lockedSelection?.selectedIndex ?? pendingSelectedIndex
  const choicesRevealed =
    Boolean(lockedSelection) || pendingSelectedIndex !== null
  const draftComplete = room?.status === 'draft_complete'

  return (
    <main className="page-shell draft-page-shell">
      <section className="draft-container">
        <header className="draft-header">
          <div>
            <p className="eyebrow">Room {displayRoomCode}</p>
            <h1>Draft Arena</h1>
            <p className="draft-coming-soon">
              {draftComplete
                ? 'All six rounds are complete.'
                : 'Choose one Pok&eacute;ball by luck.'}
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
              Choose carefully. Your first click is final.
            </p>
          </section>
        )}

        {!isLoading && room?.draft && !isRoomPlayer && (
          <div className="draft-state-panel draft-state-error" role="alert">
            You are not a player in this room.
          </div>
        )}

        {!isLoading && draftComplete && isRoomPlayer && (
          <section className="draft-complete-panel">
            <p className="eyebrow">Six Rounds Complete</p>
            <h2>Draft Complete</h2>
            <p>Both trainers have completed their teams.</p>
          </section>
        )}

        {!isLoading &&
          room?.status === 'draft' &&
          room?.draft?.currentRound >= 1 &&
          room?.draft?.currentRound <= 6 &&
          isRoomPlayer && (
            <section className="starter-choice-panel">
              <h2>Choose Your {room.draft.roundName} Pok&eacute;ball</h2>

              {optionsLoading && (
                <p className="starter-help">Preparing your private choices...</p>
              )}

              {!optionsLoading && starterOptions.length === 3 && (
                <>
                  <div className="starter-options">
                    {starterOptions.map((pokemon, index) => (
                      <button
                        className={`starter-option ${
                          choicesRevealed ? 'is-revealed' : ''
                        } ${selectedIndex === index ? 'is-selected' : ''}`}
                        type="button"
                        key={pokemon.id}
                        onClick={() => handleStarterPick(index)}
                        disabled={choicesRevealed}
                      >
                        {!choicesRevealed && (
                          <>
                            <ClosedPokeball />
                            <span>Pok&eacute;ball {index + 1}</span>
                          </>
                        )}

                        {choicesRevealed && (
                          <>
                            <img
                              src={pokemon.sprite}
                              alt={pokemon.name}
                              width="150"
                              height="150"
                            />
                            <strong>{pokemon.name}</strong>
                            <span>{pokemon.types.join(' / ')}</span>
                            {selectedIndex === index && (
                              <span className="selected-pick-label">
                                Your Pick
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    ))}
                  </div>

                  {choicesRevealed && (
                    <p className="starter-locked-message">
                      {lockedSelection
                        ? `${lockedSelection.selectedPokemon.name} is locked in.`
                        : 'Locking your starter...'}
                    </p>
                  )}

                  {selectionError && (
                    <p className="starter-selection-error" role="alert">
                      {selectionError}
                    </p>
                  )}
                </>
              )}
            </section>
          )}

        <Link className="back-link draft-back-link" to={`/room/${displayRoomCode}`}>
          &larr; Back to Lobby
        </Link>
      </section>
    </main>
  )
}

export default DraftPage
