import { useEffect, useState } from 'react'
import {
  getDisplayPokemonImage,
  getNormalPokemonImage,
  getPokemonName,
} from '../data/transformationAssets.js'
import ArenaEffects from './ArenaEffects.jsx'

function isSamePokemon(pokemon, otherPokemon) {
  const pokemonId = pokemon?.id ?? pokemon?.pokemonId
  const otherPokemonId = otherPokemon?.id ?? otherPokemon?.pokemonId

  if (pokemonId && otherPokemonId) {
    return String(pokemonId) === String(otherPokemonId)
  }

  return getPokemonName(pokemon) === getPokemonName(otherPokemon)
}

function AnimatedScore({ score, active }) {
  const numericScore = Number(score) || 0
  const startScore = Math.max(0, numericScore - 8)
  const [displayScore, setDisplayScore] = useState(startScore)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    const steps = Math.max(1, numericScore - startScore)
    let step = 0
    const timer = window.setInterval(() => {
      step += 1
      setDisplayScore(
        step >= steps ? numericScore : startScore + step,
      )

      if (step >= steps) {
        window.clearInterval(timer)
      }
    }, 75)

    return () => window.clearInterval(timer)
  }, [active, numericScore, startScore])

  return active ? displayScore : startScore
}

function TeamTracker({ label, slots = [], side, visible }) {
  return (
    <aside
      className={`battle-team-tracker is-${side} ${
        visible ? 'is-visible' : ''
      }`}
      aria-label={`${label} team tracker`}
      aria-hidden={!visible}
    >
      <strong>{label}</strong>
      <div>
        {slots.map((slot, index) => {
          const image = slot.pokemon
            ? getNormalPokemonImage(slot.pokemon)
            : null
          const name = slot.pokemon
            ? getPokemonName(slot.pokemon)
            : 'Unknown Pokemon'

          return (
            <span
              className={`battle-team-slot ${
                slot.active ? 'is-active' : ''
              } ${slot.used ? 'is-used' : ''} ${
                slot.unknown ? 'is-unknown' : ''
              }`}
              title={
                slot.unknown
                  ? 'Not revealed'
                  : `${name}${slot.active ? ' - Active' : slot.used ? ' - Used' : ' - Remaining'}`
              }
              key={`${side}-${slot.pokemon?.pokemonId ?? slot.pokemon?.id ?? 'unknown'}-${index}`}
            >
              {image ? (
                <img
                  className="battle-team-slot-portrait"
                  src={image}
                  alt=""
                  width="42"
                  height="42"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
              ) : (
                <span
                  className="battle-team-slot-pokeball"
                  aria-hidden="true"
                >
                  <i />
                </span>
              )}
              {!slot.unknown && <small>{name}</small>}
            </span>
          )
        })}
      </div>
    </aside>
  )
}

function Fighter({
  label,
  side,
  pokemon,
  score,
  outcome,
  transformation,
  visible,
  active,
  scoreVisible,
}) {
  const name = getPokemonName(pokemon)
  const normalImage = getNormalPokemonImage(pokemon)
  const image = getDisplayPokemonImage(pokemon, transformation)

  return (
    <article
      className={`battle-stage-fighter is-${side} ${
        visible ? 'is-entered' : ''
      } ${active ? 'is-active-analysis' : ''} ${
        outcome ? `is-${outcome}` : ''
      }`}
      aria-hidden={!visible}
    >
      <span className="battle-stage-fighter-label">{label}</span>
      {outcome === 'winner' && (
        <span className="battle-stage-winner-badge">Winner</span>
      )}
      {image && (
        <img
          src={image}
          alt={name}
          width="240"
          height="240"
          onError={(event) => {
            if (
              normalImage &&
              event.currentTarget.src !== normalImage
            ) {
              event.currentTarget.src = normalImage
            } else {
              event.currentTarget.hidden = true
            }
          }}
        />
      )}
      <div className="battle-stage-fighter-identity">
        <span className="battle-stage-fighter-name">
          <strong>{name}</strong>
          {transformation?.transformedForm && (
            <small>{transformation.transformedForm}</small>
          )}
        </span>
        <span
          className={`battle-stage-score ${
            scoreVisible ? 'is-revealed' : 'is-hidden'
          } ${outcome === 'winner' ? 'is-winning-score' : ''}`}
        >
          <small>Final Score</small>
          <b>
            <AnimatedScore score={score} active={scoreVisible} />
          </b>
        </span>
      </div>
    </article>
  )
}

function BattleNotification({ notification }) {
  if (!notification) {
    return null
  }

  return (
    <div
      className={`battle-ability-notification is-${notification.side} is-${notification.id}`}
      key={notification.key}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">{notification.icon}</span>
      <strong>{notification.label}</strong>
      {notification.value !== undefined && (
        <b>
          {notification.id === 'base' ||
          notification.id === 'final'
            ? notification.value
            : `${notification.value > 0 ? '+' : ''}${notification.value}`}
        </b>
      )}
    </div>
  )
}

function VictoryCelebration({ arenaId, winnerSide, active }) {
  if (!active || !winnerSide) {
    return null
  }

  return (
    <div
      className={`battle-victory-celebration is-${arenaId} is-${winnerSide}`}
      aria-hidden="true"
    >
      <div className="battle-victory-spotlight" />
      <div className="battle-victory-burst">
        {Array.from({ length: 14 }, (_, index) => (
          <i
            key={index}
            style={{
              '--burst-index': index,
              '--burst-angle': `${index * 25.7}deg`,
              '--burst-delay': `${(index % 5) * 70}ms`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function BattleStage({
  roundNumber,
  yourTrainerScore,
  opponentTrainerScore,
  yourPokemon,
  opponentPokemon,
  yourFinalScore,
  opponentFinalScore,
  yourTransformation,
  opponentTransformation,
  winnerPokemon,
  resultText,
  logs = [],
  showContinue = false,
  continueDisabled = false,
  continueLabel = 'Continue to Next Round',
  currentPlayerContinued = false,
  onContinue,
  statusMessage = '',
  errorMessages = [],
  countdownBackdrop = false,
  yourTeamSlots = [],
  opponentTeamSlots = [],
  arena,
  masterRound = false,
  entranceStep = 0,
  teamsVisible = false,
  activeAnalysisSide = null,
  notification = null,
  revealedScoreSides = [],
  showScoreComparison = false,
  showWinner = false,
  showVictoryCelebration = false,
  presentationComplete = false,
}) {
  const yourOutcome = showWinner && winnerPokemon
    ? isSamePokemon(yourPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''
  const opponentOutcome = showWinner && winnerPokemon
    ? isSamePokemon(opponentPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''
  const winnerSide =
    yourOutcome === 'winner'
      ? 'your'
      : opponentOutcome === 'winner'
        ? 'opponent'
        : null
  const arenaUiVisible = !countdownBackdrop

  return (
    <section
      className={`battle-stage ${
        countdownBackdrop ? 'is-countdown-backdrop' : ''
      } ${masterRound ? 'is-master-round' : ''}`}
      aria-labelledby="battle-stage-title"
    >
      {arenaUiVisible && (
        <header
          className={`battle-stage-header ${
            masterRound ? 'is-master-round' : ''
          }`}
        >
          <div>
            <span>{masterRound ? 'Final Showdown' : 'Round'}</span>
            <strong id="battle-stage-title">
              {masterRound ? 'Master Round' : roundNumber}
            </strong>
          </div>
          <div>
            <span>Trainer Score</span>
            <strong>
              {yourTrainerScore} - {opponentTrainerScore}
            </strong>
          </div>
        </header>
      )}

      <div
        className={`battle-stage-matchup ${
          masterRound ? `is-master-round is-${arena.id}` : ''
        }`}
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.25)), url("${arena.image}")`,
          backgroundPosition: 'center center',
        }}
      >
        <ArenaEffects arenaId={arena.id} />
        {arenaUiVisible && (
          <span className="battle-arena-name">{arena.name}</span>
        )}
        {arenaUiVisible && (
          <>
            <TeamTracker
              label="You"
              slots={yourTeamSlots}
              side="you"
              visible={teamsVisible}
            />
            <Fighter
              label="You"
              side="you"
              pokemon={yourPokemon}
              score={yourFinalScore}
              outcome={yourOutcome}
              transformation={yourTransformation}
              visible={entranceStep >= 1}
              active={activeAnalysisSide === 'your'}
              scoreVisible={revealedScoreSides.includes('your')}
            />
            <div
              className={`battle-stage-versus ${
                entranceStep >= 2 ? 'is-visible' : ''
              } ${
                showScoreComparison ? 'is-comparison' : ''
              } ${showWinner ? 'is-victory-react' : ''
              } ${masterRound ? 'is-master-round' : ''}`}
              aria-label="versus"
            >
              {showScoreComparison ? (
                <strong>
                  {yourFinalScore} <span>VS</span>{' '}
                  {opponentFinalScore}
                </strong>
              ) : (
                <span>VS</span>
              )}
            </div>
            <Fighter
              label="Opponent"
              side="opponent"
              pokemon={opponentPokemon}
              score={opponentFinalScore}
              outcome={opponentOutcome}
              transformation={opponentTransformation}
              visible={entranceStep >= 2}
              active={activeAnalysisSide === 'opponent'}
              scoreVisible={revealedScoreSides.includes('opponent')}
            />
            <TeamTracker
              label="Opponent"
              slots={opponentTeamSlots}
              side="opponent"
              visible={teamsVisible}
            />
            <BattleNotification notification={notification} />
            <VictoryCelebration
              arenaId={arena.id}
              winnerSide={winnerSide}
              active={showVictoryCelebration}
            />
            <div
              className={`battle-stage-result is-arena-result ${
                showWinner ? 'is-visible' : ''
              }`}
              aria-hidden={!showWinner}
            >
              <span>Round Winner</span>
              <strong>
                {winnerPokemon
                  ? getPokemonName(winnerPokemon)
                  : 'Round Draw'}
              </strong>
              <small>{resultText}</small>
            </div>
          </>
        )}
      </div>

      {arenaUiVisible && (
        <>
          {logs.length > 0 && (
            <details className="battle-stage-log">
              <summary>View Battle Analysis</summary>
              <div>
                {logs.map((log, index) => (
                  <p key={`${index}-${log}`}>{log}</p>
                ))}
              </div>
            </details>
          )}

          {presentationComplete &&
            (showContinue ||
              currentPlayerContinued ||
              statusMessage) && (
              <div className="battle-continue-area">
                {showContinue && !currentPlayerContinued && (
                  <button
                    className="game-button game-button-primary"
                    type="button"
                    disabled={continueDisabled}
                    onClick={onContinue}
                  >
                    {continueLabel}
                  </button>
                )}

                {currentPlayerContinued && (
                  <p>Waiting for opponent to continue...</p>
                )}

                {statusMessage && <p>{statusMessage}</p>}
              </div>
            )}

          {presentationComplete &&
            errorMessages.filter(Boolean).map((message) => (
              <p
                className="battle-lock-error"
                role="alert"
                key={message}
              >
                {message}
              </p>
            ))}
        </>
      )}
    </section>
  )
}

export default BattleStage
