// Funciones solo de la app de escritorio (Tauri). En la web no hacen nada.
// window.__TAURI__ existe porque tauri.conf.json tiene "withGlobalTauri": true.

import { el, aviso } from './ui.js';
import { VERSION } from './version.js';

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

/* ---------- Versión y actualización automática ---------- */
// Al abrir, pregunta a GitHub Releases si hay versión nueva (tauri-plugin-updater, ver tauri.conf.json).
// Si la hay, sale un aviso con "Actualizar": descarga el instalador firmado, Windows cierra la app y lo instala.
// En "Mi cuenta" y en "Iniciar sesión" se ve la versión y, en la app, un botón para buscar a mano (dice qué pasa).

/** Versión de verdad de la app instalada (la del .exe); en la web, la de version.js. */
export async function versionApp() {
  try { return (await tauri()?.app?.getVersion()) || VERSION; } catch { return VERSION; }
}

/**
 * Pregunta si hay versión nueva. Al abrir la app (manual = false) no dice nada si no la hay o si falla;
 * con el botón (manual = true) avisa siempre: "ya tienes la última", o el error.
 */
export async function comprobarActualizacion(manual = false) {
  const updater = tauri()?.updater;
  if (!updater) { if (manual) aviso('Esta versión de la app no puede buscar actualizaciones', 'error'); return; }
  let nueva;
  try { nueva = await updater.check(); }
  catch (e) {
    console.error('Actualización:', e);
    if (manual) aviso(`No se pudo comprobar: ${e?.message ?? e}`, 'error');
    return;
  }
  if (!nueva) { if (manual) aviso(`Ya tienes la última versión (${await versionApp()})`); return; }
  document.querySelector('.actualizacion')?.remove();   // no dos avisos
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

/** "Poketon 1.0.1 · App de escritorio [Buscar actualizaciones]" (en la web, solo el texto). */
export function infoVersion() {
  const texto = el('span', {}, `Poketon ${VERSION}${tauri() ? ' · App de escritorio' : ''}`);
  versionApp().then(v => { texto.textContent = `Poketon ${v}${tauri() ? ' · App de escritorio' : ''}`; });
  return el('p', { class: 'version-app' }, texto,
    tauri()?.updater && el('button', { class: 'enlace-btn', type: 'button', onclick: async e => {
      const b = e.currentTarget;
      b.disabled = true; b.textContent = 'Buscando…';
      try { await comprobarActualizacion(true); } finally { b.disabled = false; b.textContent = 'Buscar actualizaciones'; }
    } }, 'Buscar actualizaciones'));
}
