// Pantalla Novedades: qué trae cada versión de Poketon (los datos están en js/novedades.js).

import { el, poner } from '../ui.js';
import { NOVEDADES, fechaCorta } from '../novedades.js';
import { VERSION } from '../version.js';

export function vistaNovedades(raiz) {
  try { localStorage.setItem('version-vista', VERSION); } catch { /* sin almacenamiento */ }
  poner(raiz,
    el('h1', {}, 'Novedades'),
    NOVEDADES.map(v => el('section', { class: `tarjeta novedad ${v.version === VERSION ? 'actual' : ''}` },
      el('div', { class: 'novedad-cab' }, el('b', {}, `Versión ${v.version}`),
        v.version === VERSION && el('span', { class: 'etiqueta' }, 'La tuya'),
        el('small', { class: 'tenue' }, fechaCorta(v.fecha))),
      el('ul', {}, v.cambios.map(c => el('li', {}, c))))));
}

/** Tras actualizarse (o la primera vez que se abre una versión nueva): un aviso con enlace a las novedades. */
export function avisoNovedades(aviso) {
  let vista = null;
  try { vista = localStorage.getItem('version-vista'); localStorage.setItem('version-vista', VERSION); } catch { return; }
  // La primera vez que se abre Poketon en este navegador no se avisa: todo es nuevo
  if (vista && vista !== VERSION && NOVEDADES.some(v => v.version === VERSION)) {
    aviso(`Poketon ${VERSION}: mira lo nuevo`, 'ok', { enlace: ['#/novedades', 'Novedades'], ms: 8000 });
  }
}
