const $ = (selector) => document.querySelector(selector);
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const state = { images: [], file: null, objectUrl: null, busy: false, deleteKey: null };
const refs = {
  fileInput: $('#file-input'), dropzone: $('#dropzone'), uploadButton: $('#upload-button'),
  selectedFile: $('#selected-file'), selectedThumb: $('#selected-thumb'),
  selectedName: $('#selected-name'), selectedSize: $('#selected-size'),
  gallery: $('#gallery-grid'), empty: $('#empty-state'), error: $('#gallery-error'),
  summary: $('#gallery-summary'), count: $('#image-count'),
  toast: $('#toast'), progress: $('#upload-progress'),
};

$('#today').textContent = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function notify(message, error = false) {
  refs.toast.textContent = message;
  refs.toast.classList.toggle('error', error);
  refs.toast.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => refs.toast.classList.remove('visible'), 4500);
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'La solicitud no pudo completarse.');
  return data;
}

function setFile(file) {
  if (!file) return;
  if (!TYPES.has(file.type)) return notify('Usa una imagen JPG, PNG o WebP.', true);
  if (file.size < 1 || file.size > MAX_SIZE) return notify('La imagen debe pesar menos de 5 MB.', true);
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.file = file;
  state.objectUrl = URL.createObjectURL(file);
  refs.selectedThumb.style.backgroundImage = `url("${state.objectUrl}")`;
  refs.selectedName.textContent = file.name;
  refs.selectedSize.textContent = formatBytes(file.size);
  refs.selectedFile.hidden = false;
  refs.selectedFile.classList.add('is-visible');
  refs.uploadButton.disabled = false;
  $('#drop-title').textContent = 'Imagen lista para subir';
}

function clearFile() {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.file = null;
  state.objectUrl = null;
  refs.fileInput.value = '';
  refs.selectedFile.hidden = true;
  refs.selectedFile.classList.remove('is-visible');
  refs.uploadButton.disabled = true;
  $('#drop-title').textContent = 'Arrastra tu imagen aquí';
}

refs.dropzone.addEventListener('click', () => refs.fileInput.click());
refs.dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refs.fileInput.click(); }
});
refs.fileInput.addEventListener('change', () => setFile(refs.fileInput.files[0]));
refs.dropzone.addEventListener('dragover', (event) => { event.preventDefault(); refs.dropzone.classList.add('dragging'); });
refs.dropzone.addEventListener('dragleave', () => refs.dropzone.classList.remove('dragging'));
refs.dropzone.addEventListener('drop', (event) => { event.preventDefault(); refs.dropzone.classList.remove('dragging'); setFile(event.dataTransfer.files[0]); });
$('#clear-file').addEventListener('click', clearFile);

refs.uploadButton.addEventListener('click', async () => {
  if (!state.file || state.busy) return;
  state.busy = true;
  refs.uploadButton.disabled = true;
  refs.uploadButton.firstChild.textContent = 'Subiendo imagen ';
  refs.progress.hidden = false;
  refs.progress.classList.add('is-visible');
  try {
    const file = state.file;
    const signed = await api('/api/upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(signed.fields)) form.append(name, value);
    form.append('file', file);
    const sent = await fetch(signed.uploadUrl, { method: 'POST', body: form });
    if (!sent.ok) throw new Error('S3 rechazó la carga. Revisa CORS y los permisos del bucket.');
    await api('/api/images/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: signed.key }),
    });
    clearFile();
    notify('Imagen guardada de forma segura.');
    await loadGallery();
  } catch (error) {
    notify(error.message, true);
  } finally {
    state.busy = false;
    refs.progress.hidden = true;
    refs.progress.classList.remove('is-visible');
    refs.uploadButton.firstChild.textContent = 'Subir imagen ';
    refs.uploadButton.disabled = !state.file;
  }
});

function makeButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function openPreview(image) {
  $('#preview-image').src = image.url;
  $('#preview-image').alt = image.name;
  $('#preview-name').textContent = image.name;
  $('#preview-date').textContent = formatDate(image.lastModified);
  $('#preview-dialog').showModal();
}

function makeCard(image) {
  const article = document.createElement('article'); article.className = 'image-card';
  const photo = document.createElement('div'); photo.className = 'image-photo';
  const img = document.createElement('img'); img.src = image.url; img.alt = image.name; img.loading = 'lazy';
  img.addEventListener('click', () => openPreview(image));
  const zoom = makeButton('↗', 'image-zoom', () => openPreview(image));
  zoom.setAttribute('aria-label', `Ampliar ${image.name}`);
  photo.append(img, zoom);
  const details = document.createElement('div'); details.className = 'image-details';
  const name = document.createElement('strong'); name.textContent = image.name;
  const meta = document.createElement('span'); meta.textContent = `${formatDate(image.lastModified)} · ${formatBytes(image.size)}`;
  const actions = document.createElement('div'); actions.className = 'image-actions';
  const download = document.createElement('a'); download.href = image.url; download.target = '_blank'; download.rel = 'noopener noreferrer'; download.textContent = 'Abrir imagen ↗';
  const remove = makeButton('Eliminar', 'delete-action', () => { state.deleteKey = image.key; $('#confirm-dialog').showModal(); });
  actions.append(download, remove); details.append(name, meta, actions); article.append(photo, details);
  return article;
}

function renderGallery() {
  const query = $('#search-input').value.trim().toLocaleLowerCase('es');
  const order = $('#sort-select').value;
  const matching = state.images.filter((image) => image.name.toLocaleLowerCase('es').includes(query));
  matching.sort((a, b) => order === 'name'
    ? a.name.localeCompare(b.name, 'es')
    : order === 'oldest'
      ? new Date(a.lastModified) - new Date(b.lastModified)
      : new Date(b.lastModified) - new Date(a.lastModified));
  refs.gallery.replaceChildren(...matching.map(makeCard));
  refs.empty.hidden = matching.length > 0 || Boolean($('#gallery-error').hidden === false);
  refs.summary.textContent = query ? `${matching.length} resultado${matching.length === 1 ? '' : 's'}` : `${state.images.length} ${state.images.length === 1 ? 'imagen' : 'imágenes'} en tu archivo`;
  refs.count.textContent = state.images.length;
}

async function loadGallery() {
  refs.summary.textContent = 'Cargando imágenes…';
  refs.gallery.setAttribute('aria-busy', 'true');
  refs.error.hidden = true;
  refs.empty.hidden = true;
  try {
    const data = await api('/api/images');
    state.images = data.images;
    renderGallery();
    if (data.truncated) notify('Se muestran las primeras 200 imágenes.');
  } catch (error) {
    refs.gallery.replaceChildren();
    refs.count.textContent = '—';
    refs.summary.textContent = 'Galería no disponible';
    refs.error.hidden = false;
    $('#gallery-error-message').textContent = error.message;
  } finally {
    refs.gallery.removeAttribute('aria-busy');
  }
}

$('#search-input').addEventListener('input', renderGallery);
$('#sort-select').addEventListener('change', renderGallery);
$('#refresh-button').addEventListener('click', loadGallery);
$('#retry-button').addEventListener('click', loadGallery);
$('#dialog-close').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('close', () => { $('#preview-image').removeAttribute('src'); });
$('#cancel-delete').addEventListener('click', () => $('#confirm-dialog').close());
$('#confirm-delete').addEventListener('click', async () => {
  const key = state.deleteKey;
  $('#confirm-dialog').close();
  if (!key) return;
  try {
    await api(`/api/images/${encodeURIComponent(key)}`, { method: 'DELETE' });
    notify('Imagen eliminada de la galería.');
    await loadGallery();
  } catch (error) { notify(error.message, true); }
  finally { state.deleteKey = null; }
});

async function checkHealth() {
  const dot = $('#service-dot');
  const label = $('#service-label');
  try {
    const result = await api('/api/health');
    dot.classList.add(result.configured ? 'online' : 'offline');
    label.textContent = result.configured ? `S3 · ${result.region}` : 'S3 sin configurar';
  } catch {
    dot.classList.add('offline');
    label.textContent = 'Servicio no disponible';
  }
}

checkHealth();
loadGallery();
setInterval(() => { if (!document.hidden) loadGallery(); }, 12 * 60 * 1000);
