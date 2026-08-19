const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = 3000;
const localIp = getLocalIpAddress();
const rootDir = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // PC guide page
  if (urlPath === '/guide') {
    const mobileUrl = `http://${localIp}:${PORT}/`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(mobileUrl)}`;

    const guideHtml = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>スマホで遊ぶ - 旋盤マイスター</title>
  <style>
    body {
      background: #0f172a;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 16px;
      padding: 30px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 1.4rem;
      margin-top: 0;
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .qr-box {
      background: #fff;
      padding: 16px;
      border-radius: 12px;
      display: inline-block;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .qr-box img {
      display: block;
      width: 240px;
      height: 240px;
    }
    .url-badge {
      background: #0f172a;
      border: 1px solid #38bdf8;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 1.1rem;
      color: #fbbf24;
      font-weight: bold;
      word-break: break-all;
      margin-bottom: 16px;
      user-select: all;
    }
    .steps {
      text-align: left;
      font-size: 0.9rem;
      color: #cbd5e1;
      line-height: 1.6;
      background: #0f172a;
      padding: 14px 18px;
      border-radius: 8px;
      margin-top: 15px;
    }
    .steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .steps li {
      margin-bottom: 6px;
    }
    .btn-play-pc {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #0284c7;
      color: #fff;
      text-decoration: none;
      font-weight: bold;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .btn-play-pc:hover {
      background: #0369a1;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>📱 スマホで旋盤マイスターを遊ぶ</h1>
    <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 8px;">スマホのカメラで下のQRコードを読み取ってください</p>
    
    <div class="qr-box">
      <img src="${qrUrl}" alt="QRコード">
    </div>

    <div class="url-badge">${mobileUrl}</div>

    <div class="steps">
      <ol>
        <li>PCとスマホが<strong>「同じWi-Fi」</strong>に接続されていることを確認してください。</li>
        <li>スマホの<strong>標準カメラアプリ</strong>でQRコードを読み取ると、Juno等の外部アプリを介さず<strong>Safari / Chrome</strong>で直接開きます。</li>
        <li><strong>📱 ホーム画面に追加（専用アプリ化）:</strong> Safariで開いた後、画面下の<strong>共有ボタン（⬆️）➔「ホーム画面に追加」</strong>を行うと、アプリアイコンが作成され次回から全画面で快適に遊べます！</li>
        <li>この黒いコマンド画面（サーバー）はゲームプレイ中閉じずにそのままにしておいてください。</li>
      </ol>
    </div>

    <a href="/" class="btn-play-pc" target="_blank">💻 PCブラウザで開く</a>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(guideHtml);
    return;
  }

  // Static file serving
  let reqPath = urlPath === '/' ? '/旋盤マイスター.html' : urlPath;
  let filePath = path.join(rootDir, reqPath);

  // Fallback to index.html if 旋盤マイスター.html is requested or root
  if (!fs.existsSync(filePath) && (reqPath === '/旋盤マイスター.html' || reqPath === '/')) {
    filePath = path.join(rootDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Server Error: ${err.code}`);
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const mobileUrl = `http://${localIp}:${PORT}/`;
  const guideUrl = `http://localhost:${PORT}/guide`;
  
  console.log('====================================================');
  console.log(' ⚙️  旋盤マイスター - スマホ連携ローカルサーバー起動！');
  console.log('====================================================');
  console.log(`\n [PC用案内ページ]: ${guideUrl}`);
  console.log(` [スマホ用URL]:     ${mobileUrl}\n`);
  console.log(' ※ PCとスマホが同じWi-Fiに接続されている必要があります。');
  console.log(' ※ 案内ページのQRコードをスマホカメラで読み取ってください。');
  console.log(' ※ 終了するときは [Ctrl + C] を押してください。\n');
  console.log('====================================================');

  // Open the guide page in default browser automatically on Windows
  exec(`start ${guideUrl}`);
});
