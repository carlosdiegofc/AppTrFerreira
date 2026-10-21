// A photo picked in the panel (a fuel receipt, a paper), as the storage takes it (JPEG, up to 10 MB): a JPEG of at most
// 1600 px on its longer side, turned the way the camera held it, like the app sends them.

const MAX_SIDE = 1600;
const QUALITY = 0.82;

export async function photoJpeg(file: Blob): Promise<Blob> {
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Sin lienzo para la foto');
    // A photo with transparency (a PNG) on white, not black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la foto'))), 'image/jpeg', QUALITY));
  } finally {
    image.close();
  }
}
