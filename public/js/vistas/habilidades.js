// Pantalla Habilidades: buscar una habilidad, qué hace, qué cuenta de ella la tabla de cobertura, qué Pokémon
// la pueden tener (como habilidad normal u oculta) y quién la lleva en sus sets de Smogon.
// Sin habilidad elegida se ven las más usadas en Smogon, o la lista filtrada.
// Con "Pokémon Añil" elegido se ven las habilidades de ese juego y sus Pokémon (los genera scripts/anil.mjs).

import { peticion } from '../api.js';
import { catalogo, mapas, normalizar, pokemon, nombre } from '../datos.js';
import { el, sprite, spriteTira, poner, campo, selectorGen } from '../ui.js';
import { anil, enAnil, urlSprite, msSprite, nombreAnil } from '../anil.js';
import { efectoEnCobertura } from '../cobertura.js';

const MAX_LISTA = 100;
const MAX_POKEMON = 40;   // por grupo; el resto con "Ver todos"
let populares = null;     // se piden una vez
let pintada = 0;          // la última lista pedida: si se escribe mientras llegan las populares, no se pisa

/** id: habilidad de la BD (#/habilidades/26) · idAnil: habilidad de Añil (#/habilidades/anil/LEVITATE) */
export function vistaHabilidades(raiz, id = null, idAnil = null) {
  if (idAnil && anil) localStorage.setItem('gen', 'anil');
  const modoAnil = idAnil ? !!anil : id ? false : enAnil();
  const h = modoAnil ? habilidadAnil(idAnil) : id ? mapas.habilidades.get(id) : null;
  let filtro = {};
  try { filtro = JSON.parse(sessionStorage.getItem('filtro-habilidades')) || {}; } catch { /* nada */ }

  // Lo escrito y el filtro se recuerdan al ir a otra sección y volver
  const entrada = el('input', { type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Escribe una habilidad…', value: h?.nombre ?? filtro.texto ?? '' });
  const efecto = el('select', { 'aria-label': 'Mostrar' }, el('option', { value: '' }, 'Todas'),
    el('option', { value: 'cobertura', selected: filtro.efecto === 'cobertura' }, 'Cuentan en la cobertura'));
  const juego = anil && selectorGen(modoAnil ? 'anil' : 'oficial', [['oficial', 'Juegos oficiales'], ['anil', 'Pokémon Añil']], g => {
    localStorage.setItem('gen', g === 'anil' ? 'anil' : '9');
    if (location.hash === '#/habilidades') vistaHabilidades(raiz); else location.hash = '#/habilidades';
  });

  const zona = el('div', { style: { display: 'contents' } });
  const filtrar = () => {
    sessionStorage.setItem('filtro-habilidades', JSON.stringify({ texto: entrada.value, efecto: efecto.value }));
    if ((id || idAnil) && location.hash !== '#/habilidades') history.replaceState(null, '', '#/habilidades');
    id = idAnil = null;
    pintarLista(zona, entrada.value, efecto.value, modoAnil);
  };
  entrada.addEventListener('input', filtrar);
  efecto.addEventListener('change', filtrar);

  poner(raiz, juego && campo('Juego', juego), el('div', { class: 'filtro-objetos' }, campo('Habilidad', entrada), campo('Mostrar', efecto)), zona);
  if (h) (modoAnil ? pintarHabilidadAnil : pintarHabilidad)(zona, h);
  else pintarLista(zona, entrada.value, efecto.value, modoAnil);
  if (!h) entrada.focus();
}

/* ---------- Datos de Pokémon Añil ---------- */

/** Habilidad de Añil con la forma de las del catálogo, y su equivalente en los juegos oficiales (por nombre). */
function habilidadAnil(idAnil) {
  const datos = anil?.habilidades[idAnil];
  if (!datos) return null;
  const [nombreH, descripcion] = datos;
  const oficial = catalogo.habilidades.find(x => normalizar(x.nombre) === normalizar(nombreH) || normalizar(x.nombre_en) === normalizar(idAnil)) ?? null;
  return { id: idAnil, nombre: nombreH, descripcion, anil: true, oficial, nombre_en: oficial?.nombre_en ?? null };
}

/* ---------- Lista ---------- */

async function pintarLista(zona, texto, efecto, modoAnil) {
  const yo = ++pintada;
  const q = normalizar(texto);
  const cuenta = x => !efecto || !!efectoEnCobertura(x.nombre_en);
  if (!q && !efecto && !modoAnil) {
    // Sin buscar nada: las más usadas en Smogon
    poner(zona, el('p', { class: 'nota' }, 'Cargando…'));
    try { populares ??= (await peticion('habilidad.php')).populares; } catch (e) { if (yo === pintada) poner(zona, el('p', { class: 'msg error' }, e.message)); return; }
    if (yo !== pintada) return;
    poner(zona, el('b', { class: 'subtitulo' }, 'Más usadas en Smogon (Gen 9)'),
      el('div', { class: 'lista-objetos' }, populares.filter(p => mapas.habilidades.has(p.id))
        .map(p => filaHabilidad(mapas.habilidades.get(p.id), `${p.sets} sets`))));
    return;
  }
  const todas = modoAnil ? Object.keys(anil.habilidades).map(habilidadAnil) : catalogo.habilidades;
  const lista = todas.filter(x => cuenta(x) && (!q || normalizar(x.nombre).includes(q) || normalizar(x.nombre_en ?? '').includes(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // Primero las que empiezan por lo escrito
  if (q) lista.sort((a, b) => normalizar(b.nombre).startsWith(q) - normalizar(a.nombre).startsWith(q));
  poner(zona,
    !q && el('b', { class: 'subtitulo' }, `${lista.length} habilidades${modoAnil ? ' de Pokémon Añil' : ''}${efecto ? ' que cuentan en la cobertura' : ''}`),
    lista.length ? el('div', { class: 'lista-objetos' }, lista.slice(0, MAX_LISTA).map(x => filaHabilidad(x)))
      : el('p', { class: 'centro' }, 'Ninguna habilidad con ese nombre.'),
    lista.length > MAX_LISTA && el('p', { class: 'nota centro' }, `Se muestran ${MAX_LISTA} de ${lista.length}. Escribe para afinar.`));
}

function filaHabilidad(h, extra = '') {
  return el('a', { href: h.anil ? `#/habilidades/anil/${h.id}` : `#/habilidades/${h.id}`, class: 'fila-objeto fila-habilidad' },
    el('span', { class: 'nombre' }, h.nombre),
    efectoEnCobertura(h.nombre_en) && el('span', { class: 'etiqueta', title: efectoEnCobertura(h.nombre_en) }, 'Cobertura'),
    el('small', { class: 'tenue' }, extra || (h.nombre_en && h.nombre_en !== h.nombre ? h.nombre_en : '')));
}

/* ---------- Ficha de una habilidad ---------- */

function cabecera(h, subtitulo) {
  return el('section', { class: 'ficha-cab' },
    el('div', { class: 'ficha-info' }, el('b', {}, h.nombre), el('span', { class: 'tenue' }, subtitulo)));
}

/** Lo que hace en la tabla de cobertura de los equipos (Levitación: inmune a Tierra…). */
function tarjetaCobertura(h) {
  const texto = efectoEnCobertura(h.nombre_en);
  return texto && el('section', { class: 'tarjeta' }, el('b', {}, 'En la cobertura de tus equipos'),
    el('p', { class: 'descripcion' }, texto),
    el('p', { class: 'nota' }, 'La tabla de cobertura lo tiene en cuenta (sale con *). Lo que depende del combate no cuenta.'));
}

async function pintarHabilidad(zona, h) {
  const cuerpo = el('div', { style: { display: 'contents' } }, el('p', { class: 'nota' }, 'Cargando…'));
  poner(zona, cabecera(h, h.nombre_en), cuerpo);
  let d;
  try { d = await peticion(`habilidad.php?id=${h.id}`); } catch (e) { poner(cuerpo, el('p', { class: 'msg error' }, e.message)); return; }
  const lista = d.pokemon.map(x => ({ ...x, p: pokemon(x.id) })).filter(x => x.p)
    .sort((a, b) => a.p.especie_id - b.p.especie_id || a.p.id - b.p.id);
  const enlace = x => el('a', { href: `#/pokemon/${x.p.id}`, class: 'aprende', title: nombre(x.p) }, sprite(x.p.id, { tam: 32, alt: '' }), el('span', {}, nombre(x.p)));
  poner(cuerpo,
    el('section', { class: 'tarjeta' }, el('b', {}, 'Qué hace'), el('p', { class: 'descripcion' }, d.descripcion || 'Sin descripción.')),
    tarjetaCobertura(h),
    tarjetaQuien(lista, enlace),
    tarjetaRecomendados(d.recomendados));
}

function pintarHabilidadAnil(zona, h) {
  const lista = anil.pokemon.flatMap(p => p.habilidades.filter(([idH]) => idH === h.id).map(([, oculta]) => ({ p, oculta: !!oculta })));
  const enlace = x => el('a', { href: `#/anil/${x.p.id}`, class: 'aprende', title: nombreAnil(x.p) },
    spriteTira(urlSprite(x.p), { tam: 32, ms: msSprite(x.p) }), el('span', {}, nombreAnil(x.p)));
  poner(zona, cabecera(h, h.oficial ? `Pokémon Añil · también en los juegos oficiales (${h.oficial.nombre_en})` : 'Solo en Pokémon Añil'),
    el('section', { class: 'tarjeta' }, el('b', {}, 'Qué hace'), el('p', { class: 'descripcion' }, h.descripcion || 'Sin descripción.')),
    tarjetaCobertura(h),
    tarjetaQuien(lista, enlace),
    h.oficial && el('p', { class: 'nota' }, el('a', { href: `#/habilidades/${h.oficial.id}` }, `Ver ${h.oficial.nombre} en los juegos oficiales`), ' (quién la lleva en Smogon).'));
}

/** Quién la puede tener, como habilidad normal y como oculta; en cada grupo los primeros y "Ver los N". */
function tarjetaQuien(lista, enlace) {
  const grupos = [['Como habilidad normal', lista.filter(x => !x.oculta)], ['Como habilidad oculta', lista.filter(x => x.oculta)]].filter(([, l]) => l.length);
  const grupo = ([titulo, l]) => {
    const caja = el('div', { class: 'aprenden' });
    const pintar = todos => poner(caja, (todos ? l : l.slice(0, MAX_POKEMON)).map(enlace),
      !todos && l.length > MAX_POKEMON && el('button', { class: 'btn-sec-mini', type: 'button', onclick: () => pintar(true) }, `Ver los ${l.length}`));
    pintar(false);
    return [el('small', { class: 'grupo-aprende' }, `${titulo} · ${l.length}`), caja];
  };
  return el('section', { class: 'tarjeta' }, el('b', {}, 'Quién la puede tener'),
    grupos.length ? grupos.map(grupo) : el('p', { class: 'tenue' }, 'Ningún Pokémon la tiene.'));
}

function tarjetaRecomendados(lista) {
  const recomendados = lista.map(r => ({ ...r, p: pokemon(r.pokemon_id) })).filter(r => r.p);
  return el('section', { class: 'tarjeta' }, el('b', {}, 'Pokémon que la llevan'),
    recomendados.length
      ? [el('p', { class: 'nota' }, 'Según los sets competitivos de Smogon. Pulsa uno para ver su ficha.'),
        el('div', { class: 'recomendados' }, recomendados.map(r => el('a', { href: `#/pokemon/${r.p.id}`, class: 'recomendado' },
          sprite(r.p.id, { tam: 56, alt: '' }), el('b', {}, nombre(r.p)),
          el('small', { class: 'tenue' }, `Gen ${r.generacion} · ${r.formatos.split(',').slice(0, 3).join(', ')}`))))]
      : el('p', { class: 'tenue' }, 'Ningún set de Smogon la usa (o el Pokémon solo tiene una habilidad).'));
}
