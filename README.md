# ExpiryBot

お土産の賞味期限をNotionで管理するDiscord Bot。

## できること

- 登録専用チャンネルに「商品名 賞味期限 日付」のようなメッセージを送るとNotionに登録され、✅リアクションが付く
- 毎朝、期限が近い(デフォルト7日以内)お土産を1件ずつ通知チャンネルに投稿
- 通知メッセージに✅リアクションをつけると、その商品をNotion上で消費済みにする

## セットアップ

### 1. Notion側

1. https://www.notion.so/my-integrations でIntegrationを作成し、Tokenを控える
2. 次のプロパティを持つデータベースを作成する
   - `商品名` (Title)
   - `賞味期限` (Date)
   - `ステータス` (Select: `未消費`, `消費済み`)
   - `登録者` (Text)
   - `元メッセージ` (URL)
3. データベース右上の「Connections」から、作成したIntegrationを接続する
4. データベースURLからデータベースIDを控える

### 2. Discord側

1. https://discord.com/developers/applications でBotを作成する
2. 「Bot」設定で `MESSAGE CONTENT INTENT` を有効化する
3. OAuth2 URL Generatorで `bot` スコープ、`View Channel` / `Send Messages` / `Read Message History` / `Add Reactions` 権限を選び、サーバーに招待する
4. 登録専用チャンネルと通知先チャンネルのIDを控える(開発者モードを有効にして右クリック→IDをコピー)

### 3. 環境変数

`.env.example` を `.env` にコピーし、以下を埋める。

```
DISCORD_TOKEN=
NOTION_TOKEN=
NOTION_DATABASE_ID=
REGISTER_CHANNEL_ID=
NOTIFY_CHANNEL_ID=
REMINDER_DAYS=7
NOTIFY_CRON=0 9 * * *
TZ=Asia/Tokyo
MAPPING_DB_PATH=./data/mapping.sqlite
```

## ローカル実行

Node.js 22以上が必要(`better-sqlite3` のビルドに必要)。

```bash
npm install
npm run build
npm start
```

開発中は `npm run dev` でホットリロード実行できる。

## Docker実行

```bash
docker build -t expirybot .
docker run -d \
  --name expirybot \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  --restart unless-stopped \
  expirybot
```

`data/` ディレクトリはDiscordメッセージ↔Notionページの対応表(SQLite)を保存する。コンテナを再作成してもここをマウントしておけば消えない。

## 運用メモ

- 通知時刻を変えたい場合は `NOTIFY_CRON` を変更する(cron形式、タイムゾーンは `TZ` に従う)
- 通知対象にする残り日数を変えたい場合は `REMINDER_DAYS` を変更する
