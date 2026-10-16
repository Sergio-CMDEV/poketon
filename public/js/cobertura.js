// Tabla de cobertura defensiva de un equipo: qué le pega cada tipo atacante a cada miembro,
// con el total de débiles y de resistentes por tipo. Se usa en "Mis equipos" y en el editor.
// Cuenta también la habilidad de cada miembro si cambia lo que le hacen los tipos (Levitación, Absorbe agua…).

import { tablaTipos, multiplicador, mapas, nombreTipo } from './datos.js';
import { el, chip } from './ui.js';
import { datosMiembro } from './miembro.js';

const TEXTO = { 8: '×8', 4: '×4', 2: '×2', 0.5: '½', 0.25: '¼', 0.125: '⅛' };

/*
 * Habilidades que cambian lo que le hace un tipo al Pokémon (por su nombre en inglés, el de PokeAPI y Showdown).
 * desde: generación en la que la habilidad empezó a dar la inmunidad (Pararrayos y Colector antes solo atraían
 * los ataques). Solo cuenta lo que vale siempre; lo que depende del combate (Filtro, Caparazón Tera…) no.
 */
const HABILIDADES = {
  'levitate': { GROUND: 0 },                                 // Levitación
  'earth eater': { GROUND: 0 },                              // Geofagia
  'flash fire': { FIRE: 0 },                                 // Absorbe fuego
  'well-baked body': { FIRE: 0 },                            // Cuerpo horneado
  'water absorb': { WATER: 0 },                              // Absorbe agua
  'dry skin': { WATER: 0 },                                  // Piel seca
  'storm drain': { WATER: 0, desde: 5 },                     // Colector
  'volt absorb': { ELECTRIC: 0 },                            // Absorbe electricidad
  'motor drive': { ELECTRIC: 0 },                            // Electromotor
  'lightning rod': { ELECTRIC: 0, desde: 5 },                // Pararrayos
  'sap sipper': { GRASS: 0 },                                // Herbívoro
  'primordial sea': { FIRE: 0 },                             // Mar del albor: los ataques de fuego fallan
  'desolate land': { WATER: 0 },                             // Tierra del ocaso: los de agua fallan
  'thick fat': { FIRE: 0.5, ICE: 0.5 },                      // Sebo
  'heatproof': { FIRE: 0.5 },                                // Ignífugo
  'water bubble': { FIRE: 0.5 },                             // Pompa
  'purifying salt': { GHOST: 0.5 },                          // Sal purificadora
  'fluffy': { FIRE: 2 },                                     // Peluche
  'wonder guard': { soloEficaces: true },                    // Superguarda: solo le dan los supereficaces
  'mountaineer': { ROCK: 0 },                                // No oficial (CAP, fangames): inmune a los de tipo Roca
};

/** Qué cuenta de una habilidad la tabla de cobertura, en una frase ("Inmune a Tierra"), o null si no cambia nada. */
export function efectoEnCobertura(nombreEn) {
  const e = HABILIDADES[String(nombreEn ?? '').toLowerCase()];
  if (!e) return null;
  if (e.soloEficaces) return 'Solo le hacen daño los ataques supereficaces.';
  const lista = m => Object.entries(e).filter(([k, v]) => k !== 'desde' && v === m).map(([k]) => nombreTipo(k));
  const y = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0]);
  const partes = [[0, 'Inmune a los ataques de tipo'], [0.5, 'Recibe la mitad de daño de los de tipo'], [2, 'Recibe el doble de daño de los de tipo']]
    .filter(([m]) => lista(m).length).map(([m, texto]) => `${texto} ${y(lista(m))}`);
  return `${partes.join('. ')}${e.desde ? ` (desde la Gen ${e.desde})` : ''}.`;
}

/** Lo que cambia la habilidad del miembro, o null. Antes de la 3.ª generación no había habilidades. */
function efectoHabilidad(habilidadId, gen) {
  if (!habilidadId || !(gen >= 3)) return null;
  const h = mapas.habilidades?.get(habilidadId);
  const efecto = h && HABILIDADES[String(h.nombre_en ?? '').toLowerCase()];
  return efecto && gen >= (efecto.desde ?? 3) ? { nombre: h.nombre, ...efecto } : null;
}

/** Multiplicador contando la habilidad. */
function conHabilidad(m, tipo, hab) {
  if (!hab) return m;
  if (hab.soloEficaces) return m > 1 ? m : 0;
  return tipo in hab ? m * hab[tipo] : m;
}

/** miembros: titulares [{ pokemon_id, anil_id?, shiny }]. Devuelve la tabla y la frase del punto débil. */
export function tablaCobertura(miembros, gen) {
  const tabla = tablaTipos(gen);
  // Columnas en el orden de los huecos (al mover un Pokémon de sitio cambia su posición, no su lugar en la lista)
  const equipo = miembros.slice().sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0))
    .map(m => ({ ...datosMiembro(m, gen), hab: efectoHabilidad(m.habilidad_id, gen) })).filter(x => x.tipos.length);
  if (!equipo.length) return [el('p', { class: 'nota' }, 'Añade Pokémon para ver la cobertura del equipo.')];

  const rejilla = el('div', { class: 'cobertura', style: { gridTemplateColumns: `70px repeat(${equipo.length}, minmax(0, 1fr)) 44px 44px` } });
  rejilla.append(el('span', { class: 'cab esquina' }, 'ATAQUE ↓'));
  for (const x of equipo) {
    rejilla.append(el('span', { class: 'cab miembro', title: x.nombre }, x.sprite(26), el('small', {}, x.nombre)));
  }
  rejilla.append(el('span', { class: 'cab t-mal' }, 'Débil'), el('span', { class: 'cab t-bien' }, 'Resiste'));

  let peor = { n: 0, tipo: '' };
  const porHabilidad = new Set();   // miembros a los que la habilidad les cambia alguna casilla (para la nota)
  for (const t of tabla.tipos) {
    let debiles = 0, resisten = 0;
    rejilla.append(el('span', { class: 'fila-tipo' }, chip(t.clave)));
    for (const x of equipo) {
      const sinHab = multiplicador(tabla, t.clave, x.tipos);
      const m = conHabilidad(sinHab, t.clave, x.hab);
      if (m > 1) debiles++;
      if (m < 1) resisten++;
      // Si la casilla cambia por la habilidad lleva un * y, al pasar el ratón, por qué
      const cambia = m !== sinHab;
      if (cambia) porHabilidad.add(x);
      const extra = cambia ? { title: `${x.nombre}: ${TEXTO[sinHab] ?? (sinHab === 0 ? 'inmune' : 'neutro')} por tipos; con ${x.hab.nombre}, ${m === 0 ? 'inmune' : TEXTO[m] ?? 'neutro'}` } : {};
      const marca = cambia ? '*' : '';
      if (m === 0) rejilla.append(el('span', { class: 'celda inmune', ...extra }, 'Inmune' + marca));
      else rejilla.append(el('span', { class: `celda ${m >= 4 ? 'muy-mal' : m > 1 ? 'mal' : m < 1 ? 'bien' : ''}`, ...extra }, (TEXTO[m] ?? '') + marca));
    }
    rejilla.append(
      el('span', { class: `total ${debiles >= 3 ? 'mal3' : debiles === 2 ? 'mal2' : ''}` }, debiles || ''),
      el('span', { class: `total ${resisten >= 3 ? 'bien3' : resisten === 2 ? 'bien2' : ''}` }, resisten || ''),
    );
    if (debiles > peor.n) peor = { n: debiles, tipo: t.nombre };
  }

  return [
    el('div', { class: 'scroll-x' }, rejilla),
    peor.n >= 2 ? el('span', { class: 'nota', style: { padding: '0 4px', fontSize: '12px' } }, `Punto débil: ${peor.n} del equipo son débiles a ${peor.tipo}.`) : null,
    porHabilidad.size ? el('span', { class: 'nota', style: { padding: '0 4px', fontSize: '12px' } },
      `* Contando la habilidad: ${equipo.filter(x => porHabilidad.has(x)).map(x => `${x.nombre} (${x.hab.nombre})`).join(', ')}.`) : null,
  ];
}

/* ---------- Cobertura ofensiva: a qué tipos pega supereficaz cada miembro con sus movimientos ---------- */

// Movimientos cuyo efecto no es solo el de su tipo (por su nombre en inglés)
const contraTipo = (tabla, mv, tipo, habilidad) => {
  const en = String(mv.nombre_en ?? '').toLowerCase();
  let m = tabla.eficacia(mv.tipo, tipo);
  if (en === 'flying press') m *= tabla.eficacia('FLYING', tipo);          // Plancha Voladora: Lucha y Volador a la vez
  if (en === 'freeze-dry' && tipo === 'WATER') m = 2;                      // Liofilización: supereficaz contra Agua
  if (en === 'thousand arrows' && tipo === 'FLYING') m = 1;                // Mil Flechas: también da a los voladores
  // Intrépido y Ojo Mental: los ataques Normal y Lucha dan a los Fantasma
  if (m === 0 && tipo === 'GHOST' && ['NORMAL', 'FIGHTING'].includes(mv.tipo) && ['scrappy', "mind's eye"].includes(habilidad)) m = 1;
  return m;
};

/** miembros: titulares con sus movimientos. Solo cuentan los de ataque (los de estado no hacen daño). */
export function tablaCoberturaOfensiva(miembros, gen) {
  const tabla = tablaTipos(gen);
  const equipo = miembros.slice().sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0)).map(m => ({
    ...datosMiembro(m, gen),
    movs: (m.movimientos ?? []).map(id => mapas.movimientos.get(id)).filter(mv => mv && mv.categoria !== 'estado'),
    habilidad: gen >= 3 ? String(mapas.habilidades?.get(m.habilidad_id)?.nombre_en ?? '').toLowerCase() : '',
  })).filter(x => x.tipos.length);
  if (!equipo.length) return [el('p', { class: 'nota' }, 'Añade Pokémon para ver la cobertura del equipo.')];
  if (!equipo.some(x => x.movs.length)) return [el('p', { class: 'nota' }, 'Ponles movimientos de ataque para ver a qué tipos pega fuerte el equipo.')];

  const rejilla = el('div', { class: 'cobertura', style: { gridTemplateColumns: `70px repeat(${equipo.length}, minmax(0, 1fr)) 52px` } });
  rejilla.append(el('span', { class: 'cab esquina' }, 'DEFENSA ↓'));
  for (const x of equipo) rejilla.append(el('span', { class: 'cab miembro', title: x.nombre }, x.sprite(26), el('small', {}, x.nombre)));
  rejilla.append(el('span', { class: 'cab t-bien' }, 'Eficaz'));

  const sinCobertura = [];
  for (const t of tabla.tipos) {
    let eficaces = 0;
    rejilla.append(el('span', { class: 'fila-tipo' }, chip(t.clave)));
    for (const x of equipo) {
      if (!x.movs.length) { rejilla.append(el('span', { class: 'celda tenue', title: `${x.nombre} no tiene movimientos de ataque` }, '—')); continue; }
      // El mejor de sus movimientos contra ese tipo
      let mejor = null;
      for (const mv of x.movs) {
        const m = contraTipo(tabla, mv, t.clave, x.habilidad);
        if (!mejor || m > mejor.m) mejor = { m, mv };
      }
      if (mejor.m > 1) eficaces++;
      const titulo = `${x.nombre}: ${mejor.mv.nombre} (${mejor.m === 0 ? 'no le afecta' : TEXTO[mejor.m] ?? 'neutro'})`;
      if (mejor.m === 0) rejilla.append(el('span', { class: 'celda inmune', title: titulo }, 'Nada'));
      else rejilla.append(el('span', { class: `celda ${mejor.m > 1 ? 'bien' : mejor.m < 1 ? 'mal' : ''}`, title: titulo }, TEXTO[mejor.m] ?? ''));
    }
    if (!eficaces) sinCobertura.push(t.nombre);
    rejilla.append(el('span', { class: `total ${eficaces >= 3 ? 'bien3' : eficaces === 2 ? 'bien2' : eficaces === 0 ? 'mal2' : ''}` }, String(eficaces)));
  }

  const sinMovs = equipo.filter(x => !x.movs.length).map(x => x.nombre);
  const nota = texto => el('span', { class: 'nota', style: { padding: '0 4px', fontSize: '12px' } }, texto);
  return [
    el('div', { class: 'scroll-x' }, rejilla),
    sinCobertura.length ? nota(`Ningún movimiento del equipo es supereficaz contra: ${sinCobertura.join(', ')}.`) : nota('Todos los tipos tienen algún movimiento supereficaz.'),
    sinMovs.length > 0 && nota(`Sin movimientos de ataque: ${sinMovs.join(', ')}.`),
    nota('Cada casilla es el mejor movimiento de ese Pokémon contra ese tipo (pasa el ratón para verlo).'),
  ];
}

/* ---------- Defensiva u ofensiva (se recuerda la elección) ---------- */

const CLAVE_MODO = 'cobertura-modo';
export function modoCobertura() {
  try { return localStorage.getItem(CLAVE_MODO) === 'ofensiva' ? 'ofensiva' : 'defensiva'; } catch { return 'defensiva'; }
}

/** Botones "Defensiva | Ofensiva" para la cabecera de la tarjeta. */
export function selectorCobertura(alCambiar) {
  const actual = modoCobertura();
  const boton = (modo, texto) => el('button', { type: 'button', class: modo === actual ? 'on' : '', 'aria-pressed': String(modo === actual),
    onclick: () => { try { localStorage.setItem(CLAVE_MODO, modo); } catch { /* solo esta vez */ } alCambiar(modo); } }, texto);
  return el('div', { class: 'modo-cob', role: 'group', 'aria-label': 'Cobertura' }, boton('defensiva', 'Defensiva'), boton('ofensiva', 'Ofensiva'));
}

/** La tabla del modo elegido. */
export const tablaSegunModo = (miembros, gen) => (modoCobertura() === 'ofensiva' ? tablaCoberturaOfensiva : tablaCobertura)(miembros, gen);
