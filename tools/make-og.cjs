// SNS に貼ったときの絵 og.png（1200×630）を作る。今日の問題（答え）は入れない。見本の「猫に□□」だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;width:1200px;height:630px;background:#f4ecdc;font-family:'Noto Serif CJK JP','Noto Sans CJK JP',serif;color:#2b2420;display:flex;align-items:center;justify-content:center;gap:70px">
    <div style="position:relative;background:#fffaf0;border:3px solid #2b2420;border-radius:10px;padding:60px 70px;box-shadow:0 16px 40px #5e524840">
      <div style="position:absolute;left:50%;top:-22px;width:22px;height:40px;margin-left:-11px;border-radius:11px;background:#a8321a"></div>
      <div style="font-size:92px;font-weight:800;letter-spacing:8px">猫に<span style="display:inline-block;border:6px dashed #a8321a;border-radius:12px;color:#a8321a;padding:0 24px;margin-left:10px">？</span></div>
      <div style="margin-top:26px;font-size:30px;color:#5e5248;border-left:8px solid #1f4a72;padding-left:16px">意味：値打ちが分からない人に、<br>よい物をあげても役に立たない</div></div>
    <div style="display:flex;flex-direction:column;gap:18px"><div style="font-size:84px;font-weight:800;letter-spacing:10px">ことわざ<br>あわせ</div><div style="font-size:30px;color:#5e5248">意味から、欠けた言葉を当てよう<br>だれでも同じ1日5問</div></div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
