export const AVATAR_EDGE = 160;
export const AVATAR_DATA_LIMIT = 30_000;

export async function prepareAvatar(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('请选择 JPG、PNG 或 WebP 图片。');
  if (file.size > 10 * 1024 * 1024) throw Error('头像图片不能超过 10 MB。');

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    if (!size) throw Error('头像图片无法读取。');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_EDGE;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw Error('当前浏览器无法处理头像图片。');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, AVATAR_EDGE, AVATAR_EDGE);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
      size, size, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
    const data = canvas.toDataURL('image/jpeg', 0.76);
    if (data.length > AVATAR_DATA_LIMIT || !data.startsWith('data:image/jpeg;base64,'))
      throw Error('头像无法保存，请尝试另一张图片。');
    return data;
  } finally {
    URL.revokeObjectURL(source);
  }
}
