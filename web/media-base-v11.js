const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  addDoc, collection, deleteObject, getDownloadURL, serverTimestamp,
  storageRef, uploadBytesResumable,
} = CS.fb;
const { activateTab, showToast } = CS.ui;

const MAX_INLINE_BLOB_BYTES = 560 * 1024;
const MAX_INLINE_DATA_CHARS = 780000;

function mediaSource(item) {
  return item.mediaUrl || item.mediaData || '';
}

function openImageViewer(url, alt = '聊天圖片') {
  $('viewer-image').src = url;
  $('viewer-image').alt = alt;
  $('media-viewer').classList.remove('hidden');
  document.body.classList.add('viewer-open');
}

function closeImageViewer() {
  $('media-viewer').classList.add('hidden');
  $('viewer-image').removeAttribute('src');
  document.body.classList.remove('viewer-open');
}

function appendMediaContent(bubble, item) {
  const source = mediaSource(item);
  if (item.type === 'image') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-image-button';
    button.setAttribute('aria-label', '放大圖片');
    const image = document.createElement('img');
    image.className = 'message-image';
    image.src = source;
    image.alt = item.fileName || '聊天圖片';
    image.loading = 'lazy';
    image.decoding = 'async';
    button.append(image);
    button.addEventListener('click', () => openImageViewer(source, image.alt));
    bubble.append(button);
    return;
  }

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.className = 'message-video';
    video.src = source;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    bubble.append(video);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'message-audio-wrap';
  const icon = document.createElement('span');
  icon.className = 'audio-icon';
  icon.textContent = '🎤';
  const audio = document.createElement('audio');
  audio.className = 'message-audio';
  audio.src = source;
  audio.controls = true;
  audio.preload = 'metadata';
  wrap.append(icon, audio);
  bubble.append(wrap);
}

function extensionOf(fileName) {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function extensionForType(contentType, fallback = 'bin') {
  const cleanType = String(contentType || '').split(';')[0];
  const map = {
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'video/quicktime': 'mov',
    'video/mp4': 'mp4',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return map[cleanType] || cleanType.split('/')[1] || fallback;
}

function safeExtension(fileName, contentType) {
  const candidate = extensionOf(fileName);
  return /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : extensionForType(contentType);
}

function makeObjectName(extension) {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  return `${Date.now()}-${randomPart}.${extension}`;
}

function cleanDisplayName(fileName, fallback) {
  return String(fileName || fallback).slice(0, 255);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
    reader.addEventListener('error', () => reject(reader.error || new Error('讀取媒體失敗。')), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function sendInlineMedia(blob, metadata) {
  const roomId = CS.rooms.currentRoomId();
  if (!roomId || S.members.length !== 2) throw new Error('尚未完成配對。');
  if (blob.size > MAX_INLINE_BLOB_BYTES) throw new Error('媒體超出免費傳送大小。');

  const mediaData = await blobToDataUrl(blob);
  if (!mediaData || mediaData.length > MAX_INLINE_DATA_CHARS) {
    throw new Error('媒體超出免費傳送大小。');
  }

  await addDoc(collection(S.db, 'couples', roomId, 'messages'), {
    senderId: S.uid,
    type: metadata.type,
    mediaData,
    contentType: metadata.contentType,
    fileName: cleanDisplayName(metadata.fileName, `${metadata.type}-${Date.now()}`),
    size: blob.size,
    createdAt: serverTimestamp(),
  });
}

async function uploadStorageMedia(blob, metadata) {
  const roomId = CS.rooms.currentRoomId();
  if (S.members.length !== 2 || !roomId || !S.storage) {
    throw new Error('尚未完成配對或 Firebase Storage 未初始化。');
  }

  const extension = safeExtension(metadata.fileName, metadata.contentType);
  const objectName = makeObjectName(extension);
  const path = `couples/${roomId}/${S.uid}/${objectName}`;
  const objectRef = storageRef(S.storage, path);
  const upload = uploadBytesResumable(objectRef, blob, {
    contentType: metadata.contentType,
    customMetadata: {
      coupleId: roomId,
      senderId: S.uid,
      messageType: metadata.type,
    },
  });

  await new Promise((resolve, reject) => {
    upload.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        showToast(`正在上載 ${percent}%`, 10000);
      },
      reject,
      resolve,
    );
  });

  const mediaUrl = await getDownloadURL(objectRef);
  try {
    await addDoc(collection(S.db, 'couples', roomId, 'messages'), {
      senderId: S.uid,
      type: metadata.type,
      mediaUrl,
      storagePath: path,
      contentType: metadata.contentType,
      fileName: cleanDisplayName(metadata.fileName, objectName),
      size: blob.size,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(objectRef).catch(() => {});
    throw error;
  }
}

async function sendMedia(blob, metadata) {
  if (['image', 'audio'].includes(metadata.type) && blob.size <= MAX_INLINE_BLOB_BYTES) {
    await sendInlineMedia(blob, metadata);
  } else {
    await uploadStorageMedia(blob, metadata);
  }
  activateTab('chat');
  const label = { image: '圖片', video: '影片', audio: '錄音' }[metadata.type];
  showToast(`${label}已傳送`);
}

Object.assign(CS.media, {
  MAX_INLINE_BLOB_BYTES,
  extensionOf,
  extensionForType,
  openImageViewer,
  closeImageViewer,
  appendMediaContent,
  sendMedia,
  isRecording: () => false,
});
