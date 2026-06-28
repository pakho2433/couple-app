const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const { doc, setDoc } = CS.fb;
const { perform, showScreen, showToast } = CS.ui;
const MAX_ROOMS = 5;

function ensureRoomUi() {
  if (!document.getElementById('rooms-screen')) {
    const section = document.createElement('section');
    section.id = 'rooms-screen';
    section.className = 'screen hidden room-hub-screen';
    section.innerHTML = `
      <div class="room-hub-card">
        <div class="room-hub-logo">🏠</div>
        <h1>你的房間</h1>
        <p class="muted">你可以返回原本房間，或者建立／加入另一個房間。</p>
        <div id="room-list" class="room-list"></div>
        <button id="create-another-room" class="primary-button" type="button">＋ 建立新房間</button>
        <div class="divider"><span>加入另一個房間</span></div>
        <label for="room-join-code">8 位配對碼</label>
        <input id="room-join-code" class="code-input" maxlength="8" autocapitalize="characters" placeholder="LOVE5284" />
        <button id="join-another-room" class="secondary-button" type="button">加入房間</button>
        <p class="room-limit-note">每個裝置最多保留 ${MAX_ROOMS} 個房間。</p>
      </div>`;
    document.querySelector('main').append(section);
  }

  const header = document.querySelector('.app-header');
  const soundButton = document.getElementById('sound-button');
  if (header && soundButton && !document.getElementById('exit-room-button')) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    const exitButton = document.createElement('button');
    exitButton.id = 'exit-room-button';
    exitButton.type = 'button';
    exitButton.className = 'exit-room-button';
    exitButton.textContent = '退出';
    exitButton.setAttribute('aria-label', '退出目前房間並返回房間列表');
    soundButton.replaceWith(actions);
    actions.append(exitButton, soundButton);
  }

  if (!document.getElementById('room-v11-styles')) {
    const style = document.createElement('style');
    style.id = 'room-v11-styles';
    style.textContent = `
      .header-actions{display:flex;align-items:center;gap:7px}
      .exit-room-button{height:40px;padding:0 13px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--pink-dark);font-size:13px;font-weight:800}
      .room-hub-screen{display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom));overflow-y:auto}
      .room-hub-card{width:min(100%,460px);padding:26px 20px;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 18px 55px rgba(113,35,67,.12)}
      .room-hub-card h1{margin:4px 0 2px;text-align:center;font-size:29px}
      .room-hub-card>.muted{text-align:center;margin:4px auto 18px}
      .room-hub-logo{text-align:center;font-size:52px}
      .room-list{display:grid;gap:10px;margin:14px 0 18px}
      .room-empty{padding:20px 12px;border:1px dashed var(--line);border-radius:17px;text-align:center;color:var(--muted);background:#fffafb}
      .room-row{display:flex;align-items:center;gap:12px;width:100%;padding:13px;border:1px solid var(--line);border-radius:18px;background:#fff;text-align:left;color:var(--ink)}
      .room-row-icon{display:grid;place-items:center;width:44px;height:44px;flex:0 0 44px;border-radius:14px;background:var(--soft);font-size:22px}
      .room-row-info{min-width:0;flex:1}
      .room-row-info strong{display:block;font-size:15px}
      .room-row-info span{display:block;margin-top:3px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .room-enter{flex:0 0 auto;padding:8px 12px;border:0;border-radius:11px;background:var(--pink);color:#fff;font-size:12px;font-weight:800}
      .room-limit-note{margin:13px 0 0;text-align:center;color:var(--muted);font-size:11px}
      @media(max-width:390px){.exit-room-button{padding:0 10px}.header-actions{gap:5px}}
    `;
    document.head.append(style);
  }
}

function uniqueRoomIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
}

function normalizeProfile(raw = {}) {
  const roomIds = uniqueRoomIds(raw.roomIds);
  if (raw.coupleId && !roomIds.includes(raw.coupleId)) roomIds.push(raw.coupleId);

  const inviteCodes = raw.inviteCodes && typeof raw.inviteCodes === 'object'
    ? { ...raw.inviteCodes }
    : {};
  if (raw.coupleId && raw.inviteCode && !inviteCodes[raw.coupleId]) {
    inviteCodes[raw.coupleId] = raw.inviteCode;
  }

  const activeCoupleId = raw.activeCoupleId || raw.coupleId || null;
  return {
    ...raw,
    roomIds,
    inviteCodes,
    activeCoupleId,
    coupleId: activeCoupleId,
    inviteCode: activeCoupleId ? (inviteCodes[activeCoupleId] || raw.inviteCode || null) : null,
  };
}

function needsMigration(raw, normalized) {
  const rawRooms = uniqueRoomIds(raw.roomIds);
  const sameRooms = JSON.stringify(rawRooms) === JSON.stringify(normalized.roomIds);
  const rawCodes = raw.inviteCodes && typeof raw.inviteCodes === 'object' ? raw.inviteCodes : {};
  return !sameRooms
    || (raw.activeCoupleId === undefined && Boolean(raw.coupleId))
    || JSON.stringify(rawCodes) !== JSON.stringify(normalized.inviteCodes);
}

async function migrateProfile(raw, normalized) {
  if (!S.uid || !needsMigration(raw, normalized)) return;
  await setDoc(doc(S.db, 'users', S.uid), {
    roomIds: normalized.roomIds,
    inviteCodes: normalized.inviteCodes,
    activeCoupleId: normalized.activeCoupleId,
  }, { merge: true });
}

function currentRoomId() {
  return S.profile.activeCoupleId || S.profile.coupleId || null;
}

function currentRoomNumber() {
  const id = currentRoomId();
  const index = (S.profile.roomIds || []).indexOf(id);
  return index >= 0 ? index + 1 : null;
}

function currentInviteCode() {
  const id = currentRoomId();
  return id ? (S.profile.inviteCodes?.[id] || S.profile.inviteCode || '') : '';
}

function renderRoomList() {
  const list = $('room-list');
  if (!list) return;
  list.replaceChildren();
  const roomIds = S.profile.roomIds || [];
  if (!roomIds.length) {
    const empty = document.createElement('div');
    empty.className = 'room-empty';
    empty.textContent = '暫時未有房間';
    list.append(empty);
  } else {
    roomIds.forEach((roomId, index) => {
      const row = document.createElement('div');
      row.className = 'room-row';
      const icon = document.createElement('span');
      icon.className = 'room-row-icon';
      icon.textContent = index === 0 ? '💗' : '💞';
      const info = document.createElement('div');
      info.className = 'room-row-info';
      const title = document.createElement('strong');
      title.textContent = `二人空間 ${index + 1}`;
      const detail = document.createElement('span');
      detail.textContent = `房間識別：${roomId.slice(0, 8)}…`;
      info.append(title, detail);
      const enter = document.createElement('button');
      enter.type = 'button';
      enter.className = 'room-enter';
      enter.textContent = '進入';
      enter.addEventListener('click', () => switchRoom(roomId));
      row.append(icon, info, enter);
      list.append(row);
    });
  }

  const atLimit = roomIds.length >= MAX_ROOMS;
  $('create-another-room').disabled = atLimit || S.busy;
  $('join-another-room').disabled = atLimit || S.busy;
  $('room-join-code').disabled = atLimit || S.busy;
  $('.room-limit-note');
}

async function openRoomHub() {
  if (!S.uid) return;
  await perform(async () => {
    await setDoc(doc(S.db, 'users', S.uid), {
      activeCoupleId: null,
      coupleId: null,
      inviteCode: null,
    }, { merge: true });
  });
}

async function switchRoom(roomId) {
  if (!S.uid || !(S.profile.roomIds || []).includes(roomId)) return;
  await perform(async () => {
    await setDoc(doc(S.db, 'users', S.uid), {
      activeCoupleId: roomId,
      coupleId: roomId,
      inviteCode: S.profile.inviteCodes?.[roomId] || null,
    }, { merge: true });
  });
}

function showHub() {
  renderRoomList();
  showScreen('rooms-screen');
}

function bindRoomUi() {
  $('exit-room-button').addEventListener('click', openRoomHub);
  $('create-another-room').addEventListener('click', () => CS.chat.createCouple({ fromHub: true }));
  $('join-another-room').addEventListener('click', () => CS.chat.joinCouple('room-join-code'));
  $('room-join-code').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
  });
}

ensureRoomUi();

Object.assign(CS.rooms, {
  MAX_ROOMS,
  normalizeProfile,
  migrateProfile,
  currentRoomId,
  currentRoomNumber,
  currentInviteCode,
  renderRoomList,
  openRoomHub,
  switchRoom,
  showHub,
  bindRoomUi,
});
