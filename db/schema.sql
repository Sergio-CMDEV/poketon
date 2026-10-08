-- =====================================================================
--  Poketon · Esquema de la base de datos (MariaDB 10.6+ / 11)
--  Uso: mariadb -u USUARIO -p tablatipos_dev < schema.sql
-- =====================================================================

SET NAMES utf8mb4;

-- Para poder recrear la BD desde cero: borra en orden inverso a las dependencias
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS set_competitivo, miembro_movimiento, miembro_equipo, equipo, intento_login, token_recuperacion, usuario,
                     evolucion, pokemon_movimiento, pokemon_habilidad, pokemon_tipo, pokemon, especie,
                     movimiento, habilidad, objeto, naturaleza, eficacia, tipo;
SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================================
--  1. DATOS DEL JUEGO (se llenan con import.php desde PokeAPI)
-- =====================================================================

-- Tipos: Fuego, Agua…
CREATE TABLE tipo (
  id      TINYINT UNSIGNED PRIMARY KEY,
  clave   VARCHAR(10) NOT NULL UNIQUE,            -- 'FIRE': identificador estable para el código
  nombre  VARCHAR(20) NOT NULL                    -- 'Fuego': lo que ve el usuario
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Eficacia de un tipo atacante contra un defensor, válida en un rango de generaciones.
-- Solo se guardan los cruces distintos de ×1 (lo que no aparece es neutro).
CREATE TABLE eficacia (
  tipo_atacante_id  TINYINT UNSIGNED NOT NULL,
  tipo_defensor_id  TINYINT UNSIGNED NOT NULL,
  gen_desde         TINYINT UNSIGNED NOT NULL,
  gen_hasta         TINYINT UNSIGNED NULL,         -- NULL = sigue vigente hoy
  multiplicador     DECIMAL(2,1) NOT NULL,         -- 0.0, 0.5 o 2.0
  PRIMARY KEY (tipo_atacante_id, tipo_defensor_id, gen_desde),
  FOREIGN KEY (tipo_atacante_id) REFERENCES tipo(id),
  FOREIGN KEY (tipo_defensor_id) REFERENCES tipo(id),
  CHECK (multiplicador IN (0.0, 0.5, 2.0)),
  CHECK (gen_hasta IS NULL OR gen_hasta >= gen_desde)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Especie: "Raichu". Agrupa sus formas y es lo que evoluciona.
CREATE TABLE especie (
  id          SMALLINT UNSIGNED PRIMARY KEY,       -- nº de Pokédex nacional
  nombre      VARCHAR(40) NOT NULL,
  nombre_en   VARCHAR(40) NOT NULL,             -- para importar/exportar texto de Showdown
  generacion  TINYINT UNSIGNED NOT NULL,
  rareza      ENUM('legendario', 'singular') NULL,  -- NULL = normal. "Singular" es el nombre oficial de los míticos
  INDEX (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pokémon concreto: "Raichu" y "Raichu de Alola" son dos filas de la misma especie.
-- Las 6 stats van como columnas porque siempre son exactamente 6.
CREATE TABLE pokemon (
  id              SMALLINT UNSIGNED PRIMARY KEY,   -- id de PokeAPI (formas desde 10001)
  especie_id      SMALLINT UNSIGNED NOT NULL,
  identificador   VARCHAR(60) NOT NULL UNIQUE,     -- 'raichu-alola': casa con 'Raichu-Alola' de Showdown
  forma           VARCHAR(40) NULL,                -- NULL = forma normal; 'Alola', 'Mega X'…
  predeterminado  BOOLEAN NOT NULL DEFAULT TRUE,
  ps              TINYINT UNSIGNED NOT NULL,       -- stats base: 1-255
  ataque          TINYINT UNSIGNED NOT NULL,
  defensa         TINYINT UNSIGNED NOT NULL,
  at_esp          TINYINT UNSIGNED NOT NULL,
  def_esp         TINYINT UNSIGNED NOT NULL,
  velocidad       TINYINT UNSIGNED NOT NULL,
  ev_ps           TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- EVs que da al derrotarlo (0-3)
  ev_ataque       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_defensa      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_at_esp       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_def_esp      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_velocidad    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (especie_id) REFERENCES especie(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tipos de cada Pokémon, con historial: Clefairy fue Normal (gen 1-5) y es Hada (gen 6+).
CREATE TABLE pokemon_tipo (
  pokemon_id  SMALLINT UNSIGNED NOT NULL,
  slot        TINYINT UNSIGNED NOT NULL,           -- 1 = tipo principal, 2 = secundario
  gen_desde   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  gen_hasta   TINYINT UNSIGNED NULL,
  tipo_id     TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (pokemon_id, slot, gen_desde),
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE,
  FOREIGN KEY (tipo_id) REFERENCES tipo(id),
  CHECK (slot IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE habilidad (
  id           SMALLINT UNSIGNED PRIMARY KEY,
  nombre       VARCHAR(40) NOT NULL,
  nombre_en    VARCHAR(40) NOT NULL,
  descripcion  TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pokemon_habilidad (
  pokemon_id    SMALLINT UNSIGNED NOT NULL,
  slot          TINYINT UNSIGNED NOT NULL,         -- 1-2 normales, 3 oculta
  habilidad_id  SMALLINT UNSIGNED NOT NULL,
  oculta        BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (pokemon_id, slot),
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE,
  FOREIGN KEY (habilidad_id) REFERENCES habilidad(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE movimiento (
  id         SMALLINT UNSIGNED PRIMARY KEY,
  nombre     VARCHAR(40) NOT NULL,
  nombre_en  VARCHAR(40) NOT NULL,
  tipo_id    TINYINT UNSIGNED NOT NULL,
  categoria  ENUM('fisico', 'especial', 'estado') NOT NULL,
  potencia   TINYINT UNSIGNED NULL,                -- NULL en movimientos de estado
  precision_pct TINYINT UNSIGNED NULL,             -- NULL = nunca falla ("precision" es palabra reservada)
  pp         TINYINT UNSIGNED NOT NULL,
  descripcion TEXT NULL,
  INDEX (nombre),
  FOREIGN KEY (tipo_id) REFERENCES tipo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Qué movimientos puede aprender cada Pokémon (para los avisos de legalidad).
CREATE TABLE pokemon_movimiento (
  pokemon_id     SMALLINT UNSIGNED NOT NULL,
  movimiento_id  SMALLINT UNSIGNED NOT NULL,
  metodo         ENUM('nivel', 'mt', 'huevo', 'tutor', 'otro') NOT NULL,
  nivel          TINYINT UNSIGNED NULL,            -- solo si metodo = 'nivel'
  PRIMARY KEY (pokemon_id, movimiento_id, metodo),
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE,
  FOREIGN KEY (movimiento_id) REFERENCES movimiento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE objeto (
  id           SMALLINT UNSIGNED PRIMARY KEY,
  nombre       VARCHAR(40) NOT NULL,
  nombre_en    VARCHAR(60) NOT NULL,
  identificador VARCHAR(60) NULL,                  -- "thunder-stone": icono en PokeAPI (en las MT, el disco de su tipo: "tm-fire")
  icono        SMALLINT UNSIGNED NULL,             -- posición en la hoja de iconos de Pokémon Showdown (NULL = icono de PokeAPI)
  imagen       VARCHAR(80) NULL,                   -- icono de PokéSprite si no está en Showdown ("medicine/adamant-mint")
  categoria    VARCHAR(30) NULL,                   -- 'Equipables', 'Bayas', 'Evolución', 'MT'… (NULL = no sale en Objetos)
  descripcion  TEXT NULL,
  INDEX (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE naturaleza (
  id         TINYINT UNSIGNED PRIMARY KEY,
  nombre     VARCHAR(20) NOT NULL,
  nombre_en  VARCHAR(20) NOT NULL,
  stat_sube  ENUM('ataque', 'defensa', 'at_esp', 'def_esp', 'velocidad') NULL,  -- NULL = neutra
  stat_baja  ENUM('ataque', 'defensa', 'at_esp', 'def_esp', 'velocidad') NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Evolución entre especies. Una especie puede tener varias (Eevee: 9 filas).
CREATE TABLE evolucion (
  id                  SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  especie_origen_id   SMALLINT UNSIGNED NOT NULL,
  especie_destino_id  SMALLINT UNSIGNED NOT NULL,
  metodo              ENUM('nivel', 'objeto', 'intercambio', 'amistad', 'otro') NOT NULL,
  nivel               TINYINT UNSIGNED NULL,
  objeto_id           SMALLINT UNSIGNED NULL,
  detalle             VARCHAR(120) NULL,           -- texto ya montado: "Amistad de noche"
  FOREIGN KEY (especie_origen_id) REFERENCES especie(id) ON DELETE CASCADE,
  FOREIGN KEY (especie_destino_id) REFERENCES especie(id) ON DELETE CASCADE,
  FOREIGN KEY (objeto_id) REFERENCES objeto(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- Sets competitivos recomendados (Smogon), por Pokémon y generación.
-- Los objetos, habilidades, naturalezas y movimientos van como ids en un JSON porque cada
-- hueco del set puede tener varias alternativas ("Restos o Botas Gruesas").
CREATE TABLE set_competitivo (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pokemon_id  SMALLINT UNSIGNED NOT NULL,
  generacion  TINYINT UNSIGNED NOT NULL,
  formato     VARCHAR(30) NOT NULL,                 -- 'OU', 'UU', 'VGC2025'…
  nombre      VARCHAR(80) NOT NULL,                 -- 'Dragon Dance'
  datos       JSON NOT NULL,                        -- {objetos, habilidades, naturalezas, teratipos, evs, movimientos}
  INDEX (pokemon_id, generacion),
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE,
  CHECK (JSON_VALID(datos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  2. USUARIOS Y EQUIPOS
-- =====================================================================

CREATE TABLE usuario (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(254) NOT NULL UNIQUE,
  nombre         VARCHAR(30) NOT NULL,
  password_hash  VARCHAR(255) NULL,                -- NULL si solo entra con Google
  google_id      VARCHAR(64) NULL UNIQUE,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)   -- al menos una forma de entrar
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enlaces de "recuperar contraseña". Se guarda el hash del token, nunca el token.
CREATE TABLE token_recuperacion (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,            -- SHA-256 en hexadecimal
  caduca_en   DATETIME NOT NULL,
  usado_en    DATETIME NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos de login fallidos, para bloquear tras 5 seguidos.
CREATE TABLE intento_login (
  id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email  VARCHAR(254) NOT NULL,
  ip     VARCHAR(45) NOT NULL,                     -- 45 caracteres caben en IPv6
  fecha  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (email, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- El máximo de 8 equipos por usuario y el nombre "Equipo N" se controlan en PHP.
CREATE TABLE equipo (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT UNSIGNED NOT NULL,
  nombre          VARCHAR(40) NOT NULL,
  generacion      TINYINT UNSIGNED NOT NULL DEFAULT 9,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, nombre),                     -- no repetir nombre dentro de un usuario
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada Pokémon dentro de un equipo, con su configuración (formato Showdown).
-- Posiciones 1-6 = titulares, 7-8 = reservas.
CREATE TABLE miembro_equipo (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipo_id      INT UNSIGNED NOT NULL,
  posicion       TINYINT UNSIGNED NOT NULL,
  pokemon_id     SMALLINT UNSIGNED NOT NULL,
  apodo          VARCHAR(20) NULL,
  objeto_id      SMALLINT UNSIGNED NULL,
  habilidad_id   SMALLINT UNSIGNED NULL,
  naturaleza_id  TINYINT UNSIGNED NULL,
  teratipo_id    TINYINT UNSIGNED NULL,
  nivel          TINYINT UNSIGNED NOT NULL DEFAULT 100,
  shiny          BOOLEAN NOT NULL DEFAULT FALSE,
  ev_ps          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_ataque      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_defensa     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_at_esp      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_def_esp     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ev_velocidad   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  iv_ps          TINYINT UNSIGNED NOT NULL DEFAULT 31,
  iv_ataque      TINYINT UNSIGNED NOT NULL DEFAULT 31,
  iv_defensa     TINYINT UNSIGNED NOT NULL DEFAULT 31,
  iv_at_esp      TINYINT UNSIGNED NOT NULL DEFAULT 31,
  iv_def_esp     TINYINT UNSIGNED NOT NULL DEFAULT 31,
  iv_velocidad   TINYINT UNSIGNED NOT NULL DEFAULT 31,
  UNIQUE (equipo_id, posicion),                    -- un hueco no puede tener dos Pokémon
  FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE,
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id),
  FOREIGN KEY (objeto_id) REFERENCES objeto(id) ON DELETE SET NULL,
  FOREIGN KEY (habilidad_id) REFERENCES habilidad(id) ON DELETE SET NULL,
  FOREIGN KEY (naturaleza_id) REFERENCES naturaleza(id) ON DELETE SET NULL,
  FOREIGN KEY (teratipo_id) REFERENCES tipo(id) ON DELETE SET NULL,
  CHECK (posicion BETWEEN 1 AND 8),
  CHECK (nivel BETWEEN 1 AND 100),
  CHECK (ev_ps <= 252 AND ev_ataque <= 252 AND ev_defensa <= 252
         AND ev_at_esp <= 252 AND ev_def_esp <= 252 AND ev_velocidad <= 252),
  CHECK (ev_ps + ev_ataque + ev_defensa + ev_at_esp + ev_def_esp + ev_velocidad <= 510),
  CHECK (iv_ps <= 31 AND iv_ataque <= 31 AND iv_defensa <= 31
         AND iv_at_esp <= 31 AND iv_def_esp <= 31 AND iv_velocidad <= 31)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los hasta 4 movimientos de cada miembro.
CREATE TABLE miembro_movimiento (
  miembro_id     INT UNSIGNED NOT NULL,
  slot           TINYINT UNSIGNED NOT NULL,
  movimiento_id  SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (miembro_id, slot),
  FOREIGN KEY (miembro_id) REFERENCES miembro_equipo(id) ON DELETE CASCADE,
  FOREIGN KEY (movimiento_id) REFERENCES movimiento(id),
  CHECK (slot BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
