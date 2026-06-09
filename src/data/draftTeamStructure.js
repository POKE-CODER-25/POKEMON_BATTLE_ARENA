export const DRAFT_TEAM_STRUCTURE = [
  { round: 1, name: 'Starters' },
  { round: 2, name: 'Support' },
  { round: 3, name: 'Fan Favourite A' },
  { round: 4, name: 'Pseudo Legendaries' },
  { round: 5, name: 'Legendaries' },
  { round: 6, name: 'Fan Favourite B' },
]

export const DRAFT_ROUND_NAMES = Object.fromEntries(
  DRAFT_TEAM_STRUCTURE.map(({ round, name }) => [round, name]),
)

export const getOrderedDraftPicks = (picks = []) =>
  [...picks].sort((pokemonA, pokemonB) => {
    const roundA = Number.isInteger(pokemonA.round) ? pokemonA.round : 99
    const roundB = Number.isInteger(pokemonB.round) ? pokemonB.round : 99

    return roundA - roundB
  })

export const getDraftPickLabel = (pokemon) =>
  DRAFT_ROUND_NAMES[pokemon.round] ?? pokemon.roundName ?? 'Draft Pick'
