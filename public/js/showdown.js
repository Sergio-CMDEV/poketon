// Importar y exportar equipos en el formato de texto de Pokémon Showdown:
//
//   Pikachu @ Light Ball
//   Ability: Static
//   Tera Type: Electric
//   EVs: 252 SpA / 4 SpD / 252 Spe
//   Timid Nature
//   - Thunderbolt
//   - Volt Switch
//
// Al importar también vale en español con los nombres oficiales de los juegos:
//   Pikachu @ Bola Luminosa / Habilidad: Elec. Estática / Tipo Tera: Eléctrico
//   EVs: 252 Ataque Especial / 4 Defensa Especial / 252 Velocidad / Naturaleza: Miedosa / - Rayo

import { catalogo, mapas, normalizar, pokemon, ficha } from './datos.js';
import { EQUIVALENCIAS } from './equivalencias.js';
import { pokemonAnil } from './anil.js';

const STAT_TXT = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
// Nombres de cada stat en inglés y en español (ya normalizados: sin tildes, espacios ni puntos)
const STAT = {
  hp: 0, ps: 0, atk: 1, ataque: 1, atq: 1, def: 2, defensa: 2,
  spa: 3, ataqueespecial: 3, atesp: 3, ataqueesp: 3, ate: 3, spd: 4, defensaespecial: 4, defesp: 4, defensaesp: 4, dfe: 4,
  spe: 5, velocidad: 5, vel: 5,
};

// Movimientos: "- Rayo", y también con *, • o similares
const VIÑETA = /^[-–—•*·~+]/;
// Líneas de datos ("Clave: valor") que se leen o se ignoran sin avisar
const DATO = /^(ability|habilidad|level|nivel|shiny|tera type|tipo tera|teratipo|evs|ivs|naturaleza|happiness|felicidad|amistad|gigantamax|dynamax level|pokeball|hidden power):/i;

/** Índice nombre (inglés y español, normalizados) → elemento, para buscar rápido. */
function indice(lista) {
  const m = new Map();
  for (const x of lista) for (const n of [x.nombre_en, x.nombre]) if (n && !m.has(normalizar(n))) m.set(normalizar(n), x);
  return m;
}

// Equivalencias de nombres no oficiales, ya normalizadas: tipo → Map(nombre no oficial → nombre en inglés)
let equivalencias = null;
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los']);

/** Nombre no oficial → el oficial, sin preguntar: primero la tabla de equivalencias y luego variantes sencillas
 *  ("Rayo de Hielo" → Rayo Hielo, "Danza Espadas" → Danza Espada, "Osado" → Osada, "Baya Sitrus" → Sitrus Berry). */
function equivalente(tipo, nombre, idx) {
  equivalencias ??= Object.fromEntries(Object.entries(EQUIVALENCIAS).map(([t, tabla]) =>
    [t, new Map(Object.entries(tabla).map(([k, v]) => [normalizar(k), v]))]));
  const buscar = texto => {
    const k = normalizar(texto);
    const en = equivalencias[tipo]?.get(k);
    return idx.get(k) ?? (en && idx.get(normalizar(en))) ?? null;
  };
  const palabras = nombre.trim().split(/\s+/);
  const sinVacias = palabras.filter(w => !PALABRAS_VACIAS.has(w.toLowerCase()));
  const singular = ws => ws.map(w => (w.length > 3 && /s$/i.test(w) ? w.slice(0, -1) : w));
  const candidatos = [nombre, sinVacias.join(' '), singular(palabras).join(' '), singular(sinVacias).join(' ')];
  if (tipo === 'naturaleza') candidatos.push(nombre.replace(/o$/i, 'a'));
  if (tipo === 'objeto') { const b = nombre.match(/^baya\s+(.+)$/i); if (b) candidatos.push(`${b[1]} Berry`); }
  for (const c of candidatos) { const x = buscar(c); if (x) return x; }
  return null;
}

/** Si no existe, el nombre más parecido (para sugerirlo en el aviso). Compara pares de letras. */
function parecido(texto, lista, minimo = 0.5) {
  const pares = s => { const n = normalizar(s); return new Set([...n].slice(1).map((c, i) => n[i] + c)); };
  const a = pares(texto);
  let mejor = null, nota = 0;
  for (const x of lista) for (const nombre of [x.nombre, x.nombre_en]) {
    if (!nombre) continue;
    const b = pares(nombre);
    let comunes = 0;
    for (const p of a) if (b.has(p)) comunes++;
    const n = (2 * comunes) / (a.size + b.size || 1);
    if (n > nota) { nota = n; mejor = x; }
  }
  return nota >= minimo ? mejor : null;
}

/* ---------- Nombres de las formas en Showdown ----------
   PokeAPI y Showdown no llaman igual a algunas formas ("indeedee-female" → "Indeedee-F",
   "ogerpon-wellspring-mask" → "Ogerpon-Wellspring", "tauros-paldea-combat-breed" → "Tauros-Paldea-Combat").
   Se usa el nombre de la especie en inglés ("Mr. Mime") + la forma, con unas reglas y unas pocas excepciones. */

const FORMAS_SHOWDOWN = {
  'nidoran-f': 'Nidoran-F', 'nidoran-m': 'Nidoran-M',
  'maushold-family-of-four': 'Maushold-Four', 'maushold-family-of-three': 'Maushold',
  'necrozma-dusk': 'Necrozma-Dusk-Mane', 'necrozma-dawn': 'Necrozma-Dawn-Wings',
  'zygarde-10': 'Zygarde-10%', 'zygarde-10-power-construct': 'Zygarde-10%', 'zygarde-50-power-construct': 'Zygarde',
  'greninja-battle-bond': 'Greninja-Bond', 'pikachu-phd': 'Pikachu-PhD', 'minior-red-meteor': 'Minior',
  'darmanitan-galar-standard': 'Darmanitan-Galar', 'urshifu-single-strike-gmax': 'Urshifu-Gmax', 'toxtricity-amped-gmax': 'Toxtricity-Gmax',
};

const slug = n => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['’.:]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mayus = parte => parte.split('-').map(w => w && w[0].toUpperCase() + w.slice(1)).join('-');

/** Nombre de un Pokémon (o forma) tal como lo escribe Showdown. */
export function nombreShowdown(p) {
  if (FORMAS_SHOWDOWN[p.identificador]) return FORMAS_SHOWDOWN[p.identificador];
  if (p.predeterminado) return p.nombre_en;
  const base = slug(p.nombre_en);
  if (!p.identificador.startsWith(`${base}-`)) return mayus(p.identificador);
  const forma = p.identificador.slice(base.length + 1)
    .replace(/-mask(-tera)?$/, (_, t) => (t ? '-tera' : ''))   // Ogerpon
    .replace(/-(breed|plumage|cap)$/, '')                        // Tauros de Paldea, Squawkabilly, gorras de Pikachu
    .replace(/^female$/, 'f');                                   // Indeedee-F, Meowstic-F, Basculegion-F, Oinkologne-F
  return `${p.nombre_en}-${mayus(forma)}`;
}

let porNombreShowdown = null;
function buscarPokemon(texto) {
  const k = normalizar(texto);
  if (!porNombreShowdown) {
    porNombreShowdown = new Map();
    for (const p of catalogo.pokemon) { const n = normalizar(nombreShowdown(p)); if (!porNombreShowdown.has(n)) porNombreShowdown.set(n, p); }
  }
  return porNombreShowdown.get(k)
      ?? catalogo.pokemon.find(p => normalizar(p.identificador) === k)
      ?? catalogo.pokemon.find(p => p.predeterminado && (normalizar(p.nombre_en) === k || normalizar(p.nombre) === k))
      ?? catalogo.pokemon.find(p => p.clave === k)
      ?? null;
}

/**
 * Texto → { miembros, avisos, sugerencias, cambiados }. Los avisos dicen qué no se reconoció y qué se parece.
 * Con usarSugerencias, lo que no existe se cambia por lo más parecido (y se avisa del cambio).
 * Es async porque, para sugerir movimientos, mira primero los que puede aprender cada Pokémon.
 */
export async function importar(texto, { usarSugerencias = false } = {}) {
  const idx = { objeto: indice(catalogo.objetos), habilidad: indice(catalogo.habilidades), movimiento: indice(catalogo.movimientos),
    naturaleza: indice(catalogo.naturalezas) };
  const listas = { objeto: catalogo.objetos, habilidad: catalogo.habilidades, movimiento: catalogo.movimientos, naturaleza: catalogo.naturalezas };
  const miembros = [];
  const avisos = [];
  let sugerencias = 0;
  let cambiados = 0;   // nombres no oficiales cambiados por el oficial
  // Un Pokémon por bloque (separados por líneas en blanco). Si un bloque empieza por un movimiento o un dato
  // ("* Flip Turn", "EVs: …", "Quiet Nature"), es la continuación del anterior: hay quien deja una línea en blanco
  // antes de los movimientos. Las cabeceras de las copias de Showdown ("=== [gen9ou] Equipo ===") se ignoran.
  const bloques = [];
  for (const b of texto.replace(/\r/g, '').replace(/^===.*===\s*$/gm, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)) {
    const primera = b.split('\n')[0].trim();
    if (bloques.length && (VIÑETA.test(primera) || DATO.test(primera) || /\snature$/i.test(primera))) bloques[bloques.length - 1] += '\n' + b;
    else bloques.push(b);
  }

  for (const bloque of bloques) {
    if (miembros.length >= 8) { avisos.push('Solo se importan 8 Pokémon (6 titulares + 2 reservas).'); break; }
    const [primera, ...resto] = bloque.split('\n').map(l => l.trim()).filter(Boolean);

    // "Apodo (Especie) (M) @ Objeto", "Especie @ Objeto" o "Especie@Objeto"
    const arroba = primera.indexOf('@');
    let izq = (arroba >= 0 ? primera.slice(0, arroba) : primera).trim();
    const objeto = arroba >= 0 ? primera.slice(arroba + 1).trim() : '';
    izq = izq.replace(/\s*\((M|F)\)\s*$/, '');
    let apodo = null, especie = izq;
    const conApodo = izq.match(/^(.*)\s+\(([^)]+)\)$/);
    if (conApodo) { apodo = conApodo[1]; especie = conApodo[2]; }

    const p = buscarPokemon(especie);
    if (!p) { avisos.push(`No reconozco el Pokémon «${especie}».`); continue; }

    const m = nuevoMiembro(p.id, miembros.length + 1);
    m.apodo = apodo;
    const quien = p.nombre;
    // Movimientos que puede aprender: las sugerencias de movimientos se buscan primero entre ellos
    let aprendibles = [];
    try { aprendibles = (await ficha(p.id)).movimientos.map(x => mapas.movimientos.get(x.id)).filter(Boolean); } catch { /* sin ficha: se busca en todos */ }
    /** Busca un nombre en una lista; si no está, avisa con lo más parecido (o lo usa, si se ha pedido). */
    const leer = (tipo, nombre, etiqueta) => {
      const x = idx[tipo].get(normalizar(nombre));
      if (x) return x.id;
      const eq = equivalente(tipo, nombre, idx[tipo]);
      if (eq) { cambiados++; return eq.id; }
      const sug = (tipo === 'movimiento' && parecido(nombre, aprendibles, 0.4)) || parecido(nombre, listas[tipo]);
      if (sug) sugerencias++;
      if (sug && usarSugerencias) { avisos.push(`${quien}: «${nombre}» → ${sug.nombre}.`); return sug.id; }
      avisos.push(`${quien}: ${etiqueta} «${nombre}» no existe${sug ? ` (¿quizá ${sug.nombre}?)` : ''}.`);
      return null;
    };
    if (objeto) m.objeto_id = leer('objeto', objeto, 'objeto');

    for (const linea of resto) {
      let x;
      if ((x = linea.match(/^(?:ability|habilidad):\s*(.+)$/i))) m.habilidad_id = leer('habilidad', x[1], 'habilidad');
      else if ((x = linea.match(/^(?:level|nivel):\s*(\d+)/i))) m.nivel = Math.min(100, Math.max(1, +x[1]));
      else if (/^shiny:\s*(yes|s[ií])/i.test(linea)) m.shiny = true;
      else if ((x = linea.match(/^(?:tera type|tipo tera|teratipo):\s*(.+)$/i))) {
        const k = { oscuro: 'dark', pelea: 'fighting', insecto: 'bug', hierba: 'grass', electrico: 'electric' }[normalizar(x[1])] ?? normalizar(x[1]);
        const t = catalogo.tipos.find(t => normalizar(t.clave) === k || normalizar(t.nombre) === k);
        if (t) m.teratipo_id = t.id; else avisos.push(`${quien}: teratipo «${x[1]}» no existe.`);
      } else if ((x = linea.match(/^(EVs|IVs):\s*(.+)$/i))) {
        const destino = x[1].toUpperCase() === 'EVS' ? m.evs : m.ivs;
        for (const parte of x[2].split('/')) {
          const [, num, stat] = parte.trim().match(/^(\d+)\s*(.+)$/) || [];
          const i = stat === undefined ? undefined : STAT[normalizar(stat)];
          if (i !== undefined) destino[i] = Math.min(x[1].toUpperCase() === 'EVS' ? 252 : 31, +num);
          else if (parte.trim()) avisos.push(`${quien}: no entiendo «${parte.trim()}» en los ${x[1]}.`);
        }
      } else if ((x = linea.match(/^(.+?)\s+nature$/i)) || (x = linea.match(/^naturaleza:?\s*(.+)$/i))) {
        m.naturaleza_id = leer('naturaleza', x[1], 'naturaleza');
      } else if (VIÑETA.test(linea) && (x = linea.match(/^.\s*(.+)$/))) {
        const nombreMov = x[1].split(' / ')[0].trim().replace(/^Hidden Power.*/i, 'Hidden Power').replace(/^Poder Oculto.*/i, 'Poder Oculto');
        const id = leer('movimiento', nombreMov, 'movimiento');
        if (id && m.movimientos.length < 4) m.movimientos.push(id);
      } else if (!DATO.test(linea)) {
        avisos.push(`${quien}: no entiendo la línea «${linea}».`);
      }
    }
    // Comprobar que la suma de EVs no pasa de 510
    if (m.evs.reduce((a, b) => a + b, 0) > 510) avisos.push(`${quien}: los EVs suman más de 510.`);
    miembros.push(m);
  }
  return { miembros, avisos, sugerencias: usarSugerencias ? 0 : sugerencias, cambiados };
}

/** Equipo → texto de Showdown (en inglés). */
export function exportar(equipo) {
  return equipo.miembros.slice().sort((a, b) => a.posicion - b.posicion).map(m => {
    const p = pokemon(m.pokemon_id);
    // Formas propias de Pokémon Añil: Showdown no las conoce; se exporta su especie oficial o, si no tiene, su nombre
    const especie = p ? nombreShowdown(p) : (pokemonAnil(m.anil_id)?.nombre ?? m.anil_id ?? 'Unknown');
    const lineas = [];
    const objeto = mapas.objetos.get(m.objeto_id);
    lineas.push((m.apodo ? `${m.apodo} (${especie})` : especie) + (objeto ? ` @ ${objeto.nombre_en}` : ''));
    const hab = mapas.habilidades.get(m.habilidad_id);
    if (hab) lineas.push(`Ability: ${hab.nombre_en}`);
    if (m.nivel && m.nivel !== 100) lineas.push(`Level: ${m.nivel}`);
    if (m.shiny) lineas.push('Shiny: Yes');
    const tera = mapas.tipos.get(m.teratipo_id);
    if (tera) lineas.push(`Tera Type: ${tera.clave[0]}${tera.clave.slice(1).toLowerCase()}`);
    const evs = m.evs.map((v, i) => (v ? `${v} ${STAT_TXT[i]}` : '')).filter(Boolean);
    if (evs.length) lineas.push(`EVs: ${evs.join(' / ')}`);
    const nat = mapas.naturalezas.get(m.naturaleza_id);
    if (nat) lineas.push(`${nat.nombre_en} Nature`);
    const ivs = m.ivs.map((v, i) => (v !== 31 ? `${v} ${STAT_TXT[i]}` : '')).filter(Boolean);
    if (ivs.length) lineas.push(`IVs: ${ivs.join(' / ')}`);
    for (const id of m.movimientos) { const mv = mapas.movimientos.get(id); if (mv) lineas.push(`- ${mv.nombre_en}`); }
    return lineas.join('\n');
  }).join('\n\n');
}

/** Miembro nuevo. pokemon: id de la BD o { pokemon_id, anil_id } (formas propias de Pokémon Añil). */
export function nuevoMiembro(pokemon, posicion) {
  const { pokemon_id, anil_id = null, shiny = 0 } = typeof pokemon === 'object' && pokemon ? pokemon : { pokemon_id: pokemon };
  return {
    posicion, pokemon_id, anil_id, apodo: null, objeto_id: null, habilidad_id: null, naturaleza_id: null,
    teratipo_id: null, nivel: 100, shiny, evs: [0, 0, 0, 0, 0, 0], ivs: [31, 31, 31, 31, 31, 31], movimientos: [],
  };
}
