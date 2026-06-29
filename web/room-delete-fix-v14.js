const CS = globalThis.CoupleSpace;
const S = CS.state;
const { doc, runTransaction } = CS.fb;
const { perform, showToast } = CS.ui;

async function deleteSavedRoom(roomId, roomNumber) {
  const confirmed = window.confirm(`確定刪除「二人空間 ${roomNumber}」？\n\n房間會由你的列表移除，另一位成員的房間不會被強制刪除。`);
  if (!confirmed || !S.uid) return;

  await perform(async () => {
    const userRef = doc(S.db, 'users', S.uid);
    const coupleRef = doc(S.db, 'couples', roomId);
    await runTransaction(S.db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const coupleSnapshot = await transaction.get(coupleRef);
      const profile = CS.rooms.normalizeProfile(userSnapshot.exists() ? userSnapshot.data() : {});
      const inviteCode = profile.inviteCodes?.[roomId] || null;
      const codeRef = inviteCode ? doc(S.db, 'pairCodes', inviteCode) : null;
      const codeSnapshot = codeRef ? await transaction.get(codeRef) : null;

      const roomIds = profile.roomIds.filter((id) => id !== roomId);
      const inviteCodes = { ...profile.inviteCodes };
      delete inviteCodes[roomId];
      const activeRoomId = CS.rooms.currentRoomId();
      const fallbackRoomId = activeRoomId === roomId ? null : activeRoomId;

      transaction.set(userRef, {
        roomIds,
        inviteCodes,
        activeCoupleId: fallbackRoomId,
        coupleId: fallbackRoomId,
        inviteCode: fallbackRoomId ? (inviteCodes[fallbackRoomId] || null) : null,
      }, { merge: true });

      if (coupleSnapshot.exists()) {
        const members = Array.isArray(coupleSnapshot.data().members)
          ? coupleSnapshot.data().members
          : [];
        if (members.includes(S.uid)) {
          transaction.update(coupleRef, {
            members: members.filter((memberId) => memberId !== S.uid),
          });
        }
      }

      if (codeRef && codeSnapshot?.exists() && codeSnapshot.data().ownerUid === S.uid) {
        transaction.delete(codeRef);
      }
    });
    showToast('房間已刪除');
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.room-delete');
  if (!button) return;
  const row = button.closest('.room-row');
  const rows = [...document.querySelectorAll('#room-list .room-row')];
  const index = rows.indexOf(row);
  const roomId = S.profile.roomIds?.[index];
  if (!roomId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  deleteSavedRoom(roomId, index + 1);
}, true);

Object.assign(CS.rooms, { deleteSavedRoom });
