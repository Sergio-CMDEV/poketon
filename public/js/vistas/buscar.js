// Pantalla 1 · Buscar y ficha: juego, buscador, ficha del Pokémon, formas y pestañas
// Tipos / Stats / Evolución / Sets. Funciona con los juegos oficiales (BD) y con Pokémon Añil (si están sus datos).

import {
  buscar, pokemon, nombre, tiposEn, tablaTipos, multiplicador, ficha, existeEn, generacionDe,
  catalogo, mapas, nombreTipo, GENERACIONES, STATS, STATS_CORTO,
} from '../datos.js';
import {
  anil, enAnil, pokemonAnil, nombreAnil, urlSprite, msSprite, objetoAnil, tablaAnil, buscarAnil, habilidadesAnil, cadenaAnil,
} from '../anil.js';
import { el, chip, sprite, spriteTira, aviso, poner, campo, selectorGen, iconoObjeto, iconoImagen, botonMenu } from '../ui.js';
import { sesion } from '../api.js';
import { genActual, añadirAlBorrador, borrador, misEquipos, añadirAEquipo, crearEquipoCon } from '../equipos.js';
import { datosMiembro, idsDeAnil } from '../miembro.js';

const estado = { tab: 'tipos', shiny: false };

/** id: Pokémon de la BD (#/pokemon/26) · idAnil: Pokémon de Añil (#/anil/RAICHU_1) */
export function vistaBuscar(raiz, id = null, idAnil = null) {
  if (idAnil && anil) localStorage.setItem('gen', 'anil');      // un enlace de Añil cambia el juego
  if (idAnil && !anil) {
    poner(raiz, el('p', { class: 'msg info' }, 'Los datos de Pokémon Añil no están instalados. Ejecuta scripts/anil.mjs.'));
    return;
  }
  if (enAnil() && id) {                                           // venía de un Pokémon oficial: su equivalente en Añil
    const a = anil.pokemon.find(x => x.oficial === id);
    location.replace(a ? `#/anil/${a.id}` : '#/');
    return;
  }

  const gen = genActual();
  const juegoElegido = enAnil() ? 'anil' : gen;
  const opciones = anil ? [['anil', 'Pokémon Añil'], ...GENERACIONES] : GENERACIONES;
  const ir = destino => { if (location.hash === destino) vistaBuscar(raiz, id, idAnil); else location.hash = destino; };
  const juego = selectorGen(juegoElegido, opciones, g => {
    localStorage.setItem('gen', g);
    if (g === 'anil') {
      const a = id && anil.pokemon.find(x => x.oficial === id);
      ir(a ? `#/anil/${a.id}` : '#/');
    } else if (idAnil) {
      const o = pokemonAnil(idAnil)?.oficial;
      ir(o ? `#/pokemon/${o}` : '#/');
    } else ir(location.hash || '#/');
  });

  const zonaFicha = el('div', { style: { display: 'contents' } });
  let entrada;

  if (enAnil()) {
    const p = pokemonAnil(idAnil) ?? pokemonAnil('GYARADOS') ?? anil.pokemon[0];
    entrada = buscador(idAnil ? nombreAnil(p) : '', texto => buscarAnil(texto).map(x => ({
      href: `#/anil/${x.id}`, nombre: nombreAnil(x), tipos: x.tipos, sprite: spriteTira(urlSprite(x), { tam: 32, ms: msSprite(x) }), rareza: rarezaAnil(x),
    })));
    pintarFicha(zonaFicha, datosAnil(p));
  } else {
    const p = pokemon(id) ?? pokemon(130);   // sin elegir nada se muestra Gyarados
    entrada = buscador(id && p ? nombre(p) : '', texto => buscar(texto, gen).map(x => ({
      href: `#/pokemon/${x.id}`, nombre: nombre(x), tipos: tiposEn(x, gen), sprite: sprite(x.id, { tam: 32 }), rareza: x.rareza,
    })));
    if (existeEn(p, gen)) pintarFicha(zonaFicha, datosOficial(p, gen));
    else poner(zonaFicha, el('p', { class: 'msg info' }, `${nombre(p)} no existe en este juego (aparece en la Gen ${generacionDe(p)}).`));
  }

  poner(raiz, campo('Juego', juego), entrada.campo, zonaFicha);
  if (!id && !idAnil) entrada.input.focus();
}

/** Buscador con sugerencias (flechas, Enter y Escape). resultados(texto) → [{href, nombre, tipos, sprite}] */
function buscador(valor, resultados) {
  const input = el('input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'Escribe un nombre…', value: valor });
  const sug = el('ul', { class: 'sug', role: 'listbox', hidden: true });
  let res = [], activo = 0;
  const ir = x => { sug.hidden = true; location.hash = x.href; };
  const pintar = () => {
    poner(sug, res.map((x, i) => el('li', { role: 'option', class: i === activo ? 'on' : '', onmousedown: e => { e.preventDefault(); ir(x); } },
      x.sprite, el('span', {}, x.nombre, x.rareza && etiquetaRareza(x.rareza, true)), el('span', { class: 'chips' }, x.tipos.map(chip)))));
    sug.hidden = !res.length;
  };
  input.addEventListener('input', () => { res = resultados(input.value); activo = 0; pintar(); });
  input.addEventListener('keydown', e => {
    if (sug.hidden || !res.length) return;
    if (e.key === 'ArrowDown') { activo = (activo + 1) % res.length; pintar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { activo = (activo - 1 + res.length) % res.length; pintar(); e.preventDefault(); }
    else if (e.key === 'Enter') ir(res[activo]);
    else if (e.key === 'Escape') sug.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
  return { input, campo: el('label', { class: 'campo buscador' }, el('span', { class: 'lbl' }, 'Pokémon'), input, sug) };
}

/** Etiqueta "Legendario" o "Singular" (los míticos; "singular" es el nombre oficial en español). */
function etiquetaRareza(rareza, mini = false) {
  return el('span', { class: `rareza ${rareza} ${mini ? 'mini' : ''}`, title: rareza === 'legendario' ? 'Pokémon legendario' : 'Pokémon singular (mítico)' },
    rareza === 'legendario' ? 'Legendario' : 'Singular');
}
/** En Añil: lo que diga el juego; si no, lo del Pokémon oficial equivalente. */
const rarezaAnil = p => p.rareza ?? pokemon(p.oficial)?.rareza ?? null;

/* ---------- Lo que necesita la ficha, según de dónde salga el Pokémon ---------- */

function datosOficial(p, gen) {
  return {
    nombre: nombre(p),
    tipos: tiposEn(p, gen),
    rareza: p.rareza,
    tabla: tablaTipos(gen),
    sprite: (shiny, tam) => sprite(p.id, { shiny, tam, alt: nombre(p) }),
    formas: catalogo.pokemon.filter(x => x.especie_id === p.especie_id && existeEn(x, gen))
      .map(x => ({ href: `#/pokemon/${x.id}`, txt: x.forma || 'Normal', on: x.id === p.id })),
    idEquipo: p.id,
    gen,
    cargar: () => ficha(p.id),
    evolucion: f => evolucion(f, p, gen),
    sets: f => sets(f, gen),
  };
}

function datosAnil(p) {
  const fichaAnil = { stats: p.stats, evs: p.evs, habilidades: habilidadesAnil(p) };
  return {
    nombre: nombreAnil(p),
    tipos: p.tipos,
    rareza: rarezaAnil(p),
    sinShiny: !p.shiny,   // la forma no tiene sprite shiny propio: se ve el normal
    tabla: tablaAnil(),
    sprite: (shiny, tam) => spriteTira(urlSprite(p, shiny), { tam, alt: nombreAnil(p), ms: msSprite(p, shiny) }),
    formas: anil.pokemon.filter(x => x.base === p.base).map(x => ({ href: `#/anil/${x.id}`, txt: x.forma || 'Normal', on: x.id === p.id })),
    idEquipo: idsDeAnil(p, anil),   // las formas propias de Añil van con anil_id (y su especie oficial si existe)
    gen: 9,
    cargar: async () => fichaAnil,
    evolucion: () => evolucionAnil(p),
    sets: async () => {
      if (!p.oficial) return [el('p', { class: 'nota' }, 'Forma propia de Pokémon Añil. Sugerencia según sus estadísticas:'),
        tarjetaSet(setAutomatico(p.stats, (anil.cadenas[p.cadena] ?? []).some(f => f[2] === p.base), 9))];
      return [el('p', { class: 'nota' }, 'Sets del juego oficial (en Añil pueden variar movimientos y objetos).'), ...sets(await ficha(p.oficial), 9)];
    },
  };
}

/* ---------- Ficha ---------- */

async function pintarFicha(caja, d) {
  const cajaSprite = el('div', { class: 'ficha-sprite' }, d.sprite(estado.shiny, 96));
  const cabecera = el('section', { class: 'ficha-cab' },
    cajaSprite,
    el('div', { class: 'ficha-info' },
      el('b', {}, d.nombre),
      el('div', { class: 'chips' }, d.tipos.map(chip), d.rareza && etiquetaRareza(d.rareza)),
      el('label', { class: 'check', title: d.sinShiny ? 'Esta forma no tiene sprite shiny en el juego' : '' },
        el('input', { type: 'checkbox', checked: estado.shiny && !d.sinShiny, disabled: !!d.sinShiny, onchange: e => {
          estado.shiny = e.target.checked;
          poner(cajaSprite, d.sprite(estado.shiny, 96));
        } }), d.sinShiny ? 'Shiny (no hay en el juego)' : 'Shiny')),
    d.idEquipo
      ? botonMenu('+ Al equipo', 'Añadir a…', () => opcionesEquipo(d.idEquipo, d.nombre), { class: 'btn-contorno' })
      : el('button', { class: 'btn-contorno', disabled: true, title: 'Solo existe en Pokémon Añil' }, '+ Al equipo'));

  const filaFormas = d.formas.length > 1 && el('div', { class: 'formas' }, el('span', { class: 'lbl' }, 'Formas'),
    d.formas.map(f => el('a', { href: f.href, class: `pildora ${f.on ? 'on' : ''}` }, f.txt)));

  const panel = el('div', { class: 'panel', style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const pestañas = el('nav', { class: 'tabs', role: 'tablist' },
    [['tipos', 'Tipos'], ['stats', 'Stats'], ['evo', 'Evolución'], ['sets', 'Sets']].map(([idTab, txt]) =>
      el('button', { role: 'tab', 'aria-selected': String(estado.tab === idTab), onclick: () => { estado.tab = idTab; pintarFicha(caja, d); } }, txt)));

  poner(caja, cabecera, filaFormas, pestañas, panel);
  // La ficha completa (stats, evolución, sets) se pide ya, aunque se esté en "Tipos": al cambiar de pestaña sale al momento
  const precarga = d.cargar();
  precarga.catch(() => {});

  if (estado.tab === 'tipos') { poner(panel, debilidades(d.tipos, d.tabla)); return; }
  poner(panel, el('p', { class: 'nota' }, 'Cargando…'));
  try {
    const f = await precarga;
    if (estado.tab === 'stats') poner(panel, stats(f, d.gen));
    if (estado.tab === 'evo') poner(panel, d.evolucion(f));
    if (estado.tab === 'sets') poner(panel, await d.sets(f));
  } catch (e) { poner(panel, el('p', { class: 'msg error' }, e.message)); }
}

/** Opciones del menú "+ Al equipo": tus equipos guardados (con sesión) y el que estás editando.
 *  Cada uno con su portada (los primeros Pokémon del equipo), como los tableros de Pinterest. */
async function opcionesEquipo(pokemonId, nombrePk) {
  const portada = eq => {
    const ms = eq.miembros.slice().sort((a, b) => a.posicion - b.posicion);
    return ms.length ? ms.map(m => datosMiembro(m).sprite(20)) : [el('span', {}, '·')];
  };
  const b = borrador();
  const enEdicion = {
    texto: b.nombre || (b.id ? 'Equipo en edición' : 'Equipo sin guardar'), detalle: `${b.miembros.length}/8`, portada: portada(b),
    desactivada: b.miembros.length >= 8,
    accion: () => { añadirAlBorrador(pokemonId); aviso(`${nombrePk} añadido a ${b.nombre || 'tu equipo'}`); },
  };
  if (!sesion()) {
    return [enEdicion, { texto: 'Login para usar tus equipos', portada: [el('span', {}, '→')], accion: () => { location.hash = '#/login'; } }];
  }
  const equipos = await misEquipos();
  return [
    ...(b.miembros.length && !b.id ? [enEdicion] : []),
    ...equipos.map(eq => ({
      texto: eq.nombre, detalle: `${eq.miembros.length}/8`, portada: portada(eq), desactivada: eq.miembros.length >= 8,
      accion: async () => { await añadirAEquipo(eq, pokemonId); aviso(`${nombrePk} añadido a ${eq.nombre}`); },
    })),
    ...(equipos.length < 8 ? [{
      texto: 'Nuevo equipo', portada: [el('span', {}, '+')],
      accion: async () => { const nuevo = await crearEquipoCon(pokemonId); aviso(`${nombrePk} añadido a ${nuevo.nombre}`); },
    }] : []),
  ];
}

/* ---------- Tipos ---------- */

function debilidades(tiposDef, tabla) {
  const g = { 4: [], 2: [], 0.5: [], 0.25: [], 0: [] };
  for (const t of tabla.tipos) {
    const m = multiplicador(tabla, t.clave, tiposDef);
    if (m in g) g[m].push(t.clave);
  }
  return [[4, '×4', 'mal'], [2, '×2', 'mal'], [0.5, '×½', ''], [0.25, '×¼', ''], [0, '×0', 'inmune']]
    .filter(([m]) => g[m].length || m === 2 || m === 0)
    .map(([m, txt, cls]) => el('div', { class: `deb ${cls}` },
      el('b', {}, txt),
      el('div', { class: 'chips' }, g[m].length ? g[m].map(chip) : el('span', { class: 'tenue' }, 'ninguno'))));
}

/* ---------- Stats ---------- */

function rango(base, esPs) {
  if (esPs) return base === 1 ? [1, 1] : [2 * base + 110, 2 * base + 204];
  return [Math.floor((2 * base + 5) * 0.9), Math.floor((2 * base + 99) * 1.1)];
}

function stats(f, gen) {
  const color = v => (v < 50 ? 'var(--s1)' : v < 80 ? 'var(--s2)' : v < 100 ? 'var(--s3)' : v < 130 ? 'var(--s4)' : 'var(--s5)');
  const da = f.evs.map((n, i) => (n ? `${n} ${STATS_CORTO[i]}` : '')).filter(Boolean).join(' · ');
  const orden = f.stats.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  return [
    el('div', { class: 'stats' },
      el('div', { class: 'stat cab' }, el('span'), el('span'), el('span'), el('span', { class: 'num' }, 'Mín'), el('span', { class: 'num' }, 'Máx')),
      f.stats.map((v, i) => {
        const [min, max] = rango(v, i === 0);
        return el('div', { class: 'stat' }, el('span', { class: 'lab' }, STATS[i]), el('b', { class: 'num' }, v),
          el('span', { class: 'barra' }, el('i', { style: { width: `${Math.min(100, v / 2)}%`, background: color(v) } })),
          el('span', { class: 'num tenue' }, min), el('span', { class: 'num tenue' }, max));
      }),
      el('div', { class: 'stat total' }, el('span', { class: 'lab' }, 'Total'), el('b', { class: 'num' }, f.stats.reduce((a, b) => a + b, 0)))),
    el('p', { class: 'nota' }, 'Mín/Máx a nivel 100. Máx: naturaleza favorable, 252 EVs y 31 IVs. Mín: desfavorable, 0 EVs y 0 IVs.'),
    el('div', { class: 'kv' }, el('span', { class: 'lbl' }, 'Da al derrotarlo'), el('span', {}, da ? `${da} (EVs)` : '—')),
    el('div', { class: 'kv' }, el('span', { class: 'lbl' }, 'Destaca en'), el('span', {}, `${STATS[orden[0][1]]} y ${STATS[orden[1][1]]}`)),
    gen >= 3 && el('h2', { style: { marginTop: '6px' } }, 'Habilidades'),
    gen >= 3 && f.habilidades.map(h => el('div', { class: 'habilidad' },
      el('b', {}, h.nombre, h.oculta ? el('span', { class: 'etiqueta' }, 'Oculta') : null),
      h.descripcion && el('p', {}, h.descripcion))),
  ];
}

/* ---------- Evolución ---------- */

function evolucion(f, p, gen) {
  const nodos = f.evolucion.map(n => ({ ...n, p: pokemon(n.pokemon_id) })).filter(n => n.p && existeEn(n.p, gen));
  if (nodos.length < 2) return el('p', { class: 'tenue' }, 'No evoluciona.');
  return el('ul', { class: 'evo' }, nodos.map(n => el('li', { style: { '--d': n.nivel } },
    n.metodos.length > 0 && el('div', { class: 'metodos' }, '↳', n.metodos.flatMap((m, i) => (i ? [el('span', {}, 'o'), metodo(m)] : [metodo(m)]))),
    el('a', { href: `#/pokemon/${n.p.id}`, class: `evo-nombre ${n.especie_id === p.especie_id ? 'on' : ''}` },
      sprite(n.p.id, { tam: 56, shiny: estado.shiny }), el('span', {}, n.p.nombre)))));
}

function evolucionAnil(p) {
  const nodos = cadenaAnil(p);
  if (nodos.length < 2) return el('p', { class: 'tenue' }, 'No evoluciona.');
  return el('ul', { class: 'evo' }, nodos.map(n => el('li', { style: { '--d': n.nivel } },
    n.metodos.length > 0 && el('div', { class: 'metodos' }, '↳', n.metodos.flatMap((m, i) => (i ? [el('span', {}, 'o'), metodo(m)] : [metodo(m)]))),
    el('a', { href: `#/anil/${n.p.id}`, class: `evo-nombre ${n.p.base === p.base ? 'on' : ''}` },
      spriteTira(urlSprite(n.p, estado.shiny), { tam: 56, ms: msSprite(n.p, estado.shiny) }), el('span', {}, n.p.nombre)))));
}

const ICONO_METODO = { nivel: '▲', amistad: '♥', intercambio: '⇄', otro: '★' };
const TITULO_METODO = { nivel: 'Sube de nivel', objeto: 'Con objeto', amistad: 'Por amistad', intercambio: 'Por intercambio', otro: 'Método especial' };

/** Pastilla con cómo evoluciona: icono del objeto (o símbolo del método) y el detalle. */
function metodo(m) {
  const objeto = m.objeto_id && mapas.objetos.get(m.objeto_id);
  const icono = objeto ? iconoObjeto(objeto) : m.icono ? iconoImagen(m.icono, m.objeto)   // m.icono: iconos de Añil
    : el('i', { 'aria-hidden': 'true' }, ICONO_METODO[m.metodo] ?? '★');
  // Si es un objeto (oficial o de Añil), la pastilla lleva a su ficha en "Objetos"
  const deAnil = m.idAnil && objetoAnil(m.idAnil);
  return objeto || deAnil
    ? el('a', { href: objeto ? `#/objetos/${objeto.id}` : `#/objetos/anil/${deAnil.id}`, class: `metodo ${m.metodo}`, title: `Ver ${(objeto || deAnil).nombre}` }, icono, m.detalle)
    : el('span', { class: `metodo ${m.metodo}`, title: TITULO_METODO[m.metodo] }, icono, m.detalle);
}

/* ---------- Sets ---------- */

const FORMATOS = {
  MIDDLECUP: 'Middle Cup', ANYTHINGGOES: 'Anything Goes', PUREHACKMONS: 'Pure Hackmons', BALANCEDHACKMONS: 'Balanced Hackmons',
  MONOTYPE: 'Monotype', DOUBLESOU: 'Dobles OU', BATTLESPOTSINGLES: 'Battle Spot', BATTLESTADIUMSINGLES: 'Battle Stadium',
  LETSGOOU: "Let's Go OU", BDSPOU: 'DBPR OU', ALMOSTANYABILITY: 'Almost Any Ability', NATIONALDEX: 'National Dex',
  NATIONALDEXMONOTYPE: 'National Dex Monotype', NATIONALDEXRU: 'National Dex RU', NATIONALDEXUU: 'National Dex UU',
  NATIONALDEXUBERS: 'National Dex Ubers', NATIONALDEXDOUBLES: 'National Dex Dobles', DLC1NATIONALDEXAG: 'National Dex AG',
  GODLYGIFT: 'Godly Gift', UBERSUU: 'Ubers UU', VGC2025: 'VGC',
};
const formato = f => FORMATOS[f] ?? f;

const nombres = (mapa, ids) => ids.map(id => mapa.get(id)?.nombre).filter(Boolean);

function sets(f, gen) {
  // Los de la generación elegida; si no hay, los de la más reciente anterior
  const genSets = f.sets.map(s => s.generacion).filter(g => g <= gen).sort((a, b) => b - a)[0];
  const lista = f.sets.filter(s => s.generacion === genSets);
  if (!lista.length) {
    return [el('p', { class: 'nota' }, 'Sin set de Smogon para este Pokémon. Sugerencia según sus estadísticas:'), tarjetaSet(setAutomatico(f.stats, evolucionaMas(f), gen))];
  }
  return [
    el('p', { class: 'nota' }, `Sets competitivos de Smogon${genSets !== gen ? ` (de Gen ${genSets})` : ''}.`),
    ...lista.map(s => tarjetaSet({
      nombre: s.nombre, formato: formato(s.formato),
      filas: [
        ['Objeto', nombres(mapas.objetos, s.objetos)],
        ['Habilidad', nombres(mapas.habilidades, s.habilidades)],
        ['Naturaleza', nombres(mapas.naturalezas, s.naturalezas)],
        ['Teratipo', s.teratipos.map(nombreTipo)],
        ['EVs', s.evs.some(Boolean) ? [s.evs.map((v, i) => (v ? `${v} ${STATS_CORTO[i]}` : '')).filter(Boolean).join(' / ')] : []],
      ],
      // Cada hueco con sus alternativas ("Terremoto / Roca Afilada"); cada movimiento lleva a su ficha
      movimientos: s.movimientos.map(alt => alt.map(id => mapas.movimientos.get(id)).filter(Boolean)).filter(alt => alt.length),
    })),
  ];
}

function tarjetaSet(s) {
  return el('div', { class: 'set' },
    el('div', { class: 'set-cab' }, el('b', {}, s.nombre), s.formato && el('span', { class: 'etiqueta' }, s.formato)),
    s.filas.filter(([, v]) => v.length).map(([k, v]) => el('div', { class: 'kv' }, el('span', { class: 'lbl' }, k), el('span', {}, v.join(' o ')))),
    s.movimientos?.length && el('ul', { class: 'movs' }, s.movimientos.map(alt => el('li', {},
      alt.map((mv, i) => [i > 0 && ' / ', el('a', { href: `#/movimientos/${mv.id}` }, mv.nombre)])))));
}

/** ¿Le queda alguna evolución? (para sugerir el Mineral Evolutivo) */
function evolucionaMas(f) {
  const yo = f.evolucion.find(x => x.pokemon_id === f.id)?.especie_id;
  return yo != null && f.evolucion.some(n => n.desde === yo);
}

/** Sugerencia simple cuando Smogon no tiene set (Pokémon poco usados, sin evolucionar…). */
function setAutomatico(statsBase, evoluciona, gen) {
  const [ps, atq, def, ate, dfe, vel] = statsBase;
  const fisico = atq >= ate;
  const defensivo = ps + def + dfe > (Math.max(atq, ate) + vel) * 1.6;
  let nombreSet, naturaleza, evs, objetos;
  if (defensivo) {
    nombreSet = 'Defensivo';
    naturaleza = def >= dfe ? (fisico ? 'Agitada (+Def −AtEsp)' : 'Osada (+Def −Atq)') : (fisico ? 'Cauta (+DefEsp −AtEsp)' : 'Serena (+DefEsp −Atq)');
    evs = def >= dfe ? '252 PS / 252 Def / 4 DefEsp' : '252 PS / 4 Def / 252 DefEsp';
    objetos = ['Restos', 'Casco Dentado'];
  } else if (vel >= 90) {
    nombreSet = fisico ? 'Atacante físico rápido' : 'Atacante especial rápido';
    naturaleza = fisico ? 'Alegre (+Vel −AtEsp)' : 'Miedosa (+Vel −Atq)';
    evs = fisico ? '252 Atq / 4 DefEsp / 252 Vel' : '252 AtEsp / 4 DefEsp / 252 Vel';
    objetos = ['Vidasfera', fisico ? 'Cinta Elección' : 'Gafas Elección'];
  } else {
    nombreSet = fisico ? 'Atacante físico' : 'Atacante especial';
    naturaleza = fisico ? 'Firme (+Atq −AtEsp)' : 'Modesta (+AtEsp −Atq)';
    evs = fisico ? '252 PS / 252 Atq / 4 DefEsp' : '252 PS / 252 AtEsp / 4 DefEsp';
    objetos = ['Chaleco Asalto', fisico ? 'Cinta Elección' : 'Gafas Elección'];
  }
  if (evoluciona && gen >= 5) objetos.unshift('Mineral Evolutivo');
  return { nombre: nombreSet, formato: 'Auto', filas: [
    ['Objeto', gen >= 2 ? objetos : []], ['Naturaleza', gen >= 3 ? [naturaleza] : []], ['EVs', [evs]]] };
}
