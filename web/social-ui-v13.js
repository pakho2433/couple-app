const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;

function createButton(id, className, text) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function ensureSocialUi() {
  const tabs = document.querySelector('.tabs');
  if (tabs && !document.getElementById('friends-tab')) {
    tabs.append(
      createButton('friends-tab', 'tab', '👥 好友'),
      createButton('game-tab', 'tab', '🎮 挑戰'),
    );
  }

  const coupleScreen = document.getElementById('couple-screen');
  if (coupleScreen && !document.getElementById('friends-panel')) {
    const friendsPanel = document.createElement('section');
    friendsPanel.id = 'friends-panel';
    friendsPanel.className = 'panel social-panel hidden';
    friendsPanel.innerHTML = `
      <div class="social-scroll">
        <div class="social-card friend-code-card">
          <span>你的好友碼</span><strong id="friend-code">建立中…</strong>
          <div class="social-actions">
            <button id="copy-friend-code" class="small-button" type="button">複製</button>
            <button id="share-friend-code" class="small-button" type="button">分享</button>
          </div>
        </div>
        <div class="social-card">
          <h2>加入好友</h2>
          <p class="muted compact">輸入對方的 8 位好友碼，加入後即可發起 Mini Game 挑戰。</p>
          <input id="add-friend-code" class="code-input" maxlength="8" autocapitalize="characters" placeholder="FRND5284" />
          <button id="add-friend-button" class="primary-button" type="button">加入好友</button>
        </div>
        <div class="social-section-title">好友列表</div>
        <div id="friend-list" class="friend-list"></div>
      </div>`;

    const gamePanel = document.createElement('section');
    gamePanel.id = 'game-panel';
    gamePanel.className = 'panel social-panel hidden';
    gamePanel.innerHTML = `
      <div class="social-scroll">
        <div class="game-hero">
          <div class="game-hero-icon">💗</div>
          <div><h2>10 秒點擊王</h2><p>10 秒內盡量點擊愛心，兩位好友完成後自動比較成績。</p></div>
        </div>
        <div class="social-section-title">進行中的挑戰</div>
        <div id="active-challenge-list" class="challenge-list"></div>
        <div class="social-section-title">成績記錄</div>
        <div id="game-history-list" class="challenge-list"></div>
      </div>`;
    coupleScreen.append(friendsPanel, gamePanel);
  }

  if (!document.getElementById('tap-game-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'tap-game-overlay';
    overlay.className = 'tap-game-overlay hidden';
    overlay.innerHTML = `
      <div class="tap-game-card">
        <button id="close-tap-game" class="tap-game-close" type="button">×</button>
        <p id="tap-game-opponent" class="tap-game-opponent">好友挑戰</p>
        <div id="tap-countdown" class="tap-countdown">準備</div>
        <button id="tap-heart" class="tap-heart" type="button" disabled>💗</button>
        <div class="tap-score-line">點擊：<strong id="tap-score">0</strong></div>
        <p id="tap-game-status" class="tap-game-status">按開始後會倒數 3 秒</p>
        <button id="start-tap-game" class="primary-button" type="button">開始挑戰</button>
      </div>`;
    document.body.append(overlay);
  }
}

ensureSocialUi();

function activateSocialTab(name) {
  const tabs = ['chat', 'gift', 'friends', 'game'];
  if (!tabs.includes(name)) return;
  S.activeTab = name;
  tabs.forEach((tabName) => {
    $(`${tabName}-tab`)?.classList.toggle('active', tabName === name);
    $(`${tabName}-panel`)?.classList.toggle('hidden', tabName !== name);
  });
  if (name === 'chat') CS.ui.clearUnread();
}

CS.ui.activateTab = activateSocialTab;
Object.assign(CS.social, { ensureSocialUi });
