// Pantallas 10b y 10c · Chat con un amigo y "Compartir un equipo".
// Los mensajes nuevos llegan preguntando cada 3 s (sondeo) mientras el chat está abierto y la pestaña visible.

import { peticion, sesion } from '../api.js';
import { el, poner, aviso, avatarUsuario, botonMenu, confirmar, ventana } from '../ui.js';
import { actualizarResumen, alSalirDeVista, turnoVista, estadoConexion, hora, dia } from '../online.js';
import { tarjetaCompartido } from '../compartidos.js';
import { misEquipos } from '../equipos.js';
import { datosMiembro } from '../miembro.js';

const CADA = 3000;

export async function vistaChat(raiz, usuario) {
  if (!sesion()) { location.hash = '#/login'; return; }
  const cabecera = document.getElementById('cabecera-extra');
  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));

  const mensajes = new Map();   // id → mensaje (así no se repite si llega por el sondeo y por el envío)
  const burbujas = new Map();   // id → nodo ya pintado
  let amigo, visto = 0, puede = false, hayMas = false;
  let activo = true, temporizador = null;
  const ultimoId = () => Math.max(0, ...mensajes.keys());
  const primerId = () => Math.min(...mensajes.keys());

  const lista = el('div', { class: 'mensajes', role: 'log', 'aria-label': 'Mensajes' });
  const anteriores = el('button', { class: 'btn-sec-mini mas-antiguos', type: 'button', hidden: true, onclick: cargarAnteriores }, 'Ver mensajes anteriores');
  const pie = el('div', { class: 'redactar' });

  const entrada = el('textarea', { rows: 1, maxlength: 1000, placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje',
    onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } },
    oninput: () => { entrada.style.height = 'auto'; entrada.style.height = `${Math.min(entrada.scrollHeight, 140)}px`; } });
  const botonEnviar = el('button', { class: 'enviar', type: 'button', 'aria-label': 'Enviar', onclick: () => enviar() }, flecha());
  const botonEquipo = el('button', { class: 'mas-equipo', type: 'button', 'aria-label': 'Compartir un equipo', title: 'Compartir un equipo', onclick: () => compartir() }, '+');

  const cerca = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
  const alFinal = () => window.scrollTo(0, document.documentElement.scrollHeight);

  function añadir(lista) { for (const m of lista) mensajes.set(m.id, m); }

  function pintarCabecera() {
    if (!cabecera) return;
    const estado = estadoConexion(amigo);
    const opciones = () => [
      puede && { texto: 'Ver perfil', accion: () => { location.hash = `#/amigos/${amigo.usuario}`; } },
      { texto: 'Borrar chat', accion: borrarChat },
      puede && { texto: 'Bloquear', accion: bloquear },
    ].filter(Boolean);
    poner(cabecera,
      el(puede ? 'a' : 'span', { class: 'chat-quien', ...(puede ? { href: `#/amigos/${amigo.usuario}` } : {}) },
        avatarUsuario(amigo, 34, { enLinea: amigo.en_linea }),
        el('span', { class: 'chat-nombre' }, el('b', {}, amigo.nombre), el('small', { class: amigo.en_linea ? 'en-linea' : '' }, estado || `@${amigo.usuario}`))),
      botonMenu('⋯', amigo.nombre, opciones, { class: 'boton-mas', 'aria-label': 'Más opciones' }));
  }

  function pintar() {
    const abajo = cerca();
    const orden = [...mensajes.values()].sort((a, b) => a.id - b.id);
    const ultimoMio = orden.filter(m => m.mio).at(-1)?.id;
    let diaAnterior = '';
    const nodos = [];
    for (const m of orden) {
      const d = dia(m.fecha);
      if (d !== diaAnterior) { nodos.push(el('span', { class: 'dia' }, d)); diaAnterior = d; }
      // Cada burbuja se crea una vez (si no, los sprites de los equipos se recargarían en cada sondeo)
      let n = burbujas.get(m.id);
      if (!n) {
        n = el('div', { class: `msj${m.mio ? ' mio' : ''}${m.equipo ? ' con-equipo' : ''}` },
          m.equipo ? tarjetaCompartido(m.equipo, { mio: m.mio }) : el('p', {}, m.texto), el('small'));
        burbujas.set(m.id, n);
      }
      n.lastChild.textContent = hora(m.fecha) + (m.id === ultimoMio && m.id <= visto ? ' · Visto' : '');
      nodos.push(n);
    }
    poner(lista, nodos.length ? nodos : el('p', { class: 'nota centro vacio-chat' }, puede ? `Todavía no hay mensajes. ¡Saluda a ${amigo.nombre}!` : 'No hay mensajes.'));
    anteriores.hidden = !hayMas;
    poner(pie, puede ? [botonEquipo, entrada, botonEnviar]
      : el('p', { class: 'nota centro' }, 'Ya no sois amigos: no puedes escribir en este chat.'));
    if (abajo) alFinal();
  }

  async function enviar(cuerpo = null) {
    const texto = entrada.value.trim();
    if (!cuerpo && !texto) return;
    botonEnviar.disabled = true;
    try {
      const m = await peticion('mensajes.php', { method: 'POST', body: { con: amigo.id, ...(cuerpo || { texto }) } });
      añadir([m]);
      if (!cuerpo) { entrada.value = ''; entrada.style.height = 'auto'; }
      pintar();
      alFinal();
    } catch (e) {
      aviso(e.message, 'error');
      if (e.status === 403) { puede = false; pintar(); pintarCabecera(); }
    } finally { botonEnviar.disabled = false; entrada.focus(); }
  }

  async function cargarAnteriores() {
    const alto = document.documentElement.scrollHeight;
    try {
      const r = await peticion(`mensajes.php?con=${amigo.id}&antes=${primerId()}`);
      añadir(r.mensajes);
      hayMas = r.hay_mas;
      pintar();
      window.scrollBy(0, document.documentElement.scrollHeight - alto);   // que no salte: se queda donde estaba
    } catch (e) { aviso(e.message, 'error'); }
  }

  async function sondear() {
    if (!activo) return;
    if (!document.hidden) {
      try {
        const r = await peticion(`mensajes.php?con=${amigo.id}&desde=${ultimoId()}`);
        if (!activo) return;
        const cambia = r.mensajes.length > 0 || r.visto_hasta !== visto || r.puede_escribir !== puede;
        const cabeceraCambia = r.amigo.en_linea !== amigo.en_linea || r.puede_escribir !== puede;
        añadir(r.mensajes);
        visto = r.visto_hasta;
        puede = r.puede_escribir;
        amigo = r.amigo;
        if (cambia) pintar();
        if (cabeceraCambia) pintarCabecera();
        if (r.mensajes.some(m => !m.mio)) actualizarResumen();
      } catch { /* sin conexión: se reintenta */ }
    }
    temporizador = setTimeout(sondear, CADA);
  }

  async function borrarChat() {
    if (!await confirmar('¿Borrar el chat?', `Se borra solo para ti: ${amigo.nombre} seguirá viendo los mensajes. Los equipos que te ha compartido también desaparecen de aquí.`, 'Borrar chat')) return;
    try {
      await peticion('mensajes.php?accion=borrar', { method: 'POST', body: { con: amigo.id } });
      mensajes.clear();
      burbujas.clear();
      hayMas = false;
      pintar();
      aviso('Chat borrado');
      actualizarResumen();
    } catch (e) { aviso(e.message, 'error'); }
  }

  async function bloquear() {
    if (!await confirmar(`¿Bloquear a ${amigo.nombre}?`, 'Deja de ser tu amigo y no podrá encontrarte, mandarte solicitudes ni escribirte. No recibe ningún aviso.', 'Bloquear')) return;
    try {
      await peticion('amigos.php?accion=bloquear', { method: 'POST', body: { usuario_id: amigo.id } });
      aviso(`Has bloqueado a ${amigo.nombre}`);
      location.hash = '#/amigos';
    } catch (e) { aviso(e.message, 'error'); }
  }

  /* 10c · Compartir un equipo: hoja con mis equipos */
  async function compartir() {
    let equipos;
    try { equipos = await misEquipos(); } catch (e) { aviso(e.message, 'error'); return; }
    ventana(cerrar => [
      el('p', { class: 'sub' }, `Con ${amigo.nombre}. Le llega una copia: lo que cambies después no le llega.`),
      equipos.length === 0
        ? el('p', { class: 'msg info' }, 'No tienes equipos guardados en tu cuenta.')
        : el('div', { class: 'lista-compartir' }, equipos.map(eq => {
          const titulares = eq.miembros.filter(m => m.posicion <= 6);
          const reservas = eq.miembros.length - titulares.length;
          return el('button', { class: 'opcion-equipo', type: 'button', onclick: async () => { cerrar(); await enviar({ equipo_id: eq.id }); } },
            el('span', { class: 'portada' }, titulares.slice(0, 4).map(m => { const d = datosMiembro(m, eq.generacion); return d.sprite(20, d.nombre); })),
            el('span', { class: 'menu-texto' }, el('b', {}, eq.nombre),
              el('small', {}, `Gen ${eq.generacion} · ${titulares.length} Pokémon${reservas ? ` + ${reservas} reserva${reservas > 1 ? 's' : ''}` : ''}`)),
            el('span', { class: 'enviar-texto' }, 'Enviar'));
        })),
      el('button', { class: 'btn sec', type: 'button', onclick: cerrar }, 'Cancelar'),
    ], { titulo: 'Compartir un equipo', hoja: true });
  }

  // Primera carga: últimos 30 mensajes (y los marca como leídos)
  const mio = turnoVista();
  try {
    const r = await peticion(`mensajes.php?usuario=${encodeURIComponent(usuario)}`);
    amigo = r.amigo; visto = r.visto_hasta; puede = r.puede_escribir; hayMas = r.hay_mas;
    añadir(r.mensajes);
  } catch (e) {
    poner(raiz, el('p', { class: 'msg error' }, e.message), el('a', { href: '#/amigos' }, 'Volver a Amigos'));
    return;
  }
  if (mio !== turnoVista()) return;   // se ha salido del chat mientras cargaba: no se empieza a preguntar
  poner(raiz, anteriores, lista, pie);
  pintarCabecera();
  pintar();
  alFinal();
  actualizarResumen();
  if (puede && matchMedia('(pointer: fine)').matches) entrada.focus();   // en el móvil no: abriría el teclado

  temporizador = setTimeout(sondear, CADA);
  const alVolver = () => { if (!document.hidden && activo) { clearTimeout(temporizador); sondear(); } };
  document.addEventListener('visibilitychange', alVolver);
  alSalirDeVista(() => { activo = false; clearTimeout(temporizador); document.removeEventListener('visibilitychange', alVolver); });
}

function flecha() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M5 12h13M13 6l6 6-6 6"/>';
  return svg;
}
