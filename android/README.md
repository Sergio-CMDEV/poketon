# Poketon para Android

La app de Android es la web publicada (`https://poketon.online`) dentro de una app: una **TWA** (Trusted Web Activity).
Se ve a pantalla completa, sin barra de direcciones, y se actualiza sola cada vez que se publica la web.
La genera [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) a partir de `twa-manifest.json`.

## Lo que ya está hecho
- La web es instalable (PWA): `public/manifest.webmanifest`, `public/sw.js` e iconos en `public/img/app/`.
- `twa-manifest.json`: nombre, colores, iconos y el paquete `online.poketon.app`.
- Nginx sirve `/.well-known/assetlinks.json` (la prueba de que la app y la web son del mismo dueño).

## Pasos (cuando la web esté publicada con HTTPS)
1. Instalar Node.js y Bubblewrap: `npm i -g @bubblewrap/cli`. La primera vez pregunta si descarga el JDK y el SDK de Android: sí.
2. Desde esta carpeta: `bubblewrap update` (crea el proyecto de Android a partir de `twa-manifest.json`) y luego `bubblewrap build`.
   - La primera vez crea la clave de firma en `claves/poketon-android.keystore` (pide contraseñas).
     **Haz copia de la clave y de las contraseñas fuera del proyecto**: sin ellas no se pueden subir actualizaciones.
   - Salen `app-release-bundle.aab` (para la Play Store) y `app-release-signed.apk` (para instalar a mano y probar).
3. `bubblewrap fingerprint generateAssetLinks` crea `assetlinks.json` con la huella de la clave
   (o a mano: `keytool -list -v -keystore claves/poketon-android.keystore` y rellenar `assetlinks.json.ejemplo`).
4. Copiarlo a `public/.well-known/assetlinks.json` y publicar la web.
   Comprobar en https://developers.google.com/digital-asset-links/tools/generator
5. Play Console (25 $, una vez):
   - Crear la app y subir el `.aab` a una **prueba cerrada**. Con una cuenta personal nueva hacen falta
     **12 testers durante 14 días seguidos** antes de poder publicar.
   - Con la firma de apps de Google Play, añadir también su huella (Play Console → Integridad de la app) al `assetlinks.json`.
   - Ficha: política de privacidad `https://poketon.online/#/privacidad`, formulario de seguridad de los datos
     (email, nombre, fotos, mensajes) y forma de borrar la cuenta (Mi cuenta → Eliminar cuenta).
6. Para cada versión nueva de la app (solo si cambia el icono, el nombre o los colores): subir `appVersionCode` y `appVersionName`
   en `twa-manifest.json`, `bubblewrap build` y subir el `.aab`. Los cambios de la web no necesitan versión nueva.

## Ojo
Pokémon es de Nintendo / The Pokémon Company. Una app con sus nombres y sprites puede ser rechazada o retirada
de la Play Store por una reclamación de propiedad intelectual. Mientras tanto, la web se puede instalar desde el navegador
del móvil (menú → "Instalar aplicación" / "Añadir a pantalla de inicio").

## No se sube a GitHub
`claves/` (la clave de firma) y lo que genera Bubblewrap (`app/`, `gradle/`, `*.aab`, `*.apk`…): ver `.gitignore`.
