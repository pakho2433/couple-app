const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  collection, doc, getDoc, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, where,
} = CS.fb;
const { perform, showToast } = CS.ui;

let unsubscribeFriends = null;
let friendItems = [];
let identitySyncing = false;

function makeFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function friendshipId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

function ownDisplayName() {
  return S.profile.displayName || $('display-name')?.value.trim() || '好友';
}

async function ensureFriendIdentity() {
  if (!S.uid || identitySyncing) return;
  identitySyncing = true;
  try {
    const userRef = doc(S.db, 'users', S.uid);
    const userSnapshot = await getDoc(userRef);
    const userData = userSnapshot.exists() ? userSnapshot.data() : {};
    if (userData.friendCode) {
      S.profile.friendCode = userData.friendCode;
      await setDoc(doc(S.db, 'friendCodes', userData.friendCode), {
        ownerUid: S.uid,
        displayName: userData.displayName || ownDisplayName(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      updateFriendCodeUi(userData.friendCode);
      return;
    }

    let createdCode = null;
    for (let attempt = 0; attempt < 6 && !createdCode; attempt += 1) {
      const code = makeFriendCode();
      const codeRef = doc(S.db, 'friendCodes', code);
      try {
        await runTransaction(S.db, async (transaction) => {
          const codeSnapshot = await transaction.get(codeRef);
          if (codeSnapshot.exists()) throw new Error('FRIEND_CODE_COLLISION');
          transaction.set(codeRef, {
            ownerUid: S.uid,
            displayName: userData.displayName || ownDisplayName(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          transaction.set(userRef, { friendCode: code }, { merge: true });
        });
        createdCode = code;
      } catch (error) {
        if (error.message !== 'FRIEND_CODE_COLLISION') throw error;
      }
    }
    if (!createdCode) throw new Error('未能建立好友碼，請重新載入再試。');
    S.profile.friendCode = createdCode;
    updateFriendCodeUi(createdCode);
  } finally {
    identitySyncing = false;
  }
}

function updateFriendCodeUi(code) {
  if ($('friend-code')) $('friend-code').textContent = code || '建立中…';
}

async function addFriend() {
  await perform(async () => {
    const input = $('add-friend-code');
    const code = input.value.trim().toUpperCase();
    if (code.length !== 8) throw new Error('請輸入完整 8 位好友碼。');

    const codeRef = doc(S.db, 'friendCodes', code);
    const codeSnapshot = await getDoc(codeRef);
    if (!codeSnapshot.exists()) throw new Error('找不到這個好友碼。');
    const target = codeSnapshot.data();
    if (target.ownerUid === S.uid) throw new Error('不能加入自己為好友。');

    const id = friendshipId(S.uid, target.ownerUid);
    const friendRef = doc(S.db, 'friendships', id);
    await runTransaction(S.db, async (transaction) => {
      const existing = await transaction.get(friendRef);
      if (existing.exists()) throw new Error('你們已經是好友。');
      transaction.set(friendRef, {
        members: [S.uid, target.ownerUid].sort(),
        memberNames: {
          [S.uid]: ownDisplayName(),
          [target.ownerUid]: target.displayName || '好友',
        },
        createdBy: S.uid,
        createdAt: serverTimestamp(),
      });
    });
    input.value = '';
    showToast(`已加入 ${target.displayName || '好友'}`);
  });
}

async function removeFriend(friendship) {
  const otherUid = friendship.members.find((memberId) => memberId !== S.uid);
  const otherName = friendship.memberNames?.[otherUid] || '好友';
  if (!window.confirm(`確定刪除好友「${otherName}」？`)) return;

  await perform(async () => {
    const friendRef = doc(S.db, 'friendships', friendship.id);
    await runTransaction(S.db, async (transaction) => {
      const snapshot = await transaction.get(friendRef);
      if (!snapshot.exists()) return;
      transaction.delete(friendRef);
    });
    showToast('好友已刪除');
  });
}

function renderFriends() {
  const list = $('friend-list');
  if (!list) return;
  list.replaceChildren();
  if (!friendItems.length) {
    const empty = document.createElement('div');
    empty.className = 'social-empty';
    empty.textContent = '暫時未有好友，分享你的好友碼吧。';
    list.append(empty);
    return;
  }

  for (const friendship of friendItems) {
    const otherUid = friendship.members.find((memberId) => memberId !== S.uid);
    const otherName = friendship.memberNames?.[otherUid] || '好友';
    const row = document.createElement('div');
    row.className = 'friend-row';
    const avatar = document.createElement('div');
    avatar.className = 'friend-avatar';
    avatar.textContent = '💗';
    const info = document.createElement('div');
    info.className = 'friend-info';
    const name = document.createElement('strong');
    name.textContent = otherName;
    const status = document.createElement('span');
    status.textContent = '可以發起 Mini Game 挑戰';
    info.append(name, status);
    const buttons = document.createElement('div');
    buttons.className = 'friend-buttons';
    const challenge = document.createElement('button');
    challenge.type = 'button';
    challenge.className = 'challenge-button';
    challenge.textContent = '挑戰';
    challenge.addEventListener('click', () => CS.game.createChallenge(otherUid, otherName));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'friend-remove';
    remove.textContent = '刪除';
    remove.addEventListener('click', () => removeFriend(friendship));
    buttons.append(challenge, remove);
    row.append(avatar, info, buttons);
    list.append(row);
  }
}

function startFriendListener() {
  unsubscribeFriends?.();
  if (!S.uid) return;
  const friendQuery = query(
    collection(S.db, 'friendships'),
    where('members', 'array-contains', S.uid),
  );
  unsubscribeFriends = onSnapshot(friendQuery, (snapshot) => {
    friendItems = snapshot.docs.map((friendDoc) => ({ id: friendDoc.id, ...friendDoc.data() }));
    renderFriends();
  }, (error) => {
    console.error(error);
    showToast(CS.ui.errorMessage(error), 5000);
  });
}

function bindFriendUi() {
  $('friends-tab')?.addEventListener('click', () => CS.ui.activateTab('friends'));
  $('game-tab')?.addEventListener('click', () => CS.ui.activateTab('game'));
  $('add-friend-code')?.addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
  });
  $('add-friend-button')?.addEventListener('click', addFriend);
  $('copy-friend-code')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(S.profile.friendCode || '');
    showToast('好友碼已複製');
  });
  $('share-friend-code')?.addEventListener('click', async () => {
    const code = S.profile.friendCode || '';
    const text = `加我做 Couple Space 好友 💗\n好友碼：${code}\n${CS.publicAppUrl}`;
    if (navigator.share) await navigator.share({ title: 'Couple Space 好友邀請', text, url: CS.publicAppUrl });
    else {
      await navigator.clipboard.writeText(text);
      showToast('好友邀請已複製');
    }
  });
}

async function startFriends() {
  bindFriendUi();
  await ensureFriendIdentity();
  startFriendListener();
}

Object.assign(CS.friends, {
  ensureFriendIdentity,
  updateFriendCodeUi,
  startFriends,
  renderFriends,
  getItems: () => friendItems,
});
