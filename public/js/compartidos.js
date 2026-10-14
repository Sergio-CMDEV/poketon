// Equipos compartidos en el chat: tarjeta con los 6 titulares y ventana "Ver" (el equipo en texto de Showdown).
// Son copias: si el dueño cambia su equipo, la copia no cambia.

import { el, aviso, ventana } from './ui.js';
import { datosMiembro } from './miembro.js';
import { exportar } from './showdown.js';
import { guardarCopia, copiar } from './online.js';

const resumenEquipo = eq => {
  const titulares = eq.miembros.filter(m => m.posicion <= 6).length;
  const reservas = eq.miembros.length - titulares;
  return `Gen ${eq.generacion} · ${titulares}${reservas ? ` + ${reservas} reserva${reservas > 1 ? 's' : ''}` : ''}${eq.randomlocke ? ' · Randomlocke' : ''}`;
};

function huecos(eq, tam = 44) {
  return el('div', { class: 'huecos' }, [1, 2, 3, 4, 5, 6].map(pos => {
    const m = eq.miembros.find(x => x.posicion === pos);
    const d = m && datosMiembro(m, eq.generacion);
    return el('span', { class: 'hueco', title: d ? d.nombre : 'Vacío' }, d && d.sprite(tam, d.nombre));
  }));
}

async function guardar(eq, boton) {
  boton.disabled = true;
  try { await guardarCopia(eq); boton.textContent = 'Guardado ✓'; }
  catch (e) { aviso(e.message, 'error'); boton.disabled = false; }
}

/** Tarjeta de un equipo compartido (en una burbuja del chat o en el perfil de un amigo). */
export function tarjetaCompartido(eq, { mio = false, etiqueta = 'Equipo compartido', detalle = '' } = {}) {
  const btnGuardar = !mio && el('button', { class: 'btn-guardar', type: 'button', onclick: e => guardar(eq, e.currentTarget) }, 'Guardar en mis equipos');
  return el('article', { class: 'compartido' },
    etiqueta && el('span', { class: 'lbl' }, etiqueta),
    el('div', { class: 'equipo-cab' }, el('b', {}, eq.nombre), el('span', {}, resumenEquipo(eq) + (detalle ? ` · ${detalle}` : ''))),
    huecos(eq),
    el('div', { class: 'acciones-compartido' },
      el('button', { class: 'btn-contorno', type: 'button', onclick: () => verEquipo(eq, { mio }) }, 'Ver'),
      btnGuardar));
}

/** Ventana con el equipo completo en texto de Showdown (objetos, habilidades, EVs, movimientos…). */
export function verEquipo(eq, { mio = false } = {}) {
  const texto = exportar(eq);
  ventana(() => [
    el('p', { class: 'sub' }, resumenEquipo(eq) + (mio ? ' · lo compartiste tú' : '')),
    huecos(eq, 52),
    el('textarea', { class: 'texto-showdown', rows: 12, readOnly: true, spellcheck: false, 'aria-label': 'Equipo en texto de Showdown' }, texto),
    el('div', { class: 'dos-botones' },
      el('button', { class: 'btn sec', type: 'button', onclick: () => copiar(texto, 'Texto copiado') }, 'Copiar para Showdown'),
      !mio && el('button', { class: 'btn', type: 'button', onclick: e => guardar(eq, e.currentTarget) }, 'Guardar en mis equipos')),
  ], { titulo: eq.nombre, hoja: true });
}
