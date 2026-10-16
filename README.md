# Poketon
Esta app está creada por pura necesidad: soy un jugador muy nuevo de Pokémon y siempre me ha costado una barbaridad
aprender todos los tipos y cómo se afectan entre ellos. Como ninguna guía me resultaba cómoda, creé esto, tanto para
aprender y practicar las tecnologías que estoy estudiando como para jugar más cómodo a los juegos de Pokémon.

Web y app de escritorio para consultar Pokémon y montar equipos:

- Buscador con debilidades, estadísticas, habilidades, evoluciones, formas (Alola, Galar, Mega…), shiny y movimientos.
- Tabla de tipos de cada generación (1-9), con los tipos que tenía cada Pokémon en su época.
- Constructor de equipos (6 titulares + 2 reservas) con tabla de cobertura defensiva y ofensiva y avisos de movimientos ilegales.
- Movimientos y habilidades: qué hace cada uno, quién lo aprende o la tiene y qué Pokémon los llevan en sus sets de Smogon.
- Ficha con tipos en defensa y en ataque, peso, altura, sexo y ratio de captura (y la potencia de los movimientos que dependen del peso).
- Importar y exportar equipos en formato de Pokémon Showdown.
- Cuentas de usuario: registro, login (también con Google), recuperar contraseña por email, hasta 8 equipos.
- Online: perfil con foto (recorte como en Discord) o un Pokémon, amigos con código o enlace, chat 1 a 1 y equipos compartidos.

## Tecnologías

| Parte | Tecnología |
|---|---|
| Frontend | HTML, CSS y JavaScript (módulos ES, sin frameworks) |
| API | PHP 8 + PDO, lo mínimo: leer/guardar en la BD y las sesiones |
| Base de datos | MariaDB |
| Servidor | Docker Compose (Nginx + PHP-FPM) |
| Escritorio | Tauri |
| Datos | [PokeAPI](https://github.com/PokeAPI/pokeapi) |

## Estructura

```
config.example.php    plantilla de configuración (copiar a config.php)
db/
  schema.sql          crea las tablas
  import.php          llena la BD con los datos de PokeAPI
  migraciones/        cambios para una BD ya creada
src/                  fuera de public/: lib.php (común de la API), online.php (amigos y chat), equipos.php
public/               lo único que sirve el servidor web
  index.html
  css/styles.css
  js/
    app.js            arranque y rutas (#/equipos, #/pokemon/25…)
    api.js            llamadas a la API y sesión
    datos.js          catálogo, tipos por generación, búsqueda
    cobertura.js      tabla de cobertura de un equipo (defensiva y ofensiva)
    showdown.js       importar/exportar texto de Showdown
    equipos.js        equipo en edición y equipos guardados
    online.js         número de avisos de Amigos (sondeo), formatos y acciones del online
    recorte.js        recorte de la foto de perfil
    compartidos.js    equipos compartidos en el chat
    ui.js             utilidades para crear la interfaz (y el color de los super shiny de Añil)
    novedades.js      lo nuevo de cada versión (pantalla Novedades y CHANGELOG.md)
    vistas/           una pantalla por archivo
  api/
    catalogo.php      todos los datos que el frontend carga una vez
    pokemon.php       ficha: stats, habilidades, evolución, movimientos
    movimiento.php    pantalla Movimientos: más usados, quién lo aprende y quién lo lleva
    habilidad.php     pantalla Habilidades: más usadas, quién la tiene y quién la lleva
    auth.php          registro, login, Google, recuperar contraseña, cuenta
    equipos.php       CRUD de equipos del usuario
    perfil.php        @usuario, foto, código de amigo y privacidad
    amigos.php        amigos, solicitudes y bloqueos
    mensajes.php      chats (sondeo cada 3 s) y equipos compartidos
  fotos/              fotos de perfil subidas (no se sube a GitHub)
docker/               Nginx y PHP para el despliegue
src-tauri/            app de escritorio
```

## Licencia

El código es de licencia **MIT** (ver [LICENSE](LICENSE)). La licencia cubre solo el código de Poketon, no los datos ni las imágenes de Pokémon.

## Novedades

Lo que trae cada versión está en [CHANGELOG.md](CHANGELOG.md) (y en la pantalla "Novedades" de la app).

## Créditos

Proyecto fan no oficial, sin ánimo de lucro. Pokémon y sus nombres e imágenes © Nintendo / Creatures / Game Freak.
- Datos y sprites: [PokeAPI](https://pokeapi.co).
- Sets competitivos: [Smogon](https://www.smogon.com).
- Iconos de objetos: [Pokémon Showdown](https://pokemonshowdown.com) y [PokéSprite](https://github.com/msikma/pokesprite).
- Pokémon Añil: fangame de Eric_Lostie hecho con RPG Maker XP y Pokémon Essentials. Sus Pokémon, formas, tipos, habilidades y sprites
  son de su autor; no están en este repositorio (se generan a partir del juego con `scripts/anil.mjs`).

## Discleimer
Esta app está hecha en un 80 % por IA con mi supervisión. Iré actualizándola para cambiar el código por mi propio
código y así ir aprendiendo poco a poco. Si quieres ayudar o explicarme lo que sea comentamelo ^^