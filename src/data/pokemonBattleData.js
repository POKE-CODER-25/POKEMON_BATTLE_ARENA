import { POKEMON_CATEGORIES, TRAIT_PRIORITIES } from './battleConstants'

const priorityFor = (traitLabel) =>
  Number(
    Object.entries(TRAIT_PRIORITIES).find(([, labels]) =>
      labels.includes(traitLabel),
    )?.[0],
  )

const PRIORITY = {
  protected: priorityFor('Yveltal'),
  godKiller: priorityFor('Mega Rayquaza'),
  mega: priorityFor('Mega Evolutions'),
  zamazenta: priorityFor('Zamazenta'),
  mewtwo: priorityFor('Mewtwo'),
  necrozma: priorityFor('Necrozma'),
  xerneas: priorityFor('Xerneas'),
  darkrai: priorityFor('Darkrai'),
  cresselia: priorityFor('Cresselia'),
  jirachi: priorityFor('Jirachi'),
  normal: priorityFor('Normal special traits'),
}

const trait = (
  name,
  description,
  priority,
  effects = [],
  specialRules = [],
) => ({
  name,
  description,
  priority,
  effects,
  specialRules,
})

const pokemon = ({
  id,
  name,
  category,
  score,
  types,
  priority,
  traits,
  traitEffects = [],
  specialRules = [],
}) => ({
  id,
  name,
  category,
  score,
  types,
  hasTrait: true,
  traitName: traits.length > 1 ? 'Multiple Traits' : traits[0].name,
  traitDescription: traits.map(({ description }) => description).join('\n\n'),
  traitEffects,
  specialRules,
  priority,
  traits,
})

export const legendaryPokemon = [
  pokemon({
    id: 384,
    name: 'Rayquaza',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 100,
    types: ['Dragon', 'Flying'],
    priority: PRIORITY.godKiller,
    traitEffects: [
      'Negates up to 5 enemy type bonus points',
      '50% chance to become Mega Rayquaza',
      'Mega Rayquaza gains +20 battle points and reaches 120 total score',
    ],
    specialRules: [
      'Mega Rayquaza can defeat Arceus, Regigigas in Master Round, and awakened Snorlax in Master Round',
    ],
    traits: [
      trait(
        'Sky Emperor',
        'Negates up to 5 enemy type bonus points.',
        PRIORITY.normal,
        ['Negates up to 5 enemy type bonus points'],
      ),
      trait(
        'God Killer',
        '50% chance to become Mega Rayquaza. If God Killer activates, Mega Rayquaza gains +20 battle points and reaches 120 total score. Mega Rayquaza can defeat Arceus, Regigigas in Master Round, and awakened Snorlax in Master Round.',
        PRIORITY.godKiller,
        [
          '50% chance to become Mega Rayquaza',
          'Mega Rayquaza gains +20 battle points',
          'Mega Rayquaza reaches 120 total score',
        ],
        [
          'Can defeat Arceus',
          'Can defeat Regigigas in Master Round',
          'Can defeat awakened Snorlax in Master Round',
        ],
      ),
    ],
  }),
  pokemon({
    id: 493,
    name: 'Arceus',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 100,
    types: ['Normal'],
    priority: PRIORITY.godKiller,
    traitEffects: [
      'Ignores all type bonuses',
      'Ignores all trait bonuses',
      'Cannot receive penalties',
    ],
    traits: [
      trait(
        'GOD',
        'Ignores all type bonuses, ignores all trait bonuses, and cannot receive penalties.',
        PRIORITY.godKiller,
        [
          'Ignores all type bonuses',
          'Ignores all trait bonuses',
          'Cannot receive penalties',
        ],
      ),
    ],
  }),
  pokemon({
    id: 800,
    name: 'Necrozma',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 100,
    types: ['Psychic'],
    priority: PRIORITY.necrozma,
    traitEffects: [
      'Opponent trait bonuses are transferred to Necrozma',
      '50% chance to become Ultra Necrozma',
      'Ultra Necrozma gains +20 battle points and reaches 120 total score',
    ],
    specialRules: [
      'Ultra Necrozma can defeat Arceus, Regigigas in Master Round, and awakened Snorlax in Master Round',
      'Ultra Necrozma form uses priority 1',
      'Base Necrozma trait priority is 6',
    ],
    traits: [
      trait(
        'Light Devourer',
        'Opponent trait bonuses are transferred to Necrozma.',
        PRIORITY.necrozma,
        ['Opponent trait bonuses are transferred to Necrozma'],
      ),
      trait(
        'God Killer',
        '50% chance to become Ultra Necrozma. If God Killer activates, Ultra Necrozma gains +20 battle points and reaches 120 total score. Ultra Necrozma can defeat Arceus, Regigigas in Master Round, and awakened Snorlax in Master Round.',
        PRIORITY.godKiller,
        [
          '50% chance to become Ultra Necrozma',
          'Ultra Necrozma gains +20 battle points',
          'Ultra Necrozma reaches 120 total score',
        ],
        [
          'Can defeat Arceus',
          'Can defeat Regigigas in Master Round',
          'Can defeat awakened Snorlax in Master Round',
        ],
      ),
    ],
  }),
  pokemon({
    id: 151,
    name: 'Mew',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 99,
    types: ['Psychic'],
    priority: PRIORITY.normal,
    traitEffects: ['Copies opponent trait'],
    traits: [
      trait(
        'Ancestor Memory',
        'Copies opponent trait.',
        PRIORITY.normal,
        ['Copies opponent trait'],
      ),
    ],
  }),
  pokemon({
    id: 150,
    name: 'Mewtwo',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 99,
    types: ['Psychic'],
    priority: PRIORITY.mewtwo,
    traitEffects: ['Disables opponent trait'],
    traits: [
      trait(
        'Psychic Suppression',
        'Disables opponent trait.',
        PRIORITY.mewtwo,
        ['Disables opponent trait'],
      ),
    ],
  }),
  pokemon({
    id: 487,
    name: 'Giratina',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 98,
    types: ['Ghost', 'Dragon'],
    priority: PRIORITY.normal,
    traitEffects: ['Reduces enemy type advantage by 5'],
    traits: [
      trait(
        'Distortion World',
        'Reduces enemy type advantage by 5.',
        PRIORITY.normal,
        ['Reduces enemy type advantage by 5'],
      ),
    ],
  }),
  pokemon({
    id: 646,
    name: 'Kyurem',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 98,
    types: ['Dragon', 'Ice'],
    priority: PRIORITY.normal,
    traitEffects: ['Opponent cannot gain more than +3 total bonus points'],
    traits: [
      trait(
        'Absolute Zero',
        'Opponent cannot gain more than +3 total bonus points.',
        PRIORITY.normal,
        ['Opponent cannot gain more than +3 total bonus points'],
      ),
    ],
  }),
  pokemon({
    id: 791,
    name: 'Solgaleo',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 97,
    types: ['Psychic', 'Steel'],
    priority: PRIORITY.normal,
    traitEffects: ['Absorbs Fire type bonuses and Fire-based trait bonuses'],
    traits: [
      trait(
        'Absolute Sun',
        'Absorbs Fire type bonuses and Fire-based trait bonuses.',
        PRIORITY.normal,
        ['Absorbs Fire type bonuses', 'Absorbs Fire-based trait bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 792,
    name: 'Lunala',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 97,
    types: ['Psychic', 'Ghost'],
    priority: PRIORITY.normal,
    traitEffects: ['Absorbs Ghost type bonuses and Ghost-based trait bonuses'],
    traits: [
      trait(
        'Absolute Moon',
        'Absorbs Ghost type bonuses and Ghost-based trait bonuses.',
        PRIORITY.normal,
        ['Absorbs Ghost type bonuses', 'Absorbs Ghost-based trait bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 383,
    name: 'Groudon',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 96,
    types: ['Ground'],
    priority: PRIORITY.normal,
    traitEffects: ['Water type bonuses against Groudon become 0'],
    traits: [
      trait(
        'Desolate Land',
        'Water type bonuses against Groudon become 0.',
        PRIORITY.normal,
        ['Water type bonuses against Groudon become 0'],
      ),
    ],
  }),
  pokemon({
    id: 382,
    name: 'Kyogre',
    category: POKEMON_CATEGORIES.S_LEGEND,
    score: 96,
    types: ['Water'],
    priority: PRIORITY.normal,
    traitEffects: ['Absorbs Water type bonuses'],
    traits: [
      trait(
        'Water Absorber',
        'Absorbs Water type bonuses.',
        PRIORITY.normal,
        ['Absorbs Water type bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 483,
    name: 'Dialga',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 95,
    types: ['Steel', 'Dragon'],
    priority: PRIORITY.protected,
    traitEffects: ['40% chance to reverse a lost battle'],
    traits: [
      trait(
        'Time Warp',
        '40% chance to reverse a lost battle.',
        PRIORITY.protected,
        ['40% chance to reverse a lost battle'],
      ),
    ],
  }),
  pokemon({
    id: 484,
    name: 'Palkia',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 95,
    types: ['Water', 'Dragon'],
    priority: PRIORITY.normal,
    traitEffects: ['Ignores all enemy type bonuses'],
    traits: [
      trait(
        'Spatial Rift',
        'Ignores all enemy type bonuses.',
        PRIORITY.normal,
        ['Ignores all enemy type bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 644,
    name: 'Zekrom',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 94,
    types: ['Dragon', 'Electric'],
    priority: PRIORITY.normal,
    traitEffects: ['If opponent score is higher, Zekrom gains +3'],
    traits: [
      trait(
        'Ideals of Thunder',
        'If opponent score is higher, Zekrom gains +3.',
        PRIORITY.normal,
        ['If opponent score is higher, Zekrom gains +3'],
      ),
    ],
  }),
  pokemon({
    id: 643,
    name: 'Reshiram',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 94,
    types: ['Dragon', 'Fire'],
    priority: PRIORITY.normal,
    traitEffects: [
      'If opponent has type advantage against Reshiram, Reshiram gains +3',
    ],
    traits: [
      trait(
        'Flames of Truth',
        'If opponent has type advantage against Reshiram, Reshiram gains +3.',
        PRIORITY.normal,
        ['If opponent has type advantage against Reshiram, Reshiram gains +3'],
      ),
    ],
  }),
  pokemon({
    id: 716,
    name: 'Xerneas',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 93,
    types: ['Fairy'],
    priority: PRIORITY.xerneas,
    traitEffects: ['Absorbs opponent trait bonuses'],
    traits: [
      trait(
        'Aura of Life',
        'Absorbs opponent trait bonuses.',
        PRIORITY.xerneas,
        ['Absorbs opponent trait bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 718,
    name: 'Zygarde',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 93,
    types: ['Dragon', 'Ground'],
    priority: PRIORITY.normal,
    traitEffects: [
      'If opponent gains more than +5 bonus, remove 5 from that bonus',
    ],
    traits: [
      trait(
        'Order Restored',
        'If opponent gains more than +5 bonus, remove 5 from that bonus.',
        PRIORITY.normal,
        ['If opponent gains more than +5 bonus, remove 5 from that bonus'],
      ),
    ],
  }),
  pokemon({
    id: 717,
    name: 'Yveltal',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 92,
    types: ['Dark', 'Flying'],
    priority: PRIORITY.protected,
    traitEffects: [
      "If Yveltal wins, the opponent's next Pokemon loses 3 score",
    ],
    specialRules: [
      'This effect cannot stack',
      'This is a battlefield effect and can affect even Arceus before battle begins',
    ],
    traits: [
      trait(
        'Aura of Destruction',
        "If Yveltal wins, the opponent's next Pokemon loses 3 score. This effect cannot stack. This is a battlefield effect and can affect even Arceus before battle begins.",
        PRIORITY.protected,
        ["If Yveltal wins, the opponent's next Pokemon loses 3 score"],
        [
          'This effect cannot stack',
          'This is a battlefield effect and can affect even Arceus before battle begins',
        ],
      ),
    ],
  }),
  pokemon({
    id: 491,
    name: 'Darkrai',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 92,
    types: ['Dark'],
    priority: PRIORITY.darkrai,
    traitEffects: ['Opponent trait activates only 40% of the time'],
    traits: [
      trait(
        'Endless Nightmare',
        'Opponent trait activates only 40% of the time.',
        PRIORITY.darkrai,
        ['Opponent trait activates only 40% of the time'],
      ),
    ],
  }),
  pokemon({
    id: 249,
    name: 'Lugia',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 91,
    types: ['Psychic', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['Negates all enemy type bonuses'],
    traits: [
      trait(
        'Guardian of the Seas',
        'Negates all enemy type bonuses.',
        PRIORITY.normal,
        ['Negates all enemy type bonuses'],
      ),
    ],
  }),
  pokemon({
    id: 250,
    name: 'Ho-Oh',
    category: POKEMON_CATEGORIES.A_LEGEND,
    score: 91,
    types: ['Fire', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['If Ho-Oh loses, 50% chance to gain +5 and recalculate battle'],
    traits: [
      trait(
        'Sacred Rebirth',
        'If Ho-Oh loses, 50% chance to gain +5 and recalculate battle.',
        PRIORITY.normal,
        ['If Ho-Oh loses, 50% chance to gain +5 and recalculate battle'],
      ),
    ],
  }),
  pokemon({
    id: 888,
    name: 'Zacian',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 90,
    types: ['Fairy'],
    priority: PRIORITY.normal,
    traitEffects: ['If opponent score is higher, Zacian gains +5'],
    traits: [
      trait(
        'Crowned Sword',
        'If opponent score is higher, Zacian gains +5.',
        PRIORITY.normal,
        ['If opponent score is higher, Zacian gains +5'],
      ),
    ],
  }),
  pokemon({
    id: 145,
    name: 'Zapdos',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 89,
    types: ['Electric', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Against Electric-type Pokemon, Zapdos gains +5 and the Electric-type opponent loses 5',
    ],
    traits: [
      trait(
        'Thunder Rod',
        'Against Electric-type Pokemon, Zapdos gains +5 and the Electric-type opponent loses 5.',
        PRIORITY.normal,
        [
          'Against Electric-type Pokemon, Zapdos gains +5',
          'Electric-type opponent loses 5',
        ],
      ),
    ],
  }),
  pokemon({
    id: 146,
    name: 'Moltres',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 89,
    types: ['Fire', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['If Moltres loses, 50% chance to gain +3 and recalculate'],
    traits: [
      trait(
        'Eternal Flame',
        'If Moltres loses, 50% chance to gain +3 and recalculate.',
        PRIORITY.normal,
        ['If Moltres loses, 50% chance to gain +3 and recalculate'],
      ),
    ],
  }),
  pokemon({
    id: 144,
    name: 'Articuno',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 89,
    types: ['Ice', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['Opponent loses 2 type bonus points'],
    traits: [
      trait(
        'Frozen Majesty',
        'Opponent loses 2 type bonus points.',
        PRIORITY.normal,
        ['Opponent loses 2 type bonus points'],
      ),
    ],
  }),
  pokemon({
    id: 889,
    name: 'Zamazenta',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 89,
    types: ['Fighting'],
    priority: PRIORITY.zamazenta,
    traitEffects: ['Immune to trait manipulation'],
    traits: [
      trait(
        'Crowned Shield',
        'Immune to trait manipulation.',
        PRIORITY.zamazenta,
        ['Immune to trait manipulation'],
      ),
    ],
  }),
  pokemon({
    id: 494,
    name: 'Victini',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 88,
    types: ['Psychic', 'Fire'],
    priority: PRIORITY.protected,
    traitEffects: ['Automatically wins ties'],
    traits: [
      trait(
        'Victory Star',
        'Automatically wins ties.',
        PRIORITY.protected,
        ['Automatically wins ties'],
      ),
    ],
  }),
  pokemon({
    id: 486,
    name: 'Regigigas',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 88,
    types: ['Normal'],
    priority: PRIORITY.protected,
    traitEffects: [
      'Round 1 = -5',
      'Round 2 = -3',
      'Round 3 = 0',
      'Round 4 = +2',
      'Round 5 = +5',
      'Round 6 = +7',
      'Master Round = +15',
    ],
    specialRules: [
      'In Master Round, Regigigas reaches 103',
      'Master Round Titan Awakening is protected and cannot be disabled, stolen, reduced, transferred, or absorbed',
    ],
    traits: [
      trait(
        'Slow Start',
        'Round 1 = -5. Round 2 = -3. Round 3 = 0. Round 4 = +2. Round 5 = +5. Round 6 = +7. Master Round = +15. In Master Round, Regigigas reaches 103. Master Round Titan Awakening is protected and cannot be disabled, stolen, reduced, transferred, or absorbed.',
        PRIORITY.protected,
        [
          'Round 1 = -5',
          'Round 2 = -3',
          'Round 3 = 0',
          'Round 4 = +2',
          'Round 5 = +5',
          'Round 6 = +7',
          'Master Round = +15',
        ],
        [
          'In Master Round, Regigigas reaches 103',
          'Master Round Titan Awakening is protected and cannot be disabled, stolen, reduced, transferred, or absorbed',
        ],
      ),
    ],
  }),
  pokemon({
    id: 386,
    name: 'Deoxys',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 88,
    types: ['Psychic'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Random form each battle',
      'Attack Form = +5',
      'Defense Form = opponent loses 5',
      'Speed Form = negate opponent type bonus',
      'Normal Form = negate opponent trait bonus',
    ],
    traits: [
      trait(
        'DNA Mutation',
        'Random form each battle: Attack Form = +5. Defense Form = opponent loses 5. Speed Form = negate opponent type bonus. Normal Form = negate opponent trait bonus.',
        PRIORITY.normal,
        [
          'Random form each battle',
          'Attack Form = +5',
          'Defense Form = opponent loses 5',
          'Speed Form = negate opponent type bonus',
          'Normal Form = negate opponent trait bonus',
        ],
      ),
    ],
  }),
  pokemon({
    id: 488,
    name: 'Cresselia',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 87,
    types: ['Psychic'],
    priority: PRIORITY.cresselia,
    traitEffects: ['50% chance opponent trait fails'],
    traits: [
      trait(
        'Lunar Blessing',
        '50% chance opponent trait fails.',
        PRIORITY.cresselia,
        ['50% chance opponent trait fails'],
      ),
    ],
  }),
  pokemon({
    id: 381,
    name: 'Latios',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 87,
    types: ['Dragon', 'Psychic'],
    priority: PRIORITY.normal,
    traitEffects: ['If Latios wins, next ally gains +3'],
    traits: [
      trait(
        'Jet Stream',
        'If Latios wins, next ally gains +3.',
        PRIORITY.normal,
        ['If Latios wins, next ally gains +3'],
      ),
    ],
  }),
  pokemon({
    id: 380,
    name: 'Latias',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 87,
    types: ['Dragon', 'Psychic'],
    priority: PRIORITY.normal,
    traitEffects: ['If Latias wins, next ally gains immunity to trait penalties'],
    traits: [
      trait(
        'Guardian Soul',
        'If Latias wins, next ally gains immunity to trait penalties.',
        PRIORITY.normal,
        ['If Latias wins, next ally gains immunity to trait penalties'],
      ),
    ],
  }),
  pokemon({
    id: 251,
    name: 'Celebi',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 86,
    types: ['Psychic', 'Grass'],
    priority: PRIORITY.normal,
    traitEffects: ['One-time +10 bonus to any ally'],
    specialRules: ['This can be affected by other traits'],
    traits: [
      trait(
        'Time Seed',
        'One-time +10 bonus to any ally. This can be affected by other traits.',
        PRIORITY.normal,
        ['One-time +10 bonus to any ally'],
        ['This can be affected by other traits'],
      ),
    ],
  }),
  pokemon({
    id: 385,
    name: 'Jirachi',
    category: POKEMON_CATEGORIES.B_LEGEND,
    score: 86,
    types: ['Steel', 'Psychic'],
    priority: PRIORITY.jirachi,
    traitEffects: [
      'Jirachi may select one trait from any teammate currently in the team',
    ],
    specialRules: [
      'Cannot copy Mega Evolutions',
      'Cannot copy Ash Greninja',
      'Cannot copy God Killer',
      'Can only copy traits from teammates actually drafted in the current team',
      'If Jirachi copies Snorlax, normal rounds = +10 instead of +20',
      'If Jirachi copies Snorlax, Master Round = +12 instead of +25',
    ],
    traits: [
      trait(
        'Wish Maker',
        'Jirachi may select one trait from any teammate currently in the team.',
        PRIORITY.jirachi,
        [
          'Jirachi may select one trait from any teammate currently in the team',
        ],
        [
          'Cannot copy Mega Evolutions',
          'Cannot copy Ash Greninja',
          'Cannot copy God Killer',
          'Can only copy traits from teammates actually drafted in the current team',
          'If Jirachi copies Snorlax, normal rounds = +10 instead of +20',
          'If Jirachi copies Snorlax, Master Round = +12 instead of +25',
        ],
      ),
    ],
  }),
]

export const pseudoPokemon = [
  pokemon({
    id: 445,
    name: 'Garchomp',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 89,
    types: ['Dragon', 'Ground'],
    priority: PRIORITY.normal,
    traitEffects: [
      'If the opponent has a 2x type advantage against Garchomp, Garchomp gains +3',
      'If the opponent has a 4x type advantage against Garchomp, Garchomp gains +5',
    ],
    traits: [
      trait(
        'Apex Predator',
        'If the opponent has a 2x type advantage against Garchomp, Garchomp gains +3. If the opponent has a 4x type advantage against Garchomp, Garchomp gains +5.',
        PRIORITY.normal,
        [
          'If the opponent has a 2x type advantage against Garchomp, Garchomp gains +3',
          'If the opponent has a 4x type advantage against Garchomp, Garchomp gains +5',
        ],
      ),
    ],
  }),
  pokemon({
    id: 149,
    name: 'Dragonite',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 88,
    types: ['Dragon', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['If Dragonite loses, the next ally Pokemon gains +3'],
    traits: [
      trait(
        'Guardian Dragon',
        'If Dragonite loses, the next ally Pokemon gains +3.',
        PRIORITY.normal,
        ['If Dragonite loses, the next ally Pokemon gains +3'],
      ),
    ],
  }),
  pokemon({
    id: 376,
    name: 'Metagross',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 87,
    types: ['Steel', 'Psychic'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Metagross gains enough points to tie the opponent',
      'Maximum gain is +3',
    ],
    traits: [
      trait(
        'Supercomputer',
        'Metagross gains enough points to tie the opponent. Maximum gain is +3.',
        PRIORITY.normal,
        [
          'Metagross gains enough points to tie the opponent',
          'Maximum gain is +3',
        ],
      ),
    ],
  }),
  pokemon({
    id: 887,
    name: 'Dragapult',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 86,
    types: ['Dragon', 'Ghost'],
    priority: PRIORITY.normal,
    traitEffects: [
      'If Dragapult wins, the opponent cannot gain type bonus next round',
    ],
    traits: [
      trait(
        'Phantom Launch',
        'If Dragapult wins, the opponent cannot gain type bonus next round.',
        PRIORITY.normal,
        ['If Dragapult wins, the opponent cannot gain type bonus next round'],
      ),
    ],
  }),
  pokemon({
    id: 373,
    name: 'Salamence',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 85,
    types: ['Dragon', 'Flying'],
    priority: PRIORITY.normal,
    traitEffects: ['If the opponent score is higher, Salamence gains +4'],
    traits: [
      trait(
        'Berserker Wings',
        'If the opponent score is higher, Salamence gains +4.',
        PRIORITY.normal,
        ['If the opponent score is higher, Salamence gains +4'],
      ),
    ],
  }),
  pokemon({
    id: 784,
    name: 'Kommo-o',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 84,
    types: ['Dragon', 'Fighting'],
    priority: PRIORITY.normal,
    traitEffects: ['Opponent trait bonus is reduced by 3'],
    traits: [
      trait(
        'Battle Armor',
        'Opponent trait bonus is reduced by 3.',
        PRIORITY.normal,
        ['Opponent trait bonus is reduced by 3'],
      ),
    ],
  }),
  pokemon({
    id: 248,
    name: 'Tyranitar',
    category: POKEMON_CATEGORIES.PSEUDO,
    score: 83,
    types: ['Rock', 'Dark'],
    priority: PRIORITY.normal,
    traitEffects: [
      "If Tyranitar wins, the opponent's next Pokemon loses 2 score",
    ],
    traits: [
      trait(
        'Sandstorm King',
        "If Tyranitar wins, the opponent's next Pokemon loses 2 score.",
        PRIORITY.normal,
        ["If Tyranitar wins, the opponent's next Pokemon loses 2 score"],
      ),
    ],
  }),
]

export const starterPokemon = [
  pokemon({
    id: 6,
    name: 'Charizard',
    category: POKEMON_CATEGORIES.STARTER,
    score: 88,
    types: ['Fire', 'Flying'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Blaze grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Blaze + Mega Evolution X',
        'Blaze grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Blaze grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 658,
    name: 'Greninja',
    category: POKEMON_CATEGORIES.STARTER,
    score: 87,
    types: ['Water', 'Dark'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Torrent grants +2',
      '50% chance to become Ash Greninja',
      'Ash Form grants protected +3',
      'Ash Greninja also gains +1 for every round already won by the trainer',
    ],
    specialRules: [
      'Ash bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Torrent + Battle Bond',
        'Torrent grants +2. 50% chance to become Ash Greninja. Ash Form grants protected +3. Ash Greninja also gains +1 for every round already won by the trainer. Ash bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Torrent grants +2',
          '50% chance to become Ash Greninja',
          'Ash Form grants protected +3',
          'Ash Greninja also gains +1 for every round already won by the trainer',
        ],
        [
          'Ash bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 254,
    name: 'Sceptile',
    category: POKEMON_CATEGORIES.STARTER,
    score: 86,
    types: ['Grass'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Growth grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Growth + Mega Evolution',
        'Growth grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Growth grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 392,
    name: 'Infernape',
    category: POKEMON_CATEGORIES.STARTER,
    score: 85,
    types: ['Fire', 'Fighting'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Blaze grants +2',
      'If opponent has higher score, Infernape gains +5',
    ],
    traits: [
      trait(
        'Blaze + Blaze of Determination',
        'Blaze grants +2. If opponent has higher score, Infernape gains +5.',
        PRIORITY.normal,
        [
          'Blaze grants +2',
          'If opponent has higher score, Infernape gains +5',
        ],
      ),
    ],
  }),
  pokemon({
    id: 260,
    name: 'Swampert',
    category: POKEMON_CATEGORIES.STARTER,
    score: 84,
    types: ['Water', 'Ground'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Torrent grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Torrent + Mega Evolution',
        'Torrent grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Torrent grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 257,
    name: 'Blaziken',
    category: POKEMON_CATEGORIES.STARTER,
    score: 83,
    types: ['Fire', 'Fighting'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Blaze grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Blaze + Mega Evolution',
        'Blaze grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Blaze grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 9,
    name: 'Blastoise',
    category: POKEMON_CATEGORIES.STARTER,
    score: 82,
    types: ['Water'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Torrent grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Torrent + Mega Evolution',
        'Torrent grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Torrent grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 727,
    name: 'Incineroar',
    category: POKEMON_CATEGORIES.STARTER,
    score: 81,
    types: ['Fire', 'Dark'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Blaze grants +2',
      "If Incineroar wins, opponent's next Pokemon loses 2 score",
    ],
    traits: [
      trait(
        'Blaze + Heel Wrestler',
        "Blaze grants +2. If Incineroar wins, opponent's next Pokemon loses 2 score.",
        PRIORITY.normal,
        [
          'Blaze grants +2',
          "If Incineroar wins, opponent's next Pokemon loses 2 score",
        ],
      ),
    ],
  }),
  pokemon({
    id: 812,
    name: 'Rillaboom',
    category: POKEMON_CATEGORIES.STARTER,
    score: 80,
    types: ['Grass'],
    priority: PRIORITY.normal,
    traitEffects: [
      'Growth grants +2',
      'Opponent cannot gain more than +3 trait bonus',
    ],
    traits: [
      trait(
        'Growth + Drumbeat',
        'Growth grants +2. Opponent cannot gain more than +3 trait bonus.',
        PRIORITY.normal,
        [
          'Growth grants +2',
          'Opponent cannot gain more than +3 trait bonus',
        ],
      ),
    ],
  }),
  pokemon({
    id: 818,
    name: 'Inteleon',
    category: POKEMON_CATEGORIES.STARTER,
    score: 79,
    types: ['Water'],
    priority: PRIORITY.normal,
    traitEffects: ['Torrent grants +2'],
    traits: [
      trait('Torrent', 'Torrent grants +2.', PRIORITY.normal, [
        'Torrent grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 3,
    name: 'Venusaur',
    category: POKEMON_CATEGORIES.STARTER,
    score: 78,
    types: ['Grass', 'Poison'],
    priority: PRIORITY.mega,
    traitEffects: [
      'Growth grants +2',
      '50% chance to Mega Evolve',
      'Mega Evolution grants protected +3',
    ],
    specialRules: [
      'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
    ],
    traits: [
      trait(
        'Growth + Mega Evolution',
        'Growth grants +2. 50% chance to Mega Evolve. Mega Evolution grants protected +3. Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred.',
        PRIORITY.mega,
        [
          'Growth grants +2',
          '50% chance to Mega Evolve',
          'Mega Evolution grants protected +3',
        ],
        [
          'Mega bonus cannot be disabled, stolen, reduced, absorbed, or transferred',
        ],
      ),
    ],
  }),
  pokemon({
    id: 395,
    name: 'Empoleon',
    category: POKEMON_CATEGORIES.STARTER,
    score: 77,
    types: ['Water', 'Steel'],
    priority: PRIORITY.normal,
    traitEffects: ['Torrent grants +2'],
    traits: [
      trait('Torrent', 'Torrent grants +2.', PRIORITY.normal, [
        'Torrent grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 815,
    name: 'Cinderace',
    category: POKEMON_CATEGORIES.STARTER,
    score: 76,
    types: ['Fire'],
    priority: PRIORITY.normal,
    traitEffects: ['Blaze grants +2'],
    traits: [
      trait('Blaze', 'Blaze grants +2.', PRIORITY.normal, [
        'Blaze grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 724,
    name: 'Decidueye',
    category: POKEMON_CATEGORIES.STARTER,
    score: 75,
    types: ['Grass', 'Ghost'],
    priority: PRIORITY.normal,
    traitEffects: ['Growth grants +2'],
    traits: [
      trait('Growth', 'Growth grants +2.', PRIORITY.normal, [
        'Growth grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 503,
    name: 'Samurott',
    category: POKEMON_CATEGORIES.STARTER,
    score: 74,
    types: ['Water'],
    priority: PRIORITY.normal,
    traitEffects: ['Torrent grants +2'],
    traits: [
      trait('Torrent', 'Torrent grants +2.', PRIORITY.normal, [
        'Torrent grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 500,
    name: 'Emboar',
    category: POKEMON_CATEGORIES.STARTER,
    score: 73,
    types: ['Fire', 'Fighting'],
    priority: PRIORITY.normal,
    traitEffects: ['Blaze grants +2'],
    traits: [
      trait('Blaze', 'Blaze grants +2.', PRIORITY.normal, [
        'Blaze grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 389,
    name: 'Torterra',
    category: POKEMON_CATEGORIES.STARTER,
    score: 72,
    types: ['Grass', 'Ground'],
    priority: PRIORITY.normal,
    traitEffects: ['Growth grants +2'],
    traits: [
      trait('Growth', 'Growth grants +2.', PRIORITY.normal, [
        'Growth grants +2',
      ]),
    ],
  }),
  pokemon({
    id: 730,
    name: 'Primarina',
    category: POKEMON_CATEGORIES.STARTER,
    score: 72,
    types: ['Water', 'Fairy'],
    priority: PRIORITY.normal,
    traitEffects: ['Torrent grants +2'],
    traits: [
      trait('Torrent', 'Torrent grants +2.', PRIORITY.normal, [
        'Torrent grants +2',
      ]),
    ],
  }),
]

export const allBattlePokemon = [
  ...legendaryPokemon,
  ...pseudoPokemon,
  ...starterPokemon,
]
