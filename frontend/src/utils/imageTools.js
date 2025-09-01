// frontend/src/utils/imageTools.js
export async function readImageDimensions(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = url;
  });
  const { width, height } = img;
  URL.revokeObjectURL(url);
  return { width, height };
}

export async function resizeImage(file, maxW, maxH, outputType = 'image/png', quality = 0.92) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = url;
  });

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1); // no agrandar
  const newW = Math.max(1, Math.round(width * ratio));
  const newH = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, newW, newH);

  const blob = await new Promise((res) => {
    canvas.toBlob(res, outputType, quality);
  });

  URL.revokeObjectURL(url);
  const nameBase = (file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([blob], `${nameBase}.png`, { type: outputType });
}

export function bytesToKB(b) {
  return Math.round(b / 1024);
}
