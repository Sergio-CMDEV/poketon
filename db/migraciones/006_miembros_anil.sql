-- Equipos con formas propias de Pokémon Añil (las que no existen en los juegos oficiales).
-- anil_id guarda la forma ("RAICHU_2"); pokemon_id pasa a poder ser NULL (Pokémon de Añil sin especie oficial).
-- Uso: ejecútalo una vez como root en phpMyAdmin (no hace falta volver a importar).
ALTER TABLE miembro_equipo
  MODIFY pokemon_id SMALLINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS anil_id VARCHAR(40) NULL AFTER pokemon_id,
  ADD CONSTRAINT miembro_pokemon_o_anil CHECK (pokemon_id IS NOT NULL OR anil_id IS NOT NULL);
