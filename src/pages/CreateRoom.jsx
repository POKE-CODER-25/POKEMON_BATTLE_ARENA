import { Link } from 'react-router-dom'

function CreateRoom() {
  return (
    <main className="page-shell">
      <section className="game-card placeholder-card">
        <div className="page-icon" aria-hidden="true">+</div>
        <p className="eyebrow">Trainer Lobby</p>
        <h1>Create Room</h1>
        <p className="subtitle">Create Room coming on Day 2</p>
        <Link className="back-link" to="/">&larr; Back to Home</Link>
      </section>
      <footer className="site-footer">
        Fan-made Pok&eacute;mon Draft Strategy Game
      </footer>
    </main>
  )
}

export default CreateRoom
