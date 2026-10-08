// Pantalla 6 · Editor de equipo: 6 titulares + 2 reservas, configuración del miembro elegido y cobertura en vivo.
// Trabaja sobre el "borrador" (guardado en el navegador); con sesión se guarda también en la cuenta.

import { sesion } from '../api.js';
import { catalogo, mapas, pokemon, nombre, tiposEn, ficha, buscar, existeEn, normalizar, GENERACIONES, STATS_CORTO } from '../datos.js';
import { el, chip, sprite, aviso, campo, selectorGen, poner } from '../ui.js';
import { borrador, guardarBorrador, guardarEnCuenta } from '../equipos.js';
import { nuevoMiembro } from '../showdown.js';
import { tablaCobertura } from '../cobertura.js';

let seleccion = 1;   // posición elegida (1-6 titulares, 7-8 reservas)

export function vistaEditor(raiz) {
  const eq = borrador();
  const miembro = pos => eq.miembros.find(m => m.posicion === pos);
  const slots = el('div', { class: 'slots' });
  const panel = el('section', { class: 'tarjeta' });
  const cobertura = el('section', { class: 'tarjeta cob' });

  /** Cada cambio se guarda en el navegador y quita el "Equipo guardado" de la cabecera. */
  const cambio = () => { guardarBorrador(eq); estado(false); };

  function pintarSlots() {
    poner(slots, [1, 2, 3, 4, 5, 6, 7, 8].map(pos => {
      const m = miembro(pos);
      const p = m && pokemon(m.pokemon_id);
      return el('button', { class: `slot ${pos > 6 ? 'reserva' : ''} ${pos === seleccion ? 'on' : ''}`, 'data-pos': pos,
        onclick: () => { if (arrastrado) return; seleccion = pos; pintarSlots(); pintarPanel(); } },
        el('span', { class: `circulo ${p ? 'lleno' : ''}` }, p ? sprite(p.id, { tam: 40, shiny: m.shiny, alt: '' }) : '+'),
        el('small', {}, p ? p.nombre : pos > 6 ? 'Reserva' : 'Vacío'));
    }));
  }

  /** Cambia de sitio dos huecos (si el destino está vacío, solo se mueve). Así se pasa a reservas y de vuelta. */
  function mover(desde, hasta) {
    if (desde === hasta) return;
    const a = miembro(desde), b = miembro(hasta);
    if (a) a.posicion = hasta;
    if (b) b.posicion = desde;
    seleccion = hasta;
    cambioDeEquipo();
  }

  /* Arrastrar un Pokémon a otro hueco. Con ratón empieza al moverlo; en el móvil, al mantenerlo pulsado
     (así deslizar el dedo sigue haciendo scroll). Se usan eventos de puntero: valen para ratón y para dedo. */
  let arrastre = null;      // { desde, x, y, fantasma, temporizador }
  let arrastrado = false;   // para que el clic de después de soltar no cuente como "elegir"
  const huecoEn = (x, y) => document.elementFromPoint(x, y)?.closest('.slot');
  function empezar() {
    const { desde, x, y } = arrastre;
    const origen = slots.querySelector(`[data-pos="${desde}"] .circulo`);
    arrastre.fantasma = el('div', { class: 'fantasma' }, origen.cloneNode(true));
    document.body.append(arrastre.fantasma);
    slots.setPointerCapture(arrastre.puntero);   // los movimientos siguen llegando aunque el dedo salga de los huecos
    slots.classList.add('arrastrando');
    slots.querySelector(`[data-pos="${desde}"]`).classList.add('origen');
    seguir(x, y);
  }
  function seguir(x, y) {
    arrastre.fantasma.style.transform = `translate(${x - 24}px, ${y - 24}px)`;
    const hueco = huecoEn(x, y);
    slots.querySelectorAll('.slot.destino').forEach(s => s !== hueco && s.classList.remove('destino'));
    if (hueco) hueco.classList.add('destino');
  }
  function terminar(e) {
    if (!arrastre) return;
    clearTimeout(arrastre.temporizador);
    const { desde, fantasma } = arrastre;
    arrastre = null;
    if (!fantasma) return;
    fantasma.remove();
    slots.classList.remove('arrastrando');
    arrastrado = true;
    setTimeout(() => { arrastrado = false; }, 0);
    const hueco = e && e.type === 'pointerup' && huecoEn(e.clientX, e.clientY);
    if (hueco) mover(desde, +hueco.dataset.pos); else pintarSlots();
  }
  slots.addEventListener('pointerdown', e => {
    const hueco = e.target.closest('.slot');
    if (!hueco || !miembro(+hueco.dataset.pos) || e.button > 0) return;
    arrastre = { desde: +hueco.dataset.pos, x: e.clientX, y: e.clientY, tactil: e.pointerType !== 'mouse', puntero: e.pointerId };
    if (arrastre.tactil) arrastre.temporizador = setTimeout(() => { if (arrastre) { empezar(); navigator.vibrate?.(15); } }, 300);
  });
  slots.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const lejos = Math.hypot(e.clientX - arrastre.x, e.clientY - arrastre.y) > 6;
    if (!arrastre.fantasma) {
      if (lejos && arrastre.tactil) { clearTimeout(arrastre.temporizador); arrastre = null; return; }   // está haciendo scroll
      if (lejos) empezar(); else return;
    }
    seguir(e.clientX, e.clientY);
  });
  slots.addEventListener('pointerup', terminar);
  slots.addEventListener('pointercancel', terminar);
  slots.addEventListener('pointerleave', e => { if (arrastre && !arrastre.fantasma) { clearTimeout(arrastre.temporizador); arrastre = null; } });
  // En el móvil, mientras se arrastra no se mueve la página ni sale el menú de "guardar imagen"
  slots.addEventListener('touchmove', e => { if (arrastre?.fantasma) e.preventDefault(); }, { passive: false });
  slots.addEventListener('contextmenu', e => e.preventDefault());

  function pintarCobertura() {
    poner(cobertura, el('div', { class: 'cobertura-cab' }, el('b', {}, 'Cobertura defensiva')),
      tablaCobertura(eq.miembros.filter(m => m.posicion <= 6), eq.generacion));
  }

  const cambioDeEquipo = () => { cambio(); pintarSlots(); pintarPanel(); pintarCobertura(); };

  /* ---------- Miembro elegido ---------- */
  async function pintarPanel() {
    const m = miembro(seleccion);
    if (!m) { poner(panel, buscadorParaHueco()); return; }
    const p = pokemon(m.pokemon_id);
    const gen = eq.generacion;
    // Mientras llega la ficha se deja lo que había (atenuado) en vez de vaciar el cuadro, para que no parpadee
    if (!panel.childElementCount) poner(panel, el('p', { class: 'nota' }, 'Cargando…'));
    panel.classList.add('cargando');
    let f;
    try { f = await ficha(p.id); } catch (e) { poner(panel, el('p', { class: 'msg error' }, e.message)); return; }
    finally { panel.classList.remove('cargando'); }
    if (miembro(seleccion) !== m) return;   // se cambió de hueco mientras cargaba

    // Objeto: texto con sugerencias; se guarda el id si el nombre existe
    const objeto = el('input', { list: 'dl-objetos', value: mapas.objetos.get(m.objeto_id)?.nombre ?? '', placeholder: 'Ninguno' });
    objeto.addEventListener('change', () => {
      const o = catalogo.objetos.find(x => normalizar(x.nombre) === normalizar(objeto.value));
      m.objeto_id = o?.id ?? null;
      objeto.classList.toggle('invalido', !!objeto.value && !o);
      cambio();
    });
    const desplegable = (lista, actual, texto, alCambiar) => el('select', { onchange: e => { alCambiar(+e.target.value || null); cambio(); } },
      el('option', { value: '' }, '—'), lista.map(x => el('option', { value: x.id, selected: x.id === actual }, texto(x))));

    const corto = s => ({ ataque: 'Atq', defensa: 'Def', at_esp: 'AtEsp', def_esp: 'DefEsp', velocidad: 'Vel' })[s];
    // Una habilidad que no le corresponde (p. ej. importada de un randomizer) se mantiene, con aviso
    const habAjena = m.habilidad_id && !f.habilidades.some(h => h.id === m.habilidad_id) && mapas.habilidades.get(m.habilidad_id);
    const avisoHab = el('div', { style: { display: 'contents' } });
    const pintarAvisoHab = () => poner(avisoHab, habAjena && m.habilidad_id === habAjena.id
      && el('p', { class: 'msg aviso' }, `⚠ ${p.nombre} no puede tener ${habAjena.nombre}. Puedes guardar igualmente.`));
    const habilidad = desplegable([...f.habilidades, ...(habAjena ? [habAjena] : [])], m.habilidad_id,
      h => (h === habAjena ? `⚠ ${h.nombre}` : h.nombre + (h.oculta ? ' (oculta)' : '')), v => { m.habilidad_id = v; pintarAvisoHab(); });
    pintarAvisoHab();
    const teratipo = desplegable(catalogo.tipos, m.teratipo_id, t => t.nombre, v => { m.teratipo_id = v; });
    const naturaleza = desplegable(catalogo.naturalezas, m.naturaleza_id,
      n => n.nombre + (n.stat_sube ? ` (+${corto(n.stat_sube)} −${corto(n.stat_baja)})` : ''), v => { m.naturaleza_id = v; });

    // EVs (máx. 252 cada uno y 510 en total) e IVs (0-31)
    const totalEvs = el('span');
    const pintarTotal = () => {
      const s = m.evs.reduce((a, b) => a + b, 0);
      totalEvs.textContent = `${s} / 510`;
      totalEvs.classList.toggle('pasado', s > 510);
    };
    const seis = (lista, max, alCambiar = pintarTotal) => el('div', { class: 'seis' }, lista.map((v, i) => el('label', {}, el('small', {}, STATS_CORTO[i]),
      el('input', { type: 'number', min: 0, max, step: 1, value: v, oninput: e => { lista[i] = Math.max(0, Math.min(max, Math.round(+e.target.value) || 0)); alCambiar(); cambio(); } }))));
    pintarTotal();
    const resumenIvs = el('summary');
    const pintarResumenIvs = () => {
      resumenIvs.textContent = m.ivs.every(v => v === 31) ? 'IVs: 31 en todos (pulsa para editar)'
        : `IVs: ${m.ivs.map((v, i) => `${v} ${STATS_CORTO[i]}`).join(' · ')}`;
    };
    pintarResumenIvs();

    // Movimientos: avisa si no lo puede aprender, pero deja guardar
    const aprendibles = new Set(f.movimientos.map(x => x.id));
    const avisos = el('div', { style: { display: 'contents' } });
    const inputs = [0, 1, 2, 3].map(i => el('input', { list: 'dl-movs', value: mapas.movimientos.get(m.movimientos[i])?.nombre ?? '', placeholder: `Movimiento ${i + 1}` }));
    const pintarAvisos = () => {
      inputs.forEach((inp, i) => inp.classList.toggle('ilegal', !!m.movimientos[i] && !aprendibles.has(m.movimientos[i])));
      poner(avisos, m.movimientos.filter(id => !aprendibles.has(id)).map(id =>
        el('p', { class: 'msg aviso' }, `⚠ ${p.nombre} no aprende ${mapas.movimientos.get(id)?.nombre ?? 'ese movimiento'} en esta generación. Puedes guardar igualmente.`)));
    };
    inputs.forEach(inp => inp.addEventListener('change', () => {
      const ids = inputs.map(x => catalogo.movimientos.find(mv => normalizar(mv.nombre) === normalizar(x.value))?.id);
      inputs.forEach((x, i) => x.classList.toggle('invalido', !!x.value && !ids[i]));
      m.movimientos = ids.filter(Boolean);
      pintarAvisos(); cambio();
    }));
    pintarAvisos();

    // Nivel (1-100). Se importa y exporta con el texto de Showdown ("Level: 50")
    const nivel = el('input', { type: 'number', min: 1, max: 100, step: 1, value: m.nivel ?? 100, 'aria-label': 'Nivel',
      oninput: e => { const v = Math.round(+e.target.value); if (v >= 1 && v <= 100) { m.nivel = v; cambio(); } },
      onblur: e => { e.target.value = m.nivel ?? 100; } });

    poner(panel,
      el('div', { class: 'miembro-cab' },
        sprite(p.id, { tam: 64, shiny: m.shiny, alt: nombre(p) }),
        el('div', { class: 'ficha-info' }, el('b', {}, nombre(p)), el('div', { class: 'chips' }, tiposEn(p, gen).map(chip)),
          el('label', { class: 'nivel' }, el('span', {}, 'Nivel'), nivel)),
        el('div', { class: 'acciones-miembro' },
          el('button', { class: 'btn-contorno btn-peq', title: seleccion > 6 ? 'Pasar a los titulares' : 'Pasar a las reservas', onclick: () => {
            const libres = (seleccion > 6 ? [1, 2, 3, 4, 5, 6] : [7, 8]).filter(pos => !miembro(pos));
            if (!libres.length) { aviso(seleccion > 6 ? 'Los 6 titulares están ocupados: arrastra la reserva encima de uno para cambiarlos' : 'Las 2 reservas están ocupadas: arrastra encima de una para cambiarlos', 'error'); return; }
            mover(seleccion, libres[0]);
          } }, seleccion > 6 ? '↑ A titulares' : '↓ A reservas'),
          el('button', { class: 'btn-quitar', onclick: () => { eq.miembros = eq.miembros.filter(x => x !== m); cambioDeEquipo(); } }, 'Quitar'))),
      el('div', { class: 'dos-col campos-miembro' },
        campo('Objeto', objeto),
        gen >= 3 && campo('Habilidad', habilidad),
        gen >= 9 && campo('Teratipo', teratipo),
        gen >= 3 && campo('Naturaleza', naturaleza)),
      avisoHab,
      el('div', { class: 'ev-cab' }, el('span', {}, 'EVs'), totalEvs),
      seis(m.evs, 252),
      el('details', { class: 'ivs' }, resumenIvs, seis(m.ivs, 31, pintarResumenIvs)),
      el('div', { class: 'movimientos' }, el('span', {}, 'Movimientos'),
        el('datalist', { id: 'dl-movs' }, [...aprendibles].map(id => mapas.movimientos.get(id)).filter(Boolean)
          .sort((a, b) => a.nombre.localeCompare(b.nombre)).map(mv => el('option', { value: mv.nombre }))),
        el('div', { class: 'lista-movs' }, inputs), avisos),
    );
  }

  /** Hueco vacío: buscador para poner un Pokémon ahí. */
  function buscadorParaHueco() {
    const lista = el('ul', { class: 'resultados' });
    const entrada = el('input', { type: 'search', placeholder: 'Busca un Pokémon…', autocomplete: 'off' });
    entrada.addEventListener('input', () => poner(lista, buscar(entrada.value, eq.generacion, 6).map(p =>
      el('li', {}, el('button', { class: 'resultado', onclick: () => { eq.miembros.push(nuevoMiembro(p.id, seleccion)); cambioDeEquipo(); } },
        sprite(p.id, { tam: 32 }), el('span', {}, nombre(p)), el('span', { class: 'chips' }, tiposEn(p, eq.generacion).map(chip)))))));
    setTimeout(() => entrada.focus(), 0);
    return [campo(seleccion > 6 ? `Reserva ${seleccion - 6}` : `Titular ${seleccion}`, entrada), lista];
  }

  /* ---------- Guardar ---------- */
  function estado(guardado) {
    const e = document.getElementById('estado-cabecera');
    if (e) { e.textContent = 'Equipo guardado'; e.hidden = !guardado; }
  }

  async function guardar() {
    if (!eq.miembros.length) { aviso('Añade al menos un Pokémon', 'error'); return; }
    if (eq.miembros.some(m => m.evs.reduce((a, b) => a + b, 0) > 510)) { aviso('Algún Pokémon pasa de 510 EVs', 'error'); return; }
    if (!sesion()) { guardarBorrador(eq); aviso('Guardado en este navegador. Entra para guardarlo en tu cuenta.'); return; }
    try {
      Object.assign(eq, await guardarEnCuenta(eq));
      nombreInput.value = eq.nombre;
      // Los miembros ahora son los que devuelve el servidor: se vuelve a pintar todo para que el cuadro edite esos
      pintarSlots(); pintarPanel(); pintarCobertura();
      estado(true);
    } catch (e) {
      if (e.status === 401) { guardarBorrador(eq); aviso('Tu sesión ha caducado. Entra y se guardará', 'error'); location.hash = '#/login'; return; }
      aviso(e.message, 'error');
    }
  }

  const nombreInput = el('input', { value: eq.nombre, maxlength: 40, placeholder: 'Equipo N (automático)', oninput: e => { eq.nombre = e.target.value; cambio(); } });
  const genSelect = selectorGen(eq.generacion, GENERACIONES.map(([g]) => [g, `Gen ${g}`]), g => {
    eq.generacion = g;
    const fuera = eq.miembros.map(m => pokemon(m.pokemon_id)).filter(p => !existeEn(p, g)).map(p => p.nombre);
    if (fuera.length) aviso(`No existen en Gen ${g}: ${fuera.join(', ')}`, 'error');
    cambio(); pintarPanel(); pintarCobertura();
  });

  poner(raiz,
    el('div', { class: 'nombre-gen' }, campo('Nombre', nombreInput), campo('Generación', genSelect)),
    el('div', { class: 'lbl-fila' }, el('span', { class: 'lbl' }, 'Titulares (6) · Reservas (2)'), el('small', { class: 'nota' }, 'Arrastra para moverlos')),
    slots,
    el('datalist', { id: 'dl-objetos' }, catalogo.objetos.map(o => el('option', { value: o.nombre }))),
    panel,
    cobertura,
    el('div', { class: 'dos-botones' },
      el('button', { class: 'btn', onclick: guardar }, 'Guardar'),
      el('a', { class: 'btn sec', href: '#/showdown/exportar' }, 'Exportar')),
  );
  if (seleccion > 1 && !miembro(seleccion) && !eq.miembros.length) seleccion = 1;
  pintarSlots(); pintarPanel(); pintarCobertura();
  // Se piden ya las fichas de todo el equipo: al cambiar de hueco el cuadro sale al momento
  for (const m of eq.miembros) ficha(m.pokemon_id).catch(() => {});
}
