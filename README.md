# Couple Space 💗

一個只供兩個人使用的免費情侶 PWA，可直接用兩部 iPhone Safari 開啟。

## 免費版功能

- 兩部不同 iPhone 各自使用
- 8 位一次性情侶配對碼
- 一對一即時文字聊天
- 虛擬禮物：玫瑰、奶茶、蛋糕、擁抱券等
- Firestore 即時同步
- App 開啟時的新訊息提示聲
- 聊天分頁未讀紅點及網頁標題未讀數
- 加入 iPhone 主畫面
- GitHub Pages 免費部署
- 不需要信用卡
- 不需要 VAPID Key
- 不需要 Cloud Functions

## 網址

```text
https://pakho2433.github.io/couple-app/
```

兩部 iPhone 都使用 Safari 開啟網址，再按：

```text
分享 → 加入主畫面
```

## 免費版限制

當 Couple Space 正在開啟時，訊息及 Gift 會即時出現，並可播放 App 內提示聲。

當 App 完全關閉或長時間在背景時，不會彈出 iPhone 系統推送通知。這是移除付費後端及 Cloud Function 後的取捨。

## 只需一次的 Firebase 免費設定

1. 在 Firebase Console 建立免費專案，不需要升級 Blaze。
2. Authentication 啟用 **Anonymous** 登入。
3. 建立 Cloud Firestore，選 Production mode。
4. 新增 Firebase Web App。
5. Authentication → Settings → Authorized domains，加入：

```text
pakho2433.github.io
```

6. 在 GitHub repository 進入：

```text
Settings → Secrets and variables → Actions
```

加入以下 6 個 Repository secrets：

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

不需要設定 `FIREBASE_VAPID_KEY`。

7. 在 GitHub Actions 執行 **Deploy Couple Space PWA**。

## Firestore Rules

只需部署資料庫規則，不需要部署任何 Function：

```bash
firebase deploy --only firestore:rules
```

也可以直接在 Firebase Console 的 Firestore → Rules 貼上 repository 內 `firestore.rules` 的內容，再按 Publish。

## 使用流程

1. 用戶 A 開啟網址，輸入名稱並建立情侶空間。
2. App 顯示 8 位配對碼。
3. 用戶 B 在另一部 iPhone 開啟同一網址，輸入名稱及配對碼。
4. 配對完成後，兩人可即時聊天及送 Gift。
5. 右上角按 `🔇` 可開啟 App 內訊息提示聲。

## 專案結構

```text
web/                         iPhone PWA 免費版
.github/workflows/           GitHub Pages 自動部署
firestore.rules              情侶資料安全規則
firebase.json                只部署 Firestore Rules
```

## 私隱提醒

目前是私人測試 MVP。正式公開前，應加入帳戶刪除、解除配對、配對碼到期、App Check 和私隱政策。
