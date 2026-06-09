export const EFFECT_TYPES = {
  SCORE_BONUS: 'SCORE_BONUS',
  SCORE_PENALTY: 'SCORE_PENALTY',
  TYPE_BONUS_BLOCK: 'TYPE_BONUS_BLOCK',
  TRAIT_IMMUNITY: 'TRAIT_IMMUNITY',
}

const EFFECT_TARGETS = {
  ALLY: 'ALLY',
  OPPONENT: 'OPPONENT',
}

// This file stores and applies future-round effects.
// Winner determination and Master Round handling happen later.
// Trait immunity and type bonus block behavior are not implemented yet.
export const createBattlefieldEffect = ({
  sourcePokemon,
  effectType,
  value,
  duration,
  description,
}) => ({
  sourcePokemon,
  effectType,
  value: value ?? 0,
  duration,
  description,
})

export const applyBattlefieldEffects = ({ pokemon, effects = [] }) => {
  void pokemon

  let battlefieldBonus = 0
  let battlefieldPenalty = 0
  const logs = []

  effects.forEach((effect) => {
    if (effect.effectType === EFFECT_TYPES.SCORE_BONUS) {
      battlefieldBonus += effect.value
      logs.push(`${effect.description}: +${effect.value}`)
    }

    if (effect.effectType === EFFECT_TYPES.SCORE_PENALTY) {
      battlefieldPenalty += effect.value
      logs.push(`${effect.description}: -${effect.value}`)
    }
  })

  return {
    battlefieldBonus,
    battlefieldPenalty,
    logs,
  }
}

export const decrementBattlefieldEffects = (effects = []) =>
  effects
    .map((effect) => ({
      ...effect,
      duration: effect.duration - 1,
    }))
    .filter((effect) => effect.duration > 0)

const createTargetedEffect = (target, effect) => ({
  ...effect,
  target,
})

export const createFutureRoundEffects = ({
  winnerPokemon,
  loserPokemon,
}) => {
  const effects = []

  const winnerEffects = {
    Yveltal: {
      target: EFFECT_TARGETS.OPPONENT,
      effectType: EFFECT_TYPES.SCORE_PENALTY,
      value: 3,
      description: 'Aura of Destruction',
    },
    Tyranitar: {
      target: EFFECT_TARGETS.OPPONENT,
      effectType: EFFECT_TYPES.SCORE_PENALTY,
      value: 2,
      description: 'Sandstorm King',
    },
    Latios: {
      target: EFFECT_TARGETS.ALLY,
      effectType: EFFECT_TYPES.SCORE_BONUS,
      value: 3,
      description: 'Jet Stream',
    },
    Latias: {
      target: EFFECT_TARGETS.ALLY,
      effectType: EFFECT_TYPES.TRAIT_IMMUNITY,
      description: 'Guardian Soul',
    },
    Dragapult: {
      target: EFFECT_TARGETS.OPPONENT,
      effectType: EFFECT_TYPES.TYPE_BONUS_BLOCK,
      description: 'Phantom Launch',
    },
    Incineroar: {
      target: EFFECT_TARGETS.OPPONENT,
      effectType: EFFECT_TYPES.SCORE_PENALTY,
      value: 2,
      description: 'Heel Wrestler',
    },
  }
  const loserEffects = {
    Dragonite: {
      target: EFFECT_TARGETS.ALLY,
      effectType: EFFECT_TYPES.SCORE_BONUS,
      value: 3,
      description: 'Guardian Dragon',
    },
    Lapras: {
      target: EFFECT_TARGETS.ALLY,
      effectType: EFFECT_TYPES.SCORE_BONUS,
      value: 2,
      description: 'Ocean Guardian',
    },
  }
  const winnerEffect = winnerEffects[winnerPokemon?.name]
  const loserEffect = loserEffects[loserPokemon?.name]

  if (winnerEffect) {
    const { target, ...effect } = winnerEffect
    effects.push(
      createTargetedEffect(
        target,
        createBattlefieldEffect({
          sourcePokemon: winnerPokemon,
          ...effect,
          duration: 1,
        }),
      ),
    )
  }

  if (loserEffect) {
    const { target, ...effect } = loserEffect
    effects.push(
      createTargetedEffect(
        target,
        createBattlefieldEffect({
          sourcePokemon: loserPokemon,
          ...effect,
          duration: 1,
        }),
      ),
    )
  }

  return effects
}
