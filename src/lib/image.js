// Shrink a photo in the browser before it is uploaded.
//
// A phone photo is 3–12 MB. Ten of those over mobile data is a form nobody
// finishes, and storage that fills up fast — so each one is scaled down and
// re-encoded as a JPEG first. 1600 px on the long edge keeps a car photo sharp
// on any screen; documents are kept larger so the small print stays readable.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as a photo. Use a JPG or PNG.'));
    };
    img.src = url;
  });
}

/**
 * @returns {Promise<File>} a JPEG no longer than `maxEdge` px on its long side.
 * Anything that is not an image (a PDF) is returned untouched.
 */
export async function compressImage(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (fileKind(file) !== 'image') return file;

  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest) throw new Error('That photo appears to be empty.');
  const scale = Math.min(1, maxEdge / longest);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  // A transparent PNG would otherwise come out with a black background.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('That photo could not be processed. Try another one.');

  const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

/**
 * 'image', 'pdf' or null. Some phone file pickers hand over a file with no
 * type at all, so fall back to the extension before giving up on it.
 */
export function fileKind(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (type === 'application/pdf' || (!type && name.endsWith('.pdf'))) return 'pdf';
  if (type.startsWith('image/') || (!type && /\.(jpe?g|png|webp|heic|heif)$/.test(name))) return 'image';
  return null;
}
