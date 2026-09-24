const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, 'src', name), 'utf8');
const content = read('shell.html')
  .replace('/*__STYLES__*/', () => read('style.css'))
  .replace('/*__CONTENT__*/', () => read('content.js'))
  .replace('/*__LEGACY__*/', () => read('legacy-engine.js'))
  .replace('/*__ENGINE__*/', () => read('engine.js'))
  .replace('/*__APP__*/', () => read('app.js'));
fs.writeFileSync(path.join(root, 'index.html'), content, 'utf8');
console.log(`Built index.html (${Math.round(Buffer.byteLength(content) / 1024)} KB); no external dependencies.`);
