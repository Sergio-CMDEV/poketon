// Pokémon Añil (fangame). Sus datos los genera scripts/anil.mjs en public/anil/, que no se sube a GitHub
// (se copian a mano al servidor). Si no existen, la opción "Pokémon Añil" no aparece y la app funciona igual.

import { catalogo, normalizar } from './datos.js';
import { usarIconosLocales } from './ui.js';
import { API, WEB, esEscritorio } from './api.js';

export let anil = null;   // { tipos, pokemon, habilidades, cadenas, objetos, porId, porOficial, objetoPorId }

export async function cargarAnil() {
  try {
    // En la app de escritorio, del servidor (api/anil.php, con CORS); en la web, el archivo tal cual
    const r = await fetch(esEscritorio ? `${API}/anil.php` : 'anil/datos.json');
    if (!r.ok) return;
    anil = await r.json();
  } catch { return; }
  anil.porId = new Map(anil.pokemon.map(p => [p.id, p]));
  usarIconosLocales(anil.iconosObjeto ?? []);
  for (const p of anil.pokemon) {
    p.clave = normalizar(p.nombre + ' ' + (p.forma || ''));
    p.oficial = oficial(p);   // id del mismo Pokémon en la BD (para equipos y sets), o null
  }
  // Del Pokémon de la BD a su versión en Añil (para el super shiny en los equipos). Si hay varias, la que no es forma.
  anil.porOficial = new Map();
  for (const p of anil.pokemon) if (p.oficial && (!anil.porOficial.has(p.oficial) || !p.forma)) anil.porOficial.set(p.oficial, p);
  // Objetos: el mismo objeto de los juegos oficiales (por su nombre en español), si existe.
  // Sirve para saber su categoría, los sets de Smogon que lo usan y para poder equiparlo en un equipo.
  anil.objetos ??= [];
  const oficiales = new Map(catalogo.objetos.map(o => [normalizar(o.nombre), o]));
  for (const o of anil.objetos) {
    o.anil = true;
    o.clave = normalizar(o.nombre);
    o.oficial = oficiales.get(o.clave) ?? null;
    o.categoria ??= o.oficial?.categoria ?? 'Otros';
  }
  anil.objetoPorId = new Map(anil.objetos.map(o => [o.id, o]));
}

export const objetoAnil = id => anil?.objetoPorId?.get(id) ?? null;

/** Pokémon de Añil que evolucionan con ese objeto y los que megaevolucionan con él. */
export function usosObjetoAnil(o) {
  const evoluciones = [];
  for (const filas of Object.values(anil.cadenas)) for (const [id, , desde, metodos] of filas) {
    const m = metodos.find(x => x[2] === o.id);
    if (m && desde) evoluciones.push({ de: anil.porId.get(desde), a: anil.porId.get(id), detalle: m[1] });
  }
  const megas = anil.pokemon.filter(p => p.piedra === o.id);
  return { evoluciones: evoluciones.filter(e => e.de && e.a), megas };
}

/** ¿Está elegido "Pokémon Añil" en el selector de juego? */
export const enAnil = () => !!anil && localStorage.getItem('gen') === 'anil';

export const pokemonAnil = id => anil?.porId.get(id) ?? null;

/** El mismo Pokémon de la BD en Añil (null si no está o no hay datos de Añil). */
export const anilDeOficial = id => anil?.porOficial?.get(id) ?? null;

export const nombreAnil = p => (p.forma ? `${p.nombre} (${p.forma})` : p.nombre);

/** Milisegundos por fotograma de la animación, como en el juego (AnimationSpeed de pokemon_metrics.txt). */
export const msSprite = (p, shiny) => (shiny && p.shiny ? p.msShiny : p.ms) ?? 60;

export const urlSprite = (p, shiny) => {
  const archivo = (shiny && p.shiny) || p.sprite;
  return archivo ? `${WEB}anil/${shiny && p.shiny ? 'shiny' : 'sprites'}/${encodeURIComponent(archivo)}` : null;
};

/** Busca el mismo Pokémon en la BD: por nombre, y para las formas por región o mega. */
function oficial(p) {
  const especie = catalogo.pokemon.find(x => x.predeterminado && normalizar(x.nombre) === normalizar(p.nombre));
  if (!especie) return null;
  if (!p.forma) return especie.id;
  const formas = catalogo.pokemon.filter(x => x.especie_id === especie.especie_id && x.forma);
  const busca = p.region ? normalizar(p.region)
    : p.mega === 'MEGA' ? 'mega' : p.mega ? `mega${p.mega.toLowerCase()}` : null;
  if (!busca) return null;
  return formas.find(x => normalizar(x.forma) === busca)?.id
      ?? formas.find(x => normalizar(x.forma).includes(busca))?.id ?? null;
}

/** Tabla de tipos de Añil, con la misma forma que tablaTipos(gen) de datos.js. */
export function tablaAnil() {
  return {
    tipos: Object.entries(anil.tipos).map(([clave, t]) => ({ clave, nombre: t.nombre })),
    eficacia(atacante, defensor) {
      const d = anil.tipos[defensor];
      if (!d) return 1;
      if (d.inmune.includes(atacante)) return 0;
      if (d.debil.includes(atacante)) return 2;
      if (d.resiste.includes(atacante)) return 0.5;
      return 1;
    },
  };
}

export function buscarAnil(texto, limite = 8) {
  const q = normalizar(texto);
  if (!q) return [];
  const empiezan = anil.pokemon.filter(p => p.clave.startsWith(q));
  const contienen = anil.pokemon.filter(p => !p.clave.startsWith(q) && p.clave.includes(q));
  return empiezan.concat(contienen).slice(0, limite);
}

/** Habilidades con nombre y descripción, como las de la API. */
export const habilidadesAnil = p => p.habilidades.map(([id, oculta]) => {
  const [nombre, descripcion] = anil.habilidades[id] ?? [id, ''];
  return { nombre, descripcion, oculta: !!oculta, href: anil.habilidades[id] ? `#/habilidades/anil/${id}` : null };
});

/** Cadena evolutiva: [{ p, nivel, metodos: [{metodo, detalle, icono}] }] en orden. */
export function cadenaAnil(p) {
  const filas = anil.cadenas[p.cadena] ?? [];
  const nivel = id => { let n = 0, actual = filas.find(f => f[0] === id); while (actual?.[2] && n < 5) { n++; actual = filas.find(f => f[0] === actual[2]); } return n; };
  return filas
    .map(([id, , , metodos]) => ({
      p: anil.porId.get(id),
      nivel: nivel(id),
      metodos: metodos.map(([metodo, detalle, objeto]) => ({ metodo, detalle, icono: objeto ? `${WEB}anil/objetos/${objeto}.png` : null, objeto: detalle, idAnil: objeto ?? null })),
    }))
    .filter(n => n.p)
    .sort((a, b) => a.nivel - b.nivel);
}
