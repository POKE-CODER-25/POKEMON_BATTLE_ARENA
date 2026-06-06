import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { pokemonPool } from '../data/pokemonPool.js'
import { db } from '../firebase.js'

function PokemonCard({ pokemon }) {
  return (
    <article className="pokemon-card">
      <span className={`tier-badge tier-${pokemon.tier.toLowerCase()}`}>
        Tier {pokemon.tier}
      </span>
      <div className="pokemon-image-wrap">
        <img
          src={pokemon.sprite}
          alt={pokemon.name}
          loading="lazy"
          width="150"
          height="150"
        />
      </div>
      <h2>{pokemon.name}</h2>
      <div className="type-list">
        {pokemon.types.map((type) => (
          <span className={`type-badge type-${type.toLowerCase()}`} key={type}>
            {type}
          </span>
        ))}
      </div>
    </article>
  )
}

function DraftPage() {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const unsubscribe = onSnapshot(
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

    return unsubscribe
  }, [displayRoomCode])

  return (
    <main className="page-shell draft-page-shell">
      <section className="draft-container">
        <header className="draft-header">
          <div>
            <p className="eyebrow">Room {displayRoomCode}</p>
            <h1>Draft Arena</h1>
            <p className="draft-coming-soon">Draft system coming next</p>
          </div>

          <div className="draft-players">
            {isLoading && <span>Loading trainers...</span>}
            {room && (
              <>
                <span><strong>Host:</strong> {room.hostUsername}</span>
                <span><strong>Guest:</strong> {room.guestUsername || 'Waiting...'}</span>
              </>
            )}
            {errorMessage && <span className="draft-error">{errorMessage}</span>}
          </div>
        </header>

        <div className="pokemon-grid">
          {pokemonPool.map((pokemon) => (
            <PokemonCard pokemon={pokemon} key={pokemon.id} />
          ))}
        </div>

        <Link className="back-link draft-back-link" to={`/room/${displayRoomCode}`}>
          &larr; Back to Lobby
        </Link>
      </section>
    </main>
  )
}

export default DraftPage
