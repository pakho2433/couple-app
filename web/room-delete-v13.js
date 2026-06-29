const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const { doc, runTransaction } = CS.fb;
const { perform, showToast } = CS.ui;

function addDeleteButtons() {
  const rows = [...document.querySelectorAll('#room-list .room-row')];
  const roomIds = S.profile.roomIds || [];
  rows.forEach((row, index) => {
    if (row.querySelector('.room-delete')) return;
    const roomId = roomIds[index];
    if (!roomId) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-delete';
    button.textContent = '刪除';
    button.setAttribute('aria-label', `刪除二人空間 ${index + 1}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      removeRoom(roomId, index + 1);
    });
    row.append(button);
  });
}

async function removeRoom(roomId, roomNumber) {
  const confirmed = window.confirm(`確定刪除「二人空間 ${roomNumber}」？\n\n此裝置將移除房間；如另一位成員仍保留房間，他仍可查看原有聊天。`);
  if (!confirmed || !S.uid) return;

  await perform(async () => {
    const userRef = doc(S.db, 'users', S.uid);
    const coupleRef = doc(S.db, 'couples', roomId);
    await runTransaction(S.db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const coupleSnapshot = await transaction.get(coupleRef);
      const rawProfile = userSnapshot.exists() ? userSnapshot.data() : {};
      const profile = CS.rooms.normalizeProfile(rawProfile);
      const roomIds = profile.roomIds.filter((id) => id !== roomId);
      const inviteCodes = { ...profile.inviteCodes };
      const inviteCode = inviteCodes[roomId] || null;
      delete inviteCodes[roomId];

      const deletingActiveRoom = CS.rooms.currentRoomId() === roomId;
      const fallbackRoomId = deletingActiveRoom ? null : CS.rooms.currentRoomId();
      transaction.set(userRef, {
        roomIds,
        inviteCodes,
        activeCoupleId: fallbackRoomId,
        coupleId: fallbackRoomId,
        inviteCode: fallbackRoomId ? (inviteCodes[fallbackRoomId] || null) : null,
      }, { merge: true });

      if (coupleSnapshot.exists()) {
        const data = coupleSnapshot.data();
        const members = Array.isArray(data.members)
          ? data.members.filter((memberId) => memberId !== S.uid)
          : [];
        if ((data.members || []).includes(S.uid)) {
          transaction.update(coupleRef, { members });
        }
      }

      if (inviteCode) {
        const codeRef = doc(S.db, 'pairCodes', inviteCode);
        const codeSnapshot = await transaction.get(codeRef);
        if (codeSnapshot.exists() && codeSnapshot.data().ownerUid === S.uid) {
          transaction.delete(codeRef);
        }
      }
    });
    showToast('房間已刪除');
  });
}

if (!document.getElementById('room-delete-v13-style')) {
  const style = document.createElement('style');
  style.id = 'room-delete-v13-style';
  style.textContent = `
    .room-delete{flex:0 0 auto;padding:8px 10px;border:0;border-radius:11px;background:#fff0f3;color:#b72e5f;font-size:12px;font-weight:800}
    .room-row .room-enter{margin-left:auto}
  `;
  document.head.append(style);
}

const originalShowHub = CS.rooms.showHub;
CS.rooms.showHub = function showHubWithDelete() {
  originalShowHub();
  requestAnimationFrame(addDeleteButtons);
};

const originalRenderRoomList = CS.rooms.renderRoomList;
CS.rooms.renderRoomList = function renderRoomListWithDelete() {
  originalRenderRoomList();
  requestAnimationFrame(addDeleteButtons);
};

Object.assign(CS.rooms, {
  removeRoom,
  addDeleteButtons,
});
