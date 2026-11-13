# Event Studio 現場ポータル / photoedit

イベントの現場で使う道具を、ひとつのサイトにまとめた静的サイトです。ブラウザだけで動き、サーバー・アカウント・APIキーは不要。写真も入力内容も端末の外には送信しません。

HTML・CSS・JavaScriptはリポジトリ内で直接編集できます。写真素材・来場者の名簿・認証情報はアップロードしないでください。

## ツール一覧

| 分類 | ツール | ファイル | できること |
|---|---|---|---|
| 映す | スライドショー | `slideshow.html` | 写真フォルダを全画面でループ上映 |
| 映す | サイネージ | `signage.html` | 案内・告知の全画面表示、カウントダウン、矢印、自動切り替え |
| 映す | QRコード | `qr.html` | URL・Wi-FiのQRコードを全画面表示、PNG / SVG保存 |
| 進める | 進行表 | `rundown.html` | いま・つぎ・残り時間、押し巻き、進行モニター、CSV入出力、印刷 |
| 進める | ステージタイマー | `timer.html` | カウントダウン / 終了時刻まで / カウントアップ、超過表示、カンペ |
| 進める | 抽選 | `lottery.html` | 名前リスト・番号から抽選、重複なし、記録のCSV保存 |
| 数える・確かめる | 来場カウンター | `counter.html` | 入退場のカウント、定員に対する混み具合、30分ごとの集計 |
| 数える・確かめる | チェックリスト | `checklist.html` | 前日準備〜撤収の確認項目（編集可） |
| 仕込む | 画像を整える | `image-batch.html` | 画像サイズ・比率の一括統一 |
| 仕込む | 画面・音響チェック | `testpattern.html` | テストパターン11種、スピーカー確認用のテスト音 |

ホーム（`index.html`）の「現場ボード」には、現在時刻、進行表のいま・つぎ、在場人数、チェックの進み具合がまとまって出ます。入力した内容は「まとめて書き出す / ファイルから読み込む」で別のPCへ移せます。

## Vercel公開設定

`vercel.json` に設定済みです。接続先リポジトリは `77taka777/photoedit`、本番ブランチは `main` です。

- Framework: Other
- Install Command: なし
- Build Command: `python3 scripts/build.py`
- Output Directory: `dist`
- Root Directory: リポジトリ直下

ビルド時にオフライン版を再生成し、リンクとZIPを検証して、公開ファイルだけを`dist`へコピーします。Python 3.10以降の標準ライブラリのみ使用し、APIキー・追加パッケージ・バックエンドは不要です。

## ローカル確認

```sh
python3 scripts/build.py
python3 -m http.server 8080 --directory dist
```

`http://localhost:8080`をPC版Edge / Chromeで開いてください。Windowsでは`python3`を`python`に置き換えられます。ビルドせずに、リポジトリ直下の`index.html`を直接開いても動きます。

## データの扱い

- 選択した写真は端末内で処理し、保存も送信もしません。
- 進行表・チェックリスト・来場の記録・抽選・サイネージ・タイマーの設定は、使っているブラウザの localStorage に保存します（キーは `eventstudio:v1:*`）。サーバーへの送信・端末どうしの同期はありません。
- QRコードに入力した内容（Wi-Fiのパスワードを含む）は保存しません。
- 各HTMLの Content-Security-Policy は `connect-src 'none'` で、ページからの通信を禁止しています。
- 公開ページの取得時にはホスティングサービスへの通信が発生します。

詳細は `privacy.html` にあります。機能を足したら、この説明と食い違わないように更新してください。

## ファイル

- `index.html` ほか12個のHTML … 各ページ。一覧は `scripts/site_pages.py`
- `assets/site.css` `assets/site.js` … 全ページ共通（ヘッダー、ツールメニュー、端末内保存、全画面表示の共通処理）
- `assets/tools.css` … 新しいツール共通のスタイル
- `assets/<ツール名>.js` … 各ツールの処理。`assets/qrcode.js` は自前のQRコード生成
- `scripts/` … ビルドと検証用。公開先には配信しません
- `docs/` … 編集・公開・検証のメモ

## 注意

全画面表示のツールは PC版 Edge / Chrome 向けです。来場カウンターとチェックリストはスマホでも使えます。HEIC・RAWは対象外です。来場カウンターは端末ごとに数えます（複数の入口の合算は、各端末のCSVを足してください）。

本番前はPCを電源につなぎ、スリープ・通知をオフにし、実際の画面で使うツールを一度ずつ動かしてください。

## v1（Photo Event Studio）からの更新

このフォルダの**中身**で、リポジトリ直下を置き換えます。`index.html`、`vercel.json`、`assets/`、`scripts/`が最上位に並ぶ状態にしてください。ZIPファイル自体や親フォルダを丸ごと配置しないでください。

- 古い `downloads/photo-event-studio-offline.zip` は削除してください（新しい名前は `downloads/event-studio-offline.zip`）。
- `scripts/build.py` の `site-source.tar.gz` 展開の仕組みは廃止しました。リポジトリのHTML/CSS/JSがそのまま公開されます。
- スライドショーと画像変換の処理（`assets/slideshow.js` `assets/image-batch.js`）は変更していません。ヘッダー・フッター・パンくずだけを差し替えています。
