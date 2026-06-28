# Couple Space 💗

一個只供兩個人使用的私人情侶 App，使用 Expo、React Native 及 Firebase 製作。

## 已完成的 MVP 功能

- 兩部不同 iPhone 各自登入
- 8 位一次性情侶配對碼
- 一對一即時文字聊天
- 虛擬禮物：玫瑰、奶茶、蛋糕、擁抱券等
- Firestore 即時同步
- iPhone 推送通知權限及 Expo Push Token 登記
- Firebase Cloud Function：有新訊息或禮物時通知另一半
- Firestore 安全規則：只有情侶成員可讀取對話

## 專案技術

- Expo SDK 56 / React Native
- Firebase Anonymous Authentication
- Cloud Firestore
- Firebase Cloud Functions
- Expo Notifications / EAS Build

## 1. 建立 Firebase 專案

1. 到 Firebase Console 建立一個專案。
2. 在 **Authentication → Sign-in method** 啟用 **Anonymous**。
3. 建立 **Cloud Firestore** database。
4. 在 Firebase 專案新增 Web App，取得 Firebase config。
5. 將 `.env.example` 複製為 `.env`，填入全部 Firebase 資料。

```bash
cp .env.example .env
```

`.env` 範例：

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_EAS_PROJECT_ID=...
```

> 不要把 `.env` 上載到 GitHub；專案已在 `.gitignore` 排除它。

## 2. 在電腦啟動 App

需要 Node.js 22 或以上。

```bash
npm install
npx expo start
```

兩部 iPhone 可先使用 Expo Go 掃描同一個 QR Code，測試配對、聊天及送禮物。完整遠端通知建議使用 EAS development build。

## 3. 部署 Firestore Rules 及通知 Function

```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```

Firebase Functions 一般需要 Firebase Blaze 計劃才能部署。

## 4. 建立 iPhone Development Build

```bash
npm install -g eas-cli
eas login
eas init
```

`eas init` 完成後，將產生的 EAS Project ID 填入：

- `.env` 的 `EXPO_PUBLIC_EAS_PROJECT_ID`
- `app.json` 內 `expo.extra.eas.projectId`

建立 iPhone 測試版本：

```bash
eas build --profile development --platform ios
```

正式 App Store / TestFlight 版本：

```bash
eas build --profile production --platform ios
```

## 使用流程

1. 用戶 A 開啟 App，輸入名稱並按「建立情侶空間」。
2. App 顯示 8 位配對碼。
3. 用戶 B 在另一部 iPhone 輸入名稱及配對碼。
4. 配對完成後，兩人可即時聊天及送禮物。
5. App 在背景時，新訊息會經 Cloud Function 發出推送通知。

## 資料結構

```text
users/{uid}
couples/{coupleId}
couples/{coupleId}/messages/{messageId}
pairCodes/{8位配對碼}
```

## 下一階段可加入

- 相片及語音訊息
- 真實語音／視像通話
- 二人相簿
- 紀念日及約會提醒
- 每日心情及情侶問題
- Apple Sign In
- 解除配對及刪除帳戶

## 私隱提醒

目前是 MVP。正式公開前，建議加入私隱政策、封鎖／檢舉機制、帳戶刪除、配對碼有效期，以及更嚴格的 App Check 和後端驗證。
