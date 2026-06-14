import { Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase.js'

function Home({ username, onManualNavigation }) {
  return (
    <main className="page-shell">
      <div className="arena-stage" aria-hidden="true">
        <span className="arena-line arena-line-left" />
        <span className="arena-line arena-line-right" />
        <span className="arena-circle" />
      </div>

      <section className="game-card home-card premium-home-card">
        <div className="brand-mark">
          <span className="brand-line" aria-hidden="true" />
          <div className="pokeball" aria-hidden="true">
            <span />
          </div>
          <span className="brand-line" aria-hidden="true" />
        </div>

        <p className="eyebrow">Welcome, {username}</p>
        <h1 className="game-title">
          <span>Pok&eacute;mon</span>
          <span className="title-accent">Battle Cards</span>
        </h1>
        <div className="game-badges" aria-label="Game features">
          <span>Fan Made</span>
          <span>Online Multiplayer</span>
        </div>

        <div className="action-list">
          <Link
            className="game-button game-button-primary"
            to="/create-room"
            onClick={onManualNavigation}
          >
            Create Room
          </Link>
          <Link
            className="game-button game-button-secondary"
            to="/join-room"
            onClick={onManualNavigation}
          >
            Join Room
          </Link>
        </div>

        <button
          className="logout-button"
          type="button"
          onClick={() => signOut(auth)}
        >
          Log Out
        </button>
      </section>

      <footer className="site-footer">Pok&eacute;mon Battle Cards</footer>
    </main>
  )
}

export default Home
