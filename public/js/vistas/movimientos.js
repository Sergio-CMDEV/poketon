// Pantalla Movimientos: buscar un movimiento, sus datos (tipo, categoría, potencia, precisión, PP), qué hace,
// qué Pokémon lo llevan en sus sets de Smogon y quién lo aprende (subiendo de nivel, con MT, por crianza…).
// Sin movimiento elegido se ven los más usados en Smogon, o la lista filtrada por nombre, tipo y categoría.

import { peticion } from '../api.js';
import { catalogo, mapas, normalizar, pokemon, nombre, nombreTipo } from '../datos.js';
import { el, sprite, poner, campo, chip } from '../ui.js';

export const CATEGORIA = { fisico: 'Físico', especial: 'Especial', estado: 'Estado' };
const METODOS = [['nivel', 'Subiendo de nivel'], ['mt', 'Con MT o DT'], ['huevo', 'Por crianza (movimiento huevo)'],
  ['tutor', 'Con un tutor'], ['otro', 'De otras formas (eventos, formas especiales…)']];
const MAX_LISTA = 100;
const MAX_APRENDEN = 40;   // por grupo; el resto con "Ver todos"
let populares = null;      // se piden una vez

export function vistaMovimientos(raiz, id = null) {
  const mv = id ? mapas.movimientos.get(id) : null;
  let filtro = {};
  try { filtro = JSON.parse(sessionStorage.getItem('filtro-movs')) || {}; } catch { /* nada */ }

  const entrada = el('input', { type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Escribe un movimiento…', value: mv?.nombre ?? '' });
  const tiposConMovs = new Set(catalogo.movimientos.map(m => m.tipo));
  const tipo = el('select', { 'aria-label': 'Tipo' }, el('option', { value: '' }, 'Todos'),
    catalogo.tipos.filter(t => tiposConMovs.has(t.clave)).map(t => el('option', { value: t.clave, selected: t.clave === filtro.tipo }, t.nombre)));
  const categoria = el('select', { 'aria-label': 'Categoría' }, el('option', { value: '' }, 'Todas'),
    Object.entries(CATEGORIA).map(([v, t]) => el('option', { value: v, selected: v === filtro.categoria }, t)));

  const zona = el('div', { style: { display: 'contents' } });
  // Al escribir o filtrar se ve la lista; si había un movimiento abierto, se cierra
  const filtrar = () => {
    sessionStorage.setItem('filtro-movs', JSON.stringify({ tipo: tipo.value, categoria: categoria.value }));
    if (id && location.hash !== '#/movimientos') history.replaceState(null, '', '#/movimientos');
    id = null;
    pintarLista(zona, entrada.value, tipo.value, categoria.value);
  };
  entrada.addEventListener('input', filtrar);
  tipo.addEventListener('change', filtrar);
  categoria.addEventListener('change', filtrar);

  poner(raiz, el('div', { class: 'filtro-movs' }, campo('Movimiento', entrada), campo('Tipo', tipo), campo('Categoría', categoria)), zona);
  if (mv) pintarMovimiento(zona, mv);
  else pintarLista(zona, '', tipo.value, categoria.value);
  if (!mv) entrada.focus();
}

/* ---------- Lista ---------- */

async function pintarLista(zona, texto, tipo, categoria) {
  const q = normalizar(texto);
  if (!q && !tipo && !categoria) {
    // Sin buscar nada: los más usados en Smogon
    poner(zona, el('p', { class: 'nota' }, 'Cargando…'));
    try { populares ??= (await peticion('movimiento.php')).populares; } catch (e) { poner(zona, el('p', { class: 'msg error' }, e.message)); return; }
    poner(zona, el('b', { class: 'subtitulo' }, 'Más usados en Smogon (Gen 9)'),
      el('div', { class: 'lista-objetos' }, populares.filter(p => mapas.movimientos.has(p.id))
        .map(p => filaMovimiento(mapas.movimientos.get(p.id), `${p.sets} sets`))));
    return;
  }
  const lista = catalogo.movimientos.filter(m => (!tipo || m.tipo === tipo) && (!categoria || m.categoria === categoria)
    && (!q || normalizar(m.nombre).includes(q) || normalizar(m.nombre_en).includes(q)));
  // Primero los que empiezan por lo escrito
  if (q) lista.sort((a, b) => normalizar(b.nombre).startsWith(q) - normalizar(a.nombre).startsWith(q));
  poner(zona,
    !q && el('b', { class: 'subtitulo' }, `${lista.length} movimientos${tipo ? ` de tipo ${nombreTipo(tipo)}` : ''}${categoria ? ` · ${CATEGORIA[categoria]}` : ''}`),
    lista.length ? el('div', { class: 'lista-objetos' }, lista.slice(0, MAX_LISTA).map(m => filaMovimiento(m)))
      : el('p', { class: 'centro' }, 'Ningún movimiento con ese nombre.'),
    lista.length > MAX_LISTA && el('p', { class: 'nota centro' }, `Se muestran ${MAX_LISTA} de ${lista.length}. Escribe o filtra para afinar.`));
}

/** Precisión: "100 %"; sin precisión, "No falla" si hace daño (Golpe Aéreo) y "—" si es de estado (Protección). */
const precision = m => (m.precision != null ? `${m.precision} %` : m.precision === null && m.categoria !== 'estado' ? 'No falla' : '—');

/** "100 · 100 % · 10 PP" (potencia, precisión, PP). */
const datosCortos = m => [m.potencia ?? '—', precision(m), m.pp == null ? '' : `${m.pp} PP`].filter(Boolean).join(' · ');

function filaMovimiento(m, extra = '') {
  return el('a', { href: `#/movimientos/${m.id}`, class: 'fila-objeto fila-mov' },
    chip(m.tipo),
    el('span', { class: 'nombre' }, m.nombre),
    el('span', { class: `etiqueta cat-${m.categoria}` }, CATEGORIA[m.categoria]),
    el('small', { class: 'tenue datos' }, datosCortos(m)),
    extra && el('small', { class: 'tenue' }, extra));
}

/* ---------- Ficha de un movimiento ---------- */

async function pintarMovimiento(zona, m) {
  const cuerpo = el('div', { style: { display: 'contents' } }, el('p', { class: 'nota' }, 'Cargando…'));
  const dato = (titulo, valor) => el('div', {}, el('small', { class: 'tenue' }, titulo), el('b', {}, valor));
  poner(zona,
    el('section', { class: 'ficha-cab' },
      el('div', { class: 'ficha-info' },
        el('b', {}, m.nombre),
        el('div', { class: 'chips' }, chip(m.tipo), el('span', { class: `etiqueta sin-margen cat-${m.categoria}` }, CATEGORIA[m.categoria])),
        el('span', { class: 'tenue' }, m.nombre_en))),
    el('section', { class: 'tarjeta datos-mov' },
      dato('Potencia', m.potencia ?? '—'),
      dato('Precisión', precision(m)),
      dato('PP', m.pp ?? '—')),
    cuerpo);

  let d;
  try { d = await peticion(`movimiento.php?id=${m.id}`); } catch (e) { poner(cuerpo, el('p', { class: 'msg error' }, e.message)); return; }

  poner(cuerpo,
    el('section', { class: 'tarjeta' }, el('b', {}, 'Qué hace'), el('p', { class: 'descripcion' }, d.descripcion || 'Sin descripción.')),
    tarjetaRecomendados(d.recomendados),
    tarjetaAprenden(d.aprenden));
}

function tarjetaRecomendados(lista) {
  const recomendados = lista.map(r => ({ ...r, p: pokemon(r.pokemon_id) })).filter(r => r.p);
  return el('section', { class: 'tarjeta' }, el('b', {}, 'Pokémon que lo llevan'),
    recomendados.length
      ? [el('p', { class: 'nota' }, 'Según los sets competitivos de Smogon. Pulsa uno para ver su ficha.'),
        el('div', { class: 'recomendados' }, recomendados.map(r => el('a', { href: `#/pokemon/${r.p.id}`, class: 'recomendado' },
          sprite(r.p.id, { tam: 56, alt: '' }), el('b', {}, nombre(r.p)),
          el('small', { class: 'tenue' }, `Gen ${r.generacion} · ${r.formatos.split(',').slice(0, 3).join(', ')}`))))]
      : el('p', { class: 'tenue' }, 'Ningún set de Smogon lo usa.'));
}

/** Quién lo aprende, agrupado por cómo; en cada grupo los primeros y un botón para ver el resto. */
function tarjetaAprenden(aprenden) {
  const grupos = METODOS.map(([metodo, titulo]) => {
    const lista = aprenden.filter(a => a.metodo === metodo).map(a => ({ ...a, p: pokemon(a.id) })).filter(a => a.p)
      .sort((a, b) => (metodo === 'nivel' ? (a.nivel ?? 0) - (b.nivel ?? 0) : 0) || a.p.especie_id - b.p.especie_id || a.p.id - b.p.id);
    return { titulo, lista, nivel: metodo === 'nivel' };
  }).filter(g => g.lista.length);
  const total = new Set(aprenden.map(a => a.id)).size;

  const grupo = g => {
    const caja = el('div', { class: 'aprenden' });
    const pintar = todos => poner(caja,
      (todos ? g.lista : g.lista.slice(0, MAX_APRENDEN)).map(a => el('a', { href: `#/pokemon/${a.p.id}`, class: 'aprende', title: nombre(a.p) },
        sprite(a.p.id, { tam: 32, alt: '' }), el('span', {}, nombre(a.p)), g.nivel && a.nivel ? el('small', { class: 'tenue' }, `Nv. ${a.nivel}`) : null)),
      !todos && g.lista.length > MAX_APRENDEN && el('button', { class: 'btn-sec-mini', type: 'button', onclick: () => pintar(true) }, `Ver los ${g.lista.length}`));
    pintar(false);
    return [el('small', { class: 'grupo-aprende' }, `${g.titulo} · ${g.lista.length}`), caja];
  };

  return el('section', { class: 'tarjeta' }, el('b', {}, 'Quién lo aprende'),
    grupos.length
      ? [el('p', { class: 'nota' }, `${total} Pokémon (y formas) lo aprenden en algún juego.`), grupos.map(grupo)]
      : el('p', { class: 'tenue' }, 'Ningún Pokémon lo aprende.'));
}
