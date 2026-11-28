// Render the visible QR crop and its CSS treatment at source resolution.
// Pixel filters also work in browsers without CanvasRenderingContext2D.filter.
function applyFilters(context, width, height, filter) {
  const operations = [...filter.matchAll(/(grayscale|invert|contrast|brightness)\(([\d.]+)(%)?\)/g)]
    .map(([, name, value, percent]) => [name, Number(value) / (percent ? 100 : 1)]);
  if (!operations.length) return;
  const pixels = context.getImageData(0, 0, width, height);
  const clamp = value => Math.max(0, Math.min(255, value));
  for (let i = 0; i < pixels.data.length; i += 4) {
    let r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    for (const [name, amount] of operations) {
      if (name === 'grayscale') {
        const gray = r * .2126 + g * .7152 + b * .0722;
        r += (gray - r) * amount; g += (gray - g) * amount; b += (gray - b) * amount;
      } else if (name === 'invert') {
        r = r * (1 - amount) + (255 - r) * amount;
        g = g * (1 - amount) + (255 - g) * amount;
        b = b * (1 - amount) + (255 - b) * amount;
      } else if (name === 'contrast') {
        r = (r - 127.5) * amount + 127.5; g = (g - 127.5) * amount + 127.5; b = (b - 127.5) * amount + 127.5;
      } else {
        r *= amount; g *= amount; b *= amount;
      }
      r = clamp(r); g = clamp(g); b = clamp(b);
    }
    pixels.data[i] = r; pixels.data[i + 1] = g; pixels.data[i + 2] = b;
  }
  context.putImageData(pixels, 0, 0);
}

export default async function renderDisplayedQr(media, fallbackSource) {
  const element = media.querySelector('img');
  const source = new Image();
  source.src = element.currentSrc || fallbackSource;
  await source.decode();

  const bounds = media.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const mediaStyle = getComputedStyle(media);
  const fit = Math.min(rect.width / source.naturalWidth, rect.height / source.naturalHeight);
  const width = style.objectFit === 'contain' ? source.naturalWidth * fit : rect.width;
  const height = style.objectFit === 'contain' ? source.naturalHeight * fit : rect.height;
  const left = rect.left - bounds.left + (rect.width - width) / 2;
  const top = rect.top - bounds.top + (rect.height - height) / 2;
  const scale = source.naturalWidth / width;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const paint = layer.getContext('2d', { willReadFrequently: true });
  paint.drawImage(source, left * scale, top * scale, width * scale, height * scale);
  applyFilters(paint, layer.width, layer.height, style.filter);
  context.fillStyle = mediaStyle.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(layer, 0, 0);
  applyFilters(context, canvas.width, canvas.height, mediaStyle.filter);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('QR export failed')), 'image/png'));
  return { image: URL.createObjectURL(blob), aspectRatio: canvas.width / canvas.height };
}
