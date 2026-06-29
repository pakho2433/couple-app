const CS = globalThis.CoupleSpace;
const S = CS.state;
const $ = CS.$;
const {
  addDoc, collection, doc, onSnapshot, query, runTransaction,
  serverTimestamp, where,
} = CS.fb;
const { perform, showToast } = CS.ui;

let unsubscribeChallenges = null;
let challengeItems = [];
let currentChallenge = null;
let tapScore = 0;
let gameRunning = false;
let gameTimer = null;

function ownName() {
  return S.profile.displayName || '我';
}

function otherPlayer(challenge) {
  const otherUid = challenge.participants.find((uid) => uid !== S.uid);
  return {
    uid: otherUid,
    name: challenge.playerNames?.[otherUid] || '好友',
  };
}

async function createChallenge(opponentUid, opponentName) {
  if (!S.uid || !opponentUid) return;
  const duplicate = challengeItems.some((item) => (
    item.status !== 'completed'
    && item.participants.includes(opponentUid)
  ));
  if (duplicate) {
    CS.ui.activateTab('game');
    showToast('你和這位好友已有進行中的挑戰。');
    return;
  }

  await perform(async () => {
    await addDoc(collection(S.db, 'gameChallenges'), {
      gameType: 'tap10',
      participants: [S.uid, opponentUid].sort(),
      playerNames: {
        [S.uid]: ownName(),
        [opponentUid]: opponentName || '好友',
      },
      scores: {},
      status: 'open',
      createdBy: S.uid,
      createdAt: serverTimestamp(),
      completedAt: null,
    });
    CS.ui.activateTab('game');
    showToast(`已向 ${opponentName || '好友'} 發出挑戰`);
  });
}

function timestampValue(value) {
  return value?.toMillis?.() || 0;
}

function resultText(challenge) {
  const mine = challenge.scores?.[S.uid];
  const other = otherPlayer(challenge);
  const theirs = challenge.scores?.[other.uid];
  if (mine === undefined || theirs === undefined) return '';
  if (mine > theirs) return '🏆 你勝出';
  if (mine < theirs) return '再接再厲';
  return '🤝 平手';
}

function makeScorePlayer(name, score) {
  const player = document.createElement('div');
  player.className = 'score-player';
  const label = document.createElement('span');
  label.textContent = name;
  const value = document.createElement('strong');
  value.textContent = score === undefined ? '—' : String(score);
  player.append(label, value);
  return player;
}

function makeChallengeCard(challenge) {
  const other = otherPlayer(challenge);
  const mine = challenge.scores?.[S.uid];
  const theirs = challenge.scores?.[other.uid];
  const completed = challenge.status === 'completed';

  const card = document.createElement('article');
  card.className = 'challenge-card';
  const head = document.createElement('div');
  head.className = 'challenge-head';
  const title = document.createElement('strong');
  title.textContent = `你 vs ${other.name}`;
  const state = document.createElement('span');
  state.className = 'challenge-state';
  state.textContent = completed
    ? resultText(challenge)
    : (mine === undefined ? '輪到你挑戰' : '等待好友完成');
  head.append(title, state);

  const board = document.createElement('div');
  board.className = 'score-board';
  board.append(
    makeScorePlayer('你', mine),
    Object.assign(document.createElement('div'), { className: 'score-vs', textContent: 'VS' }),
    makeScorePlayer(other.name, theirs),
  );
  card.append(head, board);

  if (!completed && mine === undefined) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'primary-button';
    play.textContent = '開始 10 秒挑戰';
    play.addEventListener('click', () => openGame(challenge));
    card.append(play);
  } else if (completed) {
    state.classList.add(mine >= theirs ? 'result-win' : 'result-draw');
  }
  return card;
}

function renderChallenges() {
  const activeList = $('active-challenge-list');
  const historyList = $('game-history-list');
  if (!activeList || !historyList) return;
  activeList.replaceChildren();
  historyList.replaceChildren();

  const sorted = [...challengeItems].sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));
  const active = sorted.filter((item) => item.status !== 'completed');
  const history = sorted.filter((item) => item.status === 'completed');

  if (!active.length) {
    const empty = document.createElement('div');
    empty.className = 'social-empty';
    empty.textContent = '暫時未有進行中的挑戰。';
    activeList.append(empty);
  } else {
    active.forEach((item) => activeList.append(makeChallengeCard(item)));
  }

  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'social-empty';
    empty.textContent = '完成挑戰後，成績會保留在這裡。';
    historyList.append(empty);
  } else {
    history.forEach((item) => historyList.append(makeChallengeCard(item)));
  }
}

function startChallengeListener() {
  unsubscribeChallenges?.();
  if (!S.uid) return;
  const challengeQuery = query(
    collection(S.db, 'gameChallenges'),
    where('participants', 'array-contains', S.uid),
  );
  unsubscribeChallenges = onSnapshot(challengeQuery, (snapshot) => {
    challengeItems = snapshot.docs.map((challengeDoc) => ({
      id: challengeDoc.id,
      ...challengeDoc.data(),
    }));
    renderChallenges();
  }, (error) => {
    console.error(error);
    showToast(CS.ui.errorMessage(error), 5000);
  });
}

function openGame(challenge) {
  currentChallenge = challenge;
  tapScore = 0;
  gameRunning = false;
  clearInterval(gameTimer);
  const other = otherPlayer(challenge);
  $('tap-game-opponent').textContent = `挑戰 ${other.name}`;
  $('tap-countdown').textContent = '準備';
  $('tap-score').textContent = '0';
  $('tap-game-status').textContent = '按開始後會倒數 3 秒';
  $('tap-heart').disabled = true;
  $('start-tap-game').disabled = false;
  $('start-tap-game').textContent = '開始挑戰';
  $('tap-game-overlay').classList.remove('hidden');
}

function closeGame() {
  if (gameRunning) return;
  clearInterval(gameTimer);
  $('tap-game-overlay').classList.add('hidden');
  currentChallenge = null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitScore(challengeId, score) {
  await perform(async () => {
    const challengeRef = doc(S.db, 'gameChallenges', challengeId);
    await runTransaction(S.db, async (transaction) => {
      const snapshot = await transaction.get(challengeRef);
      if (!snapshot.exists()) throw new Error('這個挑戰已不存在。');
      const data = snapshot.data();
      if (data.scores?.[S.uid] !== undefined) throw new Error('你已完成這個挑戰。');
      const scores = { ...(data.scores || {}), [S.uid]: score };
      const completed = Object.keys(scores).length >= 2;
      transaction.update(challengeRef, {
        scores,
        status: completed ? 'completed' : 'waiting',
        completedAt: completed ? serverTimestamp() : null,
      });
    });
    showToast(`成績已記錄：${score} 次`);
  });
}

async function startGameRound() {
  if (!currentChallenge || gameRunning) return;
  $('start-tap-game').disabled = true;
  $('tap-heart').disabled = true;
  for (let count = 3; count >= 1; count -= 1) {
    $('tap-countdown').textContent = String(count);
    $('tap-game-status').textContent = '準備…';
    await delay(700);
  }

  tapScore = 0;
  gameRunning = true;
  $('tap-score').textContent = '0';
  $('tap-heart').disabled = false;
  $('tap-game-status').textContent = '快啲點擊愛心！';
  const endAt = Date.now() + 10000;
  $('tap-countdown').textContent = '10.0';

  gameTimer = setInterval(async () => {
    const remaining = Math.max(0, endAt - Date.now());
    $('tap-countdown').textContent = (remaining / 1000).toFixed(1);
    if (remaining <= 0) {
      clearInterval(gameTimer);
      gameRunning = false;
      $('tap-heart').disabled = true;
      $('tap-countdown').textContent = '完成';
      $('tap-game-status').textContent = `你的成績：${tapScore} 次`;
      $('start-tap-game').textContent = '已完成';
      await submitScore(currentChallenge.id, tapScore);
    }
  }, 50);
}

function bindGameUi() {
  $('start-tap-game')?.addEventListener('click', startGameRound);
  $('tap-heart')?.addEventListener('click', () => {
    if (!gameRunning) return;
    tapScore += 1;
    $('tap-score').textContent = String(tapScore);
  });
  $('close-tap-game')?.addEventListener('click', closeGame);
}

async function startGameFeature() {
  bindGameUi();
  startChallengeListener();
}

Object.assign(CS.game, {
  createChallenge,
  startGameFeature,
  renderChallenges,
});
