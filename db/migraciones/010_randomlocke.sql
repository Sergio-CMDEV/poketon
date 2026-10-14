-- Equipos de randomlocke: con la opción activada, el editor deja poner cualquier habilidad y movimiento
-- (sin avisos de "no puede tener…"). Se puede ejecutar más de una vez.
ALTER TABLE equipo ADD COLUMN IF NOT EXISTS randomlocke TINYINT(1) NOT NULL DEFAULT 0 AFTER generacion;
