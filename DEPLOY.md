# GitHub Pagesで公開する手順

Vercelで公開する場合は、この手順は不要です（[README](../README.md) の「Vercel公開設定」を参照）。ここでは、GitHub Pagesだけで公開する場合の手順を説明します。

このファイル一式は**公開の準備ができたサイトデータ**です。リポジトリへのアップロードとPagesの有効化は、以下の操作で行ってください。ビルドコマンド、サーバー契約、APIキーは不要です。

## 1. 配布ZIPを解凍する

ZIPを右クリックし、「すべて展開」で解凍してください。解凍してできたフォルダを開きます。

`index.html`、`slideshow.html`、`rundown.html`、`timer.html` などのHTML、`assets`、`downloads`、`README.md` が見える場所がサイトのルートです。

- この**フォルダの中身**をアップロードします。
- 配布ZIPをそのまま1個だけアップロードしないでください。
- 解凍してできた外側のフォルダごとではなく、その中身をアップロードしてください。
- `downloads` 内のオフライン版ZIPはサイトの機能に必要なので、そのまま含めてください。
- イベント写真・企業の非公開資料・来場者の名簿などの個人情報はアップロードしません。

## 2. 新しいリポジトリを作る

GitHubの **New repository** で作成します。名前の例は `event-studio` です。実際の名前は自由です。

GitHub FreeでPagesを使う場合は **Public** を選びます。既存サイトや別プロジェクトを上書きしないよう、専用の新規リポジトリを推奨します。Publicではサイトのソースコードが公開されるため、非公開の写真や認証情報を混ぜないでください。

## 3. ファイルをアップロードする

空のリポジトリなら **uploading an existing file**、ファイルがあるリポジトリなら **Add file → Upload files** を開きます。

解凍したフォルダ内のファイルとフォルダを、まとめてドラッグ＆ドロップします。コミットメッセージは、たとえば `Add Event Studio portal`。アップロード・コミットを確定し、公開対象の `main` に入っていることを確認します。別ブランチに追加した場合は、プルリクエストを `main` にマージしてください。

最終的に次の形になればOKです。

```text
リポジトリ直下
  index.html
  slideshow.html
  signage.html
  qr.html
  rundown.html
  timer.html
  lottery.html
  counter.html
  checklist.html
  image-batch.html
  testpattern.html
  privacy.html
  vercel.json
  assets/
  downloads/
  scripts/
  docs/
  README.md
  .nojekyll
  .gitignore
  .editorconfig
```

ドットから始まるファイルがPCで非表示の場合があります。`.nojekyll` がないときは **Add file → Create new file** でファイル名を `.nojekyll` にし、作成してください。内容は空、または改行だけで構いません。`.gitignore` はGitでの誤追加を減らすための補助であり、ブラウザから手動でアップロードした写真を自動で隠すものではありません。

## 4. GitHub Pagesを有効にする

リポジトリの **Settings → Pages** を開きます。

| 項目 | 設定 |
|---|---|
| Source | **Deploy from a branch** |
| Branch | **main** |
| Folder | **/(root)** |

**Save** を押します。`main` が選べない場合は、まずファイルをコミットしてブランチを作ってください。この構成では **GitHub Actions** をSourceとして選んだり、独自のデプロイ用YAMLを追加したりする必要はありません。

## 5. 公開URLを確認する

Pagesの設定画面に表示される **Visit site** を開きます。プロジェクトサイトの場合、URLは通常次の形です。

```text
https://あなたのGitHubユーザー名.github.io/リポジトリ名/
```

これはURLの形式を示す例です。実際のURLはSettings → Pagesで確認してください。GitHub公式では、変更が公開されるまで最大10分ほどかかる場合があると案内しています。

反映されない場合は **Actions** の `pages build and deployment` など、Pagesのデプロイ結果を確認します。

## 公開後の確認

トップページから10個のツールがすべて開くこと、ヘッダーの「ツール」メニューが開くこと、進行表・チェックリストに入力した内容が再読み込み後も残ること、画像を選択してプレビューできること、PNG/JPGの個別保存とZIP保存ができること、ZIPを解凍した画像の寸法が正しいこと、スライドショーの全画面・停止・暗転・終了が使えること、オフライン版をダウンロードして使えることを確認してください。

実際の会場では、PCを電源に接続し、スリープと通知をオフにします。PCとプロジェクター・モニターで一周再生してください。

## よくあるつまずき

**トップページが404になる**：`index.html` がリポジトリ直下にあるか、Pagesの対象が `main / (root)` か、Actionsが成功したか確認します。`フォルダ名/index.html` のように1段深く入っていたら、ファイルを直下へ移します。

**画面が崩れる・ボタンが動かない**：`assets` フォルダを中身ごとアップロードしてください。ファイル名の大文字・小文字を変更しないでください。HTTPSで開き、再読み込みしてください。

**オフライン版のリンクが開かない**：`downloads/event-studio-offline.zip` がアップロードされているか確認します。

**入力した進行表が別のPCで出てこない**：入力内容は使ったブラウザの中だけに保存されます。ホームの「まとめて書き出す」で保存したファイルを、移した先のホームで「ファイルから読み込む」と引き継げます。

**Pagesが表示されない・Publicを選べない**：リポジトリの管理権限、利用プラン、組織のポリシーを確認してください。

**変換した画像が上映ツールに出ない**：自動転送はしていません。変換画像を保存し、ZIPなら解凍してから、上映ツールでそのフォルダを選びます。

## 公式資料

2026年10月15日確認。

- [公開元を設定する](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [リポジトリへファイルを追加する](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [GitHub Pagesサイトを作成する](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
