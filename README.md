# Couple Space 💗

一個只供兩個人使用的私人情侶 App。專案同時保留 Expo 原生版本，並新增可直接用 iPhone Safari 開啟的 PWA 網頁版。

## iPhone 網頁版功能

- 兩部不同 iPhone 各自使用
- 8 位一次性情侶配對碼
- 一對一即時文字聊天
- 虛擬禮物：玫瑰、奶茶、蛋糕、擁抱券等
- Firestore 即時同步
- 加入 iPhone 主畫面後可申請背景推送通知
- GitHub Pages 自動部署
- Firestore 安全規則：只有情侶成員可讀取對話

## 部署後網址

```text
https://pakho2433.github.io/couple-app/
```

兩部 iPhone 都使用 Safari 開啟以上網址，再按：

```text
分享 → 加入主畫面
```

之後由 iPhone 主畫面開啟 Couple Space，即可使用類似普通 App 的全螢幕介面。背景通知必須由主畫面版本開啟及授權。

## 一次性 Firebase 設定

GitHub Pages 只負責 App 網址；即時聊天和通知需要 Firebase。

1. 在 Firebase Console 建立專案。
2. Authentication 啟用 **Anonymous** 登入。
3. 建立 Cloud Firestore。
4. 新增 Firebase Web App。
5. Authentication → Settings → Authorized domains，加入：

```text
pakho2433.github.io
```

6. Cloud Messaging → Web Push certificates，產生 VAPID Key。
7. 在 GitHub repository：

```text
Settings → Secrets and variables → Actions
```

加入以下 Repository secrets：

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_VAPID_KEY
```

Secrets 加入後，執行 GitHub Actions 內的 **Deploy Couple Space PWA**，網站會自動重新部署並注入 Firebase 設定。

## 部署 Firestore Rules 及通知 Function

後端仍需要部署一次：

```bash
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```

這一步可以使用 GitHub Codespaces 或其他瀏覽器雲端終端執行，不要求擁有 Mac。

## 專案結構

```text
web/                         iPhone PWA 網頁版
.github/workflows/           GitHub Pages 自動部署
functions/                   新訊息／禮物通知 Function
firestore.rules              情侶資料安全規則
App.tsx                      Expo 原生版本
```

## 使用流程

1. 用戶 A 開啟網址，輸入名稱並建立情侶空間。
2. App 顯示 8 位配對碼。
3. 用戶 B 在另一部 iPhone 開啟同一網址，輸入名稱及配對碼。
4. 配對完成後，兩人可即時聊天及送禮物。
5. 兩人將網站加入主畫面並開啟通知後，App 在背景亦可收到新訊息通知。

## 私隱提醒

目前是私人測試 MVP。正式公開前，應加入帳戶刪除、解除配對、配對碼到期、App Check、私隱政策，以及圖片／語音內容管理。
