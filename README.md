# Laboratorio 9 — Galería privada de imágenes en Amazon S3

Aplicación web para subir, listar, previsualizar y eliminar imágenes de un bucket **privado**. El navegador pide al backend una autorización temporal; después envía el archivo directamente a S3. El backend no recibe el archivo y el frontend no contiene claves de AWS.

## Tecnologías y funciones

- Node.js 18+, Express y AWS SDK v3; interfaz HTML, CSS y JavaScript adaptable a móvil.
- `POST /api/upload-url`: entrega un formulario prefirmado que dura cinco minutos. S3 verifica que la carga real sea menor o igual a 5 MB.
- `POST /api/images/verify`: comprueba tamaño, MIME y firma real de JPG, PNG o WebP después de la carga.
- `GET /api/images`: devuelve la galería con enlaces privados de visualización válidos durante 15 minutos.
- `DELETE /api/images/:key`: quita una imagen de la galería. Si el bucket tiene versionado, S3 conserva la versión anterior mediante un *delete marker*.

Se usa **POST prefirmado** en lugar del PUT simplificado de la guía para que S3 haga cumplir `content-length-range` sobre el archivo recibido. La transferencia sigue siendo directa navegador → S3. La interfaz muestra el estado de configuración y un aviso claro si AWS aún no está conectado.

## Iniciar en Windows

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` con el nombre real del bucket. Configura el perfil `app-user` mediante AWS CLI con las claves entregadas por IAM; no subas claves ni `.env` al repositorio. El SDK usa ese perfil. Después ejecuta:

```powershell
npm run dev
```

Abre [http://127.0.0.1:3000](http://127.0.0.1:3000). El servidor escucha solo en `127.0.0.1` porque esta práctica no implementa autenticación de usuarios. **No lo expongas a internet sin añadir autenticación y permisos por usuario.** `npm test` comprueba la validación de archivos y claves.

**Estado del laboratorio al 14 de octubre de 2026:** se creó el bucket privado `lab-09-campos-20261014` en `us-east-1`, con bloqueo público, HTTPS obligatorio, SSE-S3, versionado, CORS local y la regla de ciclo de vida. El usuario IAM `app-imagenes-user` usa el perfil local `app-user`; su clave permanece fuera de Git. Hay tres fotografías sintéticas de prueba en `originales/`, disponibles también en `samples/`. Se comprobó una carga y eliminación desde la web, la recuperación tras un *delete marker* y que la URL pública sin firma responde 403.

## Configuración de AWS según la guía

1. Crea un bucket nuevo y globalmente único en `us-east-1`. Mantén **Block all public access** activado. Unifica el nombre en todos los comandos: la guía alterna `lab-09-...` y `lab-imagenes-...` como ejemplos.
2. Crea los prefijos `originales/`, `miniaturas/` y `temporal/`; sube tres imágenes de prueba sin datos personales. Prueba carga, lista y descarga con AWS CLI.
3. Activa versionado y cifrado predeterminado **SSE-S3**. Adjunta la política de HTTPS de `aws/https-only-policy.example.json` tras reemplazar `REEMPLAZAR_BUCKET`.
4. Crea el usuario IAM `app-imagenes-user` sin acceso a consola y adjúntale una política limitada al bucket. `aws/iam-policy.example.json` incluye `DeleteObjectVersion` para poder retirar una carga inválida incluso si el versionado está activo. Sustituye `REEMPLAZAR_BUCKET` por el nombre real. Guarda sus claves solo en el perfil local de AWS CLI.
5. Copia el contenido de `aws/cors.json` en **Permissions → CORS** del bucket. Si cambias el puerto u origen del frontend, ajusta `AllowedOrigins`.
6. Configura la regla de ciclo de vida `regla-imagenes-antiguas` para `originales/`: versiones actuales a Standard-IA a los 30 días y Glacier Instant Retrieval a los 90; versiones no actuales a Deep Archive a los 60 y expiración a los 365 días, según la guía. Las imágenes de prueba menores de 128 KB podrían no transicionar por la configuración predeterminada de S3.

La política `PublicReadGetObject` de Canvas es para **lectura pública** y menciona el bucket de ejemplo `jfm02`. No se aplica aquí: contradice el requisito del ejercicio 4 de mantener el bucket privado y usar URLs prefirmadas.

## Pruebas y evidencias

La guía pide capturas de los ejercicios 1–3, informe PDF con respuestas de análisis, repositorio Git y video de **máximo cinco minutos**. Para la aplicación, documenta una carga JPG válida; bloqueo de PDF/EXE y de un archivo de 10 MB; galería y eliminación; URL de lectura vencida; y la pestaña **Network**, donde se vea la carga directa a S3. No incluyas valores de claves, archivos `.env` ni URL prefirmadas completas en las capturas.

Al terminar la práctica, documenta la limpieza: elimina objetos y **todas sus versiones** antes de borrar el bucket; después desactiva/elimina el usuario IAM y sus claves. El versionado y las clases de almacenamiento pueden mantener cargos hasta que se borren sus versiones.

## Créditos visuales

La imagen de portada y las tres fotografías de `samples/` se generaron para esta práctica. La portada está en `public/assets/hero.jpg`; las imágenes de la galería siempre provienen del bucket S3 configurado.
