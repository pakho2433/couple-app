const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const { perform, showToast, updateComposerState } = CS.ui;

const MAX_STORAGE_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 60;

let recorder = null;
let recorderStream = null;
let recorderChunks = [];
let recorderStartedAt = 0;
let recorderTimer = null;
let discardRecording = false;
let sendAfterStop = false;

function isRecording() {
  return recorder?.state === 'recording';
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

function createRecorder(stream, mimeType) {
  const options = { audioBitsPerSecond: 32000 };
  if (mimeType) options.mimeType = mimeType;
  try {
    return new MediaRecorder(stream, options);
  } catch (error) {
    console.warn('Low bitrate recorder unavailable, using browser default:', error);
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }
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
  sendAfterStop = false;
  recorderChunks = [];
  recorderStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const selectedType = preferredRecordingType();
  const activeRecorder = createRecorder(recorderStream, selectedType);
  recorder = activeRecorder;

  activeRecorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) recorderChunks.push(event.data);
  });

  activeRecorder.addEventListener('stop', async () => {
    const chunks = [...recorderChunks];
    const shouldDiscard = discardRecording;
    const shouldSend = sendAfterStop;
    const contentType = activeRecorder.mimeType || selectedType || 'audio/mp4';
    resetRecorderUi();
    if (shouldDiscard || !shouldSend || !chunks.length) return;

    const blob = new Blob(chunks, { type: contentType });
    if (!blob.size) {
      showToast('錄音內容是空的，請再試一次。');
      return;
    }
    if (blob.size > MAX_STORAGE_AUDIO_BYTES) {
      showToast('錄音檔案太大，請錄製較短內容。');
      return;
    }

    await perform(async () => {
      const extension = CS.media.extensionForType(contentType, 'm4a');
      await CS.media.sendMedia(blob, {
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
      sendAfterStop = true;
      activeRecorder.stop();
      showToast('錄音已達 1 分鐘，正在傳送。');
    }
  }, 500);
}

function cancelRecording() {
  if (!isRecording()) return;
  discardRecording = true;
  sendAfterStop = false;
  recorder.stop();
  showToast('已取消錄音');
}

function sendRecording() {
  if (!isRecording()) return;
  discardRecording = false;
  sendAfterStop = true;
  recorder.stop();
}

Object.assign(CS.media, {
  isRecording,
  startRecording,
  cancelRecording,
  sendRecording,
});
