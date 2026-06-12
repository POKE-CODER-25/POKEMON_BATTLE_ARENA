import { useState } from 'react'
import {
  getDisplayPokemonImage,
  getNormalPokemonImage,
  getPokemonName,
} from '../data/transformationAssets.js'

const BATTLE_ARENAS = [
  'forest',
  'volcano',
  'ocean',
  'night',
  'electric',
]

function isSamePokemon(pokemon, otherPokemon) {
  const pokemonId = pokemon?.id ?? pokemon?.pokemonId
  const otherPokemonId = otherPokemon?.id ?? otherPokemon?.pokemonId

  if (pokemonId && otherPokemonId) {
    return String(pokemonId) === String(otherPokemonId)
  }

  return getPokemonName(pokemon) === getPokemonName(otherPokemon)
}

function Fighter({
  label,
  pokemon,
  score,
  outcome,
  transformation,
}) {
  const name = getPokemonName(pokemon)
  const normalImage = getNormalPokemonImage(pokemon)
  const image = getDisplayPokemonImage(pokemon, transformation)

  return (
    <article
      className={`battle-stage-fighter ${
        outcome ? `is-${outcome}` : ''
      }`}
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
        <span className="battle-stage-score">
          <small>Final Score</small>
          <b>{score}</b>
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
}) {
  const [arena] = useState(
    () =>
      BATTLE_ARENAS[
        Math.floor(Math.random() * BATTLE_ARENAS.length)
      ],
  )
  const yourOutcome = winnerPokemon
    ? isSamePokemon(yourPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''
  const opponentOutcome = winnerPokemon
    ? isSamePokemon(opponentPokemon, winnerPokemon)
      ? 'winner'
      : 'loser'
    : ''

  return (
    <section className="battle-stage" aria-labelledby="battle-stage-title">
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
        className={`battle-stage-matchup battle-arena-${arena}`}
      >
        <Fighter
          label="You"
          pokemon={yourPokemon}
          score={yourFinalScore}
          outcome={yourOutcome}
          transformation={yourTransformation}
        />
        <div className="battle-stage-versus" aria-label="versus">
          <span>VS</span>
        </div>
        <Fighter
          label="Opponent"
          pokemon={opponentPokemon}
          score={opponentFinalScore}
          outcome={opponentOutcome}
          transformation={opponentTransformation}
        />
      </div>

      <div className="battle-stage-result">
        <span>Round Result</span>
        <strong>{resultText}</strong>
      </div>

      {logs.length > 0 && (
        <div className="battle-stage-log">
          <h2>Battle Log</h2>
          <div>
            {logs.map((log, index) => (
              <p key={`${index}-${log}`}>{log}</p>
            ))}
          </div>
        </div>
      )}

      {(showContinue || currentPlayerContinued || statusMessage) && (
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

      {errorMessages.filter(Boolean).map((message) => (
        <p className="battle-lock-error" role="alert" key={message}>
          {message}
        </p>
      ))}
    </section>
  )
}

export default BattleStage
