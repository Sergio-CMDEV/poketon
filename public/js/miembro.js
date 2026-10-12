// Lo que hace falta para pintar un miembro de un equipo (nombre, tipos y sprite).
// Casi siempre es un Pokémon de la BD (pokemon_id). Las formas propias de Pokémon Añil llevan además
// anil_id, y pokemon_id es su especie en los juegos oficiales si existe (para Showdown, habilidades y movimientos).
// Si los datos de Añil no están (p. ej. en la web publicada), se ve la especie oficial o un "?".

import { pokemon, nombre, tiposEn } from './datos.js';
import { pokemonAnil, nombreAnil, urlSprite, msSprite } from './anil.js';
import { el, sprite, spriteTira } from './ui.js';

export function datosMiembro(m, gen = 9) {
  const a = m.anil_id ? pokemonAnil(m.anil_id) : null;
  const p = m.pokemon_id ? pokemon(m.pokemon_id) : null;
  if (a) {
    return { nombre: nombreAnil(a), tipos: a.tipos, p, anil: a,
      sprite: (tam, alt = '') => spriteTira(urlSprite(a, m.shiny), { tam, alt, ms: msSprite(a, m.shiny) }) };
  }
  if (p) {
    return { nombre: nombre(p) + (m.anil_id ? ' (Añil)' : ''), tipos: tiposEn(p, gen), p, anil: null,
      sprite: (tam, alt = '') => sprite(p.id, { tam, shiny: m.shiny, alt }) };
  }
  return { nombre: 'Forma de Pokémon Añil', tipos: [], p: null, anil: null,
    sprite: tam => el('span', { class: 'sprite tira vacio', style: { width: `${tam}px`, height: `${tam}px` } }, '?') };
}

/** Para añadir un Pokémon de Añil a un equipo: { pokemon_id, anil_id } (anil_id solo en las formas propias). */
export function idsDeAnil(a, anilData) {
  if (a.oficial) return { pokemon_id: a.oficial, anil_id: null };
  return { pokemon_id: anilData?.porId.get(a.base)?.oficial ?? null, anil_id: a.id };
}
