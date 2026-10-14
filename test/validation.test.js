import test from 'node:test';
import assert from 'node:assert/strict';
import { imageTypeFromBytes, isOwnImageKey, safeFilename, validateUpload } from '../src/validation.js';

test('solo admite imágenes compatibles de hasta 5 MB', () => {
  assert.equal(validateUpload({ filename: 'foto.jpg', contentType: 'image/jpeg', sizeBytes: 1024 }), null);
  assert.match(validateUpload({ filename: 'foto.pdf', contentType: 'application/pdf', sizeBytes: 1024 }), /Formato/);
  assert.match(validateUpload({ filename: 'foto.exe', contentType: 'image/png', sizeBytes: 1024 }), /extensión/);
  assert.match(validateUpload({ filename: 'foto.png', contentType: 'image/png', sizeBytes: 10 * 1024 * 1024 }), /5 MB/);
  assert.match(validateUpload({ filename: 'foto.png', contentType: 'image/png', sizeBytes: 0 }), /5 MB/);
});

test('la comprobación posterior detecta la firma real del archivo', () => {
  assert.equal(imageTypeFromBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(imageTypeFromBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(imageTypeFromBytes(Buffer.from('RIFFxxxxWEBPxxxx')), 'image/webp');
  assert.equal(imageTypeFromBytes(Buffer.from('%PDF-1.7')), null);
});

test('solo se pueden eliminar claves creadas para la galería', () => {
  const key = 'originales/47a508c2-7fbb-49dd-a6f3-2d78f6047063-Foto-de-prueba.jpg';
  assert.equal(isOwnImageKey(key), true);
  assert.equal(isOwnImageKey('../secretos.txt'), false);
  assert.equal(isOwnImageKey('miniaturas/foto.jpg'), false);
  assert.equal(safeFilename('mañana en Lima.jpg'), 'manana-en-Lima.jpg');
});
