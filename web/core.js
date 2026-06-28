const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = (id) => document.getElementById(id);
CS.$ = $;

Object.assign(S, {
  auth: null,
  db: null,
  storage: null,
  uid: null,
  profile: {},
  members: [],
  busy: false,
  activeTab: 'chat',
  soundEnabled: localStorage.getItem('coupleSound') === '1',
  audioContext: null,
  unreadCount: 0,
  messagesReady: false,
  unsubscribeProfile: null,
  unsubscribeCouple: null,
  unsubscribeMessages: null,
  toastTimer: null,
});

const GIFTS = [
  { emoji: '🌹', name: '玫瑰' }, { emoji: '🧋', name: '珍珠奶茶' },
  { emoji: '🍰', name: '蛋糕' }, { emoji: '🤗', name: '擁抱券' },
  { emoji: '💋', name: '親吻券' }, { emoji: '🎬', name: '電影約會' },
  { emoji: '💌', name: '情書' }, { emoji: '❤️', name: '愛心' },
];
const screens = ['loading-screen', 'config-screen', 'onboarding-screen', 'couple-screen'];

function hasFirebaseConfig() {
  return Object.values(CS.firebaseConfig).every(
    (value) => typeof value === 'string' && value && !value.includes('__FIREBASE_'),
  );
}
function showScreen(id) {
  for (const screenId of screens) $(screenId).classList.toggle('hidden', screenId !== id);
}
function updateComposerState() {
  const connected = S.members.length === 2;
  const recording = CS.media.isRecording?.() || false;
  const hasText = $('message-input')?.value.trim();
  if ($('message-input')) {
    $('message-input').disabled = !connected || S.busy || recording;
    $('message-input').placeholder = connected ? '輸入訊息…' : '等待另一半加入…';
  }
  if ($('send-button')) $('send-button').disabled = !connected || !hasText || S.busy || recording;
  if ($('media-button')) $('media-button').disabled = !connected || S.busy || recording;
  if ($('record-button')) $('record-button').disabled = !connected || S.busy || recording;
  if ($('cancel-recording')) $('cancel-recording').disabled = S.busy || !recording;
  if ($('send-recording')) $('send-recording').disabled = S.busy || !recording;
  document.querySelectorAll('.gift-card').forEach((button) => {
    button.disabled = !connected || S.busy || recording;
  });
}
function setBusy(value) {
  S.busy = value;
  $('busy-overlay').classList.toggle('hidden', !value);
  document.querySelectorAll('button').forEach((button) => {
    if (button.id !== 'dismiss-install') button.disabled = value;
  });
  updateComposerState();
}
function showToast(message, duration = 2600) {
  clearTimeout(S.toastTimer);
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  S.toastTimer = setTimeout(() => $('toast').classList.add('hidden'), duration);
}
function errorMessage(error) {
  const code = error?.code || '';
  const name = error?.name || '';
  const message = String(error?.message || '');
  if (name === 'NotAllowedError') return '未允許使用咪高峰，請到 Safari／iPhone 設定開啟咪高峰權限。';
  if (name === 'NotSupportedError') return '這部裝置暫時不支援網頁錄音。';
  if (code.includes('storage/quota-exceeded') || message.includes('402')) return 'Firebase Storage 尚未可用：請啟用 Blaze 方案及建立 Storage。';
  if (code.includes('storage/unauthorized')) return '圖片／錄音／影片權限未設定完成，請發布 Storage Rules。';
  if (code.includes('storage/retry-limit-exceeded')) return '上傳逾時，請檢查網絡後再試。';
  if (code.includes('permission-denied')) return '資料庫權限未設定完成，請部署最新 Firestore Rules。';
  if (code.includes('auth/operation-not-allowed')) return 'Firebase 尚未啟用 Anonymous 登入。';
  if (code.includes('auth/unauthorized-domain')) return '請將 pakho2433.github.io 加入 Firebase 授權網域。';
  return error?.message || '暫時未能完成，請稍後再試。';
}
async function perform(task) {
  if (S.busy) return;
  setBusy(true);
  try { await task(); }
  catch (error) { console.error(error); showToast(errorMessage(error), 5200); }
  finally { setBusy(false); }
}
function makePairCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function formatTime(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }) : '傳送中…';
}
function updateSoundButton() {
  const button = $('sound-button');
  button.textContent = S.soundEnabled ? '🔊' : '🔇';
  button.classList.toggle('enabled', S.soundEnabled);
  button.setAttribute('aria-label', S.soundEnabled ? '關閉訊息提示聲' : '開啟訊息提示聲');
}
async function playTone() {
  if (!S.soundEnabled) return;
  try {
    S.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (S.audioContext.state === 'suspended') await S.audioContext.resume();
    const oscillator = S.audioContext.createOscillator();
    const gain = S.audioContext.createGain();
    oscillator.frequency.setValueAtTime(720, S.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(940, S.audioContext.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, S.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, S.audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, S.audioContext.currentTime + 0.22);
    oscillator.connect(gain); gain.connect(S.audioContext.destination);
    oscillator.start(); oscillator.stop(S.audioContext.currentTime + 0.23);
  } catch (error) { console.warn('Unable to play message tone:', error); }
}
async function toggleSound() {
  S.soundEnabled = !S.soundEnabled;
  localStorage.setItem('coupleSound', S.soundEnabled ? '1' : '0');
  updateSoundButton();
  if (S.soundEnabled) await playTone();
  showToast(S.soundEnabled ? 'App 內訊息提示聲已開啟' : 'App 內訊息提示聲已關閉');
}
function updateUnreadBadge() {
  const badge = $('unread-badge');
  badge.textContent = S.unreadCount > 99 ? '99+' : String(S.unreadCount);
  badge.classList.toggle('hidden', S.unreadCount === 0);
  document.title = S.unreadCount > 0 ? `(${S.unreadCount}) Couple Space` : 'Couple Space';
}
function clearUnread() { S.unreadCount = 0; updateUnreadBadge(); }
function activateTab(name) {
  S.activeTab = name;
  const chat = name === 'chat';
  $('chat-tab').classList.toggle('active', chat);
  $('gift-tab').classList.toggle('active', !chat);
  $('chat-panel').classList.toggle('hidden', !chat);
  $('gift-panel').classList.toggle('hidden', chat);
  if (chat) clearUnread();
}
function updateCoupleHeader() {
  const connected = S.members.length === 2;
  $('space-title').textContent = connected ? '我哋嘅二人空間 💞' : '等待另一半加入 💗';
  $('connection-status').textContent = connected ? '● 另一半已連線' : '○ 尚未完成配對';
  $('invite-card').classList.toggle('hidden', connected || !S.profile.inviteCode);
  $('invite-code').textContent = S.profile.inviteCode || '--------';
  updateComposerState();
}
function renderGifts() {
  const grid = $('gift-grid'); grid.replaceChildren();
  for (const gift of GIFTS) {
    const button = document.createElement('button');
    button.className = 'gift-card'; button.type = 'button';
    const emoji = document.createElement('span'); emoji.className = 'emoji'; emoji.textContent = gift.emoji;
    const name = document.createElement('strong'); name.textContent = gift.name;
    button.append(emoji, name);
    button.addEventListener('click', () => CS.chat.sendGift(gift));
    grid.append(button);
  }
  updateComposerState();
}
Object.assign(CS.ui, {
  hasFirebaseConfig, showScreen, updateComposerState, setBusy, showToast, errorMessage,
  perform, makePairCode, isStandalone, formatTime, updateSoundButton, playTone,
  toggleSound, updateUnreadBadge, clearUnread, activateTab, updateCoupleHeader, renderGifts,
});
