import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase.js'

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

  return (
    <main className="page-shell draft-page-shell">
      <section className="draft-container battle-arena-container">
        <header className="draft-header">
          <div>
            <p className="eyebrow">Battle Setup</p>
            <h1>Battle Arena</h1>
            <p className="draft-coming-soon">
              Choose phase foundation is ready.
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
                  <span>Score</span>
                  <strong>
                    Host {battleState.hostScore} - Guest{' '}
                    {battleState.guestScore}
                  </strong>
                </div>
                <div>
                  <span>Phase</span>
                  <strong>{battleState.phase}</strong>
                </div>
              </div>
            </section>

            <section className="battle-arena-summary">
              <div className="battle-arena-team-count">
                <span>Your Team</span>
                <strong>{yourTeamCount} Pok&eacute;mon</strong>
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
