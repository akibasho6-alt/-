const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const fs = require('fs');

const sourceModuleScript = /\s*<script\s+type=["']module["']\s+src=["']js\/app\.js["']><\/script>/;

module.exports = merge(common, {
  mode: 'production',
  plugins: [
    new HtmlWebpackPlugin({
      // Keep index.html usable by the local ES-module server, but remove its
      // source entry from the production copy and inject webpack's bundle.
      templateContent: () => fs.readFileSync('./index.html', 'utf8').replace(sourceModuleScript, ''),
      inject: 'body',
      scriptLoading: 'defer',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'img', to: 'img' },
        { from: 'css', to: 'css' },
        { from: 'icon.svg', to: 'icon.svg' },
        { from: 'favicon.ico', to: 'favicon.ico' },
        { from: 'robots.txt', to: 'robots.txt' },
        { from: 'icon.png', to: 'icon.png' },
        { from: '404.html', to: '404.html' },
        { from: 'site.webmanifest', to: 'site.webmanifest' },
      ],
    }),
  ],
});
