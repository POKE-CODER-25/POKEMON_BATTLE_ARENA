function getPokemonName(pokemon) {
  return pokemon?.name ?? pokemon?.pokemonName ?? 'Unknown Pokemon'
}

function getPokemonImage(pokemon) {
  const pokemonId = pokemon?.id ?? pokemon?.pokemonId

  if (!pokemonId) {
    return null
  }

  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemonId}.png`
}

function Fighter({ label, pokemon, score }) {
  const name = getPokemonName(pokemon)
  const image = getPokemonImage(pokemon)

  return (
    <article className="battle-stage-fighter">
      <span>{label}</span>
      {image && (
        <img
          src={image}
          alt={name}
          width="240"
          height="240"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      )}
      <strong>{name}</strong>
      <small>Final Score</small>
      <b>{score}</b>
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

      <div className="battle-stage-matchup">
        <Fighter
          label="Your Pokemon"
          pokemon={yourPokemon}
          score={yourFinalScore}
        />
        <div className="battle-stage-versus" aria-label="versus">
          VS
        </div>
        <Fighter
          label="Opponent Pokemon"
          pokemon={opponentPokemon}
          score={opponentFinalScore}
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
