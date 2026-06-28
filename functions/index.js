const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const APP_URL = 'https://pakho2433.github.io/couple-app/';

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
    const recipient = recipientSnapshot.data() || {};
    const expoPushToken = recipient.expoPushToken;
    const webPushToken = recipient.webPushToken;

    const isGift = message.type === 'gift';
    const title = isGift ? '你收到一份禮物 🎁' : '你有新訊息 💗';
    const body = isGift
      ? `${message.giftEmoji || '🎁'} ${message.giftName || '神秘禮物'}`
      : String(message.text || '打開 Couple Space 查看').slice(0, 120);

    const deliveries = [];

    const validExpoToken =
      typeof expoPushToken === 'string'
      && /^(ExponentPushToken|ExpoPushToken)\[/.test(expoPushToken);

    if (validExpoToken) {
      deliveries.push(
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: expoPushToken,
            sound: 'default',
            title,
            body,
            data: {
              coupleId: event.params.coupleId,
              messageId: event.params.messageId,
              type: message.type || 'text',
            },
          }),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Expo push failed: ${response.status} ${await response.text()}`);
          }
        }),
      );
    }

    if (typeof webPushToken === 'string' && webPushToken.length > 20) {
      deliveries.push(
        getMessaging().send({
          token: webPushToken,
          notification: { title, body },
          data: {
            coupleId: event.params.coupleId,
            messageId: event.params.messageId,
            type: message.type || 'text',
          },
          webpush: {
            fcmOptions: { link: APP_URL },
            notification: {
              icon: `${APP_URL}icon.svg`,
              badge: `${APP_URL}icon.svg`,
              tag: `couple-${event.params.coupleId}`,
              renotify: true,
            },
          },
        }),
      );
    }

    const results = await Promise.allSettled(deliveries);
    for (const result of results) {
      if (result.status === 'rejected') console.error(result.reason);
    }
  },
);
