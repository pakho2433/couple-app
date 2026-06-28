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
    const isMedia = ['image', 'video', 'audio'].includes(item.type)
      && Boolean(item.mediaUrl || item.mediaData);
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMedia ? 'media-bubble' : ''}`;
    if (isMedia) {
      CS.media.appendMediaContent(bubble, item);
    } else {
      const text = document.createElement('div');
      text.className = 'message-text';
      text.textContent = item.text || '';
      bubble.append(text);
    }
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = formatTime(item.createdAt);
    bubble.append(time);
    row.append(bubble);
    container.append(row);
  }

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function notificationSummary(item) {
  if (item.type === 'gift') return `${item.giftEmoji || '🎁'} 收到「${item.giftName || '禮物'}」`;
  if (item.type === 'image') return '📷 收到圖片';
  if (item.type === 'video') return '🎬 收到影片';
  if (item.type === 'audio') return '🎤 收到錄音';
  return `💬 ${String(item.text || '新訊息').slice(0, 45)}`;
}

function notifyForNewItems(snapshot) {
  if (!S.messagesReady) {
    S.messagesReady = true;
    return;
  }
  const incoming = snapshot.docChanges()
    .filter((change) => change.type === 'added')
    .map((change) => change.doc.data())
    .filter((item) => item.senderId !== S.uid);
  if (!incoming.length) return;
  if (document.hidden || S.activeTab !== 'chat') {
    S.unreadCount += incoming.length;
    updateUnreadBadge();
  }
  showToast(notificationSummary(incoming[incoming.length - 1]), 3600);
  playTone();
}

function stopCoupleListeners() {
  S.unsubscribeCouple?.();
  S.unsubscribeMessages?.();
  S.unsubscribeCouple = null;
  S.unsubscribeMessages = null;
  S.members = [];
  S.messagesReady = false;
  $('messages')?.replaceChildren();
}

function startCoupleListeners(coupleId) {
  stopCoupleListeners();
  S.unsubscribeCouple = onSnapshot(
    doc(S.db, 'couples', coupleId),
    (snapshot) => {
      S.members = snapshot.exists() ? snapshot.data().members || [] : [];
      updateCoupleHeader();
    },
    (error) => showToast(errorMessage(error), 4200),
  );

  const messageQuery = query(
    collection(S.db, 'couples', coupleId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  S.unsubscribeMessages = onSnapshot(
    messageQuery,
    (snapshot) => {
      renderMessages(snapshot.docs.map((messageDoc) => ({
        id: messageDoc.id,
        ...messageDoc.data(),
      })));
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
      const rawProfile = snapshot.exists() ? snapshot.data() : {};
      const previousRoomId = CS.rooms.currentRoomId();
      const normalized = CS.rooms.normalizeProfile(rawProfile);
      S.profile = normalized;
      CS.rooms.migrateProfile(rawProfile, normalized).catch((error) => console.warn('Profile migration skipped:', error));

      if (S.profile.displayName) $('display-name').value = S.profile.displayName;
      const activeRoomId = CS.rooms.currentRoomId();
      if (activeRoomId) {
        showScreen('couple-screen');
        if (previousRoomId !== activeRoomId) startCoupleListeners(activeRoomId);
        updateCoupleHeader();
      } else if (S.profile.roomIds?.length) {
        stopCoupleListeners();
        CS.rooms.showHub();
      } else {
        stopCoupleListeners();
        showScreen('onboarding-screen');
      }
    },
    (error) => showToast(errorMessage(error), 4200),
  );
}

function currentDisplayName() {
  return S.profile.displayName || $('display-name')?.value.trim() || '我';
}

async function createCouple() {
  await perform(async () => {
    const displayName = currentDisplayName();
    let created = false;

    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const code = makePairCode();
      const coupleRef = doc(collection(S.db, 'couples'));
      const codeRef = doc(S.db, 'pairCodes', code);
      const userRef = doc(S.db, 'users', S.uid);

      try {
        await runTransaction(S.db, async (transaction) => {
          const codeSnapshot = await transaction.get(codeRef);
          const userSnapshot = await transaction.get(userRef);
          if (codeSnapshot.exists()) throw new Error('PAIR_CODE_COLLISION');

          const existing = CS.rooms.normalizeProfile(userSnapshot.exists() ? userSnapshot.data() : {});
          if (existing.roomIds.length >= CS.rooms.MAX_ROOMS) {
            throw new Error(`每個裝置最多只可保留 ${CS.rooms.MAX_ROOMS} 個房間。`);
          }

          const roomIds = [...existing.roomIds, coupleRef.id];
          const inviteCodes = { ...existing.inviteCodes, [coupleRef.id]: code };
          transaction.set(coupleRef, {
            members: [S.uid],
            createdBy: S.uid,
            createdAt: serverTimestamp(),
          });
          transaction.set(codeRef, {
            coupleId: coupleRef.id,
            ownerUid: S.uid,
            createdAt: serverTimestamp(),
          });
          transaction.set(userRef, {
            displayName,
            roomIds,
            inviteCodes,
            activeCoupleId: coupleRef.id,
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

async function joinCouple(inputId = 'join-code') {
  await perform(async () => {
    const displayName = currentDisplayName();
    const input = $(inputId);
    const code = input.value.trim().toUpperCase();
    if (code.length !== 8) throw new Error('請輸入完整 8 位配對碼。');

    const codeRef = doc(S.db, 'pairCodes', code);
    const userRef = doc(S.db, 'users', S.uid);
    await runTransaction(S.db, async (transaction) => {
      const codeSnapshot = await transaction.get(codeRef);
      if (!codeSnapshot.exists()) throw new Error('配對碼不存在、已使用，或者房間已完成配對。');

      const { coupleId } = codeSnapshot.data();
      const coupleRef = doc(S.db, 'couples', coupleId);
      const coupleSnapshot = await transaction.get(coupleRef);
      const userSnapshot = await transaction.get(userRef);
      if (!coupleSnapshot.exists()) throw new Error('情侶空間不存在。');

      const currentMembers = coupleSnapshot.data().members || [];
      if (currentMembers.length >= 2 && !currentMembers.includes(S.uid)) {
        throw new Error('這個情侶空間已經有兩名成員。');
      }

      const existing = CS.rooms.normalizeProfile(userSnapshot.exists() ? userSnapshot.data() : {});
      const alreadySaved = existing.roomIds.includes(coupleId);
      if (!alreadySaved && existing.roomIds.length >= CS.rooms.MAX_ROOMS) {
        throw new Error(`每個裝置最多只可保留 ${CS.rooms.MAX_ROOMS} 個房間。`);
      }

      const nextMembers = currentMembers.includes(S.uid)
        ? currentMembers
        : [...currentMembers, S.uid];
      const roomIds = alreadySaved ? existing.roomIds : [...existing.roomIds, coupleId];

      transaction.update(coupleRef, { members: nextMembers });
      transaction.set(userRef, {
        displayName,
        roomIds,
        inviteCodes: existing.inviteCodes,
        activeCoupleId: coupleId,
        coupleId,
        inviteCode: existing.inviteCodes[coupleId] || null,
      }, { merge: true });
      transaction.delete(codeRef);
    });
    input.value = '';
  });
}

async function sendText(event) {
  event.preventDefault();
  const roomId = CS.rooms.currentRoomId();
  const input = $('message-input');
  const text = input.value.trim();
  if (!text || S.members.length !== 2 || !roomId) return;

  input.value = '';
  input.style.height = 'auto';
  updateComposerState();
  try {
    await addDoc(collection(S.db, 'couples', roomId, 'messages'), {
      senderId: S.uid,
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
  const roomId = CS.rooms.currentRoomId();
  if (S.members.length !== 2 || !roomId) return;
  await perform(async () => {
    await addDoc(collection(S.db, 'couples', roomId, 'messages'), {
      senderId: S.uid,
      type: 'gift',
      giftEmoji: gift.emoji,
      giftName: gift.name,
      createdAt: serverTimestamp(),
    });
    activateTab('chat');
    showToast(`已送出 ${gift.emoji} ${gift.name}`);
  });
}

async function shareInvite() {
  const code = CS.rooms.currentInviteCode();
  if (!code) return;
  const text = `加入我嘅 Couple Space 💗\n配對碼：${code}\n${CS.publicAppUrl}`;
  if (navigator.share) {
    await navigator.share({ title: 'Couple Space 配對邀請', text, url: CS.publicAppUrl });
  } else {
    await navigator.clipboard.writeText(text);
    showToast('邀請內容已複製');
  }
}

Object.assign(CS.chat, {
  renderMessages,
  startProfileListener,
  createCouple,
  joinCouple,
  sendText,
  sendGift,
  shareInvite,
});
