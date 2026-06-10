export const cloneBattleState = (state) => ({
  ...state,
  logs: [...(state.logs || [])],
  appliedTraits: [...(state.appliedTraits || [])],
  traitBonusEntries: [...(state.traitBonusEntries || [])],
  protectedBonuses: [...(state.protectedBonuses || [])],
})

export const adjustTypeBonus = (state, amount) => ({
  ...state,
  typeBonus: (state.typeBonus || 0) + amount,
  finalScore: state.finalScore + amount,
})

export const adjustTraitBonus = (state, amount) => ({
  ...state,
  traitBonus: (state.traitBonus || 0) + amount,
  finalScore: state.finalScore + amount,
})

export const adjustFinalScore = (state, amount, reason) => {
  void reason

  return {
    ...state,
    finalScore: state.finalScore + amount,
  }
}

export const capTypeBonus = (state, maxValue) => {
  const removedAmount = Math.max(0, (state.typeBonus || 0) - maxValue)

  return removedAmount > 0
    ? adjustTypeBonus(state, -removedAmount)
    : state
}

export const setTypeBonusToZero = (state) =>
  adjustTypeBonus(state, -(state.typeBonus || 0))

const hasType = (state, type) =>
  state.pokemon?.types?.includes(type) ?? false

const recordEffect = ({
  sourceState,
  targetState,
  trait,
  amount,
  message,
  logs,
  appliedEffects,
}) => {
  logs.push(message)
  sourceState.logs.push(message)
  appliedEffects.push({
    sourcePokemon: sourceState.pokemon,
    targetPokemon: targetState.pokemon,
    trait,
    applied: true,
    amount,
  })
}

const reduceTypeBonus = ({
  sourceState,
  targetState,
  trait,
  maximum,
  message,
  logs,
  appliedEffects,
}) => {
  const amount = Math.min(maximum, targetState.typeBonus || 0)

  if (amount <= 0) {
    return targetState
  }

  const nextTargetState = adjustTypeBonus(targetState, -amount)
  recordEffect({
    sourceState,
    targetState,
    trait,
    amount,
    message,
    logs,
    appliedEffects,
  })
  return nextTargetState
}

const eraseTypeBonus = ({
  sourceState,
  targetState,
  trait,
  message,
  logs,
  appliedEffects,
}) =>
  reduceTypeBonus({
    sourceState,
    targetState,
    trait,
    maximum: targetState.typeBonus || 0,
    message,
    logs,
    appliedEffects,
  })

const reduceTraitBonus = ({
  sourceState,
  targetState,
  trait,
  maximum,
  message,
  logs,
  appliedEffects,
}) => {
  const amount = Math.min(maximum, Math.max(0, targetState.traitBonus || 0))

  if (amount <= 0) {
    return targetState
  }

  const nextTargetState = adjustTraitBonus(targetState, -amount)
  recordEffect({
    sourceState,
    targetState,
    trait,
    amount,
    message,
    logs,
    appliedEffects,
  })
  return nextTargetState
}

const applyDirectScoreChange = ({
  sourceState,
  targetState,
  sourceAmount = 0,
  targetAmount = 0,
  targetFloor,
  trait,
  message,
  logs,
  appliedEffects,
}) => {
  const boundedTargetAmount =
    targetFloor === undefined
      ? targetAmount
      : Math.max(targetAmount, targetFloor - targetState.finalScore)
  const nextSourceState = sourceAmount
    ? adjustFinalScore(sourceState, sourceAmount)
    : sourceState
  const nextTargetState = boundedTargetAmount
    ? adjustFinalScore(targetState, boundedTargetAmount)
    : targetState
  const amount =
    sourceAmount && boundedTargetAmount
      ? Math.max(sourceAmount, Math.abs(boundedTargetAmount))
      : sourceAmount || Math.abs(boundedTargetAmount)

  recordEffect({
    sourceState: nextSourceState,
    targetState,
    trait,
    amount,
    message,
    logs,
    appliedEffects,
  })

  return {
    sourceState: nextSourceState,
    targetState: nextTargetState,
  }
}

const applySourceTrait = ({
  sourceState,
  targetState,
  logs,
  appliedEffects,
}) => {
  if (sourceState.traitDisabled) {
    return { sourceState, targetState }
  }

  const sourceName = sourceState.pokemon?.name

  if (sourceName === 'Rayquaza') {
    targetState = reduceTypeBonus({
      sourceState,
      targetState,
      trait: 'Sky Emperor',
      maximum: 5,
      message: 'Sky Emperor reduced opponent type bonus by up to 5.',
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Giratina') {
    targetState = reduceTypeBonus({
      sourceState,
      targetState,
      trait: 'Distortion World',
      maximum: 5,
      message: 'Distortion World reduced opponent type bonus by up to 5.',
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Kyurem') {
    const excess = Math.max(
      0,
      (targetState.typeBonus || 0) + (targetState.traitBonus || 0) - 3,
    )
    const traitReduction = Math.min(
      excess,
      Math.max(0, targetState.traitBonus || 0),
    )
    const typeReduction = Math.min(
      excess - traitReduction,
      Math.max(0, targetState.typeBonus || 0),
    )

    if (excess > 0) {
      targetState = adjustTraitBonus(targetState, -traitReduction)
      targetState = adjustTypeBonus(targetState, -typeReduction)
      recordEffect({
        sourceState,
        targetState,
        trait: 'Absolute Zero',
        amount: traitReduction + typeReduction,
        message: 'Absolute Zero capped opponent type and trait bonuses at +3.',
        logs,
        appliedEffects,
      })
    }
  }

  if (sourceName === 'Solgaleo' && hasType(targetState, 'Fire')) {
    const typeAmount = Math.max(0, targetState.typeBonus || 0)
    const traitAmount = Math.max(0, targetState.traitBonus || 0)

    if (typeAmount + traitAmount > 0) {
      targetState = setTypeBonusToZero(targetState)
      targetState = adjustTraitBonus(targetState, -traitAmount)
      recordEffect({
        sourceState,
        targetState,
        trait: 'Absolute Sun',
        amount: typeAmount + traitAmount,
        message: 'Absolute Sun erased Fire type and trait bonuses.',
        logs,
        appliedEffects,
      })
    }
  }

  if (sourceName === 'Lunala' && hasType(targetState, 'Ghost')) {
    const typeAmount = Math.max(0, targetState.typeBonus || 0)
    const traitAmount = Math.max(0, targetState.traitBonus || 0)

    if (typeAmount + traitAmount > 0) {
      targetState = setTypeBonusToZero(targetState)
      targetState = adjustTraitBonus(targetState, -traitAmount)
      recordEffect({
        sourceState,
        targetState,
        trait: 'Absolute Moon',
        amount: typeAmount + traitAmount,
        message: 'Absolute Moon erased Ghost type and trait bonuses.',
        logs,
        appliedEffects,
      })
    }
  }

  const typedTypeErasers = {
    Groudon: ['Water', 'Desolate Land'],
    Kyogre: ['Water', 'Water Absorber'],
  }
  const typedEraser = typedTypeErasers[sourceName]

  if (typedEraser && hasType(targetState, typedEraser[0])) {
    targetState = eraseTypeBonus({
      sourceState,
      targetState,
      trait: typedEraser[1],
      message: `${typedEraser[1]} erased opponent Water type bonus.`,
      logs,
      appliedEffects,
    })
  }

  const fullTypeErasers = {
    Palkia: 'Spatial Rift',
    Lugia: 'Guardian of the Seas',
  }
  const fullTypeEraser = fullTypeErasers[sourceName]

  if (fullTypeEraser) {
    targetState = eraseTypeBonus({
      sourceState,
      targetState,
      trait: fullTypeEraser,
      message: `${fullTypeEraser} erased opponent type bonus.`,
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Articuno') {
    targetState = reduceTypeBonus({
      sourceState,
      targetState,
      trait: 'Frozen Majesty',
      maximum: 2,
      message: 'Frozen Majesty reduced opponent type bonus by up to 2.',
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Zapdos' && hasType(targetState, 'Electric')) {
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: 5,
      targetAmount: -5,
      trait: 'Thunder Rod',
      message: 'Thunder Rod: Zapdos gained +5 and opponent lost 5.',
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
    targetState = result.targetState
  }

  if (sourceName === 'Reshiram' && targetState.typeBonus > 0) {
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: 3,
      trait: 'Flames of Truth',
      message: 'Flames of Truth: Reshiram gained +3.',
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  if (sourceName === 'Garchomp' && targetState.typeBonus >= 5) {
    const amount = targetState.typeBonus >= 10 ? 5 : 3
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: amount,
      trait: 'Apex Predator',
      message: `Apex Predator: Garchomp gained +${amount}.`,
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  if (sourceName === 'Haxorus' && hasType(targetState, 'Dragon')) {
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: 5,
      trait: 'Dragon Slayer',
      message: 'Dragon Slayer: Haxorus gained +5.',
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  if (sourceName === 'Steelix' && targetState.typeBonus > 3) {
    const amount = targetState.typeBonus - 3
    targetState = capTypeBonus(targetState, 3)
    recordEffect({
      sourceState,
      targetState,
      trait: 'Iron Fortress',
      amount,
      message: 'Iron Fortress capped opponent type bonus at +3.',
      logs,
      appliedEffects,
    })
  }

  if (
    sourceName === 'Zoroark' &&
    targetState.typeBonus > sourceState.typeBonus
  ) {
    const amount = targetState.typeBonus - sourceState.typeBonus
    sourceState = adjustTypeBonus(sourceState, amount)
    recordEffect({
      sourceState,
      targetState,
      trait: 'Illusion',
      amount,
      message: `Illusion: Zoroark matched opponent type bonus at +${targetState.typeBonus}.`,
      logs,
      appliedEffects,
    })
  }

  const comebackScores = {
    Gallade: ['Noble Duelist', 3],
    Scizor: ['Bullet Punch', 4],
  }
  const comebackScore = comebackScores[sourceName]
  const scoreDeficit = targetState.finalScore - sourceState.finalScore

  if (comebackScore && scoreDeficit >= 1 && scoreDeficit <= 3) {
    const [trait, amount] = comebackScore
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: amount,
      trait,
      message: `${trait}: ${sourceName} gained +${amount}.`,
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  if (sourceName === 'Talonflame' && sourceState.typeBonus > 0) {
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: 2,
      trait: 'Gale Wings',
      message: 'Gale Wings: Talonflame gained +2.',
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  const traitReducers = {
    Noivern: ['Sonic Wave', 3],
    Goodra: ['Gooey Armor', 2],
    'Kommo-o': ['Battle Armor', 3],
  }
  const traitReducer = traitReducers[sourceName]

  if (traitReducer) {
    targetState = reduceTraitBonus({
      sourceState,
      targetState,
      trait: traitReducer[0],
      maximum: traitReducer[1],
      message: `${traitReducer[0]} reduced opponent trait bonus by up to ${traitReducer[1]}.`,
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Rillaboom' && targetState.traitBonus > 3) {
    const amount = targetState.traitBonus - 3
    targetState = adjustTraitBonus(targetState, -amount)
    recordEffect({
      sourceState,
      targetState,
      trait: 'Drumbeat',
      amount,
      message: 'Drumbeat capped opponent trait bonus at +3.',
      logs,
      appliedEffects,
    })
  }

  if (sourceName === 'Gyarados') {
    const amount = Math.min(3, Math.max(0, targetState.finalScore))

    if (amount > 0) {
      const result = applyDirectScoreChange({
        sourceState,
        targetState,
        targetAmount: -amount,
        targetFloor: 0,
        trait: 'Intimidate',
        message: `Intimidate: opponent lost ${amount} final score.`,
        logs,
        appliedEffects,
      })
      targetState = result.targetState
    }
  }

  if (sourceName === 'Flygon') {
    targetState = reduceTypeBonus({
      sourceState,
      targetState,
      trait: 'Desert Spirit',
      maximum: 3,
      message: 'Desert Spirit reduced opponent type bonus by up to 3.',
      logs,
      appliedEffects,
    })
  }

  const metagrossDeficit = targetState.finalScore - sourceState.finalScore

  if (
    sourceName === 'Metagross' &&
    metagrossDeficit >= 1 &&
    metagrossDeficit <= 3
  ) {
    const result = applyDirectScoreChange({
      sourceState,
      targetState,
      sourceAmount: metagrossDeficit,
      trait: 'Supercomputer',
      message: `Supercomputer: Metagross gained +${metagrossDeficit} to tie.`,
      logs,
      appliedEffects,
    })
    sourceState = result.sourceState
  }

  return { sourceState, targetState }
}

export const resolveTypeAndScoreTraits = ({
  playerAState,
  playerBState,
}) => {
  let nextPlayerAState = cloneBattleState(playerAState)
  let nextPlayerBState = cloneBattleState(playerBState)
  const logs = []
  const appliedEffects = []

  const playerAResult = applySourceTrait({
    sourceState: nextPlayerAState,
    targetState: nextPlayerBState,
    logs,
    appliedEffects,
  })
  nextPlayerAState = playerAResult.sourceState
  nextPlayerBState = playerAResult.targetState

  const playerBResult = applySourceTrait({
    sourceState: nextPlayerBState,
    targetState: nextPlayerAState,
    logs,
    appliedEffects,
  })
  nextPlayerBState = playerBResult.sourceState
  nextPlayerAState = playerBResult.targetState

  return {
    playerAState: nextPlayerAState,
    playerBState: nextPlayerBState,
    logs,
    appliedEffects,
  }
}
