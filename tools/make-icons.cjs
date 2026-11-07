// アプリのアイコン（icon-192.png・icon-512.png・icon-512-maskable.png）を作る。maskable は絵を中心から0.75倍にして、丸く切られても欠けないようにする（安全な範囲は中心の直径80%）。生成りの地に、朱のひもの短冊と「諺」の字。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [s, name, k] of [[192, "icon-192.png", 1], [512, "icon-512.png", 1], [512, "icon-512-maskable.png", 0.75]]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#f4ecdc"/><g transform="translate(50 50) scale(${k}) translate(-50 -50)">
      <rect x="30" y="12" width="40" height="78" rx="3" fill="#fffaf0" stroke="#2b2420" stroke-width="2"/>
      <rect x="46" y="4" width="8" height="14" rx="4" fill="#a8321a"/>
      <text x="50" y="47" font-size="26" font-weight="800" text-anchor="middle" fill="#2b2420" font-family="serif">諺</text>
      <rect x="38" y="57" width="24" height="24" rx="3" fill="none" stroke="#a8321a" stroke-width="2.5" stroke-dasharray="5 3"/>
      <text x="50" y="76" font-size="18" font-weight="800" text-anchor="middle" fill="#a8321a" font-family="sans-serif">？</text></g></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", name), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
