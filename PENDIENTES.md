# Pendientes

- [ ] **Legendarios y singulares:** marcar en la ficha y en el buscador si un Pokémon es legendario o singular (mítico).
      PokeAPI lo trae en `pokemon_species.csv` (`is_legendary`, `is_mythical`): añadir las columnas a `especie`, importarlas y mostrar una etiqueta.
- [ ] **Siempre encima (app de escritorio):** opción para que la ventana quede por encima de las demás, útil para tenerla junto al juego.
      En Tauri se hace con `alwaysOnTop` en la ventana; con un interruptor en la app usando `getCurrentWindow().setAlwaysOnTop(true/false)`.
- [ ] **Actualización automática (app de escritorio):** que la app avise de que hay versión nueva y se actualice con un botón, sin descargar el .exe a mano.
      Con el plugin oficial `tauri-plugin-updater`: cada versión se publica en GitHub Releases firmada (`tauri signer generate`) junto a un `latest.json`;
      al abrir, la app llama a `check()`, y si hay versión nueva muestra un botón "Actualizar" que hace `downloadAndInstall()` y reinicia.
      Ojo: la parte web (HTML/JS) ya se actualiza sola en el navegador; esto es solo para el .exe.
- [ ] **Seguridad de contraseñas:** ahora se guardan con bcrypt (`password_hash` de PHP). Mejora prevista: pasar a **Argon2id**
      (`PASSWORD_ARGON2ID`, el algoritmo recomendado hoy por OWASP) más una "pimienta" (clave secreta en `config.php` que se mezcla con HMAC
      antes de hashear, así un volcado de la BD no basta para atacar las contraseñas). Las antiguas se migran solas al iniciar sesión con
      `password_needs_rehash`. Repasar también: cabeceras de seguridad en nginx, HTTPS obligatorio y caducidad del JWT.
- [ ] **Documentación en Obsidian:** carpeta `Poketon` en la bóveda con toda la info de la app: requisitos y casos de uso, proceso
      (fases y decisiones), base de datos (modelo E/R y relacional), API, pantallas, despliegue (Proxmox, Docker, Tauri) y pruebas.
