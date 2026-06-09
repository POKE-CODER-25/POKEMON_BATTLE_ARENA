export const SPECIAL_TRAIT_CONFLICTS = [
  {
    pokemonAName: 'Lucario',
    pokemonBName: 'Necrozma',
    result: 'Lucario Aura cannot be stolen.',
  },
  {
    pokemonAName: 'Mewtwo',
    pokemonBName: 'Lucario',
    result: 'Mewtwo may disable Aura Master.',
  },
  {
    pokemonAName: 'Mewtwo',
    pokemonBName: 'Zamazenta',
    result: 'Zamazenta immune.',
  },
  {
    pokemonAName: 'Necrozma',
    pokemonBName: 'Lucario',
    result: 'Necrozma cannot absorb Aura Master.',
  },
  {
    pokemonAName: 'Xerneas',
    pokemonBName: 'Lucario',
    result: 'Xerneas cannot absorb Aura Master.',
  },
  {
    pokemonAName: 'Darkrai',
    pokemonBName: 'Lucario',
    result: 'Aura Master unaffected.',
  },
  {
    pokemonAName: 'Jirachi',
    pokemonBName: 'Snorlax',
    isOrderIndependent: true,
    result: 'Half Sleeping Monster.',
    normalBonus: 10,
    masterRoundBonus: 12,
  },
  {
    pokemonAName: 'Yveltal',
    pokemonBName: 'Arceus',
    result: 'Curse persists even against Arceus.',
    reason: 'Battlefield effect.',
  },
  {
    pokemonAName: 'God Killer',
    pokemonBName: 'GOD',
    result: 'God Killer defeats GOD when activated.',
  },
]

const normalizeName = (name) => name.trim().toLowerCase()

export const compareTraitPriority = (pokemonA, pokemonB) => {
  const priorityA = pokemonA.priority
  const priorityB = pokemonB.priority
  const isTie = priorityA === priorityB

  // Priority only affects traits. It never changes base score and never
  // automatically wins battles.
  if (isTie) {
    return {
      higherPriorityPokemon: null,
      lowerPriorityPokemon: null,
      winnerPriority: priorityA,
      isTie: true,
    }
  }

  const pokemonAHasPriority = priorityA < priorityB

  return {
    higherPriorityPokemon: pokemonAHasPriority ? pokemonA : pokemonB,
    lowerPriorityPokemon: pokemonAHasPriority ? pokemonB : pokemonA,
    winnerPriority: pokemonAHasPriority ? priorityA : priorityB,
    isTie: false,
  }
}

export const getTraitConflictRule = (pokemonAName, pokemonBName) => {
  const normalizedAName = normalizeName(pokemonAName)
  const normalizedBName = normalizeName(pokemonBName)

  return (
    SPECIAL_TRAIT_CONFLICTS.find((rule) => {
      const ruleAName = normalizeName(rule.pokemonAName)
      const ruleBName = normalizeName(rule.pokemonBName)
      const isDirectMatch =
        ruleAName === normalizedAName && ruleBName === normalizedBName
      const isReverseMatch =
        rule.isOrderIndependent &&
        ruleAName === normalizedBName &&
        ruleBName === normalizedAName

      return isDirectMatch || isReverseMatch
    }) ?? null
  )
}

const PROTECTED_TRAITS = new Set([
  'GOD',
  'God Killer',
  'Sleeping Monster',
  'Mega Evolution',
  'Ash Greninja',
  'Titan Awakening',
])

export const isTraitProtected = (traitName) => PROTECTED_TRAITS.has(traitName)

export const canTraitBeModified = (traitName) => !isTraitProtected(traitName)
