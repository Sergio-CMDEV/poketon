// Novedades de cada versión (la pantalla "Novedades" y CHANGELOG.md salen de aquí: npm run changelog).
// Al sacar una versión: súbela en version.js y tauri.conf.json, añádela arriba con su fecha y lanza npm run changelog.

export const NOVEDADES = [
  {
    version: '1.0.3', fecha: '2026-10-16', cambios: [
      'Nueva sección Habilidades: qué hace cada una, quién la puede tener (normal u oculta), quién la lleva en Smogon y qué cuenta en la cobertura. También con las de Pokémon Añil.',
      'Super shiny de Pokémon Añil en la ficha (Normal · Shiny · Super shiny), con el mismo color que en el juego.',
      'Equipos: cada Pokémon puede ser normal, shiny o super shiny (con Pokémon Añil). Desde la ficha se añade tal y como lo estás viendo.',
      'Ficha: en la pestaña Tipos, "Ataque" dice a qué tipos pegan fuerte, poco o nada los ataques de sus tipos.',
      'Ficha: peso, altura, sexo y ratio de captura, y la potencia de Patada Baja, Hierba Lazo, Cuerpo Pesado y Golpe Calor según el peso.',
      'Cobertura ofensiva de los equipos: a qué tipos pega supereficaz cada miembro con sus movimientos (botones Defensiva · Ofensiva).',
      'Cada sección recuerda lo último que viste: si miras un objeto y vuelves a Buscar, sigue el Pokémon que tenías.',
      'Esta pantalla de Novedades.',
      'Arreglado: en la app de escritorio el botón de "Continuar con Google" podía salir gris.',
    ],
  },
  {
    version: '1.0.2', fecha: '2026-10-13', cambios: [
      'La versión sale en "Iniciar sesión" y en "Mi cuenta". En la app de escritorio, botón "Buscar actualizaciones".',
      'Botón propio de "Continuar con Google", con el estilo de la app.',
    ],
  },
  {
    version: '1.0.1', fecha: '2026-10-13', cambios: [
      'Nueva sección Movimientos: datos, qué hace, quién lo aprende y quién lo lleva en Smogon.',
      'Equipos Randomlocke: cualquier habilidad y cualquier movimiento, sin avisos.',
      'EVs: si escribes más de 252 se queda en 252, y avisa si el total pasa de 510.',
      'La cobertura cuenta la habilidad (Levitación, Geofagia, Absorbe Agua, Sebo…).',
      'Primera actualización automática de la app de escritorio.',
    ],
  },
  {
    version: '1.0.0', fecha: '2026-10-13', cambios: [
      'Primera versión publicada: la web y la app de escritorio para Windows.',
      'Buscador con debilidades según la generación, estadísticas, evolución, formas, shiny y sets de Smogon.',
      'Equipos de 6 titulares y 2 reservas con su tabla de cobertura, e importar y exportar de Pokémon Showdown.',
      'Objetos: qué hacen, quién los lleva y a quién hacen evolucionar; equipar desde la ficha.',
      'Cuentas (con email o Google), hasta 8 equipos, y online: perfil, amigos, chat y equipos compartidos.',
      'Pokémon Añil como un juego más, tema claro y oscuro, y en la app, "siempre encima".',
    ],
  },
];

/** "2026-10-16" → "16 oct 2026" */
export const fechaCorta = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
