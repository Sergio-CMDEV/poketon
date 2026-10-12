// Pantalla Objetos: buscar un objeto del juego, qué hace, qué Pokémon lo llevan en sus sets de Smogon
// y a quién hace evolucionar. Sin objeto elegido se ven los más usados (o todos los de una categoría).
// Con "Pokémon Añil" elegido se ven los objetos de ese juego (los genera scripts/anil.mjs).
// Desde la ficha, "Equipar" da el objeto a un Pokémon de tus equipos.

import { peticion, sesion, WEB } from '../api.js';
import { catalogo, mapas, normalizar, pokemon, nombre } from '../datos.js';
import { el, sprite, spriteTira, poner, campo, iconoObjeto, iconoImagen, botonMenu, aviso, selectorGen } from '../ui.js';
import { anil, enAnil, objetoAnil, usosObjetoAnil, urlSprite, msSprite, nombreAnil } from '../anil.js';
import { borrador, misEquipos, equiparEnBorrador, equiparEnEquipo } from '../equipos.js';
import { datosMiembro } from '../miembro.js';

const CATEGORIAS = ['Equipables', 'Bayas', 'Evolución', 'Megapiedras', 'Cristales Z', 'Medicinas', 'Poké Balls', 'MT', 'Combate', 'Otros'];
const MAX_LISTA = 100;
let populares = null;   // se piden una vez

export function vistaObjetos(raiz, id = null, idAnil = null) {
  if (idAnil && anil) localStorage.setItem('gen', 'anil');   // un enlace a un objeto de Añil elige Añil
  // Un objeto oficial se ve aunque esté elegido Añil (p. ej. al llegar desde un set de Smogon)
  const modoAnil = idAnil ? !!anil : id ? false : enAnil();
  const o = modoAnil ? objetoAnil(idAnil) : id ? mapas.objetos.get(id) : null;
  const categoria = sessionStorage.getItem('categoria-objeto') || '';

  const entrada = el('input', { type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Escribe un objeto…', value: o?.nombre ?? '' });
  const selector = el('select', { onchange: e => {
    sessionStorage.setItem('categoria-objeto', e.target.value);
    if (id || idAnil) location.hash = '#/objetos'; else vistaObjetos(raiz);
  } }, el('option', { value: '' }, 'Todas'), CATEGORIAS.map(c => el('option', { value: c, selected: c === categoria }, c)));
  // Juego: solo si están los datos de Añil en este PC
  const juego = anil && selectorGen(modoAnil ? 'anil' : 'oficial', [['oficial', 'Juegos oficiales'], ['anil', 'Pokémon Añil']], g => {
    if (g === 'anil') localStorage.setItem('gen', 'anil'); else localStorage.setItem('gen', '9');
    if (location.hash === '#/objetos') vistaObjetos(raiz); else location.hash = '#/objetos';
  });

  const zona = el('div', { style: { display: 'contents' } });
  // Al escribir se ve la lista filtrada; si había un objeto abierto, se cierra
  entrada.addEventListener('input', () => {
    if ((id || idAnil) && location.hash !== '#/objetos') history.replaceState(null, '', '#/objetos');
    id = idAnil = null;
    pintarLista(zona, entrada.value, selector.value, modoAnil);
  });

  poner(raiz,
    juego && campo('Juego', juego),
    el('div', { class: 'filtro-objetos' }, campo('Objeto', entrada), campo('Categoría', selector)),
    zona);

  if (o) (modoAnil ? pintarObjetoAnil : pintarObjeto)(zona, o);
  else pintarLista(zona, '', categoria, modoAnil);
  if (!o) entrada.focus();
}

/* ---------- Lista ---------- */

async function pintarLista(zona, texto, categoria, modoAnil) {
  const q = normalizar(texto);
  if (!q && !categoria && !modoAnil) {
    // Sin buscar nada: los más usados en Smogon
    poner(zona, el('p', { class: 'nota' }, 'Cargando…'));
    try { populares ??= (await peticion('objeto.php')).populares; } catch (e) { poner(zona, el('p', { class: 'msg error' }, e.message)); return; }
    poner(zona, el('b', { class: 'subtitulo' }, 'Más usados en Smogon (Gen 9)'),
      el('div', { class: 'lista-objetos' }, populares.filter(p => mapas.objetos.has(p.id))
        .map(p => filaObjeto(mapas.objetos.get(p.id), `${p.sets} sets`))));
    return;
  }
  const lista = modoAnil
    ? anil.objetos.filter(x => (!categoria || x.categoria === categoria) && (!q || x.clave.includes(q)))
    // Fuera los que no tienen información y los que no sirven para combates (sin categoría: caramelos de Let's Go, ingredientes…)
    : catalogo.objetos.filter(x => x.con_info && x.categoria && (!categoria || x.categoria === categoria)
      && (!q || normalizar(x.nombre).includes(q) || normalizar(x.nombre_en).includes(q)));
  // Primero los que empiezan por lo escrito
  if (q) lista.sort((a, b) => normalizar(b.nombre).startsWith(q) - normalizar(a.nombre).startsWith(q));
  poner(zona,
    modoAnil && !q && !categoria && el('b', { class: 'subtitulo' }, `Objetos de Pokémon Añil (${lista.length})`),
    lista.length ? el('div', { class: 'lista-objetos' }, lista.slice(0, MAX_LISTA).map(x => filaObjeto(x)))
      : el('p', { class: 'centro' }, 'Ningún objeto con ese nombre.'),
    lista.length > MAX_LISTA && el('p', { class: 'nota centro' }, `Se muestran ${MAX_LISTA} de ${lista.length}. Escribe para afinar.`));
}

function filaObjeto(x, extra = '') {
  return el('a', { href: x.anil ? `#/objetos/anil/${x.id}` : `#/objetos/${x.id}`, class: 'fila-objeto' },
    x.anil ? iconoAnil(x, 32) : iconoObjeto(x, 32),
    el('span', { class: 'nombre' }, x.nombre),
    el('span', { class: 'etiqueta' }, x.categoria ?? 'Otros'),
    extra && el('small', { class: 'tenue' }, extra));
}

/** Icono de un objeto de Añil: el del juego; si no lo tiene, el del objeto oficial. */
function iconoAnil(o, tam) {
  if (anil.iconosObjeto?.includes(o.id)) return iconoImagen([`${WEB}anil/objetos/${o.id}.png`], o.nombre, tam);
  return iconoObjeto(o.oficial, tam);
}

/* ---------- Ficha de un objeto ---------- */

function cabecera(icono, o, subtitulo) {
  return el('section', { class: 'ficha-cab' },
    el('div', { class: 'ficha-sprite icono-grande' }, icono),
    el('div', { class: 'ficha-info' },
      el('b', {}, o.nombre),
      el('div', { class: 'chips' }, el('span', { class: 'etiqueta sin-margen' }, o.categoria ?? 'Otros')),
      el('span', { class: 'tenue' }, subtitulo)),
    botonEquipar(o.anil ? o.oficial : o));
}

async function pintarObjeto(zona, o) {
  const cuerpo = el('div', { style: { display: 'contents' } }, el('p', { class: 'nota' }, 'Cargando…'));
  poner(zona, cabecera(iconoObjeto(o, 64), o, o.nombre_en), cuerpo);

  let d;
  try { d = await peticion(`objeto.php?id=${o.id}`); } catch (e) { poner(cuerpo, el('p', { class: 'msg error' }, e.message)); return; }

  const evoluciones = d.evoluciones.map(e => ({ ...e, de: pokemon(e.desde), a: pokemon(e.hacia) })).filter(e => e.de && e.a);
  poner(cuerpo,
    el('section', { class: 'tarjeta' }, el('b', {}, 'Qué hace'),
      el('p', { class: 'descripcion' }, d.descripcion || 'Sin descripción.')),
    evoluciones.length > 0 && el('section', { class: 'tarjeta' }, el('b', {}, 'Hace evolucionar a'),
      evoluciones.map(e => filaEvolucion(
        el('a', { href: `#/pokemon/${e.de.id}`, class: 'evo-nombre' }, sprite(e.de.id, { tam: 48 }), el('span', {}, nombre(e.de))),
        el('a', { href: `#/pokemon/${e.a.id}`, class: 'evo-nombre' }, sprite(e.a.id, { tam: 48 }), el('span', {}, nombre(e.a))),
        e.detalle))),
    tarjetaRecomendados(d.recomendados, 'Según los sets competitivos de Smogon. Pulsa uno para ver su ficha.'),
  );
}

async function pintarObjetoAnil(zona, o) {
  const { evoluciones, megas } = usosObjetoAnil(o);
  const enlaceAnil = p => el('a', { href: `#/anil/${p.id}`, class: 'evo-nombre' },
    spriteTira(urlSprite(p), { tam: 48, ms: msSprite(p) }), el('span', {}, nombreAnil(p)));
  const cuerpo = el('div', { style: { display: 'contents' } });
  poner(zona, cabecera(iconoAnil(o, 64), o, o.oficial ? 'Pokémon Añil · también en los juegos oficiales' : 'Solo en Pokémon Añil'), cuerpo);

  poner(cuerpo,
    el('section', { class: 'tarjeta' }, el('b', {}, 'Qué hace'),
      o.movimiento && el('p', { class: 'descripcion' }, `Enseña el movimiento ${o.movimiento}.`),
      el('p', { class: 'descripcion' }, o.descripcion)),
    evoluciones.length > 0 && el('section', { class: 'tarjeta' }, el('b', {}, 'Hace evolucionar a'),
      evoluciones.map(e => filaEvolucion(enlaceAnil(e.de), enlaceAnil(e.a), e.detalle))),
    megas.length > 0 && el('section', { class: 'tarjeta' }, el('b', {}, 'Megaevoluciona a'),
      el('div', { class: 'recomendados' }, megas.map(p => el('a', { href: `#/anil/${p.id}`, class: 'recomendado' },
        spriteTira(urlSprite(p), { tam: 56, ms: msSprite(p) }), el('b', {}, nombreAnil(p)))))),
  );
  // Si también existe en los juegos oficiales: los sets de Smogon que lo usan
  if (!o.oficial) return;
  const sitio = el('div', { style: { display: 'contents' } }, el('p', { class: 'nota' }, 'Cargando…'));
  cuerpo.append(sitio);
  try {
    const d = await peticion(`objeto.php?id=${o.oficial.id}`);
    poner(sitio, tarjetaRecomendados(d.recomendados, 'Sets de Smogon del juego oficial (en Añil pueden variar).'));
  } catch (e) { poner(sitio, el('p', { class: 'msg error' }, e.message)); }
}

const filaEvolucion = (de, a, detalle) => el('div', { class: 'evo-objeto' }, de, el('span', { class: 'tenue' }, '→'), a, el('small', { class: 'tenue' }, detalle));

function tarjetaRecomendados(lista, nota) {
  const recomendados = lista.map(r => ({ ...r, p: pokemon(r.pokemon_id) })).filter(r => r.p);
  return el('section', { class: 'tarjeta' }, el('b', {}, 'Pokémon que lo llevan'),
    recomendados.length
      ? [el('p', { class: 'nota' }, nota),
        el('div', { class: 'recomendados' }, recomendados.map(r => el('a', { href: `#/pokemon/${r.p.id}`, class: 'recomendado' },
          sprite(r.p.id, { tam: 56, alt: '' }), el('b', {}, nombre(r.p)),
          el('small', { class: 'tenue' }, `Gen ${r.generacion} · ${r.formatos.split(',').slice(0, 3).join(', ')}`))))]
      : el('p', { class: 'tenue' }, 'Ningún set de Smogon lo usa.'));
}

/* ---------- Equipar el objeto a un Pokémon de tus equipos ---------- */

function botonEquipar(o) {
  if (o?.categoria === 'MT') return null;   // las MT no se pueden equipar
  if (!o) return el('button', { class: 'btn-contorno', disabled: true, title: 'Solo existe en Pokémon Añil: no se puede equipar en los equipos' }, 'Equipar');
  return botonMenu('Equipar', 'Dar a…', () => opcionesEquipar(o), { class: 'btn-contorno' });
}

async function opcionesEquipar(o) {
  const opcion = (m, accion) => {
    const d = datosMiembro(m);
    const lleva = m.objeto_id === o.id;
    return {
      texto: d.nombre,
      detalle: lleva ? 'Ya lo lleva' : (mapas.objetos.get(m.objeto_id)?.nombre ?? 'Sin objeto') + (m.posicion > 6 ? ' · reserva' : ''),
      portada: [d.sprite(40)],
      desactivada: lleva,
      accion: async () => { await accion(); aviso(`${o.nombre} equipado a ${d.nombre}`); },
    };
  };
  const ordenados = eq => eq.miembros.slice().sort((a, b) => a.posicion - b.posicion);
  const b = borrador();
  const opciones = [];
  // El equipo que se está montando, si aún no está en la cuenta (si lo está, sale con los demás)
  if (b.miembros.length && (!sesion() || !b.id)) {
    opciones.push({ seccion: b.nombre || 'Equipo sin guardar' },
      ...ordenados(b).map(m => opcion(m, () => equiparEnBorrador(m.posicion, o.id))));
  }
  if (sesion()) {
    for (const eq of await misEquipos()) {
      if (!eq.miembros.length) continue;
      opciones.push({ seccion: eq.nombre }, ...ordenados(eq).map(m => opcion(m, () => equiparEnEquipo(eq, m.posicion, o.id))));
    }
  } else {
    opciones.push({ texto: 'Login para usar tus equipos', portada: [el('span', {}, '→')], accion: () => { location.hash = '#/login'; } });
  }
  if (!opciones.some(x => x.accion && x.texto !== 'Login para usar tus equipos')) {
    opciones.unshift({ nota: 'Aún no tienes ningún Pokémon en un equipo. Añádelo desde Buscar con "+ Al equipo".' });
  }
  return opciones;
}
