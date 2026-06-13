const CARD_DEFINITIONS = [
  {
    id: 'base',
    label: 'Base Power',
    icon: '\u2694',
    valueKeys: ['baseScore'],
  },
  {
    id: 'transformation',
    label: 'Mega Bonus',
    icon: '\u2726',
    valueKeys: ['formBonus'],
  },
  {
    id: 'type',
    label: 'Type Advantage',
    icon: '\u25c6',
    valueKeys: ['typeBonus'],
  },
  {
    id: 'trait',
    label: 'Trait Bonus',
    icon: '\u2605',
    valueKeys: ['traitBonus', 'protectedTraitBonus'],
  },
  {
    id: 'battlefield',
    label: 'Arena Effect',
    icon: '\u25ce',
    valueKeys: ['battlefieldBonus'],
    penaltyKeys: ['battlefieldPenalty'],
  },
]

function sumStateValues(state, keys = []) {
  return keys.reduce(
    (total, key) => total + (Number(state?.[key]) || 0),
    0,
  )
}

function getBaseScoreFromLogs(logs, playerIndex) {
  const baseScores = logs
    .map((log) => log.match(/^Base score:\s*(\d+)/i)?.[1])
    .filter(Boolean)

  return Number(baseScores[playerIndex]) || null
}

function getCelebiWishAmount(state) {
  const wish = state?.protectedBonuses?.find(
    (bonus) => bonus?.source === 'Celebi Future Wish',
  )

  return Number(wish?.amount) || 0
}

export function createFighterAnalysis({
  state,
  pokemon,
  finalScore,
  logs = [],
  playerIndex = 0,
}) {
  const fallbackBaseScore =
    Number(pokemon?.score) || getBaseScoreFromLogs(logs, playerIndex)
  const celebiWishAmount = getCelebiWishAmount(state)

  const cards = CARD_DEFINITIONS.map((definition) => {
    const positiveValue = sumStateValues(state, definition.valueKeys)
    const penaltyValue = sumStateValues(state, definition.penaltyKeys)
    const value =
      definition.id === 'base'
        ? Number(state?.baseScore) || fallbackBaseScore
        : positiveValue -
          penaltyValue -
          (definition.id === 'trait' ? celebiWishAmount : 0)

    return value
      ? {
          id: definition.id,
          label: definition.label,
          icon: definition.icon,
          value,
        }
      : null
  }).filter(Boolean)
  const typeCardIndex = cards.findIndex((card) => card.id === 'type')
  const wishInsertIndex =
    typeCardIndex >= 0 ? typeCardIndex : Math.min(1, cards.length)

  if (celebiWishAmount) {
    cards.splice(wishInsertIndex, 0, {
      id: 'celebi-wish',
      label: 'Celebi Future Wish',
      icon: '\u2727',
      value: celebiWishAmount,
    })
  }

  return cards.concat({
    id: 'final',
    label: 'Final Score',
    icon: '\u2606',
    value: Number(finalScore) || 0,
  })
}
