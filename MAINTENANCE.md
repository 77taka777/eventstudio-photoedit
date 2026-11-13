# サイトの編集・更新

## どこを変えるか

| 変えたいもの | 編集するファイル |
|---|---|
| ホームの文言・ツールの並び | `index.html` |
| 色・共通ヘッダー・フッター・ホームの見た目 | `assets/site.css` |
| ヘッダーの「ツール」メニューの中身 | `assets/site.js` の `TOOLS` |
| 新しいツール共通の見た目（カード、入力欄、全画面表示） | `assets/tools.css` |
| 各ツールの文言 | そのツールのHTML |
| 各ツールの動作 | `assets/<ツール名>.js` |
| チェックリストの最初の項目 | `assets/checklist.js` の `TEMPLATE` |
| サイネージのひな形 | `assets/signage.js` の `TEMPLATES` |
| タイマーのカンペの初期値 | `assets/timer.js` の `DEFAULT_CUES` |
| 進行表のサンプル | `assets/rundown.js` の `plan` |

ヘッダーのサイト名（EVENT STUDIO / 現場ポータル）とフッターは、12個のHTMLそれぞれに同じものが入っています。変えるときは全ページを同じ内容に揃えてください。

公開版はローカルのHTML/CSS/JavaScriptだけで動作し、外部CDNやnpm依存はありません。各HTMLの `Content-Security-Policy` は外部通信を禁止しています（`connect-src 'none'`）。新しい外部サービスを追加する場合は、処理内容と `privacy.html` の説明が一致するよう見直してください。

## ツールを追加するとき

1. `新しいツール.html` を既存のツール（例：`counter.html`）からコピーして作る。スクリプトは必ず `<script src="assets/xxx.js" defer></script>` の形で読み込む（オフライン版の埋め込みがこの形を前提にしています）。
2. `scripts/site_pages.py` の `PAGES` に追加する。
3. `index.html` のツール一覧（`.directory-list`）に1行追加する。
4. `assets/site.js` の `TOOLS` に追加する（ヘッダーのメニュー）。
5. 端末に保存するデータがあるなら、`assets/site.js` の `KEYS` に保存名を追加し（「まとめて書き出す」の対象になります）、`privacy.html` の表と `assets/home.js` の `names` にも追記する。
6. `python3 scripts/build.py` を実行。2〜4のどれかを忘れているとエラーで知らせます。

## 共通の仕組み（`assets/site.js`）

`window.EventStudio` に次のものがあります。

- `store.get / set / remove` … 端末内保存。実体は localStorage の `eventstudio:v1:<名前>`。保存できない環境（プライベートモードなど）ではページ内のメモリに切り替わります。
- `createStage(element, options)` … 全画面表示の共通処理。全画面化、画面スリープの抑止、操作バーの自動非表示、`Esc` `F` `B` キー、表示中に下の設定画面を操作不能にする処理をまとめています。
- `schedule.parseTime / live` … 「1830」「25:00」などの時刻の解釈と、進行表の「いま・つぎ」の計算。ホームと進行表で共用。
- `download / toCsv / parseCsv / toast / confirm / fitText` … ファイル保存、CSV、通知、確認ダイアログ、文字サイズの自動調整。

スライドショーと画像変換は以前の `window.PhotoStudio.setDirty` をそのまま使っています（互換のために残しています）。

## 変更を反映する

Vercelでは `main` へコミットすると `python3 scripts/build.py` が走り、オフライン版ZIPの再生成・検証・`dist/` への書き出しまで自動で行います。

GitHub Pages（`main / (root)` をそのまま公開）の場合、オフライン版ZIPは自動では作り直されません。編集後にサイトのルートで次を実行し、`downloads/event-studio-offline.zip` も一緒にコミットしてください。

```bash
python scripts/build_offline.py
python scripts/check_site.py
```

`check_site.py` は、リンク切れ、IDの重複、CSP、インラインスクリプトの混入、JS内の通信処理（`fetch` など）、ホームとメニューへの登録漏れ、オフラインZIPの中身を確認します。

## ローカル確認（任意）

`index.html` をブラウザで開くか、開発用ローカルサーバーを使用します。

```bash
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8000/` を開きます。これは公開URLではなく、PC上だけの確認用です。終了は `Ctrl+C`。

`file://` で開いたときと `http://` で開いたときでは、ブラウザ上の保存場所が別になります。片方で入れた進行表はもう片方には出ません（ホームの書き出し・読み込みで移せます）。

## バージョン管理

日付やバージョン表示は `privacy.html` の末尾と、各ページのフッターにあります。独自ドメイン・解析・認証・サーバー側の保存・端末どうしの同期・サービスワーカーは実装していません。

公開物にテスト用の写真や本番写真、来場者の名簿を混ぜないでください。入力フォルダはサイトのフォルダと分けて保管する構成を推奨します。
