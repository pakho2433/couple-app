import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { firebaseConfig, publicAppUrl } from './firebase-config.js';

const GIFTS = [
  { emoji: '🌹', name: '玫瑰' },
  { emoji: '🧋', name: '珍珠奶茶' },
  { emoji: '🍰', name: '蛋糕' },
  { emoji: '🤗', name: '擁抱券' },
  { emoji: '💋', name: '親吻券' },
  { emoji: '🎬', name: '電影約會' },
  { emoji: '💌', name: '情書' },
  { emoji: '❤️', name: '愛心' },
];

const $ = (id) => document.getElementById(id);
const screens = ['loading-screen', 'config-screen', 'onboarding-screen', 'couple-screen'];

let auth;
let db;
let uid = null;
let profile = {};
let members = [];
let busy = false;
let activeTab = 'chat';
let soundEnabled = localStorage.getItem('coupleSound') === '1';
let audioContext;
let unreadCount = 0;
let messagesReady = false;
let unsubscribeProfile;
let unsubscribeCouple;
let unsubscribeMessages;
let toastTimer;

function hasFirebaseConfig() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === 'string' && value && !value.includes('__FIREBASE_'),
  );
}

function showScreen(id) {
  for (const screenId of screens) {
    $(screenId).classList.toggle('hidden', screenId !== id);
  }
}

function setBusy(value) {
  busy = value;
  $('busy-overlay').classList.toggle('hidden', !value);
  document.querySelectorAll('button').forEach((button) => {
    if (button.id !== 'dismiss-install') button.disabled = value;
  });
  updateComposerState();
}

function showToast(message, duration = 2600) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), duration);
}

function errorMessage(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return '資料庫權限未設定完成，請部署 Firestore Rules。';
  if (code.includes('auth/operation-not-allowed')) return 'Firebase 尚未啟用 Anonymous 登入。';
  if (code.includes('auth/unauthorized-domain')) return '請將 pakho2433.github.io 加入 Firebase 授權網域。';
  return error?.message || '暫時未能完成，請稍後再試。';
}

async function perform(task) {
  if (busy) return;
  setBusy(true);
  try {
    await task();
  } catch (error) {
    console.error(error);
    showToast(errorMessage(error), 4200);
  } finally {
    setBusy(false);
  }
}

function makePairCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 8 },
    () => characters[Math.floor(Math.random() * characters.length)],
  ).join('');
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function formatTime(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return '傳送中…';
  return date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
}

function updateSoundButton() {
  const button = $('sound-button');
  button.textContent = soundEnabled ? '🔊' : '🔇';
  button.classList.toggle('enabled', soundEnabled);
  button.setAttribute('aria-label', soundEnabled ? '關閉訊息提示聲' : '開啟訊息提示聲');
}

async function playTone() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(940, audioContext.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.23);
  } catch (error) {
    console.warn('Unable to play message tone:', error);
  }
}

async function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('coupleSound', soundEnabled ? '1' : '0');
  updateSoundButton();
  if (soundEnabled) {
    await playTone();
    showToast('App 內訊息提示聲已開啟');
  } else {
    showToast('App 內訊息提示聲已關閉');
  }
}

function updateUnreadBadge() {
  const badge = $('unread-badge');
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.classList.toggle('hidden', unreadCount === 0);
  document.title = unreadCount > 0 ? `(${unreadCount}) Couple Space` : 'Couple Space';
}

function clearUnread() {
  unreadCount = 0;
  updateUnreadBadge();
}

function updateComposerState() {
  const connected = members.length === 2;
  const hasText = $('message-input')?.value.trim();
  if ($('message-input')) {
    $('message-input').disabled = !connected || busy;
    $('message-input').placeholder = connected ? '輸入訊息…' : '等待另一半加入…';
  }
  if ($('send-button')) $('send-button').disabled = !connected || !hasText || busy;
  document.querySelectorAll('.gift-card').forEach((button) => {
    button.disabled = !connected || busy;
  });
}

function updateCoupleHeader() {
  const connected = members.length === 2;
  $('space-title').textContent = connected ? '我哋嘅二人空間 💞' : '等待另一半加入 💗';
  $('connection-status').textContent = connected ? '● 另一半已連線' : '○ 尚未完成配對';
  $('invite-card').classList.toggle('hidden', connected || !profile.inviteCode);
  $('invite-code').textContent = profile.inviteCode || '--------';
  updateComposerState();
}

function renderGifts() {
  const grid = $('gift-grid');
  grid.replaceChildren();
  for (const gift of GIFTS) {
    const button = document.createElement('button');
    button.className = 'gift-card';
    button.type = 'button';

    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = gift.emoji;

    const name = document.createElement('strong');
    name.textContent = gift.name;

    button.append(emoji, name);
    button.addEventListener('click', () => sendGift(gift));
    grid.append(button);
  }
  updateComposerState();
}

function renderMessages(items) {
  const container = $('messages');
  container.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = members.length === 2
      ? '講第一句甜言蜜語啦 💕'
      : '等待另一半輸入配對碼…';
    container.append(empty);
    return;
  }

  for (const item of [...items].reverse()) {
    const mine = item.senderId === uid;

    if (item.type === 'gift') {
      const gift = document.createElement('article');
      gift.className = 'gift-message';

      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.textContent = item.giftEmoji || '🎁';

      const text = document.createElement('strong');
      text.textContent = `${mine ? '你送出' : '你收到'}「${item.giftName || '神秘禮物'}」`;

      const time = document.createElement('time');
      time.textContent = formatTime(item.createdAt);

      gift.append(emoji, text, time);
      container.append(gift);
      continue;
    }

    const row = document.createElement('article');
    row.className = `message-row ${mine ? 'mine' : 'other'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = item.text || '';

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(item.createdAt);

    bubble.append(text, time);
    row.append(bubble);
    container.append(row);
  }

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function notifyForNewItems(snapshot) {
  if (!messagesReady) {
    messagesReady = true;
    return;
  }

  const incoming = snapshot.docChanges()
    .filter((change) => change.type === 'added')
    .map((change) => change.doc.data())
    .filter((item) => item.senderId !== uid);

  if (!incoming.length) return;

  const newest = incoming[incoming.length - 1];
  const isGift = newest.type === 'gift';
  const summary = isGift
    ? `${newest.giftEmoji || '🎁'} 收到「${newest.giftName || '禮物'}」`
    : `💬 ${String(newest.text || '新訊息').slice(0, 45)}`;

  if (document.hidden || activeTab !== 'chat') {
    unreadCount += incoming.length;
    updateUnreadBadge();
  }

  showToast(summary, 3600);
  playTone();
}

function stopCoupleListeners() {
  unsubscribeCouple?.();
  unsubscribeMessages?.();
  unsubscribeCouple = undefined;
  unsubscribeMessages = undefined;
  members = [];
  messagesReady = false;
}

function startCoupleListeners(coupleId) {
  stopCoupleListeners();

  unsubscribeCouple = onSnapshot(
    doc(db, 'couples', coupleId),
    (snapshot) => {
      members = snapshot.exists() ? snapshot.data().members || [] : [];
      updateCoupleHeader();
    },
    (error) => showToast(errorMessage(error), 4200),
  );

  const messageQuery = query(
    collection(db, 'couples', coupleId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );

  unsubscribeMessages = onSnapshot(
    messageQuery,
    (snapshot) => {
      const items = snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      }));
      renderMessages(items);
      notifyForNewItems(snapshot);
    },
    (error) => showToast(errorMessage(error), 4200),
  );
}

function startProfileListener(userId) {
  unsubscribeProfile?.();
  unsubscribeProfile = onSnapshot(
    doc(db, 'users', userId),
    (snapshot) => {
      const previousCoupleId = profile.coupleId;
      profile = snapshot.exists() ? snapshot.data() : {};

      if (profile.displayName) $('display-name').value = profile.displayName;

      if (profile.coupleId) {
        showScreen('couple-screen');
        if (previousCoupleId !== profile.coupleId) startCoupleListeners(profile.coupleId);
        updateCoupleHeader();
      } else {
        stopCoupleListeners();
        showScreen('onboarding-screen');
      }
    },
    (error) => showToast(errorMessage(error), 4200),
  );
}

async function createCouple() {
  await perform(async () => {
    const displayName = $('display-name').value.trim() || '我';
    let created = false;

    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const code = makePairCode();
      const coupleRef = doc(collection(db, 'couples'));
      const codeRef = doc(db, 'pairCodes', code);

      try {
        await runTransaction(db, async (transaction) => {
          const codeSnapshot = await transaction.get(codeRef);
          if (codeSnapshot.exists()) throw new Error('PAIR_CODE_COLLISION');

          transaction.set(coupleRef, {
            members: [uid],
            createdBy: uid,
            createdAt: serverTimestamp(),
          });
          transaction.set(codeRef, {
            coupleId: coupleRef.id,
            ownerUid: uid,
            createdAt: serverTimestamp(),
          });
          transaction.set(doc(db, 'users', uid), {
            displayName,
            coupleId: coupleRef.id,
            inviteCode: code,
          }, { merge: true });
        });
        created = true;
      } catch (error) {
        if (error.message !== 'PAIR_CODE_COLLISION') throw error;
      }
    }

    if (!created) throw new Error('未能產生配對碼，請再試一次。');
  });
}

async function joinCouple() {
  await perform(async () => {
    const displayName = $('display-name').value.trim() || '我';
    const code = $('join-code').value.trim().toUpperCase();
    if (code.length !== 8) throw new Error('請輸入完整 8 位配對碼。');

    const codeRef = doc(db, 'pairCodes', code);
    await runTransaction(db, async (transaction) => {
      const codeSnapshot = await transaction.get(codeRef);
      if (!codeSnapshot.exists()) throw new Error('配對碼不存在或已被使用。');

      const { coupleId } = codeSnapshot.data();
      const coupleRef = doc(db, 'couples', coupleId);
      const coupleSnapshot = await transaction.get(coupleRef);
      if (!coupleSnapshot.exists()) throw new Error('情侶空間不存在。');

      const currentMembers = coupleSnapshot.data().members || [];
      if (currentMembers.length >= 2 && !currentMembers.includes(uid)) {
        throw new Error('這個情侶空間已經有兩名成員。');
      }

      const nextMembers = currentMembers.includes(uid)
        ? currentMembers
        : [...currentMembers, uid];

      transaction.update(coupleRef, { members: nextMembers });
      transaction.set(doc(db, 'users', uid), { displayName, coupleId }, { merge: true });
      transaction.delete(codeRef);
    });
  });
}

async function sendText(event) {
  event.preventDefault();
  const input = $('message-input');
  const text = input.value.trim();
  if (!text || members.length !== 2 || !profile.coupleId) return;

  input.value = '';
  input.style.height = 'auto';
  updateComposerState();

  try {
    await addDoc(collection(db, 'couples', profile.coupleId, 'messages'), {
      senderId: uid,
      type: 'text',
      text,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    input.value = text;
    updateComposerState();
    showToast(errorMessage(error), 4200);
  }
}

async function sendGift(gift) {
  if (members.length !== 2 || !profile.coupleId) return;
  await perform(async () => {
    await addDoc(collection(db, 'couples', profile.coupleId, 'messages'), {
      senderId: uid,
      type: 'gift',
      giftEmoji: gift.emoji,
      giftName: gift.name,
      createdAt: serverTimestamp(),
    });
    activateTab('chat');
    showToast(`已送出 ${gift.emoji} ${gift.name}`);
  });
}

function activateTab(name) {
  activeTab = name;
  const chat = name === 'chat';
  $('chat-tab').classList.toggle('active', chat);
  $('gift-tab').classList.toggle('active', !chat);
  $('chat-panel').classList.toggle('hidden', !chat);
  $('gift-panel').classList.toggle('hidden', chat);
  if (chat) clearUnread();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
}

async function shareInvite() {
  const code = profile.inviteCode;
  if (!code) return;
  const text = `加入我嘅 Couple Space 💗\n配對碼：${code}\n${publicAppUrl}`;
  if (navigator.share) {
    await navigator.share({ title: 'Couple Space 配對邀請', text, url: publicAppUrl });
  } else {
    await navigator.clipboard.writeText(text);
    showToast('邀請內容已複製');
  }
}

function bindUi() {
  renderGifts();
  updateSoundButton();
  updateUnreadBadge();

  $('create-button').addEventListener('click', createCouple);
  $('join-button').addEventListener('click', joinCouple);
  $('join-code').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
  });
  $('message-form').addEventListener('submit', sendText);
  $('message-input').addEventListener('input', () => {
    updateComposerState();
    const input = $('message-input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 118)}px`;
  });
  $('chat-tab').addEventListener('click', () => activateTab('chat'));
  $('gift-tab').addEventListener('click', () => activateTab('gift'));
  $('sound-button').addEventListener('click', () => toggleSound());
  $('copy-code').addEventListener('click', async () => {
    await navigator.clipboard.writeText(profile.inviteCode || '');
    showToast('配對碼已複製');
  });
  $('share-code').addEventListener('click', () => {
    shareInvite().catch((error) => showToast(errorMessage(error)));
  });
  $('dismiss-install').addEventListener('click', () => {
    localStorage.setItem('hideInstallBanner', '1');
    $('install-banner').classList.add('hidden');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && activeTab === 'chat') clearUnread();
  });
}

async function bootstrap() {
  bindUi();
  await registerServiceWorker();

  if (!hasFirebaseConfig()) {
    showScreen('config-screen');
    return;
  }

  if (!isStandalone() && localStorage.getItem('hideInstallBanner') !== '1') {
    $('install-banner').classList.remove('hidden');
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }

      uid = user.uid;
      await setDoc(doc(db, 'users', uid), { updatedAt: serverTimestamp() }, { merge: true });
      startProfileListener(uid);
    } catch (error) {
      console.error(error);
      showScreen('onboarding-screen');
      showToast(errorMessage(error), 5000);
    }
  });
}

bootstrap().catch((error) => {
  console.error(error);
  showScreen('config-screen');
  showToast(errorMessage(error), 5000);
});
