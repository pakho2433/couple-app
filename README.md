# Couple Space 💗

一個只供兩個人使用的情侶 PWA，可直接用兩部 iPhone Safari 開啟。

## 功能

- 兩部不同 iPhone 各自使用
- 8 位一次性情侶配對碼
- 一對一即時文字聊天
- 傳送圖片及影片
- Safari 內直接錄音及傳送語音訊息
- 點擊圖片全螢幕預覽
- 虛擬禮物：玫瑰、奶茶、蛋糕、擁抱券等
- Firestore 即時同步
- App 開啟時的新訊息提示聲
- 聊天分頁未讀紅點及網頁標題未讀數
- 加入 iPhone 主畫面
- GitHub Pages 部署

## 網址

```text
https://pakho2433.github.io/couple-app/web/
```

兩部 iPhone 都使用 Safari 開啟網址，再按：

```text
分享 → 加入主畫面
```

## Firebase 設定

1. 在 Firebase Console 建立專案及 Web App。
2. Authentication 啟用 **Anonymous** 登入。
3. 建立 Cloud Firestore，選 Production mode。
4. Authentication → Settings → Authorized domains，加入：

```text
pakho2433.github.io
```

5. 將 Firebase Web Config 寫入 `web/firebase-config.js` 及目前網站使用的設定檔。
6. 如要使用圖片、錄音及影片功能，必須：
   - 將 Firebase 專案升級為 Blaze 方案
   - 在 Firebase Console 建立 Cloud Storage bucket
   - 發布 repository 內的 `storage.rules`

## 部署安全規則

使用 Firebase CLI：

```bash
firebase deploy --only firestore:rules,storage
```

也可以在 Firebase Console 分別貼上並發布：

- Firestore Database → Rules：`firestore.rules`
- Storage → Rules：`storage.rules`

## 媒體限制

- 圖片：每個檔案最多 12 MB
- 影片：每個檔案最多 50 MB
- 錄音：最多 5 分鐘及 12 MB
- 上傳路徑只允許已配對成員存取

## 使用流程

1. 用戶 A 開啟網址，輸入名稱並建立情侶空間。
2. App 顯示 8 位配對碼。
3. 用戶 B 在另一部 iPhone 開啟同一網址，輸入名稱及配對碼。
4. 配對完成後，兩人可即時聊天、送 Gift、傳圖片、錄音及影片。
5. 聊天輸入列的 `＋` 可選圖片或影片，`🎤` 可開始錄音。
6. 右上角按 `🔇` 可開啟 App 內訊息提示聲。

## 專案結構

```text
web/                         iPhone PWA
.github/workflows/           GitHub Pages 自動部署
firestore.rules              聊天及媒體訊息安全規則
storage.rules                圖片、錄音及影片安全規則
firebase.json                Firebase Rules 部署設定
```

## 私隱提醒

目前是私人測試 MVP。正式公開前，應加入帳戶刪除、解除配對、媒體刪除、配對碼到期、App Check、用量限制及私隱政策。
