const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const js = fs.readFileSync('js/bundle.js', 'utf8');

html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>');
// The source entry is an ES module, while the standalone file must embed the
// production bundle so it also works when opened directly from the filesystem.
html = html.replace(
  /<script\s+type=["']module["']\s+src=["']js\/app\.js["']><\/script>/,
  () => '<script>\n' + js + '\n</script>'
);

fs.writeFileSync('旋盤マイスター.html', html, 'utf8');
console.log('Standalone HTML generated successfully: 旋盤マイスター.html');
