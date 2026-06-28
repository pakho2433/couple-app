const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  addDoc, collection, doc, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp,
} = CS.fb;
const {
  formatTime, showToast, errorMessage, updateCoupleHeader, perform,
  makePairCode, showScreen, activateTab, updateComposerState, updateUnreadBadge, playTone,
} = CS.ui;

function renderMessages(items) {
  const container = $('messages');
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = S.members.length === 2 ? '講第一句甜言蜜語啦 💕' : '等待另一半輸入配對碼…';
    container.append(empty);
    return;
  }
  for (const item of [...items].reverse()) {
    const mine = item.senderId === S.uid;
    if (item.type === 'gift') {
      const gift = document.createElement('article');
      gift.className = 'gift-message';
      const emoji = document.createElement('span'); emoji.className = 'emoji'; emoji.textContent = item.giftEmoji || '🎁';
      const text = document.createElement('strong');
      text.textContent = `${mine ? '你送出' : '你收到'}「${item.giftName || '神秘禮物'}」`;
      const time = document.createElement('time'); time.textContent = formatTime(item.createdAt);
      gift.append(emoji, text, time); container.append(gift); continue;
    }
    const row = document.createElement('article');
    row.className = `message-row ${mine ? 'mine' : 'other'}`;
    const isMedia = ['image', 'video', 'audio'].includes(item.type) && item.mediaUrl;
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMedia ? 'media-bubble' : ''}`;
    if (isMedia) CS.media.appendMediaContent(bubble, item);
    else {
      const text = document.createElement('div'); text.className = 'message-text'; text.textContent = item.text || '';
      bubble.append(text);
    }
    const time = document.createElement('div'); time.className = 'message-time'; time.textContent = formatTime(item.createdAt);
    bubble.append(time); row.append(bubble); container.append(row);
  }
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}
function notificationSummary(item) {
  if (item.type === 'gift') return `${item.giftEmoji || '🎁'} 收到「${item.giftName || '禮物'}」`;
  if (item.type === 'image') return '📷 收到圖片';
  if (item.type === 'video') return '🎬 收到影片';
  if (item.type === 'audio') return '🎤 收到錄音';
  return `💬 ${String(item.text || '新訊息').slice(0, 45)}`;
}
function notifyForNewItems(snapshot) {
  if (!S.messagesReady) { S.messagesReady = true; return; }
  const incoming = snapshot.docChanges()
    .filter((change) => change.type === 'added')
    .map((change) => change.doc.data())
    .filter((item) => item.senderId !== S.uid);
  if (!incoming.length) return;
  if (document.hidden || S.activeTab !== 'chat') {
    S.unreadCount += incoming.length; updateUnreadBadge();
  }
  showToast(notificationSummary(incoming[incoming.length - 1]), 3600);
  playTone();
}
function stopCoupleListeners() {
  S.unsubscribeCouple?.(); S.unsubscribeMessages?.();
  S.unsubscribeCouple = null; S.unsubscribeMessages = null;
  S.members = []; S.messagesReady = false;
}
function startCoupleListeners(coupleId) {
  stopCoupleListeners();
  S.unsubscribeCouple = onSnapshot(
    doc(S.db, 'couples', coupleId),
    (snapshot) => { S.members = snapshot.exists() ? snapshot.data().members || [] : []; updateCoupleHeader(); },
    (error) => showToast(errorMessage(error), 4200),
  );
  const messageQuery = query(
    collection(S.db, 'couples', coupleId, 'messages'), orderBy('createdAt', 'desc'), limit(100),
  );
  S.unsubscribeMessages = onSnapshot(
    messageQuery,
    (snapshot) => {
      renderMessages(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })));
      notifyForNewItems(snapshot);
    },
    (error) => showToast(errorMessage(error), 4200),
  );
}
function startProfileListener(userId) {
  S.unsubscribeProfile?.();
  S.unsubscribeProfile = onSnapshot(
    doc(S.db, 'users', userId),
    (snapshot) => {
      const previousCoupleId = S.profile.coupleId;
      S.profile = snapshot.exists() ? snapshot.data() : {};
      if (S.profile.displayName) $('display-name').value = S.profile.displayName;
      if (S.profile.coupleId) {
        showScreen('couple-screen');
        if (previousCoupleId !== S.profile.coupleId) startCoupleListeners(S.profile.coupleId);
        updateCoupleHeader();
      } else {
        stopCoupleListeners(); showScreen('onboarding-screen');
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
      const coupleRef = doc(collection(S.db, 'couples'));
      const codeRef = doc(S.db, 'pairCodes', code);
      try {
        await runTransaction(S.db, async (transaction) => {
          const codeSnapshot = await transaction.get(codeRef);
          if (codeSnapshot.exists()) throw new Error('PAIR_CODE_COLLISION');
          transaction.set(coupleRef, { members: [S.uid], createdBy: S.uid, createdAt: serverTimestamp() });
          transaction.set(codeRef, { coupleId: coupleRef.id, ownerUid: S.uid, createdAt: serverTimestamp() });
          transaction.set(doc(S.db, 'users', S.uid), {
            displayName, coupleId: coupleRef.id, inviteCode: code,
          }, { merge: true });
        });
        created = true;
      } catch (error) { if (error.message !== 'PAIR_CODE_COLLISION') throw error; }
    }
    if (!created) throw new Error('未能產生配對碼，請再試一次。');
  });
}
async function joinCouple() {
  await perform(async () => {
    const displayName = $('display-name').value.trim() || '我';
    const code = $('join-code').value.trim().toUpperCase();
    if (code.length !== 8) throw new Error('請輸入完整 8 位配對碼。');
    const codeRef = doc(S.db, 'pairCodes', code);
    await runTransaction(S.db, async (transaction) => {
      const codeSnapshot = await transaction.get(codeRef);
      if (!codeSnapshot.exists()) throw new Error('配對碼不存在或已被使用。');
      const { coupleId } = codeSnapshot.data();
      const coupleRef = doc(S.db, 'couples', coupleId);
      const coupleSnapshot = await transaction.get(coupleRef);
      if (!coupleSnapshot.exists()) throw new Error('情侶空間不存在。');
      const currentMembers = coupleSnapshot.data().members || [];
      if (currentMembers.length >= 2 && !currentMembers.includes(S.uid)) throw new Error('這個情侶空間已經有兩名成員。');
      const nextMembers = currentMembers.includes(S.uid) ? currentMembers : [...currentMembers, S.uid];
      transaction.update(coupleRef, { members: nextMembers });
      transaction.set(doc(S.db, 'users', S.uid), { displayName, coupleId }, { merge: true });
      transaction.delete(codeRef);
    });
  });
}
async function sendText(event) {
  event.preventDefault();
  const input = $('message-input'); const text = input.value.trim();
  if (!text || S.members.length !== 2 || !S.profile.coupleId) return;
  input.value = ''; input.style.height = 'auto'; updateComposerState();
  try {
    await addDoc(collection(S.db, 'couples', S.profile.coupleId, 'messages'), {
      senderId: S.uid, type: 'text', text, createdAt: serverTimestamp(),
    });
  } catch (error) {
    input.value = text; updateComposerState(); showToast(errorMessage(error), 4200);
  }
}
async function sendGift(gift) {
  if (S.members.length !== 2 || !S.profile.coupleId) return;
  await perform(async () => {
    await addDoc(collection(S.db, 'couples', S.profile.coupleId, 'messages'), {
      senderId: S.uid, type: 'gift', giftEmoji: gift.emoji, giftName: gift.name, createdAt: serverTimestamp(),
    });
    activateTab('chat'); showToast(`已送出 ${gift.emoji} ${gift.name}`);
  });
}
async function shareInvite() {
  const code = S.profile.inviteCode; if (!code) return;
  const text = `加入我嘅 Couple Space 💗\n配對碼：${code}\n${CS.publicAppUrl}`;
  if (navigator.share) await navigator.share({ title: 'Couple Space 配對邀請', text, url: CS.publicAppUrl });
  else { await navigator.clipboard.writeText(text); showToast('邀請內容已複製'); }
}
Object.assign(CS.chat, {
  renderMessages, startProfileListener, createCouple, joinCouple, sendText, sendGift, shareInvite,
});
