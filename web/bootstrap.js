const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  doc, getAuth, getFirestore, getStorage, initializeApp,
  onAuthStateChanged, serverTimestamp, setDoc, signInAnonymously,
} = CS.fb;
const {
  clearUnread, errorMessage, hasFirebaseConfig, isStandalone, renderGifts,
  showScreen, showToast, toggleSound, updateComposerState, updateSoundButton,
  updateUnreadBadge,
} = CS.ui;

function bindUi() {
  renderGifts();
  updateSoundButton();
  updateUnreadBadge();

  $('create-button').addEventListener('click', CS.chat.createCouple);
  $('join-button').addEventListener('click', CS.chat.joinCouple);
  $('join-code').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
  });

  $('message-form').addEventListener('submit', CS.chat.sendText);
  $('message-input').addEventListener('input', () => {
    updateComposerState();
    const input = $('message-input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 118)}px`;
  });

  $('media-button').addEventListener('click', () => $('media-input').click());
  $('media-input').addEventListener('change', CS.media.handleMediaSelection);
  $('record-button').addEventListener('click', () => {
    CS.media.startRecording().catch((error) => showToast(errorMessage(error), 5200));
  });
  $('cancel-recording').addEventListener('click', CS.media.cancelRecording);
  $('send-recording').addEventListener('click', CS.media.sendRecording);

  $('chat-tab').addEventListener('click', () => CS.ui.activateTab('chat'));
  $('gift-tab').addEventListener('click', () => CS.ui.activateTab('gift'));
  $('sound-button').addEventListener('click', toggleSound);
  $('copy-code').addEventListener('click', async () => {
    await navigator.clipboard.writeText(S.profile.inviteCode || '');
    showToast('配對碼已複製');
  });
  $('share-code').addEventListener('click', () => {
    CS.chat.shareInvite().catch((error) => showToast(errorMessage(error)));
  });
  $('dismiss-install').addEventListener('click', () => {
    localStorage.setItem('hideInstallBanner', '1');
    $('install-banner').classList.add('hidden');
  });

  $('close-media-viewer').addEventListener('click', CS.media.closeImageViewer);
  $('media-viewer').addEventListener('click', (event) => {
    if (event.target === $('media-viewer')) CS.media.closeImageViewer();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.activeTab === 'chat') clearUnread();
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed:', error);
  }
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

  const app = initializeApp(CS.firebaseConfig);
  S.auth = getAuth(app);
  S.db = getFirestore(app);
  S.storage = getStorage(app);

  onAuthStateChanged(S.auth, async (user) => {
    try {
      if (!user) {
        await signInAnonymously(S.auth);
        return;
      }
      S.uid = user.uid;
      await setDoc(doc(S.db, 'users', S.uid), { updatedAt: serverTimestamp() }, { merge: true });
      CS.chat.startProfileListener(S.uid);
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
