export const TYPE_CHART = {
  Normal: {
    strongAgainst: [],
    resistedBy: ['Rock', 'Steel', 'Ghost'],
  },
  Fire: {
    strongAgainst: ['Grass', 'Bug', 'Ice', 'Steel'],
    resistedBy: ['Fire', 'Water', 'Rock', 'Dragon'],
  },
  Water: {
    strongAgainst: ['Fire', 'Ground', 'Rock'],
    resistedBy: ['Water', 'Grass', 'Dragon'],
  },
  Grass: {
    strongAgainst: ['Water', 'Ground', 'Rock'],
    resistedBy: [
      'Fire',
      'Grass',
      'Poison',
      'Flying',
      'Bug',
      'Dragon',
      'Steel',
    ],
  },
  Electric: {
    strongAgainst: ['Water', 'Flying'],
    resistedBy: ['Electric', 'Grass', 'Dragon', 'Ground'],
  },
  Ice: {
    strongAgainst: ['Grass', 'Ground', 'Flying', 'Dragon'],
    resistedBy: ['Fire', 'Water', 'Ice', 'Steel'],
  },
  Fighting: {
    strongAgainst: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'],
    resistedBy: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy', 'Ghost'],
  },
  Poison: {
    strongAgainst: ['Grass', 'Fairy'],
    resistedBy: ['Poison', 'Ground', 'Rock', 'Ghost', 'Steel'],
  },
  Ground: {
    strongAgainst: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'],
    resistedBy: ['Grass', 'Bug', 'Flying'],
  },
  Flying: {
    strongAgainst: ['Grass', 'Fighting', 'Bug'],
    resistedBy: ['Electric', 'Rock', 'Steel'],
  },
  Psychic: {
    strongAgainst: ['Fighting', 'Poison'],
    resistedBy: ['Psychic', 'Steel', 'Dark'],
  },
  Bug: {
    strongAgainst: ['Grass', 'Psychic', 'Dark'],
    resistedBy: [
      'Fire',
      'Fighting',
      'Poison',
      'Flying',
      'Ghost',
      'Steel',
      'Fairy',
    ],
  },
  Rock: {
    strongAgainst: ['Fire', 'Ice', 'Flying', 'Bug'],
    resistedBy: ['Fighting', 'Ground', 'Steel'],
  },
  Ghost: {
    strongAgainst: ['Psychic', 'Ghost'],
    resistedBy: ['Dark', 'Normal'],
  },
  Dragon: {
    strongAgainst: ['Dragon'],
    resistedBy: ['Steel', 'Fairy'],
  },
  Dark: {
    strongAgainst: ['Psychic', 'Ghost'],
    resistedBy: ['Fighting', 'Dark', 'Fairy'],
  },
  Steel: {
    strongAgainst: ['Ice', 'Rock', 'Fairy'],
    resistedBy: ['Fire', 'Water', 'Electric', 'Steel'],
  },
  Fairy: {
    strongAgainst: ['Fighting', 'Dragon', 'Dark'],
    resistedBy: ['Fire', 'Poison', 'Steel'],
  },
}

export const TYPE_BONUS_VALUES = {
  // +5 represents a 2x type advantage.
  SUPER_EFFECTIVE: 5,
  // +10 represents a 4x type advantage.
  DOUBLE_SUPER_EFFECTIVE: 10,
  RESISTED: -5,
  DOUBLE_RESISTED: -10,
  MIN_BONUS: 0,
  MAX_BONUS: 10,
}

export const getAttackEffectiveness = (attackingType, defendingType) => {
  const attackData = TYPE_CHART[attackingType]

  if (!attackData) {
    return 0
  }

  if (attackData.strongAgainst.includes(defendingType)) {
    return 1
  }

  if (attackData.resistedBy.includes(defendingType)) {
    return -1
  }

  return 0
}

export const calculateRawTypeBonus = (attackerTypes, defenderTypes) => {
  const uniqueAttackerTypes = [...new Set(attackerTypes)]
  const uniqueDefenderTypes = [...new Set(defenderTypes)]
  const strongMatchCounts = uniqueAttackerTypes.map(
    (attackingType) =>
      uniqueDefenderTypes.filter(
        (defendingType) =>
          getAttackEffectiveness(attackingType, defendingType) === 1,
      ).length,
  )

  if (strongMatchCounts.some((count) => count >= 2)) {
    return TYPE_BONUS_VALUES.DOUBLE_SUPER_EFFECTIVE
  }

  if (strongMatchCounts.some((count) => count === 1)) {
    return TYPE_BONUS_VALUES.SUPER_EFFECTIVE
  }

  return TYPE_BONUS_VALUES.MIN_BONUS
}
