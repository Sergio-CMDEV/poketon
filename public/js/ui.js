// Pequeñas utilidades para crear la interfaz.

import { COLOR_TIPO, nombreTipo, urlsSprite } from './datos.js';
import { WEB } from './api.js';

/** Crea un elemento: el('button', { class: 'x', onclick: fn }, 'texto', otroElemento) */
export function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // setProperty también sirve para variables CSS (--c), que Object.assign ignoraría
      for (const [prop, val] of Object.entries(v)) e.style.setProperty(prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), val);
    }
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat(Infinity)) if (h !== null && h !== undefined && h !== false) e.append(h.nodeType ? h : String(h));
  return e;
}

export function chip(tipo) {
  return el('span', { class: 'chip', style: { '--c': COLOR_TIPO[tipo] || '#777' } }, nombreTipo(tipo));
}

/** Imagen del sprite; si una URL falla prueba la siguiente. */
export function sprite(id, { shiny = false, tam = 96, alt = '' } = {}) {
  const urls = urlsSprite(id, shiny);
  let i = 0;
  const img = el('img', { class: 'sprite', alt, width: tam, height: tam, loading: 'lazy' });
  img.onerror = () => { if (++i < urls.length) img.src = urls[i]; else img.replaceWith(el('span', { class: 'sprite vacio', style: { width: `${tam}px`, height: `${tam}px` } }, '?')); };
  img.src = urls[0];
  return img;
}

/* ---------- Iconos de objetos ---------- */
// 1) Hoja de iconos de Pokémon Showdown (la descarga import.php en img/objetos.png; si no está, se usa la de su web).
//    En la app de escritorio se pide al servidor (WEB): dentro del .exe no va, y la web de Showdown no la sirve a otras apps.
//    Cada icono mide 24 px y hay 16 por fila; `icono` es su posición en la hoja.
// 2) Si el objeto no está en Showdown, el de PokéSprite (hasta la Gen 8). 3) El de PokeAPI. 4) Si no hay ninguno, un círculo.
const HOJA_REMOTA = 'https://play.pokemonshowdown.com/sprites/itemicons-sheet.png';
let hoja = `${WEB}img/objetos.png`;
const prueba = new Image();
prueba.onerror = () => {
  hoja = HOJA_REMOTA;
  document.querySelectorAll('.icono-hoja').forEach(e => { e.style.backgroundImage = `url("${hoja}")`; });
};
prueba.src = hoja;

/** Icono de un objeto del catálogo ({ nombre, identificador, icono }). */
export function iconoObjeto(o, tam = 24) {
  if (!o) return iconoVacio(tam);
  if (o.icono !== null && o.icono !== undefined) {
    const k = tam / 24;
    return el('span', { class: 'icono-objeto icono-hoja', role: 'img', 'aria-label': o.nombre, title: o.nombre, style: {
      width: `${tam}px`, height: `${tam}px`, backgroundImage: `url("${hoja}")`, backgroundSize: `${16 * 24 * k}px auto`,
      backgroundPosition: `-${(o.icono % 16) * 24 * k}px -${Math.floor(o.icono / 16) * 24 * k}px` } });
  }
  const pokeapi = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${id}.png`;
  const local = claveJuego(o.nombre_en);
  const urls = [
    o.imagen && `https://raw.githubusercontent.com/msikma/pokesprite/master/items/${o.imagen}.png`,
    o.identificador && pokeapi(o.identificador),
    o.identificador?.includes('--') && pokeapi(o.identificador.split('--')[0]),   // "ss-ticket--letsgo" → "ss-ticket"
    iconosLocales.has(local) && `${WEB}anil/objetos/${local}.png`,
  ].filter(Boolean);
  return urls.length ? iconoImagen(urls, o.nombre, tam) : iconoVacio(tam);
}

// Iconos de objetos copiados del juego instalado (los genera scripts/anil.mjs en public/anil/objetos/).
// Sirven para los pocos objetos de Escarlata/Púrpura que no tienen icono en ninguna web (Mochis, Cordón Unión…).
let iconosLocales = new Set();
export const usarIconosLocales = lista => { iconosLocales = new Set(lista); };
/** "Health Mochi" → "HEALTHMOCHI" (así se llaman en los juegos hechos con Pokémon Essentials). */
const claveJuego = n => (n || '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** Icono a partir de una URL o de varias (si una falla prueba la siguiente; si fallan todas, un círculo). */
export function iconoImagen(urls, alt = '', tam = 24) {
  const lista = [].concat(urls);
  let i = 0;
  const img = el('img', { class: 'icono-objeto', alt, title: alt, width: tam, height: tam, loading: 'lazy', src: lista[0] });
  img.onerror = () => { if (++i < lista.length) img.src = lista[i]; else img.replaceWith(iconoVacio(tam, alt)); };
  return img;
}

const iconoVacio = (tam, titulo = '') => el('span', { class: 'icono-vacio', title: titulo, style: { width: `${tam}px`, height: `${tam}px` } });

/* ---------- Botón con menú desplegable ---------- */
// Como "Guardar" en Pinterest: al pulsarlo sale la lista de sitios donde guardar.
// opciones() → [{ texto, detalle?, portada?, desactivada?, accion }] (puede ser async, p. ej. si pide los equipos a la API)
// portada: lista de nodos (p. ej. sprites del equipo) que se ven en un cuadrado 2×2, como las portadas de los tableros

export function botonMenu(texto, titulo, opciones, attrs = {}) {
  const menu = el('div', { class: 'menu', role: 'menu', hidden: true });
  const boton = el('button', { ...attrs, type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => (menu.hidden ? abrir() : cerrar()) },
    texto, el('span', { class: 'flecha', 'aria-hidden': 'true' }, '▾'));
  const caja = el('div', { class: 'con-menu' }, boton, menu);
  const fuera = e => { if (!caja.contains(e.target)) cerrar(); };
  const tecla = e => { if (e.key === 'Escape') { cerrar(); boton.focus(); } };

  async function abrir() {
    menu.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    poner(menu, el('p', { class: 'menu-titulo' }, titulo), el('p', { class: 'nota' }, 'Cargando…'));
    try {
      const lista = await opciones();
      poner(menu, el('p', { class: 'menu-titulo' }, titulo), lista.map(o => o.seccion ? el('p', { class: 'menu-seccion' }, o.seccion)
        : o.nota ? el('p', { class: 'nota menu-nota' }, o.nota) : el('button', { type: 'button', role: 'menuitem', class: 'menu-opcion', disabled: !!o.desactivada,
        onclick: async () => {
          cerrar();
          try { await o.accion(); } catch (e) { aviso(e.message, 'error'); }
        } }, o.portada && el('span', { class: 'portada' }, o.portada.slice(0, 4)), el('span', { class: 'menu-texto' }, o.texto), o.detalle && el('small', {}, o.detalle))));
      menu.querySelector('.menu-opcion:not(:disabled)')?.focus();
    } catch (e) { poner(menu, el('p', { class: 'msg error' }, e.message)); }
  }
  function cerrar() {
    menu.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', fuera);
    document.removeEventListener('keydown', tecla);
  }
  return caja;
}

let temporizador;
/** Aviso breve en la parte de abajo. */
export function aviso(texto, tipo = 'ok') {
  const t = document.getElementById('aviso');
  t.textContent = texto;
  t.className = `toast ${tipo}`;
  t.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { t.hidden = true; }, 3500);
}

/** Campo con etiqueta en mayúsculas pequeñas (JUEGO, POKÉMON, NOMBRE…). */
export function campo(etiqueta, control, extra = null) {
  return el('label', { class: 'campo' }, el('span', { class: 'lbl' }, etiqueta), control, extra);
}

/** Campo de formulario de cuenta (etiqueta en negrita encima). */
export function campoForm(etiqueta, control, extra = null) {
  return el('label', { class: 'campo-form' }, el('span', {}, etiqueta), control, extra);
}

/** Selector de generación / juego. Los valores son números (1-9) o 'anil'. */
export function selectorGen(gen, generaciones, onchange, attrs = {}) {
  return el('select', { ...attrs, onchange: e => onchange(isNaN(e.target.value) ? e.target.value : +e.target.value) },
    generaciones.map(([g, txt]) => el('option', { value: g, selected: g === gen }, txt)));
}

/* ---------- Tema claro / oscuro ---------- */
// Claro por defecto (el del canvas). La elección se guarda en el navegador; index.html la aplica al cargar.

export function botonTema() {
  const oscuro = document.documentElement.dataset.tema === 'oscuro';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.innerHTML = oscuro   // en oscuro se ofrece el sol (pasar a claro); en claro, la luna
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
    : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  return el('button', { class: 'tema', type: 'button', 'aria-label': oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
    title: oscuro ? 'Modo claro' : 'Modo oscuro', onclick: e => {
      const nuevo = oscuro ? 'claro' : 'oscuro';
      try { localStorage.setItem('tema', nuevo); } catch { /* sin almacenamiento: solo esta vez */ }
      document.documentElement.dataset.tema = nuevo;
      e.currentTarget.replaceWith(botonTema());
    } }, svg);
}

/* ---------- Sprites de Pokémon Añil ---------- */
// Son tiras PNG con todos los fotogramas en horizontal; se animan moviendo el fondo a saltos (steps).

export function spriteTira(url, { tam = 96, alt = '', ms = 60 } = {}) {
  const caja = el('span', { class: 'sprite tira', role: 'img', 'aria-label': alt, style: { width: `${tam}px`, height: `${tam}px` } });
  if (!url) { caja.classList.add('vacio'); caja.textContent = '?'; return caja; }
  const img = new Image();
  img.onload = () => {
    const fotogramas = Math.max(1, Math.round(img.naturalWidth / img.naturalHeight));
    caja.style.backgroundImage = `url("${url}")`;
    caja.style.backgroundSize = `${fotogramas * tam}px ${tam}px`;
    if (fotogramas > 1 && ms > 0) {
      caja.animate([{ backgroundPositionX: '0px' }, { backgroundPositionX: `-${fotogramas * tam}px` }],
        { duration: fotogramas * ms, iterations: Infinity, easing: `steps(${fotogramas})` });
    }
  };
  img.onerror = () => { caja.classList.add('vacio'); caja.textContent = '?'; };
  img.src = url;
  return caja;
}

/** Icono de Google (trazo simple, sin logotipo). */
export function iconoGoogle() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  return svg;
}

/** Como replaceChildren pero ignorando los huecos (null/false), que si no se pintarían como texto "null". */
export function poner(nodo, ...hijos) {
  // flat(Infinity): las listas pueden venir anidadas (p. ej. [cabecera, [habilidad, habilidad]])
  nodo.replaceChildren(...hijos.flat(Infinity).filter(h => h !== null && h !== undefined && h !== false));
}
