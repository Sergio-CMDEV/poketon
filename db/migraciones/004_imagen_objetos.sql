-- Segundo icono de los objetos (PokéSprite) para los que no están en la hoja de Showdown, como medicinas o mentas.
-- Uso: ejecútalo una vez como root en phpMyAdmin y después vuelve a lanzar php db/import.php
ALTER TABLE objeto ADD COLUMN IF NOT EXISTS imagen VARCHAR(80) NULL AFTER icono;
