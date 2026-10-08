// Catálogo de datos (se descarga una vez) y toda la lógica de Pokémon: tipos por generación,
// tabla de eficacias, búsqueda, nombres y sprites.

import { peticion } from './api.js';

export let catalogo = null;
const porId = new Map();          // pokemon id → pokemon
const fichas = new Map();         // pokemon id → ficha (stats, habilidades, evolución, movimientos)
export const mapas = {};          // id → objeto, habilidad, naturaleza, movimiento, tipo

export const GENERACIONES = [
  [9, 'Gen 9 (Escarlata/Púrpura)'], [8, 'Gen 8 (Espada/Escudo)'], [7, 'Gen 7 (Sol/Luna)'], [6, 'Gen 6 (X/Y)'],
  [5, 'Gen 5 (Negro/Blanco)'], [4, 'Gen 4 (Diamante/Perla/Platino)'], [3, 'Gen 3 (Rubí/Zafiro/Esmeralda)'],
  [2, 'Gen 2 (Oro/Plata/Cristal)'], [1, 'Gen 1 (Rojo/Azul/Amarillo)'],
];

export const COLOR_TIPO = {   // mismos colores que la tabla de cobertura del canvas
  NORMAL: '#9a9a78', FIRE: '#e8762e', WATER: '#4f86e0', GRASS: '#5aa83c', ELECTRIC: '#c9a00f', ICE: '#4aa9ad',
  FIGHTING: '#b52f28', POISON: '#9241a0', GROUND: '#b08e3c', FLYING: '#8c7fe0', PSYCHIC: '#e8507a', BUG: '#93a51e',
  ROCK: '#a8902e', GHOST: '#6b5596', DRAGON: '#6438e8', DARK: '#6b5848', STEEL: '#8c8caa', FAIRY: '#d9759c',
};

export const STATS = ['PS', 'Ataque', 'Defensa', 'At. Esp.', 'Def. Esp.', 'Velocidad'];
export const STATS_CORTO = ['PS', 'Atq', 'Def', 'AtEsp', 'DefEsp', 'Vel'];

export async function cargarCatalogo() {
  if (catalogo) return catalogo;
  catalogo = await peticion('catalogo.php');
  for (const p of catalogo.pokemon) {
    // 'DARK:1:1:,NORMAL:2:1:' → [{tipo, slot, desde, hasta}]
    p.tiposHist = p.tipos.split(',').map(t => {
      const [tipo, slot, desde, hasta] = t.split(':');
      return { tipo, slot: +slot, desde: +desde, hasta: hasta === '' ? null : +hasta };
    });
    p.clave = normalizar(p.nombre + ' ' + (p.forma || ''));
    porId.set(p.id, p);
  }
  for (const [nombre, lista] of [['objetos', catalogo.objetos], ['habilidades', catalogo.habilidades],
    ['naturalezas', catalogo.naturalezas], ['movimientos', catalogo.movimientos], ['tipos', catalogo.tipos]]) {
    mapas[nombre] = new Map(lista.map(x => [x.id, x]));
  }
  return catalogo;
}

export const pokemon = id => porId.get(id);

/** Ficha completa de un Pokémon (se pide a la API una vez y se guarda). */
export function ficha(id) {
  // Se guarda la promesa: si se pide dos veces a la vez, solo hay una petición
  if (!fichas.has(id)) fichas.set(id, peticion(`pokemon.php?id=${id}`).catch(e => { fichas.delete(id); throw e; }));
  return fichas.get(id);
}

export function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

export function nombre(p) {
  return p.forma ? `${p.nombre} (${p.forma})` : p.nombre;
}

/* ---------- Generaciones ---------- */

/** Generación en la que aparece un Pokémon o forma (las megas en la 6, Alola en la 7…). */
export function generacionDe(p) {
  if (p.predeterminado) return p.generacion;
  const f = p.forma || '';
  if (/Paldea/.test(f)) return 9;
  if (/Galar|Hisui/.test(f)) return 8;
  if (/Alola/.test(f)) return 7;
  if (/Mega|Primigenio/.test(f)) return 6;
  return p.generacion;
}

export const existeEn = (p, gen) => generacionDe(p) <= gen;

/** Tipos que tenía el Pokémon en esa generación (Clefairy: Normal hasta la 5, Hada desde la 6). */
export function tiposEn(p, gen) {
  return p.tiposHist
    .filter(t => t.desde <= gen && (t.hasta === null || t.hasta >= gen))
    .sort((a, b) => a.slot - b.slot)
    .map(t => t.tipo);
}

/** Tabla de tipos de una generación: lista de tipos y función eficacia(atacante, defensor). */
export function tablaTipos(gen) {
  const m = {};
  const existen = new Set();
  for (const [a, d, desde, hasta, mult] of catalogo.eficacia) {
    if (desde > gen || (hasta !== null && hasta < gen)) continue;
    (m[a] ||= {})[d] = mult;
    existen.add(a); existen.add(d);
  }
  return {
    tipos: catalogo.tipos.filter(t => existen.has(t.clave)),
    eficacia: (a, d) => m[a]?.[d] ?? 1,
  };
}

/** Multiplicador de un ataque contra un Pokémon de uno o dos tipos. */
export function multiplicador(tabla, ataque, tiposDefensor) {
  return tiposDefensor.reduce((x, d) => x * tabla.eficacia(ataque, d), 1);
}

export function nombreTipo(clave) {
  return catalogo.tipos.find(t => t.clave === clave)?.nombre ?? clave;
}

/* ---------- Búsqueda ---------- */

export function buscar(texto, gen, limite = 8) {
  const q = normalizar(texto);
  if (!q) return [];
  const lista = catalogo.pokemon.filter(p => existeEn(p, gen));
  const empiezan = lista.filter(p => p.clave.startsWith(q));
  const contienen = lista.filter(p => !p.clave.startsWith(q) && p.clave.includes(q));
  return empiezan.concat(contienen).slice(0, limite);
}

/* ---------- Sprites (repositorio de PokeAPI) ---------- */

const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
export function urlsSprite(id, shiny = false) {
  return shiny
    ? [`${SPR}/other/showdown/shiny/${id}.gif`, `${SPR}/shiny/${id}.png`, `${SPR}/other/showdown/${id}.gif`]
    : [`${SPR}/other/showdown/${id}.gif`, `${SPR}/${id}.png`];
}
