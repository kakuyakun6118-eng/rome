/**
 * 配布用の1枚 HTML を書き出す。
 *
 * `npm run build` のあとに走らせると、CSS と JS を index.html に
 * 埋め込んだ `rome.html` ができる。**この1ファイルだけで遊べる**ので、
 * サーバも置き場所も要らず、ブラウザで開けばそのまま動く。
 *
 * 肖像・戦場のイメージ画・地の画は外部のファイルなので含まれない。
 * どれも「無ければ SVG の代替図に落ちる」作りにしてあるため、
 * 絵が線画になるだけで遊びには影響しない。
 *
 * 実行: npm run build && node scripts/build-single-file.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = 'dist';
let html = readFileSync(`${dir}/index.html`, 'utf8');
const files = readdirSync(`${dir}/assets`);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));

const jsCode = readFileSync(`${dir}/assets/${js}`, 'utf8');
const cssCode = readFileSync(`${dir}/assets/${css}`, 'utf8');

// 外部を指す行を、中身そのものに置き換える
html = html
  .split('\n')
  .map((line) => {
    if (line.includes(`assets/${css}`)) return `    <style>\n${cssCode}\n    </style>`;
    if (line.includes(`assets/${js}`)) return `    <script type="module">\n${jsCode}\n    </script>`;
    return line;
  })
  .join('\n');

if (html.includes('./assets/')) throw new Error('外部参照が残っている');
writeFileSync('rome.html', html);
console.log('rome.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
