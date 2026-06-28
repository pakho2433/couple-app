const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

exports.notifyPartnerOnMessage = onDocumentCreated(
  'couples/{coupleId}/messages/{messageId}',
  async (event) => {
    const message = event.data?.data();
    if (!message) return;

    const db = getFirestore();
    const coupleSnapshot = await db.doc(`couples/${event.params.coupleId}`).get();
    if (!coupleSnapshot.exists) return;

    const members = coupleSnapshot.data().members || [];
    const recipientUid = members.find((memberUid) => memberUid !== message.senderId);
    if (!recipientUid) return;

    const recipientSnapshot = await db.doc(`users/${recipientUid}`).get();
    const expoPushToken = recipientSnapshot.data()?.expoPushToken;
    const validToken =
      typeof expoPushToken === 'string'
      && /^(ExponentPushToken|ExpoPushToken)\[/.test(expoPushToken);
    if (!validToken) return;

    const isGift = message.type === 'gift';
    const payload = {
      to: expoPushToken,
      sound: 'default',
      title: isGift ? '你收到一份禮物 🎁' : '你有新訊息 💗',
      body: isGift
        ? `${message.giftEmoji || '🎁'} ${message.giftName || '神秘禮物'}`
        : String(message.text || '打開 Couple Space 查看'),
      data: {
        coupleId: event.params.coupleId,
        messageId: event.params.messageId,
        type: message.type || 'text',
      },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Expo push failed:', response.status, await response.text());
    }
  },
);
