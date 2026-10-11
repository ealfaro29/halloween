# Halloween

Formulario personalizado en español para inscribir presentaciones de Halloween.

Sitio: https://ealfaro29.github.io/halloween/

Pide nombre, personaje o disfraz, si necesita música, canción y artista, enlace e indicaciones opcionales, y notas. La página funciona en móvil y respeta la preferencia de reducir animaciones.

## Respuestas

Las respuestas se guardan en una hoja privada de Google Sheets a través de una aplicación de Google Apps Script. El sitio público no permite leer inscripciones.

`backend/Code.gs` es la plantilla del receptor. Configura `SPREADSHEET_ID`, despliega como aplicación web ejecutada por el propietario con acceso `Anyone`, y copia la URL `/exec` en `config.js`. La hoja debe tener una pestaña `Respuestas` y los encabezados definidos en el script. La autorización inicial de Google debe completarse antes de recibir inscripciones.

El navegador envía JSON como `text/plain` y muestra éxito solo al recibir confirmación de guardado con el mismo identificador. Los reintentos del mismo envío conservan su identificador para evitar registros duplicados.

## Desarrollo y publicación

No necesita instalación ni compilación. Para probar localmente:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

GitHub Pages publica la raíz de `main`. `.nojekyll` evita transformaciones de los archivos estáticos.
