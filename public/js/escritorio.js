// Funciones solo de la app de escritorio (Tauri). En la web no hacen nada.
// window.__TAURI__ existe porque tauri.conf.json tiene "withGlobalTauri": true.

import { el, aviso } from './ui.js';

const tauri = () => window.__TAURI__;

/* ---------- Siempre encima ---------- */
// Para tener Poketon delante del juego mientras se juega. La elección se guarda y se aplica al abrir.

const leer = () => { try { return localStorage.getItem('encima') === '1'; } catch { return false; } };

export async function aplicarEncima() {
  if (leer()) await tauri()?.window?.getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
}

export function botonEncima() {
  const ventana = tauri()?.window?.getCurrentWindow();
  if (!ventana) return null;
  const on = leer();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', on ? 'currentColor' : 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 16v5"/>';   // chincheta
  return el('button', { class: `tema encima ${on ? 'on' : ''}`, type: 'button', 'aria-pressed': String(on),
    'aria-label': 'Siempre encima', title: on ? 'Siempre encima: activado' : 'Siempre encima', onclick: async e => {
      const boton = e.currentTarget;
      try {
        await ventana.setAlwaysOnTop(!on);
        try { localStorage.setItem('encima', on ? '0' : '1'); } catch { /* solo esta vez */ }
        aviso(on ? 'Ya no está siempre encima' : 'Poketon se queda encima de las demás ventanas');
        boton.replaceWith(botonEncima());
      } catch (err) { aviso(String(err?.message ?? err), 'error'); }
    } }, svg);
}

/* ---------- Actualización automática ---------- */
// Al abrir, pregunta a GitHub Releases si hay versión nueva (tauri-plugin-updater, ver tauri.conf.json).
// Si la hay, sale un aviso con "Actualizar": descarga el instalador firmado, Windows cierra la app y lo instala.

export async function comprobarActualizacion() {
  const updater = tauri()?.updater;
  if (!updater) return;
  let nueva;
  try { nueva = await updater.check(); } catch { return; }   // sin internet o sin versiones publicadas: nada
  if (!nueva) return;
  const boton = el('button', { class: 'btn mini', type: 'button', onclick: async () => {
    boton.disabled = true;
    let total = 0, bajado = 0;
    try {
      await nueva.downloadAndInstall(ev => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
        if (ev.event === 'Progress') { bajado += ev.data.chunkLength; boton.textContent = total ? `${Math.round((bajado / total) * 100)} %` : 'Descargando…'; }
        if (ev.event === 'Finished') boton.textContent = 'Instalando…';
      });
    } catch (e) { aviso(`No se pudo actualizar: ${e?.message ?? e}`, 'error'); boton.disabled = false; boton.textContent = 'Actualizar'; }
  } }, 'Actualizar');
  document.body.append(el('div', { class: 'actualizacion', role: 'status' },
    el('span', {}, `Poketon ${nueva.version} disponible`), boton,
    el('button', { class: 'cerrar', type: 'button', 'aria-label': 'Más tarde', onclick: e => e.currentTarget.parentElement.remove() }, '×')));
}
