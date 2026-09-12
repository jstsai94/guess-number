/**
 * 把 `vite build` 的產物打包成單一 HTML 檔，CSS 與 JS 全部內嵌、零外部請求。
 *
 * 會產出兩個版本：
 *   dist/artifact.html  給 Claude Artifact 用（發佈時平台會自己包上 doctype/head/body）
 *   docs/index.html     完整獨立網頁，GitHub Pages 或任何靜態主機直接放就能跑
 *
 * 使用方式：npm run bundle
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const DOCS = 'docs';
const ASSETS = join(DIST, 'assets');

const files = readdirSync(ASSETS);
const cssName = files.find((f) => f.endsWith('.css'));
const jsName = files.find((f) => f.endsWith('.js'));

if (!cssName || !jsName) {
  console.error('找不到建置產物，請先執行 npm run build');
  process.exit(1);
}

const css = readFileSync(join(ASSETS, cssName), 'utf8');
const js = readFileSync(join(ASSETS, jsName), 'utf8');

// 內嵌 script 內若出現 </script 會提前結束標籤，必須跳脫
const safeJs = js.replaceAll('</script', '<\\/script');

const body = `<div id="app"></div>
<script type="module">
${safeJs}
</script>
`;

// --- Claude Artifact 版：不含外層骨架 ---
const artifact = `<title>2A2B 猜數字</title>
<style>
${css}
</style>
${body}`;

writeFileSync(join(DIST, 'artifact.html'), artifact, 'utf8');

// --- 獨立網頁版：完整骨架，雙擊就能開 ---
const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
  "%3Crect width='100' height='100' rx='22' fill='%232563eb'/%3E" +
  "%3Ctext x='50' y='70' font-size='54' font-family='monospace' font-weight='bold' " +
  "text-anchor='middle' fill='white'%3E2A%3C/text%3E%3C/svg%3E";

const standalone = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="4 位不重複數字的 2A2B 猜數字遊戲，含筆記板與本機統計。" />
    <link rel="icon" href="${favicon}" />
    <title>2A2B 猜數字</title>
    <style>
${css}
    </style>
  </head>
  <body>
${body}  </body>
</html>
`;

mkdirSync(DOCS, { recursive: true });
writeFileSync(join(DOCS, 'index.html'), standalone, 'utf8');

const kb = (s) => `${(s.length / 1024).toFixed(1)} kB`;
console.log(`已輸出 ${join(DIST, 'artifact.html')}（${kb(artifact)}）`);
console.log(`已輸出 ${join(DOCS, 'index.html')}（${kb(standalone)}）`);
