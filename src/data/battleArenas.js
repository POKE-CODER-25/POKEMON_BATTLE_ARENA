export const BATTLE_ARENAS = [
  {
    id: 'royal-champion-stadium',
    name: 'Royal Champion Stadium',
    image: '/arenas/royal-champion-stadium.png',
  },
  {
    id: 'moonlit-forest-shrine',
    name: 'Moonlit Forest Shrine',
    image: '/arenas/moonlit-forest-shrine.png',
  },
  {
    id: 'inferno-colosseum',
    name: 'Inferno Colosseum',
    image: '/arenas/inferno-colosseum.png',
  },
  {
    id: 'crystal-cavern',
    name: 'Crystal Cavern',
    image: '/arenas/crystal-cavern.png',
  },
  {
    id: 'celestial-sky-temple',
    name: 'Celestial Sky Temple',
    image: '/arenas/celestial-sky-temple.png',
  },
]

export function selectRandomBattleArenaId() {
  return BATTLE_ARENAS[
    Math.floor(Math.random() * BATTLE_ARENAS.length)
  ].id
}

export function getBattleArena(arenaId) {
  return (
    BATTLE_ARENAS.find((arena) => arena.id === arenaId) ??
    BATTLE_ARENAS[0]
  )
}
