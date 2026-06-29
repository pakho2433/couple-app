const CS = globalThis.CoupleSpace;
const S = CS.state;

async function startSocialFeatures() {
  if (S.socialStarted || !S.uid) return;
  S.socialStarted = true;
  try {
    await CS.friends.startFriends();
    await CS.game.startGameFeature();
  } catch (error) {
    S.socialStarted = false;
    console.error('Unable to start social features:', error);
    CS.ui.showToast(CS.ui.errorMessage(error), 6000);
  }
}

function attachWhenReady() {
  if (!S.auth) {
    setTimeout(attachWhenReady, 100);
    return;
  }
  CS.fb.onAuthStateChanged(S.auth, async (user) => {
    if (!user) return;
    S.uid = user.uid;
    await startSocialFeatures();
  });
}

attachWhenReady();
