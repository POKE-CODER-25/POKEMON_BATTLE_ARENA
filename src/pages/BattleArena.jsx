import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import {
  getDraftPickLabel,
  getOrderedDraftPicks,
} from '../data/draftTeamStructure.js'
import { db } from '../firebase.js'

const ROUND_WINS_NEEDED = 4

function RoundScoreRow({ label, score }) {
  return (
    <div className="round-score-row">
      <span>{label}</span>
      <div
        className="round-score-dots"
        aria-label={`${label}: ${score} of ${ROUND_WINS_NEEDED} rounds won`}
      >
        {Array.from({ length: ROUND_WINS_NEEDED }, (_, index) => (
          <span
            className={index < score ? 'is-won' : ''}
            key={`${label}-round-${index + 1}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

function BattleArena({ currentUser }) {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [battleState, setBattleState] = useState(null)
  const [draftTeam, setDraftTeam] = useState(null)
  const [roomLoading, setRoomLoading] = useState(true)
  const [battleLoading, setBattleLoading] = useState(true)
  const [teamLoading, setTeamLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    return onSnapshot(
      doc(db, 'rooms', displayRoomCode),
      (snapshot) => {
        if (!snapshot.exists()) {
          setRoom(null)
          setErrorMessage('Room not found')
        } else {
          setRoom(snapshot.data())
          setErrorMessage('')
        }

        setRoomLoading(false)
      },
      () => {
        setErrorMessage('Could not load the battle room.')
        setRoomLoading(false)
      },
    )
  }, [displayRoomCode])

  useEffect(() => {
    return onSnapshot(
      doc(db, 'rooms', displayRoomCode, 'battle', 'state'),
      (snapshot) => {
        setBattleState(snapshot.exists() ? snapshot.data() : null)
        setBattleLoading(false)
      },
      () => {
        setErrorMessage('Could not load the battle state.')
        setBattleLoading(false)
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
      (snapshot) => {
        setDraftTeam(snapshot.exists() ? snapshot.data() : null)
        setTeamLoading(false)
      },
      () => {
        setErrorMessage('Could not load your private team.')
        setTeamLoading(false)
      },
    )
  }, [currentUser?.uid, displayRoomCode])

  const isLoading = roomLoading || battleLoading || teamLoading
  const isRoomPlayer = Boolean(room?.players?.[currentUser?.uid])
  const yourTeamCount = draftTeam?.picks?.length ?? 0
  const isHost = room?.hostUid === currentUser?.uid
  const yourScore = isHost
    ? battleState?.hostScore ?? 0
    : battleState?.guestScore ?? 0
  const opponentScore = isHost
    ? battleState?.guestScore ?? 0
    : battleState?.hostScore ?? 0
  const orderedDraftPicks = getOrderedDraftPicks(draftTeam?.picks)

  return (
    <main className="page-shell draft-page-shell battle-arena-page">
      <section className="draft-container battle-arena-container">
        <header className="draft-header battle-arena-header">
          <div>
            <p className="eyebrow">Trainer Showdown</p>
            <h1>&#9876; Battle Arena</h1>
            <p className="draft-coming-soon">
              Round {battleState?.round ?? 1} Begins &mdash; Choose Your
              Pok&eacute;mon
            </p>
          </div>

          <div className="draft-room-code">
            <span>Room Code</span>
            <strong>{displayRoomCode}</strong>
          </div>
        </header>

        {isLoading && (
          <div className="draft-state-panel">Loading battle state...</div>
        )}

        {!isLoading && errorMessage && (
          <div className="draft-state-panel draft-state-error" role="alert">
            {errorMessage}
          </div>
        )}

        {!isLoading && room && !isRoomPlayer && (
          <div className="draft-state-panel draft-state-error" role="alert">
            You are not a player in this room.
          </div>
        )}

        {!isLoading &&
          room &&
          isRoomPlayer &&
          room.status !== 'battle_setup' && (
            <div className="draft-state-panel draft-state-error" role="alert">
              This battle is not ready yet.
            </div>
          )}

        {!isLoading &&
          room?.status === 'battle_setup' &&
          isRoomPlayer &&
          !battleState && (
            <div className="draft-state-panel draft-state-error" role="alert">
              Battle state is not initialized.
            </div>
          )}

        {!isLoading && battleState && isRoomPlayer && (
          <>
            <section className="draft-state-panel battle-state-panel">
              <div className="draft-round-heading">
                <div>
                  <span>Round</span>
                  <strong>
                    {battleState.round} / {battleState.maxNormalRounds}
                  </strong>
                </div>
                <div>
                  <span>Trainer Score</span>
                  <strong>
                    {yourScore} - {opponentScore}
                  </strong>
                </div>
                <div>
                  <span>Battle Phase</span>
                  <strong>Choose Pok&eacute;mon</strong>
                </div>
              </div>

              <div className="round-score">
                <h2>&#9876; Round Score</h2>
                <RoundScoreRow label="You" score={yourScore} />
                <RoundScoreRow label="Opponent" score={opponentScore} />
              </div>
            </section>

            <section className="battle-arena-summary">
              <div className="battle-arena-your-team">
                <div className="battle-section-heading">
                  <div>
                    <p className="eyebrow">Your Team</p>
                    <h2>Choose Your Fighter</h2>
                  </div>
                  <span>{yourTeamCount} / 6</span>
                </div>

                <div className="battle-selection-grid">
                  {orderedDraftPicks.map((pokemon) => (
                    <button
                      className="battle-selection-card"
                      type="button"
                      key={pokemon.id}
                      disabled
                    >
                      <img
                        src={pokemon.sprite}
                        alt={pokemon.name}
                        width="120"
                        height="120"
                      />
                      <strong>{pokemon.name}</strong>
                      <small>{getDraftPickLabel(pokemon)}</small>
                      <div className="battle-type-list">
                        {pokemon.types.map((type) => (
                          <span key={type}>{type}</span>
                        ))}
                      </div>
                      <small>Available</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="opponent-hidden-team">
                <h2>Opponent Team</h2>
                <p>Hidden During Selection</p>
                <div className="opponent-pokeball-grid">
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      className="opponent-pokeball"
                      key={`battle-opponent-pokeball-${index + 1}`}
                      aria-label={`Hidden opponent Pokemon ${index + 1}`}
                    >
                      <span />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        <Link className="back-link draft-back-link" to={`/draft/${displayRoomCode}`}>
          &larr; Back to Battle Ready
        </Link>
      </section>
    </main>
  )
}

export default BattleArena
