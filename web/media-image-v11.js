const CS = globalThis.CoupleSpace;
const { perform, showToast } = CS.ui;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function detectFileKind(file) {
  const type = String(file?.type || '').toLowerCase();
  const extension = CS.media.extensionOf(file?.name);
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(extension)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm'].includes(extension)) return 'video';
  return '';
}

function validateSelectedFile(file) {
  if (!file) throw new Error('未有選擇檔案。');
  const kind = detectFileKind(file);
  if (kind === 'image') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('圖片不可超過 12 MB。');
    return kind;
  }
  if (kind === 'video') {
    if (file.size > MAX_VIDEO_BYTES) throw new Error('影片不可超過 50 MB。');
    return kind;
  }
  throw new Error('只支援圖片及影片檔案。');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('這張圖片格式未能讀取，請先在相片 App 截圖後再傳送。'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function compressImage(file) {
  const image = await loadImage(file);
  let smallest = null;

  for (const maxDimension of [1280, 1024, 800, 640]) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.78, 0.66, 0.54, 0.42, 0.32]) {
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) continue;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= CS.media.MAX_INLINE_BLOB_BYTES) return blob;
    }
  }

  if (!smallest) throw new Error('圖片壓縮失敗，請選擇另一張圖片。');
  return smallest;
}

async function handleMediaSelection(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  await perform(async () => {
    const type = validateSelectedFile(file);
    if (type === 'image') {
      showToast('正在壓縮圖片…', 10000);
      const compressed = await compressImage(file);
      const baseName = String(file.name || 'photo').replace(/\.[^.]+$/, '');
      await CS.media.sendMedia(compressed, {
        type: 'image',
        fileName: `${baseName}.jpg`,
        contentType: 'image/jpeg',
      });
      return;
    }

    await CS.media.sendMedia(file, {
      type: 'video',
      fileName: file.name || `video-${Date.now()}.mp4`,
      contentType: file.type || 'video/mp4',
    });
  });
}

Object.assign(CS.media, {
  handleMediaSelection,
});
