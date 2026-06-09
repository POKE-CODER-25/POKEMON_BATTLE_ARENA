const SIMPLE_TRAIT_BONUSES = {
  Blaze: 2,
  Torrent: 2,
  Growth: 2,
}

const SLOW_START_BONUSES = {
  1: -5,
  2: -3,
  3: 0,
  4: 2,
  5: 5,
  6: 7,
}

const getTraitNames = (pokemon) =>
  (pokemon.traits || []).flatMap(({ name }) =>
    name.split(' + ').map((traitName) => traitName.trim()),
  )

const formatBonus = (bonus) => (bonus >= 0 ? `+${bonus}` : `${bonus}`)

// This resolver handles only the predictable passive trait layer.
// Complex trait interactions and form changes are resolved elsewhere later.
export const resolvePassiveTraitBonus = ({
  pokemon,
  opponent,
  roundNumber,
  trainerScore = 0,
  opponentScore = 0,
  isMasterRound = false,
}) => {
  void trainerScore
  void opponentScore

  let bonus = 0
  const logs = []
  const appliedTraits = []
  const traitNames = new Set(getTraitNames(pokemon))

  Object.entries(SIMPLE_TRAIT_BONUSES).forEach(
    ([traitName, traitBonus]) => {
      if (!traitNames.has(traitName)) {
        return
      }

      bonus += traitBonus
      logs.push(`${traitName}: +${traitBonus}`)
      appliedTraits.push(traitName)
    },
  )

  if (pokemon.name === 'Lucario') {
    bonus += 2
    logs.push('Aura Master: +2 (protected)')
    appliedTraits.push('Aura Master')
  }

  if (pokemon.name === 'Regigigas') {
    const slowStartBonus = isMasterRound
      ? 15
      : (SLOW_START_BONUSES[roundNumber] ?? 0)

    bonus += slowStartBonus
    appliedTraits.push('Slow Start')

    if (isMasterRound) {
      logs.push('Titan Awakening: +15 (protected)')
      appliedTraits.push('Titan Awakening')
    } else {
      logs.push(`Slow Start: ${formatBonus(slowStartBonus)}`)
    }
  }

  const opponentHasHigherBaseScore = opponent.score > pokemon.score

  if (pokemon.name === 'Infernape' && opponentHasHigherBaseScore) {
    bonus += 5
    logs.push('Blaze of Determination: +5')
    appliedTraits.push('Blaze of Determination')
  }

  const scoreConditionalTraits = {
    Zekrom: ['Ideals of Thunder', 3],
    Gardevoir: ['Devotion', 4],
    Salamence: ['Berserker Wings', 4],
    Staraptor: ['Reckless', 4],
  }
  const conditionalTrait = scoreConditionalTraits[pokemon.name]

  if (conditionalTrait && opponentHasHigherBaseScore) {
    const [traitName, traitBonus] = conditionalTrait
    bonus += traitBonus
    logs.push(`${traitName}: +${traitBonus}`)
    appliedTraits.push(traitName)
  }

  return {
    bonus,
    logs,
    appliedTraits,
  }
}
