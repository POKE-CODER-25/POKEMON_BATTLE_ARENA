import { Link, useParams } from 'react-router-dom'

function RoomLobby() {
  const { roomCode = '' } = useParams()
  const displayRoomCode = roomCode.toUpperCase()

  return (
    <main className="page-shell">
      <div className="arena-stage" aria-hidden="true">
        <span className="arena-line arena-line-left" />
        <span className="arena-line arena-line-right" />
        <span className="arena-circle" />
      </div>

      <section className="game-card lobby-card">
        <div className="pokeball small-pokeball" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">Pok&eacute;mon Draft Arena Lobby</p>
        <h1 className="lobby-title">Room Code</h1>
        <div className="room-code">{displayRoomCode}</div>
        <p className="waiting-message">
          <span className="status-dot" />
          Waiting for opponent...
        </p>
        <Link className="back-link" to="/">&larr; Back to Home</Link>
      </section>

      <footer className="site-footer">
        Fan-made Pok&eacute;mon Draft Strategy Game
      </footer>
    </main>
  )
}

export default RoomLobby
