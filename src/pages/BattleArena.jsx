import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { resolveBattleRound } from '../data/battleRoundResolver.js'
import { allBattlePokemon } from '../data/pokemonBattleData.js'
import {
  getDraftPickLabel,
  getOrderedDraftPicks,
} from '../data/draftTeamStructure.js'
import { db } from '../firebase.js'
import { lockBattlePokemon } from '../services/roomService.js'

const ROUND_WINS_NEEDED = 4
const EMPTY_BATTLEFIELD_EFFECTS = []
const REVEALED_BATTLE_PHASES = new Set([
  'reveal',
  'score_breakdown',
  'round_result',
])

function findSelectedPokemon(selection, team = []) {
  if (!selection) {
    return null
  }

  const matchesSelection = (pokemon) =>
    String(pokemon.id) === String(selection.pokemonId) ||
    pokemon.name === selection.pokemonName

  return team.find(matchesSelection) ?? allBattlePokemon.find(matchesSelection)
}

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
  const [selectedPokemonId, setSelectedPokemonId] = useState(null)
  const [isLockingFighter, setIsLockingFighter] = useState(false)
  const [lockErrorMessage, setLockErrorMessage] = useState('')

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
  const opponentUid = isHost ? room?.guestUid : room?.hostUid
  const currentRound = battleState?.currentRound ?? battleState?.round ?? 1
  const yourScore =
    battleState?.playerScores?.[currentUser?.uid] ??
    (isHost
      ? battleState?.hostScore ?? 0
      : battleState?.guestScore ?? 0)
  const opponentScore =
    battleState?.playerScores?.[opponentUid] ??
    (isHost
      ? battleState?.guestScore ?? 0
      : battleState?.hostScore ?? 0)
  const orderedDraftPicks = useMemo(
    () => getOrderedDraftPicks(draftTeam?.picks),
    [draftTeam?.picks],
  )
  const currentPlayerSelection =
    battleState?.selections?.[currentUser?.uid] ?? null
  const opponentHasLocked = Boolean(
    opponentUid && battleState?.selections?.[opponentUid],
  )
  const currentPlayerHasLocked = Boolean(currentPlayerSelection)
  const bothPlayersLocked = currentPlayerHasLocked && opponentHasLocked
  const opponentSelection = bothPlayersLocked
    ? battleState.selections[opponentUid]
    : null
  const activeSelectedPokemonId =
    currentPlayerSelection?.pokemonId ?? selectedPokemonId
  const legacyUsedPokemon = isHost
    ? battleState?.hostUsedPokemon
    : battleState?.guestUsedPokemon
  const usedPokemonIds = useMemo(() => {
    const usedPokemon =
      battleState?.usedPokemon?.[currentUser?.uid] ??
      legacyUsedPokemon ??
      []

    return new Set(
      usedPokemon.map((entry) =>
        String(typeof entry === 'object' ? entry?.id : entry),
      ),
    )
  }, [
    battleState?.usedPokemon,
    currentUser?.uid,
    legacyUsedPokemon,
  ])
  const selectedPokemon = orderedDraftPicks.find(
    (pokemon) => String(pokemon.id) === String(activeSelectedPokemonId),
  )
  const selectedPokemonIsUsed = selectedPokemon
    ? usedPokemonIds.has(String(selectedPokemon.id))
    : false
  const selectionIsOpen =
    (battleState?.phase ?? 'choose_pokemon') === 'choose_pokemon'
  const currentPlayerBattlefieldEffects =
    battleState?.battlefieldEffects?.[currentUser?.uid] ??
    EMPTY_BATTLEFIELD_EFFECTS
  const opponentBattlefieldEffects =
    battleState?.battlefieldEffects?.[opponentUid] ??
    EMPTY_BATTLEFIELD_EFFECTS
  const lockedPlayerPokemon = bothPlayersLocked
    ? findSelectedPokemon(currentPlayerSelection, orderedDraftPicks)
    : null
  const lockedOpponentPokemon = bothPlayersLocked
    ? findSelectedPokemon(opponentSelection)
    : null
  const lockedBattlePreview = useMemo(() => {
    if (
      !bothPlayersLocked ||
      !lockedPlayerPokemon ||
      !lockedOpponentPokemon
    ) {
      return null
    }

    return resolveBattleRound({
      pokemonA: lockedPlayerPokemon,
      pokemonB: lockedOpponentPokemon,
      roundNumber: currentRound,
      playerAScore: yourScore,
      playerBScore: opponentScore,
      battlefieldEffectsA: currentPlayerBattlefieldEffects,
      battlefieldEffectsB: opponentBattlefieldEffects,
      teamA: orderedDraftPicks,
      teamB: [],
      isMasterRound: false,
    })
  }, [
    bothPlayersLocked,
    currentPlayerBattlefieldEffects,
    currentRound,
    lockedOpponentPokemon,
    lockedPlayerPokemon,
    opponentBattlefieldEffects,
    opponentScore,
    orderedDraftPicks,
    yourScore,
  ])

  async function handleLockFighter() {
    if (
      !selectedPokemon ||
      selectedPokemonIsUsed ||
      currentPlayerHasLocked ||
      isLockingFighter
    ) {
      return
    }

    setIsLockingFighter(true)
    setLockErrorMessage('')

    try {
      await lockBattlePokemon(
        displayRoomCode,
        currentUser.uid,
        selectedPokemon,
      )
    } catch (error) {
      setLockErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not lock this fighter.',
      )
    } finally {
      setIsLockingFighter(false)
    }
  }

  const opponentPokemon =
    battleState &&
    REVEALED_BATTLE_PHASES.has(battleState.phase)
      ? isHost
        ? battleState.guestSubmittedPokemon
        : battleState.hostSubmittedPokemon
      : null
  const previewPokemonA = orderedDraftPicks[0]
  const previewPokemonB = opponentPokemon ?? orderedDraftPicks[1]
  const previewMode = opponentPokemon
    ? 'Opponent Team Preview'
    : 'Local Team Preview'
  const battlePreview = useMemo(() => {
    if (!import.meta.env.DEV || !previewPokemonA || !previewPokemonB) {
      return null
    }

    return resolveBattleRound({
      pokemonA: previewPokemonA,
      pokemonB: previewPokemonB,
      roundNumber: battleState?.round || 1,
      playerAScore: yourScore,
      playerBScore: opponentScore,
      teamA: orderedDraftPicks,
      teamB: opponentPokemon ? [opponentPokemon] : orderedDraftPicks,
      isMasterRound: false,
    })
  }, [
    battleState?.round,
    opponentPokemon,
    opponentScore,
    orderedDraftPicks,
    previewPokemonA,
    previewPokemonB,
    yourScore,
  ])

  return (
    <main className="page-shell draft-page-shell battle-arena-page">
      <section className="draft-container battle-arena-container">
        <header className="draft-header battle-arena-header">
          <div>
            <p className="eyebrow">Trainer Showdown</p>
            <h1>&#9876; Battle Arena</h1>
            <p className="draft-coming-soon">
              Round {currentRound} Begins &mdash; Choose Your
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
                    {currentRound} / {battleState.maxNormalRounds}
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
                  {orderedDraftPicks.map((pokemon) => {
                    const isUsed = usedPokemonIds.has(String(pokemon.id))
                    const isSelected =
                      String(pokemon.id) ===
                      String(activeSelectedPokemonId)

                    return (
                      <button
                        className={`battle-selection-card ${
                          isSelected ? 'is-selected' : ''
                        } ${isUsed ? 'is-used' : ''}`}
                        type="button"
                        key={pokemon.id}
                        disabled={
                          isUsed ||
                          currentPlayerHasLocked ||
                          isLockingFighter ||
                          !selectionIsOpen
                        }
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedPokemonId(pokemon.id)
                          setLockErrorMessage('')
                        }}
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
                        <small>
                          {isUsed
                            ? 'Already Used'
                            : isSelected
                              ? 'Selected'
                              : 'Available'}
                        </small>
                      </button>
                    )
                  })}
                </div>

                <div className="battle-lock-area">
                  <button
                    className="game-button game-button-primary"
                    type="button"
                    disabled={
                      !selectedPokemon ||
                      selectedPokemonIsUsed ||
                      currentPlayerHasLocked ||
                      isLockingFighter ||
                      !selectionIsOpen
                    }
                    onClick={handleLockFighter}
                  >
                    {isLockingFighter ? 'Locking...' : 'Lock Fighter'}
                  </button>

                  {bothPlayersLocked ? (
                    <p>Both trainers locked. Battle reveal ready.</p>
                  ) : currentPlayerHasLocked ? (
                    <p>Fighter locked. Waiting for opponent...</p>
                  ) : (
                    <p>Select one unused Pok&eacute;mon for this round.</p>
                  )}

                  {lockErrorMessage && (
                    <p className="battle-lock-error" role="alert">
                      {lockErrorMessage}
                    </p>
                  )}
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

            {bothPlayersLocked && (
              <section className="draft-state-panel battle-reveal-preview">
                <p className="eyebrow">Battle Reveal Preview</p>

                {!lockedBattlePreview && (
                  <p>
                    Battle reveal waiting for selected opponent fighter
                    data.
                  </p>
                )}

                {lockedBattlePreview && (
                  <>
                    <div className="battle-reveal-fighters">
                      <div>
                        <span>Your Fighter</span>
                        <strong>
                          {lockedBattlePreview.playerAState.pokemon.name}
                        </strong>
                        <small>
                          Final Score:{' '}
                          {lockedBattlePreview.playerAState.finalScore}
                        </small>
                      </div>
                      <div>
                        <span>Opponent Fighter</span>
                        <strong>
                          {lockedBattlePreview.playerBState.pokemon.name}
                        </strong>
                        <small>
                          Final Score:{' '}
                          {lockedBattlePreview.playerBState.finalScore}
                        </small>
                      </div>
                    </div>

                    <p>
                      <strong>Winner:</strong>{' '}
                      {lockedBattlePreview.winnerResult.reason}
                    </p>
                    <strong>Battle Logs:</strong>
                    <ul>
                      {lockedBattlePreview.logs.map((log, index) => (
                        <li key={`${index}-${log}`}>{log}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {import.meta.env.DEV && (
              <section className="draft-state-panel">
                <p className="eyebrow">Battle Engine Preview DEV ONLY</p>

                {!battlePreview && (
                  <p>Battle preview waiting for enough local team data.</p>
                )}

                {battlePreview && (
                  <>
                    <p>
                      <strong>Preview Mode:</strong> {previewMode}
                    </p>
                    <p>
                      <strong>Pokemon A:</strong>{' '}
                      {battlePreview.playerAState.pokemon.name} -{' '}
                      {battlePreview.playerAState.finalScore}
                    </p>
                    <p>
                      <strong>Pokemon B:</strong>{' '}
                      {battlePreview.playerBState.pokemon.name} -{' '}
                      {battlePreview.playerBState.finalScore}
                    </p>
                    <p>
                      <strong>Winner:</strong>{' '}
                      {battlePreview.winnerResult.reason}
                    </p>
                    <strong>Logs:</strong>
                    <ul>
                      {battlePreview.logs.map((log, index) => (
                        <li key={`${index}-${log}`}>{log}</li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
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
