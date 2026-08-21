const path = require('path');

module.exports = {
  entry: {
    app: './js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    // A content hash prevents GitHub Pages/CDN and browser caches from
    // serving an older game bundle after a deployment.
    filename: 'js/bundle.[contenthash:8].js',
    publicPath: '',
  },
};
