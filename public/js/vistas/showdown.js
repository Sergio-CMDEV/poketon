// Pantalla 7 · Texto de Showdown: importar un equipo pegando el texto, o exportar el del editor.

import { el, aviso, poner } from '../ui.js';
import { importar, exportar } from '../showdown.js';
import { borrador, guardarBorrador, equipoVacio } from '../equipos.js';

export function vistaShowdown(raiz, modo = 'importar') {
  const importando = modo === 'importar';
  const eq = borrador();
  const area = el('textarea', { class: 'texto-showdown', rows: 16, spellcheck: false, 'aria-label': 'Texto de Showdown',
    placeholder: 'Gyarados @ Leftovers\nAbility: Intimidate\nTera Type: Steel\nEVs: 252 HP / 4 Atk / 252 Spe\nJolly Nature\n- Waterfall\n- Dragon Dance' });
  const avisos = el('div', { style: { display: 'contents' } });

  if (!importando) { area.value = eq.miembros.length ? exportar(eq) : ''; area.readOnly = true; }

  const segmento = (id, txt) => el('button', { role: 'tab', 'aria-selected': String(modo === id), onclick: () => { location.hash = `#/showdown/${id}`; } }, txt);

  const alImportar = async (usarSugerencias = false) => {
    const { miembros, avisos: lista, sugerencias, cambiados } = await importar(area.value, { usarSugerencias });
    poner(avisos, lista.map(a => el('p', { class: 'msg aviso' }, a)));
    if (!miembros.length) { aviso('No se reconoció ningún Pokémon', 'error'); return; }
    guardarBorrador({ ...equipoVacio(), miembros });
    aviso(`${miembros.length} Pokémon importados` + (cambiados ? ` · ${cambiados} nombres pasados al oficial` : ''));
    if (!lista.length) { location.hash = '#/editor'; return; }
    if (sugerencias) avisos.append(el('p', { class: 'nota' }, 'Los nombres tienen que ser los de Showdown (en inglés) o los oficiales en español. Revisa las sugerencias antes de usarlas: algunas pueden no ser lo que querías.'));
    avisos.append(el('div', { class: 'dos-botones' },
      sugerencias > 0 && el('button', { class: 'btn sec', onclick: () => alImportar(true) }, `Usar las ${sugerencias} sugerencias`),
      el('a', { class: 'btn sec', href: '#/editor' }, 'Abrir en el editor')));
  };

  const copiar = async () => {
    if (!area.value.trim()) { aviso('No hay texto que copiar', 'error'); return; }
    try { await navigator.clipboard.writeText(area.value); aviso('Texto copiado'); }
    catch { area.select(); aviso('Pulsa Ctrl+C para copiar'); }
  };

  poner(raiz,
    el('h1', {}, 'Texto de Showdown'),
    el('nav', { class: 'segmentos', role: 'tablist' }, segmento('importar', 'Importar'), segmento('exportar', 'Exportar')),
    el('label', { class: 'campo-form' },
      el('span', { class: 'suave' }, importando ? 'Pega aquí el equipo exportado desde Pokémon Showdown (en inglés o con los nombres oficiales en español)'
        : eq.miembros.length ? `${eq.nombre || 'Equipo sin nombre'} · cópialo y pégalo en Showdown` : 'El editor no tiene ningún equipo'),
      area),
    avisos,
    el('div', { class: 'dos-botones' },
      el('button', { class: 'btn', onclick: () => alImportar(), disabled: !importando }, 'Importar al editor'),
      el('button', { class: 'btn sec', onclick: copiar }, 'Copiar texto')),
  );
}
