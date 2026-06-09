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
  let manipulatableTraitBonus = 0
  let protectedTraitBonus = 0
  const logs = []
  const appliedTraits = []
  const traitBonusEntries = []
  const traitNames = new Set(getTraitNames(pokemon))

  const addTraitBonus = (traitName, amount, isProtected = false) => {
    bonus += amount

    if (isProtected) {
      protectedTraitBonus += amount
    } else {
      manipulatableTraitBonus += amount
    }

    appliedTraits.push(traitName)
    traitBonusEntries.push({
      traitName,
      amount,
      protected: isProtected,
    })
  }

  Object.entries(SIMPLE_TRAIT_BONUSES).forEach(
    ([traitName, traitBonus]) => {
      if (!traitNames.has(traitName)) {
        return
      }

      addTraitBonus(traitName, traitBonus)
      logs.push(`${traitName}: +${traitBonus}`)
    },
  )

  if (pokemon.name === 'Lucario') {
    addTraitBonus('Aura Master', 2, true)
    logs.push('Aura Master: +2 (protected)')
  }

  if (pokemon.name === 'Regigigas') {
    const slowStartBonus = isMasterRound
      ? 15
      : (SLOW_START_BONUSES[roundNumber] ?? 0)

    if (isMasterRound) {
      appliedTraits.push('Slow Start')
      addTraitBonus('Titan Awakening', slowStartBonus, true)
      logs.push('Titan Awakening: +15 (protected)')
    } else {
      addTraitBonus('Slow Start', slowStartBonus, true)
      logs.push(`Slow Start: ${formatBonus(slowStartBonus)}`)
    }
  }

  const opponentHasHigherBaseScore = opponent.score > pokemon.score

  if (pokemon.name === 'Infernape' && opponentHasHigherBaseScore) {
    addTraitBonus('Blaze of Determination', 5)
    logs.push('Blaze of Determination: +5')
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
    addTraitBonus(traitName, traitBonus)
    logs.push(`${traitName}: +${traitBonus}`)
  }

  return {
    bonus,
    logs,
    appliedTraits,
    manipulatableTraitBonus,
    protectedTraitBonus,
    traitBonusEntries,
  }
}
