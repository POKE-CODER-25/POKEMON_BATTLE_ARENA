export const POKEMON_CATEGORIES = {
  S_LEGEND: 'S_LEGEND',
  A_LEGEND: 'A_LEGEND',
  B_LEGEND: 'B_LEGEND',
  PSEUDO: 'PSEUDO',
  STARTER: 'STARTER',
  FAN_FAVOURITE: 'FAN_FAVOURITE',
  SUPPORT: 'SUPPORT',
}

export const CATEGORY_LABELS = {
  S_LEGEND: 'S-Tier Legend',
  A_LEGEND: 'A-Tier Legend',
  B_LEGEND: 'B-Tier Legend',
  PSEUDO: 'Pseudo Legendary',
  STARTER: 'Starter',
  FAN_FAVOURITE: 'Fan Favourite',
  SUPPORT: 'Support',
}

export const SCORE_RANGES = {
  S_LEGEND: { min: 96, max: 100 },
  A_LEGEND: { min: 91, max: 95 },
  B_LEGEND: { min: 86, max: 90 },
  PSEUDO: { min: 82, max: 89 },
  STARTER: { min: 72, max: 88 },
  FAN_FAVOURITE: { min: 70, max: 88 },
  SUPPORT: { min: 60, max: 80 },
}

export const TRAIT_PRIORITIES = {
  0: ['Yveltal', 'Dialga', 'Victini', 'Snorlax', 'Regigigas'],
  1: ['Arceus', 'Mega Rayquaza', 'Ultra Necrozma'],
  2: ['Mega Evolutions', 'Ash Greninja'],
  3: ['Zamazenta'],
  4: ['Lucario'],
  5: ['Mewtwo'],
  6: ['Necrozma'],
  7: ['Xerneas'],
  8: ['Darkrai'],
  9: ['Cresselia'],
  11: ['Normal special traits'],
  99: ['No trait'],
}

export const MASTER_PRIORITY = {
  S_LEGEND: 1,
  A_LEGEND: 2,
  B_LEGEND: 3,
  PSEUDO: 4,
  STARTER: 5,
  FAN_FAVOURITE_A: 6,
  FAN_FAVOURITE_B: 7,
  SUPPORT: 8,
}

export const BATTLE_PHASES = {
  CHOOSE_POKEMON: 'choose_pokemon',
  WAITING_FOR_OPPONENT: 'waiting_for_opponent',
  REVEAL: 'reveal',
  SCORE_BREAKDOWN: 'score_breakdown',
  ROUND_RESULT: 'round_result',
  MASTER_ROUND: 'master_round',
  MATCH_OVER: 'match_over',
}

export const MASTER_ROUND_RULES = {
  triggerScore: 3,
  totalNormalRounds: 6,
  name: 'Master Round',
  choicesPerPlayer: 3,
  snorlaxAutoInclude: true,
  traitsReset: true,
}

export const TIE_RULES = {
  victini: 'Victini wins ties',
  roundOne: 'Round 1 tie gives both players 1 point',
  roundsTwoToSix: 'Rounds 2-6 tie gives point to trailing player',
  masterRound: 'Master Round uses Master Priority',
  sameCategoryMasterRound: 'Same category Master Round tie = True Warriors',
}

export const REMOVED_POKEMON = ['Hydreigon', 'Heatran']
