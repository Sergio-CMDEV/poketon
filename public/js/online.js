// Online: número rojo de "Amigos" (la web pregunta cada 30 s), limpieza al cambiar de pantalla y utilidades comunes
// de las pantallas de amigos y chat.

import { peticion, sesion, esEscritorio, WEB } from './api.js';
import { el, aviso } from './ui.js';
import { misEquipos } from './equipos.js';

/* ---------- Sondeo: mensajes sin leer + solicitudes recibidas ---------- */

export const resumen = { sin_leer: 0, solicitudes: 0 };
const CADA = 30_000;
let temporizador = null;

export async function actualizarResumen() {
  if (!sesion()) { Object.assign(resumen, { sin_leer: 0, solicitudes: 0 }); pintarInsignia(); return; }
  try {
    const r = await peticion('mensajes.php?resumen');
    const cambio = r.sin_leer !== resumen.sin_leer || r.solicitudes !== resumen.solicitudes;
    Object.assign(resumen, r);
    pintarInsignia();
    if (cambio) window.dispatchEvent(new Event('resumen'));   // la pantalla de Amigos se recarga
  } catch { /* sin conexión: se vuelve a intentar en el siguiente turno */ }
}

/** Arranca (o reinicia, al entrar o salir) el sondeo. Con la pestaña oculta no pregunta. */
export function iniciarSondeo() {
  clearInterval(temporizador);
  actualizarResumen();
  if (sesion()) temporizador = setInterval(() => { if (!document.hidden) actualizarResumen(); }, CADA);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && sesion()) actualizarResumen(); });

export const totalAvisos = () => resumen.sin_leer + resumen.solicitudes;
export const insignia = n => el('span', { class: 'insignia', title: `${n} sin ver` }, n > 99 ? '99+' : String(n));

/** El número junto a "Amigos" y en el título de la pestaña: "(2) Poketon". */
export function pintarInsignia() {
  const n = totalAvisos();
  document.querySelectorAll('.nav a[href="#/amigos"]').forEach(a => {
    a.querySelector('.insignia')?.remove();
    if (n) a.append(insignia(n));
  });
  document.title = n ? `(${n}) Poketon` : 'Poketon';
}

/* ---------- Limpieza al salir de una pantalla (el sondeo del chat, oyentes…) ---------- */

let limpiezas = [];
let turno = 0;
export const alSalirDeVista = fn => { limpiezas.push(fn); };
/** Cambia en cada navegación: una pantalla que acaba de cargar comprueba que sigue siendo la actual. */
export const turnoVista = () => turno;
export function salirDeVista() {
  turno++;
  const l = limpiezas;
  limpiezas = [];
  for (const fn of l) { try { fn(); } catch { /* nada */ } }
}

/* ---------- Formatos ---------- */

export const formatoCodigo = c => (c ? `PKT-${c.slice(0, 4)}-${c.slice(4)}` : '');
export const enlaceAmigo = c => `${esEscritorio ? WEB : location.origin + location.pathname}#/amigo/${formatoCodigo(c)}`;

/** "En línea", "Hace 5 min", "Hace 3 h", "Ayer", "Hace 4 días" o "" si no lo enseña. */
export function estadoConexion(u) {
  if (u.en_linea) return 'En línea';
  if (u.hace === null || u.hace === undefined) return '';
  const min = Math.floor(u.hace / 60);
  if (min < 60) return `Hace ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Ayer' : `Hace ${d} días`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const inicioDia = f => new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
const diasHasta = seg => Math.round((inicioDia(new Date()) - inicioDia(new Date(seg * 1000))) / 864e5);

export const hora = seg => new Date(seg * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Para la lista de amigos: 18:05 · Ayer · lun · 3 oct */
export function horaCorta(seg) {
  const d = diasHasta(seg);
  if (d === 0) return hora(seg);
  if (d === 1) return 'Ayer';
  if (d < 7) return new Date(seg * 1000).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
  const f = new Date(seg * 1000);
  return `${f.getDate()} ${MESES[f.getMonth()]}`;
}

/** Separadores del chat: Hoy · Ayer · 3 de octubre */
export function dia(seg) {
  const d = diasHasta(seg);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  const f = new Date(seg * 1000);
  return f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', ...(f.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

/** "hace 5 min" para las solicitudes. */
export function haceTexto(seg) {
  const min = Math.floor((Date.now() / 1000 - seg) / 60);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
  return dia(seg) === 'Ayer' ? 'ayer' : `el ${dia(seg)}`;
}

/* ---------- Acciones comunes ---------- */

export async function copiar(texto, mensaje = 'Copiado') {
  try { await navigator.clipboard.writeText(texto); aviso(mensaje); }
  catch { aviso('No se pudo copiar. Cópialo a mano: ' + texto, 'error'); }
}

/** Compartir el enlace de amigo: en el móvil, el menú del sistema; si no, se copia. */
export async function compartirEnlace(codigo) {
  const url = enlaceAmigo(codigo);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Poketon', text: 'Añádeme como amigo en Poketon', url }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  copiar(url, 'Enlace copiado');
}

/** Guarda una copia de un equipo compartido en mis equipos. Si ya hay uno con ese nombre: "Nombre (2)". */
export async function guardarCopia(equipo) {
  const mios = await misEquipos();
  if (mios.length >= 8) throw new Error('Ya tienes 8 equipos. Borra uno para guardar este');
  const usados = new Set(mios.map(e => e.nombre));
  let nombre = equipo.nombre.slice(0, 40);
  for (let n = 2; usados.has(nombre); n++) nombre = `${equipo.nombre.slice(0, 40 - ` (${n})`.length)} (${n})`;
  await peticion('equipos.php', { method: 'POST', body: { nombre, generacion: equipo.generacion, miembros: equipo.miembros } });
  aviso(`Guardado en tus equipos como "${nombre}"`);
}
