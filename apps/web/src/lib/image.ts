/**
 * Shrinks a photo to a JPEG data URL under `maxChars`, keeping as much quality as the budget allows. Redrawing on a
 * canvas also drops EXIF (including GPS location) and applies the phone's rotation.
 */
export async function compressImage(file: Blob, maxEdge: number, maxChars: number, qualities = [0.92, 0.86, 0.8, 0.72, 0.62]): Promise<string> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("This photo can't be read. Try a different one (JPEG or PNG works best).");
  }
  try {
    for (let edge = maxEdge; edge >= 480; edge = Math.round(edge * 0.85)) {
      const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not process the photo');
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      for (const q of qualities) {
        const url = canvas.toDataURL('image/jpeg', q);
        if (url.length <= maxChars) return url;
      }
    }
  } finally {
    bmp.close();
  }
  throw new Error('That photo is too large to shrink. Try another one.');
}

/** Both sizes are limited by what the API accepts (GLIMMER_FULL_MAX / GLIMMER_THUMB_MAX), with a little headroom. */
export const compressGlimmer = async (file: Blob) => ({
  full: await compressImage(file, 3000, 3_500_000),
  thumb: await compressImage(file, 1200, 380_000, [0.88, 0.82, 0.75, 0.66]),
});
