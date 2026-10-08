-- Objetos: icono (hoja de Pokémon Showdown) y categoría, para la pantalla "Objetos".
-- Uso: ejecútalo una vez como root en phpMyAdmin y después vuelve a lanzar php db/import.php
ALTER TABLE objeto ADD COLUMN IF NOT EXISTS icono SMALLINT UNSIGNED NULL AFTER identificador;
ALTER TABLE objeto ADD COLUMN IF NOT EXISTS categoria VARCHAR(30) NULL AFTER icono;
