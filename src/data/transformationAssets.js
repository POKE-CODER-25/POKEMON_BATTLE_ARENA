const OFFICIAL_ARTWORK_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

const TRANSFORMATION_POKEMON_IDS = {
  'Mega Venusaur': 10033,
  'Mega Charizard X': 10034,
  'Mega Blastoise': 10036,
  'Mega Blaziken': 10050,
  'Mega Swampert': 10064,
  'Mega Sceptile': 10065,
  'Mega Rayquaza': 10079,
  'Ash Greninja': 10117,
  'Ultra Necrozma': 10155,
  'Gigantamax Snorlax': 10206,
  'Titan Regigigas': 486,
}

const TRANSFORMED_FORM_BY_POKEMON = {
  Charizard: 'Mega Charizard X',
  Blastoise: 'Mega Blastoise',
  Venusaur: 'Mega Venusaur',
  Sceptile: 'Mega Sceptile',
  Swampert: 'Mega Swampert',
  Blaziken: 'Mega Blaziken',
  Greninja: 'Ash Greninja',
  Rayquaza: 'Mega Rayquaza',
  Necrozma: 'Ultra Necrozma',
  Snorlax: 'Gigantamax Snorlax',
  Regigigas: 'Titan Regigigas',
}

export const TRANSFORMATION_IMAGES = Object.fromEntries(
  Object.entries(TRANSFORMATION_POKEMON_IDS).map(
    ([formName, pokemonId]) => [
      formName,
      `${OFFICIAL_ARTWORK_BASE_URL}/${pokemonId}.png`,
    ],
  ),
)

export function getPokemonName(pokemon) {
  return pokemon?.name ?? pokemon?.pokemonName ?? 'Unknown Pokemon'
}

export function getNormalPokemonImage(pokemon) {
  const pokemonId = pokemon?.id ?? pokemon?.pokemonId

  return pokemonId
    ? `${OFFICIAL_ARTWORK_BASE_URL}/${pokemonId}.png`
    : null
}

export function getTransformationFormForPokemon(pokemon) {
  return TRANSFORMED_FORM_BY_POKEMON[getPokemonName(pokemon)] ?? null
}

export function getTransformationImage(transformedForm) {
  return TRANSFORMATION_IMAGES[transformedForm] ?? null
}

export function getDisplayPokemonImage(pokemon, transformation) {
  const transformedForm =
    typeof transformation === 'string'
      ? transformation
      : transformation?.transformedForm

  return (
    getTransformationImage(transformedForm) ??
    getNormalPokemonImage(pokemon)
  )
}
