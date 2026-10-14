// Pantalla 5 · Mis equipos: lista de equipos guardados (máx. 8) y tabla de cobertura con selector de equipo.

import { sesion } from '../api.js';
import { pokemon, nombre } from '../datos.js';
import { el, sprite, aviso, poner } from '../ui.js';
import { misEquipos, borrador, guardarBorrador, borrarEquipo, equipoVacio } from '../equipos.js';
import { tablaCobertura } from '../cobertura.js';
import { datosMiembro } from '../miembro.js';

const MAX = 8;

export async function vistaEquipos(raiz) {
  // Sin cuenta: el equipo que se esté montando vive en este navegador
  if (!sesion()) {
    const b = borrador();
    const equipos = b.miembros.length ? [{ ...b, nombre: b.nombre || 'Equipo sin guardar' }] : [];
    poner(raiz,
      cabecera(equipos.length, false),
      el('p', { class: 'msg info' }, 'Sin cuenta, el equipo se guarda solo en este navegador. ', el('a', { href: '#/login' }, 'Entra'), ' para guardar hasta 8 equipos.'),
      el('div', { class: 'lista-equipos' }, equipos.map(eq => tarjetaEquipo(eq, raiz, false))),
      equipos.length > 0 && cobertura(equipos));
    return;
  }

  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));
  let equipos;
  try { equipos = await misEquipos(); } catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); return; }

  poner(raiz,
    cabecera(equipos.length, true),
    equipos.length === 0 && el('p', { class: 'centro' }, 'Todavía no tienes equipos guardados.'),
    el('div', { class: 'lista-equipos' }, equipos.map(eq => tarjetaEquipo(eq, raiz, true))),
    equipos.length > 0 && cobertura(equipos));
}

function cabecera(n, conCuenta) {
  const nuevo = () => { guardarBorrador(equipoVacio()); location.hash = '#/editor'; };
  return [
    el('div', { class: 'fila-base' }, el('h1', {}, 'Mis equipos'), conCuenta && el('span', { class: 'tenue' }, `${n} de ${MAX}`)),
    el('div', { class: 'dos-botones' },
      el('button', { class: 'btn', onclick: nuevo, disabled: conCuenta && n >= MAX }, '+ Nuevo equipo'),
      el('a', { class: 'btn sec', href: '#/showdown/importar' }, 'Importar de Showdown')),
  ];
}

function tarjetaEquipo(eq, raiz, conCuenta) {
  const titulares = eq.miembros.filter(m => m.posicion <= 6);
  const reservas = eq.miembros.length - titulares.length;
  const huecos = [1, 2, 3, 4, 5, 6].map(pos => {
    const m = eq.miembros.find(x => x.posicion === pos);
    const d = m && datosMiembro(m, eq.generacion);
    return el('span', { class: 'hueco', title: d ? d.nombre : 'Vacío' }, d && d.sprite(56, d.nombre));
  });

  const abrir = destino => () => { guardarBorrador(eq); location.hash = destino; };
  let confirmando = false;
  const btnBorrar = conCuenta && el('button', { class: 'enlace borrar', onclick: async () => {
    if (!confirmando) { confirmando = true; btnBorrar.textContent = '¿Seguro? Pulsa otra vez'; return; }
    try { await borrarEquipo(eq.id); aviso('Equipo eliminado'); vistaEquipos(raiz); } catch (e) { aviso(e.message, 'error'); }
  } }, 'Eliminar');

  return el('article', { class: 'equipo' },
    el('div', { class: 'equipo-cab' }, el('b', {}, eq.nombre),
      el('span', {}, `Gen ${eq.generacion} · ${titulares.length}${reservas ? ` + ${reservas} reserva${reservas > 1 ? 's' : ''}` : ''}${eq.randomlocke ? ' · Randomlocke' : ''}`)),
    el('div', { class: 'huecos' }, huecos),
    el('div', { class: 'acciones-texto' },
      el('button', { class: 'enlace', onclick: abrir('#/editor') }, 'Editar'),
      el('button', { class: 'enlace', onclick: abrir('#/showdown/exportar') }, 'Exportar'),
      btnBorrar));
}

/** Tarjeta "Cobertura defensiva" con un desplegable para elegir qué equipo analizar. */
function cobertura(equipos) {
  const contenido = el('div', { style: { display: 'contents' } });
  const pintar = i => poner(contenido, tablaCobertura(equipos[i].miembros.filter(m => m.posicion <= 6), equipos[i].generacion));
  const selector = el('select', { onchange: e => pintar(+e.target.value) }, equipos.map((eq, i) => el('option', { value: i }, eq.nombre)));
  pintar(0);
  return el('section', { class: 'tarjeta cob' },
    el('div', { class: 'cobertura-cab' }, el('b', {}, 'Cobertura defensiva'), el('label', {}, 'Equipo', selector)),
    contenido);
}
