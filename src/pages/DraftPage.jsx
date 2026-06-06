import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../firebase.js'
import {
  advancePlayerDraft,
  completePlayerDraft,
  DRAFT_ROUND_NAMES,
  lockDraftPick,
  markPlayerBattleReady,
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
  const navigate = useNavigate()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [draftTeam, setDraftTeam] = useState(null)
  const [draftOptions, setDraftOptions] = useState([])
  const [optionsRound, setOptionsRound] = useState(null)
  const [lockedSelection, setLockedSelection] = useState(null)
  const [pendingSelectedIndex, setPendingSelectedIndex] = useState(null)
  const [pendingAction, setPendingAction] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [privateStateLoading, setPrivateStateLoading] = useState(true)
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
    if (!currentUser?.uid) {
      return undefined
    }

    return onSnapshot(
      doc(
        db,
        'rooms',
        displayRoomCode,
        'draftTeams',
        currentUser.uid,
      ),
      (teamSnapshot) => {
        if (!teamSnapshot.exists()) {
          setDraftTeam(null)
          setPrivateStateLoading(false)
          setErrorMessage('Your private draft state is not initialized.')
          return
        }

        setDraftTeam(teamSnapshot.data())
        setPrivateStateLoading(false)
      },
      () => {
        setPrivateStateLoading(false)
        setErrorMessage('Could not load your private draft state.')
      },
    )
  }, [currentUser?.uid, displayRoomCode])

  useEffect(() => {
    if (room?.status === 'battle_setup') {
      navigate(`/battle/${displayRoomCode}`, { replace: true })
    }
  }, [displayRoomCode, navigate, room?.status])

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
          setDraftOptions([])
          return
        }

        const optionData = optionsSnapshot.data()
        setDraftOptions(optionData.options || [])
        setOptionsRound(optionData.round)
        setLockedSelection(
          optionData.locked
            ? {
                selectedIndex: optionData.selectedIndex,
                selectedPokemon: optionData.selectedPokemon,
              }
            : null,
        )
        setPendingSelectedIndex(null)
        setPendingAction('')
        setSelectionError('')
      },
      () => {
        setErrorMessage('Could not load your private draft options.')
      },
    )
  }, [currentUser?.uid, displayRoomCode])

  async function handlePick(selectedIndex) {
    if (lockedSelection || pendingSelectedIndex !== null) {
      return
    }

    setSelectionError('')
    setPendingSelectedIndex(selectedIndex)

    try {
      await lockDraftPick(displayRoomCode, currentUser, selectedIndex)
    } catch (error) {
      setPendingSelectedIndex(null)
      setSelectionError(error.message || 'Could not lock your choice.')
    }
  }

  async function handleNextRound() {
    setPendingAction('next')
    setSelectionError('')

    try {
      await advancePlayerDraft(displayRoomCode, currentUser)
    } catch (error) {
      setPendingAction('')
      setSelectionError(error.message || 'Could not start the next round.')
    }
  }

  async function handleGoToBattle() {
    setPendingAction('complete')
    setSelectionError('')

    try {
      await completePlayerDraft(displayRoomCode, currentUser)
    } catch (error) {
      setPendingAction('')
      setSelectionError(error.message || 'Could not complete your draft.')
    }
  }

  async function handleBattleReady() {
    setPendingAction('battle-ready')
    setSelectionError('')

    try {
      await markPlayerBattleReady(displayRoomCode, currentUser)
    } catch (error) {
      setPendingAction('')
      setSelectionError(
        error.message || 'Could not enter the battle arena.',
      )
    }
  }

  const isRoomPlayer = Boolean(room?.players?.[currentUser?.uid])
  const currentUsername = room?.players?.[currentUser?.uid]?.username
  const opponentUid =
    room?.hostUid === currentUser?.uid ? room?.guestUid : room?.hostUid
  const yourTeamCount = draftTeam?.picks?.length ?? 0
  const opponentTeamCount = room?.teams?.[opponentUid]?.length ?? 0
  const currentRound =
    draftTeam?.currentRound ?? Math.min((draftTeam?.picks?.length ?? 0) + 1, 6)
  const roundName = DRAFT_ROUND_NAMES[currentRound]
  const selectedIndex =
    lockedSelection?.selectedIndex ?? pendingSelectedIndex
  const choicesRevealed =
    Boolean(lockedSelection) || pendingSelectedIndex !== null
  const teamComplete = yourTeamCount === 6
  const waitingForOpponent =
    Boolean(draftTeam?.completed) && room?.status === 'draft'
  const battleReadyScreen = ['battle_ready', 'battle_setup'].includes(
    room?.status,
  )
  const isHost = room?.hostUid === currentUser?.uid
  const currentPlayerBattleReady = isHost
    ? Boolean(room?.battleReady?.hostReady)
    : Boolean(room?.battleReady?.guestReady)
  const bothPlayersBattleReady = room?.status === 'battle_setup'
  const optionsMatchCurrentRound = optionsRound === currentRound

  return (
    <main className="page-shell draft-page-shell">
      <section className="draft-container">
        <header className="draft-header">
          <div>
            <p className="eyebrow">Room {displayRoomCode}</p>
            <h1>{battleReadyScreen ? 'Battle Ready' : 'Draft Arena'}</h1>
            <p className="draft-coming-soon">
              {battleReadyScreen
                ? 'Review your team before entering the arena.'
                : 'Draft privately at your own pace.'}
            </p>
          </div>

          <div className="draft-room-code">
            <span>Room Code</span>
            <strong>{displayRoomCode}</strong>
          </div>
        </header>

        {(isLoading || privateStateLoading) && (
          <div className="draft-state-panel">Loading draft state...</div>
        )}

        {!isLoading && errorMessage && (
          <div className="draft-state-panel draft-state-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!isLoading &&
          !privateStateLoading &&
          draftTeam &&
          isRoomPlayer &&
          !battleReadyScreen && (
            <section className="draft-state-panel">
              <div className="draft-round-heading">
                <div>
                  <span>Your Round</span>
                  <strong>{Math.min(currentRound, 6)} / 6</strong>
                </div>
                <div>
                  <span>Round Name</span>
                  <strong>{roundName}</strong>
                </div>
                <div>
                  <span>Phase</span>
                  <strong>{room?.draft?.phase || 'active'}</strong>
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
            </section>
          )}

        {!isLoading && room?.draft && !isRoomPlayer && (
          <div className="draft-state-panel draft-state-error" role="alert">
            You are not a player in this room.
          </div>
        )}

        {!privateStateLoading &&
          draftTeam &&
          !draftTeam.completed &&
          (!teamComplete || lockedSelection) && (
            <section className="starter-choice-panel">
              <h2>Choose Your {roundName} Pok&eacute;ball</h2>
              <p className="starter-help">
                Your first click is final for this round.
              </p>

              {!optionsMatchCurrentRound && (
                <p className="starter-help">Preparing your private choices...</p>
              )}

              {optionsMatchCurrentRound && draftOptions.length === 3 && (
                <div className="starter-options">
                  {draftOptions.map((pokemon, index) => (
                    <button
                      className={`starter-option ${
                        choicesRevealed ? 'is-revealed' : ''
                      } ${selectedIndex === index ? 'is-selected' : ''}`}
                      type="button"
                      key={pokemon.id}
                      onClick={() => handlePick(index)}
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
              )}

              {lockedSelection && !teamComplete && (
                <div className="draft-next-area">
                  <p className="starter-locked-message">
                    {lockedSelection.selectedPokemon.name} is locked in.
                  </p>
                  <button
                    className="game-button game-button-primary"
                    type="button"
                    onClick={handleNextRound}
                    disabled={pendingAction === 'next'}
                  >
                    {pendingAction === 'next' ? 'Loading Next Round...' : 'Next'}
                  </button>
                </div>
              )}

              {selectionError && (
                <p className="starter-selection-error" role="alert">
                  {selectionError}
                </p>
              )}
            </section>
          )}

        {!privateStateLoading &&
          draftTeam &&
          teamComplete &&
          !draftTeam.completed && (
            <section className="draft-complete-panel">
              <p className="eyebrow">Six Picks Locked</p>
              <h2>Your Team Is Complete</h2>
              <p>Your opponent still cannot see your Pok&eacute;mon.</p>
              <button
                className="game-button game-button-primary draft-complete-button"
                type="button"
                onClick={handleGoToBattle}
                disabled={pendingAction === 'complete'}
              >
                {pendingAction === 'complete'
                  ? 'Finishing Draft...'
                  : 'Go to Battle'}
              </button>
              {selectionError && (
                <p className="starter-selection-error" role="alert">
                  {selectionError}
                </p>
              )}
            </section>
          )}

        {waitingForOpponent && (
          <section className="draft-complete-panel">
            <p className="eyebrow">Your Draft Is Complete</p>
            <h2>Waiting for opponent to finish drafting...</h2>
          </section>
        )}

        {battleReadyScreen && draftTeam && (
          <section className="battle-ready-panel">
            <div className="battle-ready-heading">
              <p className="eyebrow">Both Drafts Complete</p>
              <h2>Battle Ready</h2>
            </div>

            <div className="battle-ready-columns">
              <div>
                <h3>Your Team</h3>
                <div className="battle-team-grid">
                  {draftTeam.picks.map((pokemon) => (
                    <article className="battle-team-card" key={pokemon.id}>
                      <img
                        src={pokemon.sprite}
                        alt={pokemon.name}
                        width="120"
                        height="120"
                      />
                      <strong>{pokemon.name}</strong>
                      <div className="battle-type-list">
                        {pokemon.types.map((type) => (
                          <span key={type}>{type}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="opponent-hidden-team">
                <h3>Opponent Team</h3>
                <p>Hidden Until Battle</p>
                <div className="opponent-pokeball-grid">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      className="opponent-pokeball"
                      key={`opponent-pokeball-${index + 1}`}
                      aria-label={`Hidden opponent Pokemon ${index + 1}`}
                    >
                      <span />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="battle-ready-action">
              <button
                className="game-button game-button-primary"
                type="button"
                onClick={handleBattleReady}
                disabled={
                  currentPlayerBattleReady ||
                  bothPlayersBattleReady ||
                  pendingAction === 'battle-ready'
                }
              >
                {bothPlayersBattleReady
                  ? 'Battle Setup Ready'
                  : currentPlayerBattleReady
                    ? 'Ready for Battle'
                    : pendingAction === 'battle-ready'
                      ? 'Entering Arena...'
                      : 'Enter Battle Arena'}
              </button>

              {currentPlayerBattleReady && !bothPlayersBattleReady && (
                <p>Waiting for opponent...</p>
              )}

              {bothPlayersBattleReady && (
                <p>Both trainers are ready. Battle setup is next.</p>
              )}

              {selectionError && (
                <p className="starter-selection-error" role="alert">
                  {selectionError}
                </p>
              )}
            </div>
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
