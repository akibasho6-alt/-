const fs = require('fs');
const path = require('path');

let html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');
const bundleName = fs.readdirSync(path.join('dist', 'js'))
  .find((name) => /^bundle\.[0-9a-f]+\.js$/.test(name));

if (!bundleName) {
  throw new Error('Production bundle was not found in dist/js. Run the webpack build first.');
}

const bundlePath = path.join('dist', 'js', bundleName);
const js = fs.readFileSync(bundlePath, 'utf8');

// Keep the conventional local copy available for existing local workflows.
fs.copyFileSync(bundlePath, path.join('js', 'bundle.js'));

html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>');
// The source entry is an ES module, while the standalone file must embed the
// production bundle so it also works when opened directly from the filesystem.
html = html.replace(
  /<script\s+type=["']module["']\s+src=["']js\/app\.js["']><\/script>/,
  () => '<script>\n' + js + '\n</script>'
);

fs.writeFileSync('旋盤マイスター.html', html, 'utf8');
console.log('Standalone HTML generated successfully: 旋盤マイスター.html');
