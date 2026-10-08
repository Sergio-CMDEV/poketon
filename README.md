# Poketon

Web y app de escritorio para consultar Pokémon y montar equipos:

- Buscador con debilidades, estadísticas, habilidades, evoluciones, formas (Alola, Galar, Mega…), shiny y movimientos.
- Tabla de tipos de cada generación (1-9), con los tipos que tenía cada Pokémon en su época.
- Constructor de equipos (6 titulares + 2 reservas) con tabla de cobertura defensiva y avisos de movimientos ilegales.
- Importar y exportar equipos en formato de Pokémon Showdown.
- Cuentas de usuario: registro, login (también con Google), recuperar contraseña por email, hasta 8 equipos.

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
src/lib.php           funciones comunes de la API (fuera de public/)
public/               lo único que sirve el servidor web
  index.html
  css/styles.css
  js/
    app.js            arranque y rutas (#/equipos, #/pokemon/25…)
    api.js            llamadas a la API y sesión
    datos.js          catálogo, tipos por generación, búsqueda
    cobertura.js      tabla de cobertura de un equipo
    showdown.js       importar/exportar texto de Showdown
    equipos.js        equipo en edición y equipos guardados
    ui.js             utilidades para crear la interfaz
    vistas/           una pantalla por archivo
  api/
    catalogo.php      todos los datos que el frontend carga una vez
    pokemon.php       ficha: stats, habilidades, evolución, movimientos
    auth.php          registro, login, Google, recuperar contraseña, cuenta
    equipos.php       CRUD de equipos del usuario
docker/               Nginx y PHP para el despliegue
src-tauri/            app de escritorio
```

## Puesta en marcha (desarrollo)

1. Copia `config.example.php` como `config.php` y rellénalo.
2. Crea la base de datos y cárgala:
   ```bash
   mariadb -h IP -u USUARIO -p tablatipos_dev < db/schema.sql
   php db/import.php
   ```
3. Arranca el servidor de desarrollo y abre http://localhost:8000:
   ```bash
   php -S localhost:8000 -t public
   ```

## Despliegue

En la máquina de webs (la BD está en su propia máquina; `config.php` apunta a su IP):
```bash
docker compose up -d --build
```
La web queda en el puerto 8080; ponla detrás de tu proxy con HTTPS.

## App de escritorio

Requiere [Rust](https://rustup.rs) y las Build Tools de Visual Studio con C++.
```bash
npm install
npm run build
```
El .exe queda en `src-tauri/target/release/`. Llama a la API publicada (constante `API_PUBLICADA` en `public/js/api.js`).

## Créditos

Proyecto fan no oficial. Pokémon y sus nombres e imágenes © Nintendo / Creatures / Game Freak. Datos y sprites: PokeAPI.
