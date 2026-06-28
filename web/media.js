const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  addDoc, collection, deleteObject, getDownloadURL, serverTimestamp,
  storageRef, uploadBytesResumable,
} = CS.fb;
const { activateTab, perform, showToast, updateComposerState } = CS.ui;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 5 * 60;

let recorder = null;
let recorderStream = null;
let recorderChunks = [];
let recorderStartedAt = 0;
let recorderTimer = null;
let discardRecording = false;
let uploadRecordingAfterStop = false;

function isRecording() {
  return recorder?.state === 'recording';
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
  if (item.type === 'image') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-image-button';
    button.setAttribute('aria-label', '放大圖片');
    const image = document.createElement('img');
    image.className = 'message-image';
    image.src = item.mediaUrl;
    image.alt = item.fileName || '聊天圖片';
    image.loading = 'lazy';
    image.decoding = 'async';
    button.append(image);
    button.addEventListener('click', () => openImageViewer(item.mediaUrl, image.alt));
    bubble.append(button);
    return;
  }

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.className = 'message-video';
    video.src = item.mediaUrl;
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
  audio.src = item.mediaUrl;
  audio.controls = true;
  audio.preload = 'metadata';
  wrap.append(icon, audio);
  bubble.append(wrap);
}

function validateSelectedFile(file) {
  if (!file) throw new Error('未有選擇檔案。');
  if (file.type.startsWith('image/')) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('圖片不可超過 12 MB。');
    return 'image';
  }
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error('影片不可超過 50 MB。');
    return 'video';
  }
  throw new Error('只支援圖片及影片檔案。');
}

function extensionForType(contentType, fallback = 'bin') {
  const map = {
    'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
    'video/quicktime': 'mov', 'video/mp4': 'mp4',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
  };
  const cleanType = String(contentType || '').split(';')[0];
  return map[cleanType] || cleanType.split('/')[1] || fallback;
}

function safeExtension(fileName, contentType) {
  const parts = String(fileName || '').split('.');
  const candidate = parts.length > 1 ? parts.pop().toLowerCase() : '';
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

async function uploadMedia(blob, { type, fileName, contentType }) {
  if (S.members.length !== 2 || !S.profile.coupleId || !S.storage) {
    throw new Error('尚未完成配對或 Firebase Storage 未初始化。');
  }

  const extension = safeExtension(fileName, contentType);
  const objectName = makeObjectName(extension);
  const path = `couples/${S.profile.coupleId}/${S.uid}/${objectName}`;
  const objectRef = storageRef(S.storage, path);
  const upload = uploadBytesResumable(objectRef, blob, {
    contentType,
    customMetadata: {
      coupleId: S.profile.coupleId,
      senderId: S.uid,
      messageType: type,
    },
  });

  await new Promise((resolve, reject) => {
    upload.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        showToast(`正在上傳 ${percent}%`, 10000);
      },
      reject,
      resolve,
    );
  });

  const mediaUrl = await getDownloadURL(objectRef);
  try {
    await addDoc(collection(S.db, 'couples', S.profile.coupleId, 'messages'), {
      senderId: S.uid,
      type,
      mediaUrl,
      storagePath: path,
      contentType,
      fileName: cleanDisplayName(fileName, objectName),
      size: blob.size,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(objectRef).catch(() => {});
    throw error;
  }

  activateTab('chat');
  const label = { image: '圖片', video: '影片', audio: '錄音' }[type];
  showToast(`${label}已傳送`);
}

async function handleMediaSelection(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  await perform(async () => {
    const type = validateSelectedFile(file);
    const fallbackType = type === 'image' ? 'image/jpeg' : 'video/mp4';
    await uploadMedia(file, {
      type,
      fileName: file.name,
      contentType: file.type || fallbackType,
    });
  });
}

function preferredRecordingType() {
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function resetRecorderUi() {
  clearInterval(recorderTimer);
  recorderTimer = null;
  recorderStream?.getTracks().forEach((track) => track.stop());
  recorderStream = null;
  recorder = null;
  recorderChunks = [];
  recorderStartedAt = 0;
  $('recording-panel').classList.add('hidden');
  $('recording-time').textContent = '00:00';
  updateComposerState();
}

async function startRecording() {
  if (S.busy || isRecording() || S.members.length !== 2) return;
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    throw new DOMException('Recording is not supported', 'NotSupportedError');
  }

  discardRecording = false;
  uploadRecordingAfterStop = false;
  recorderChunks = [];
  recorderStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });

  const selectedType = preferredRecordingType();
  const activeRecorder = selectedType
    ? new MediaRecorder(recorderStream, { mimeType: selectedType })
    : new MediaRecorder(recorderStream);
  recorder = activeRecorder;

  activeRecorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) recorderChunks.push(event.data);
  });

  activeRecorder.addEventListener('stop', async () => {
    const chunks = [...recorderChunks];
    const shouldDiscard = discardRecording;
    const shouldUpload = uploadRecordingAfterStop;
    const contentType = activeRecorder.mimeType || selectedType || 'audio/mp4';
    resetRecorderUi();
    if (shouldDiscard || !shouldUpload || !chunks.length) return;

    const blob = new Blob(chunks, { type: contentType });
    if (!blob.size) {
      showToast('錄音內容是空的，請再試一次。');
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      showToast('錄音檔案太大，請錄製較短內容。');
      return;
    }

    await perform(async () => {
      const extension = extensionForType(contentType, 'm4a');
      await uploadMedia(blob, {
        type: 'audio',
        fileName: `voice-${Date.now()}.${extension}`,
        contentType,
      });
    });
  }, { once: true });

  activeRecorder.start(1000);
  recorderStartedAt = Date.now();
  $('recording-panel').classList.remove('hidden');
  $('recording-time').textContent = '00:00';
  updateComposerState();

  recorderTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recorderStartedAt) / 1000);
    $('recording-time').textContent = formatDuration(elapsed);
    if (elapsed >= MAX_RECORDING_SECONDS && isRecording()) {
      uploadRecordingAfterStop = true;
      activeRecorder.stop();
      showToast('錄音已達 5 分鐘，正在傳送。');
    }
  }, 500);
}

function cancelRecording() {
  if (!isRecording()) return;
  discardRecording = true;
  uploadRecordingAfterStop = false;
  recorder.stop();
  showToast('已取消錄音');
}

function sendRecording() {
  if (!isRecording()) return;
  discardRecording = false;
  uploadRecordingAfterStop = true;
  recorder.stop();
}

Object.assign(CS.media, {
  isRecording,
  openImageViewer,
  closeImageViewer,
  appendMediaContent,
  handleMediaSelection,
  startRecording,
  cancelRecording,
  sendRecording,
});
