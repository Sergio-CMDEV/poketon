// Lo que hace falta para pintar un miembro de un equipo (nombre, tipos y sprite).
// Casi siempre es un Pokémon de la BD (pokemon_id). Las formas propias de Pokémon Añil llevan además
// anil_id, y pokemon_id es su especie en los juegos oficiales si existe (para Showdown, habilidades y movimientos).
// Si los datos de Añil no están (p. ej. en la web publicada), se ve la especie oficial o un "?".
// shiny: 0 normal, 1 shiny, 2 super shiny (solo Añil: el sprite shiny del juego con el tono girado).

import { pokemon, nombre, tiposEn } from './datos.js';
import { pokemonAnil, anilDeOficial, nombreAnil, urlSprite, msSprite } from './anil.js';
import { el, sprite, spriteTira } from './ui.js';

/** 0 normal, 1 shiny, 2 super shiny (los equipos antiguos guardan true/false). */
export const variante = m => (m.shiny === 2 ? 2 : m.shiny ? 1 : 0);

/** El Pokémon de Añil con el que se pinta el super shiny: su forma propia o su especie oficial en Añil. */
export function anilDelMiembro(m) {
  if (m.anil_id) return pokemonAnil(m.anil_id);
  return m.pokemon_id ? anilDeOficial(m.pokemon_id) : null;
}

/** ¿Tiene super shiny? Hace falta su sprite shiny en Añil y el tono (lo calcula scripts/anil.mjs). */
export function puedeSuperShiny(m) {
  const a = anilDelMiembro(m);
  return !!(a?.shiny && a.superShiny != null);
}

const spriteAnil = (a, v, tam, alt) =>
  spriteTira(urlSprite(a, v > 0), { tam, alt, ms: msSprite(a, v > 0), tono: v === 2 ? a.superShiny ?? 0 : 0 });

export function datosMiembro(m, gen = 9) {
  const a = m.anil_id ? pokemonAnil(m.anil_id) : null;
  const p = m.pokemon_id ? pokemon(m.pokemon_id) : null;
  const v = variante(m);
  if (a) {
    return { nombre: nombreAnil(a), tipos: a.tipos, p, anil: a, sprite: (tam, alt = '') => spriteAnil(a, v, tam, alt) };
  }
  if (p) {
    // Super shiny de una especie oficial: se ve con el sprite de Añil; sin datos de Añil, como shiny normal
    const sup = v === 2 && puedeSuperShiny(m) ? anilDeOficial(p.id) : null;
    return { nombre: nombre(p) + (m.anil_id ? ' (Añil)' : ''), tipos: tiposEn(p, gen), p, anil: null,
      sprite: (tam, alt = '') => (sup ? spriteAnil(sup, 2, tam, alt) : sprite(p.id, { tam, shiny: v > 0, alt })) };
  }
  return { nombre: 'Forma de Pokémon Añil', tipos: [], p: null, anil: null,
    sprite: tam => el('span', { class: 'sprite tira vacio', style: { width: `${tam}px`, height: `${tam}px` } }, '?') };
}

/** Para añadir un Pokémon de Añil a un equipo: { pokemon_id, anil_id } (anil_id solo en las formas propias). */
export function idsDeAnil(a, anilData) {
  if (a.oficial) return { pokemon_id: a.oficial, anil_id: null };
  return { pokemon_id: anilData?.porId.get(a.base)?.oficial ?? null, anil_id: a.id };
}
