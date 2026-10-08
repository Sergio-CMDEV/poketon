-- Pokémon legendarios y singulares (los "míticos" en inglés). Ejecutar como root y después: php db\import.php
ALTER TABLE especie ADD COLUMN IF NOT EXISTS rareza ENUM('legendario', 'singular') NULL AFTER generacion;
