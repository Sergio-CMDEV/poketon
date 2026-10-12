-- Poketon online: perfil, amigos, bloqueos y chats.
-- Uso: ejecútalo una vez como root en phpMyAdmin (no hace falta volver a importar).
-- nombre_usuario y codigo_amigo de las cuentas que ya existen los rellena PHP la primera vez que entran.

-- Perfil y privacidad
ALTER TABLE usuario
  ADD COLUMN IF NOT EXISTS nombre_usuario     VARCHAR(20) NULL AFTER nombre,              -- @usuario, en minúsculas
  ADD COLUMN IF NOT EXISTS codigo_amigo       CHAR(8) NULL AFTER nombre_usuario,          -- se enseña como PKT-XXXX-XXXX
  ADD COLUMN IF NOT EXISTS foto               CHAR(37) NULL AFTER codigo_amigo,           -- "<32 hex>.webp" en public/fotos/
  ADD COLUMN IF NOT EXISTS avatar_pokemon_id  SMALLINT UNSIGNED NULL AFTER foto,          -- o un Pokémon como avatar
  ADD COLUMN IF NOT EXISTS acepta_solicitudes BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS muestra_en_linea   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ultima_conexion    DATETIME NULL,
  ADD UNIQUE INDEX IF NOT EXISTS usuario_nombre_usuario (nombre_usuario),
  ADD UNIQUE INDEX IF NOT EXISTS usuario_codigo_amigo (codigo_amigo),
  ADD CONSTRAINT usuario_avatar FOREIGN KEY IF NOT EXISTS (avatar_pokemon_id) REFERENCES pokemon(id) ON DELETE SET NULL,
  ADD CONSTRAINT IF NOT EXISTS usuario_formato_nombre CHECK (nombre_usuario IS NULL OR nombre_usuario REGEXP BINARY '^[a-z0-9_]{3,20}$'),
  ADD CONSTRAINT IF NOT EXISTS usuario_formato_codigo CHECK (codigo_amigo IS NULL OR codigo_amigo REGEXP BINARY '^[2-9A-HJKMNP-Z]{8}$');

-- Amistades y solicitudes. Una fila por pareja: usuario_a es siempre el id menor.
-- Rechazar o cancelar una solicitud borra la fila.
CREATE TABLE IF NOT EXISTS amistad (
  usuario_a       INT UNSIGNED NOT NULL,
  usuario_b       INT UNSIGNED NOT NULL,
  solicitante_id  INT UNSIGNED NOT NULL,                 -- quién mandó la solicitud
  estado          ENUM('pendiente','aceptada') NOT NULL DEFAULT 'pendiente',
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aceptada_en     DATETIME NULL,                         -- "Amigos desde…"
  PRIMARY KEY (usuario_a, usuario_b),
  INDEX (usuario_b),
  FOREIGN KEY (usuario_a) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_b) REFERENCES usuario(id) ON DELETE CASCADE,
  CHECK (usuario_a < usuario_b),
  CHECK (solicitante_id IN (usuario_a, usuario_b)),
  CHECK ((estado = 'aceptada') = (aceptada_en IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bloqueos. Bloquear borra la amistad o la solicitud que hubiera.
CREATE TABLE IF NOT EXISTS bloqueo (
  usuario_id    INT UNSIGNED NOT NULL,                   -- quien bloquea
  bloqueado_id  INT UNSIGNED NOT NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, bloqueado_id),
  INDEX (bloqueado_id),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (bloqueado_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CHECK (usuario_id <> bloqueado_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chats. Los de 1 a 1 llevan la pareja (id menor en usuario_a) para no repetirlos;
-- los de grupo (futuro) la dejan en NULL.
CREATE TABLE IF NOT EXISTS conversacion (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_a  INT UNSIGNED NULL,
  usuario_b  INT UNSIGNED NULL,
  creado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_a, usuario_b),
  FOREIGN KEY (usuario_a) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_b) REFERENCES usuario(id) ON DELETE CASCADE,
  CHECK (usuario_a < usuario_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quién está en cada chat, hasta qué mensaje ha leído (para "sin leer" y "Visto")
-- y hasta cuál ha borrado ("Borrar chat" solo lo borra para él; lo que han borrado los dos se elimina).
CREATE TABLE IF NOT EXISTS conversacion_miembro (
  conversacion_id  INT UNSIGNED NOT NULL,
  usuario_id       INT UNSIGNED NOT NULL,
  ultimo_leido     BIGINT UNSIGNED NOT NULL DEFAULT 0,   -- id del último mensaje visto
  borrado_hasta    BIGINT UNSIGNED NOT NULL DEFAULT 0,   -- no ve los mensajes con id <= este
  PRIMARY KEY (conversacion_id, usuario_id),
  INDEX (usuario_id),
  FOREIGN KEY (conversacion_id) REFERENCES conversacion(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mensajes: texto, equipo compartido (copia en JSON) o los dos.
CREATE TABLE IF NOT EXISTS mensaje (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversacion_id  INT UNSIGNED NOT NULL,
  autor_id         INT UNSIGNED NOT NULL,
  texto            VARCHAR(1000) NULL,
  equipo           JSON NULL,                            -- mismo formato que devuelve equipos.php
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (conversacion_id, id),                           -- "mensajes desde el id X" del sondeo
  INDEX (autor_id, creado_en),                           -- límite de mensajes por minuto
  FOREIGN KEY (conversacion_id) REFERENCES conversacion(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CHECK (texto IS NOT NULL OR equipo IS NOT NULL),
  CHECK (CHAR_LENGTH(texto) BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acciones con límite (solicitudes, búsquedas de código, fotos: 3 al día), para frenar abusos.
-- Se borran las de más de 2 días.
CREATE TABLE IF NOT EXISTS accion_limitada (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NULL,                         -- NULL si no hay sesión (enlace de amigo)
  ip          VARCHAR(45) NOT NULL,
  tipo        ENUM('solicitud','buscar','foto') NOT NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tipo, usuario_id, fecha),
  INDEX (tipo, ip, fecha),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
