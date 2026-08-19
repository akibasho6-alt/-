# 旋盤マイスター

ブラウザで遊べる旋盤加工シミュレーションゲームです。PCとスマートフォンの両方に対応しています。

## GitHub Pagesで公開する

1. このフォルダーをGitHubリポジトリの `main` ブランチへpushします。
2. GitHubのリポジトリで **Settings → Pages** を開きます。
3. **Source** を **GitHub Actions** に設定します。
4. **Actions** の `Deploy to GitHub Pages` が完了すると、PagesのURLで遊べます。

以後は `main` へpushするたびに自動更新されます。

## 同じWi-Fiのスマートフォンで確認する（Windows）

1. [Node.js LTS](https://nodejs.org/)をインストールします。
2. `スマホで遊ぶ(QRコード表示).bat` をダブルクリックします。
3. 自動表示された案内ページのQRコードをスマートフォンで読み取ります。

`npm install` は不要です。PCとスマートフォンを同じWi-Fiへ接続してください。

## 開発・ビルド

```sh
npm ci
npm run build
```

公開用ファイルは `dist` に生成されます。
