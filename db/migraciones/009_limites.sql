-- Límites nuevos por IP (revisión de seguridad): cuentas creadas (30/h) y emails de "recuperar contraseña" (10/h).
-- Se puede ejecutar más de una vez. Hay que ejecutarla ANTES de actualizar el código: sin ella, el registro da error.
ALTER TABLE accion_limitada MODIFY tipo ENUM('solicitud','buscar','foto','registro','recuperar') NOT NULL;
