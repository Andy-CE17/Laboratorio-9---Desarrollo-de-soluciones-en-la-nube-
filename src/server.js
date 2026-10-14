import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EXTENSIONS,
  MAX_SIZE_BYTES,
  imageTypeFromBytes,
  isOwnImageKey,
  safeFilename,
  validateUpload,
} from './validation.js';

const app = express();
const region = process.env.AWS_REGION || 'us-east-1';
const bucket = process.env.S3_BUCKET || '';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const s3 = new S3Client({ region });
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '12kb' }));
app.use(express.static(publicDir, { etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const mutations = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera unos minutos.' },
});

function ready(req, res, next) {
  if (!bucket) return res.status(503).json({ error: 'Configura S3_BUCKET en el archivo .env.' });
  next();
}

function handleError(error, res) {
  console.error('Operación S3 fallida:', error.name || 'Error');
  const message = error.name === 'CredentialsProviderError'
    ? 'No se encontraron credenciales de AWS. Comprueba el perfil CLI.'
    : 'No se pudo completar la operación en S3. Revisa la configuración y los permisos.';
  res.status(502).json({ error: message });
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', configured: Boolean(bucket), region });
});

app.post('/api/upload-url', mutations, ready, async (req, res) => {
  const error = validateUpload(req.body);
  if (error) return res.status(400).json({ error });

  const { filename, contentType } = req.body;
  const key = `originales/${randomUUID()}-${safeFilename(filename)}`;
  try {
    // POST firmado permite exigir el tamaño REAL a S3: un PUT firmado no aporta
    // por sí solo una condición content-length-range verificable por S3.
    const signed = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Expires: 300,
      Fields: {
        'Content-Type': contentType,
        'x-amz-server-side-encryption': 'AES256',
      },
      Conditions: [
        ['content-length-range', 1, MAX_SIZE_BYTES],
        { 'Content-Type': contentType },
        { 'x-amz-server-side-encryption': 'AES256' },
      ],
    });
    res.json({ uploadUrl: signed.url, fields: signed.fields, key, method: 'POST', expiresIn: 300 });
  } catch (cause) {
    handleError(cause, res);
  }
});

app.post('/api/images/verify', mutations, ready, async (req, res) => {
  const key = req.body?.key;
  if (!isOwnImageKey(key)) return res.status(400).json({ error: 'Identificador de imagen no válido.' });
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: 'bytes=0-15' }));
    const signature = imageTypeFromBytes(await body.Body.transformToByteArray());
    const extension = key.split('.').pop().toLowerCase();
    const valid = head.ContentLength > 0
      && head.ContentLength <= MAX_SIZE_BYTES
      && Boolean(signature)
      && EXTENSIONS[signature].includes(extension)
      && signature === head.ContentType;
    if (!valid) {
      // Con versionado, VersionId elimina exactamente la carga inválida.
      await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(head.VersionId ? { VersionId: head.VersionId } : {}),
      }));
      return res.status(415).json({ error: 'El archivo no es una imagen válida y se eliminó.' });
    }
    res.json({ valid: true, size: head.ContentLength, contentType: signature });
  } catch (cause) {
    handleError(cause, res);
  }
});

app.get('/api/images', ready, async (_req, res) => {
  try {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'originales/',
      MaxKeys: 200,
    }));
    const objects = (listed.Contents || [])
      .filter((object) => isOwnImageKey(object.Key))
      .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
    const images = await Promise.all(objects.map(async (object) => ({
      key: object.Key,
      name: object.Key.slice('originales/'.length).replace(/^[a-f0-9-]{36}-/, ''),
      size: object.Size,
      lastModified: object.LastModified,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: object.Key }), { expiresIn: 900 }),
    })));
    res.json({ images, truncated: Boolean(listed.IsTruncated) });
  } catch (cause) {
    handleError(cause, res);
  }
});

app.delete('/api/images/:key', mutations, ready, async (req, res) => {
  const key = req.params.key;
  if (!isOwnImageKey(key)) return res.status(400).json({ error: 'Identificador de imagen no válido.' });
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    res.json({ deleted: true });
  } catch (cause) {
    handleError(cause, res);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.listen(port, host, () => {
  console.log(`Galería S3 disponible en http://${host}:${port}`);
  if (!bucket) console.log('Configura S3_BUCKET en .env para conectar AWS.');
});
