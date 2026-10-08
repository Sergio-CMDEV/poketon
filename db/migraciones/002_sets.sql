-- Añade la tabla de sets competitivos (pestaña "Sets") y el identificador de los objetos (iconos en Evolución).
-- Uso: ejecútalo una vez sobre la BD que ya existe y después vuelve a ejecutar php db/import.php
CREATE TABLE IF NOT EXISTS set_competitivo (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pokemon_id  SMALLINT UNSIGNED NOT NULL,
  generacion  TINYINT UNSIGNED NOT NULL,
  formato     VARCHAR(30) NOT NULL,
  nombre      VARCHAR(80) NOT NULL,
  datos       JSON NOT NULL,
  INDEX (pokemon_id, generacion),
  FOREIGN KEY (pokemon_id) REFERENCES pokemon(id) ON DELETE CASCADE,
  CHECK (JSON_VALID(datos))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE objeto ADD COLUMN IF NOT EXISTS identificador VARCHAR(60) NULL AFTER nombre_en;
