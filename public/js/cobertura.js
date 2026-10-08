// Tabla de cobertura defensiva de un equipo: qué le pega cada tipo atacante a cada miembro,
// con el total de débiles y de resistentes por tipo. Se usa en "Mis equipos" y en el editor.

import { tablaTipos, multiplicador, tiposEn, pokemon } from './datos.js';
import { el, chip, sprite } from './ui.js';

const TEXTO = { 4: '×4', 2: '×2', 0.5: '½', 0.25: '¼' };

/** miembros: titulares [{ pokemon_id, shiny }]. Devuelve la tabla y la frase del punto débil. */
export function tablaCobertura(miembros, gen) {
  const tabla = tablaTipos(gen);
  // Columnas en el orden de los huecos (al mover un Pokémon de sitio cambia su posición, no su lugar en la lista)
  const equipo = miembros.slice().sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0))
    .map(m => ({ p: pokemon(m.pokemon_id), shiny: m.shiny })).filter(x => x.p);
  if (!equipo.length) return [el('p', { class: 'nota' }, 'Añade Pokémon para ver la cobertura del equipo.')];

  const rejilla = el('div', { class: 'cobertura', style: { gridTemplateColumns: `70px repeat(${equipo.length}, minmax(0, 1fr)) 44px 44px` } });
  rejilla.append(el('span', { class: 'cab esquina' }, 'ATAQUE ↓'));
  for (const { p, shiny } of equipo) {
    rejilla.append(el('span', { class: 'cab miembro', title: p.nombre }, sprite(p.id, { tam: 26, shiny, alt: '' }), el('small', {}, p.nombre)));
  }
  rejilla.append(el('span', { class: 'cab t-mal' }, 'Débil'), el('span', { class: 'cab t-bien' }, 'Resiste'));

  let peor = { n: 0, tipo: '' };
  for (const t of tabla.tipos) {
    let debiles = 0, resisten = 0;
    rejilla.append(el('span', { class: 'fila-tipo' }, chip(t.clave)));
    for (const { p } of equipo) {
      const m = multiplicador(tabla, t.clave, tiposEn(p, gen));
      if (m > 1) debiles++;
      if (m < 1) resisten++;
      if (m === 0) rejilla.append(el('span', { class: 'celda inmune' }, 'Inmune'));
      else rejilla.append(el('span', { class: `celda ${m >= 4 ? 'muy-mal' : m > 1 ? 'mal' : m < 1 ? 'bien' : ''}` }, TEXTO[m] ?? ''));
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
  ];
}
