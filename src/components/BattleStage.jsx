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

function TeamTracker({ label, slots = [], side }) {
  return (
    <aside
      className={`battle-team-tracker is-${side}`}
      aria-label={`${label} team tracker`}
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
  pokemon,
  score,
  outcome,
  transformation,
  showFinalScore,
  spotlight,
}) {
  const name = getPokemonName(pokemon)
  const normalImage = getNormalPokemonImage(pokemon)
  const image = getDisplayPokemonImage(pokemon, transformation)
  const numericScore = Number(score) || 0
  const scoreCountStart = Math.max(0, numericScore - 6)
  const [displayScore, setDisplayScore] = useState(scoreCountStart)

  useEffect(() => {
    if (!showFinalScore) {
      return undefined
    }

    const finalScore = numericScore
    const startScore = scoreCountStart
    const steps = Math.max(1, finalScore - startScore)
    let step = 0

    const timer = window.setInterval(() => {
      step += 1
      setDisplayScore(
        step >= steps ? finalScore : startScore + step,
      )

      if (step >= steps) {
        window.clearInterval(timer)
      }
    }, 90)

    return () => window.clearInterval(timer)
  }, [numericScore, scoreCountStart, showFinalScore])
  const visibleScore = showFinalScore ? displayScore : scoreCountStart

  return (
    <article
      className={`battle-stage-fighter ${
        outcome ? `is-${outcome}` : ''
      } ${spotlight ? 'is-spotlighted' : ''}`}
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
            showFinalScore ? 'is-revealed' : 'is-hidden'
          }`}
        >
          <small>Final Score</small>
          <b>{visibleScore}</b>
        </span>
      </div>
    </article>
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
  analysisCards = [],
  visibleAnalysisCardCount = 0,
  showFinalScores = false,
  showWinner = false,
  presentationComplete = false,
}) {
  const yourOutcome = !countdownBackdrop && showWinner && winnerPokemon
    ? isSamePokemon(yourPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''
  const opponentOutcome = !countdownBackdrop && showWinner && winnerPokemon
    ? isSamePokemon(opponentPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''
  const spotlight =
    !countdownBackdrop && visibleAnalysisCardCount === 0

  return (
    <section
      className={`battle-stage ${
        countdownBackdrop ? 'is-countdown-backdrop' : ''
      }`}
      aria-labelledby="battle-stage-title"
    >
      <header className="battle-stage-header">
        <div>
          <span>Round</span>
          <strong id="battle-stage-title">{roundNumber}</strong>
        </div>
        <div>
          <span>Trainer Score</span>
          <strong>
            {yourTrainerScore} - {opponentTrainerScore}
          </strong>
        </div>
      </header>

      <div
        className="battle-stage-matchup"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.25)), url("${arena.image}")`,
          backgroundPosition: 'center center',
        }}
      >
        <ArenaEffects arenaId={arena.id} />
        <span className="battle-arena-name">{arena.name}</span>
        <TeamTracker label="You" slots={yourTeamSlots} side="you" />
        <Fighter
          label="You"
          pokemon={yourPokemon}
          score={yourFinalScore}
          outcome={yourOutcome}
          transformation={
            countdownBackdrop ? null : yourTransformation
          }
          showFinalScore={showFinalScores}
          spotlight={spotlight}
        />
        <div className="battle-stage-versus" aria-label="versus">
          <span>VS</span>
        </div>
        <Fighter
          label="Opponent"
          pokemon={opponentPokemon}
          score={opponentFinalScore}
          outcome={opponentOutcome}
          transformation={
            countdownBackdrop ? null : opponentTransformation
          }
          showFinalScore={showFinalScores}
          spotlight={spotlight}
        />
        <TeamTracker
          label="Opponent"
          slots={opponentTeamSlots}
          side="opponent"
        />
      </div>

      {!countdownBackdrop && (
        <>
          <section
            className="battle-analysis-sequence"
            aria-label="Animated battle analysis"
          >
            <header>
              <span>Live Analysis</span>
              <strong>
                {visibleAnalysisCardCount < analysisCards.length
                  ? 'Calculating battle impact'
                  : 'Analysis complete'}
              </strong>
            </header>
            <div className="battle-analysis-cards">
              {analysisCards
                .slice(0, visibleAnalysisCardCount)
                .map((card, index) => (
                  <article
                    className={`battle-analysis-card is-${card.id}`}
                    style={{
                      '--analysis-depth':
                        visibleAnalysisCardCount - index - 1,
                    }}
                    key={card.id}
                  >
                    <span className="battle-analysis-icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    <div>
                      <strong>{card.label}</strong>
                      {card.entries.map((entry) => (
                        <p key={entry.text}>
                          <span>{entry.text}</span>
                          {entry.value && <b>{entry.value}</b>}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
            </div>
          </section>

          <div
            className={`battle-stage-final-score ${
              showFinalScores ? 'is-visible' : ''
            }`}
            aria-hidden={!showFinalScores}
          >
            <span>Final Score</span>
            <strong>
              {yourFinalScore} <i>vs</i> {opponentFinalScore}
            </strong>
          </div>

          <div
            className={`battle-stage-result ${
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

          {presentationComplete && (showContinue ||
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
            <p className="battle-lock-error" role="alert" key={message}>
              {message}
            </p>
            ))}
        </>
      )}
    </section>
  )
}

export default BattleStage
