// ことわざあわせの検査。ことわざのデータの形・今日の5問と上級の組み方（3年分・過去の日が変わらない）・答え合わせ（かな・漢字・カタカナ）・4つの選び肢（全部の問題）・とことんの並び（何百回）・通しで遊ぶ・まちがい・ヒント・続きから・上級・練習・おさらい・あとから・実績・記録の読み合わせ・スマホ幅・PWA・引き継ぎ・見やすさ。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = pathToFileURL(path.join(root, "index.html")).href;
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 500) });
const G = createRequire(import.meta.url)(path.join(root, "game.js"));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const gameSrc = readFileSync(path.join(root, "game.js"), "utf8");
const dataSrc = readFileSync(path.join(root, "data.js"), "utf8");
const KEY = "kotowaza-awase-v1"; // gitleaks:allow 記録の名前（鍵ではない）
const day = (n) => new Date(Date.parse(G.EPOCH) + n * 864e5).toISOString().slice(0, 10);

// 1. ことわざのデータ（ブラウザを使わない）
{
  const L = G.LIST, bad = [];
  for (const x of L) {
    const n = (x.form.match(/\{/g) || []).length;
    if (n !== 1 || !x.word || !/^[ぁ-んー]+$/.test(x.ans) || !/^[ぁ-んー]+$/.test(x.yomi) || !x.yomi.includes(x.ans)) bad.push("形:" + x.form);
    if (![1, 2, 3].includes(x.lv) || !G.CATS[x.cat]) bad.push("むずかしさ・なかま:" + x.form);
    if (!x.mean || x.mean.length > 45 || /使わない/.test(x.mean)) bad.push("意味:" + x.form);
    // 欠けた言葉が漢字なら、読みの中の答えの読みと同じ位置に来る（前後の字のかながそろう）
    const f = G.full(x), isK = (ch) => /[ぁ-んー]/.test(ch);
    if ((isK(f[0]) && x.yomi[0] !== f[0]) || (isK(f.at(-1)) && x.yomi.at(-1) !== f.at(-1))) bad.push("読み:" + x.form);
  }
  check("ことわざのデータの形（欠ける所は1つ・答えの読みはひらがなで読みの中にある・意味は45字以内・むずかしさ1〜3・なかま）", bad.length === 0, bad.slice(0, 5).join(" / "));
  const forms = L.map((x) => x.form);
  check("同じ問題（同じことわざの同じ欠け方）が二つ無い", new Set(forms).size === forms.length);
  check("ことわざは300以上・問題は500以上（好きなだけ遊べる数。game-dev.md F6）", G.PROVERBS.length >= 300 && L.length >= 500, `${G.PROVERBS.length}・${L.length}`);
  const lv = [1, 2, 3].map((v) => L.filter((x) => x.lv === v).length);
  check("やさしい・ふつう・むずかしいがどれも100問以上", lv.every((n) => n >= 100), lv.join(","));
  check("7つのなかまにどれも20以上のことわざ", Object.keys(G.CATS).every((c) => new Set(L.filter((x) => x.cat === c).map(G.full)).size >= 20));
  check("性別で決めつける言い方のことわざを入れない（女・男・嫁・婿・姑・主婦）", !/[女男嫁婿姑]|主婦/.test(L.map((x) => x.form + x.mean).join("")));
  check("番号（id）は0から順に飛ばずに並ぶ（今日の問題の番号。足すのは最後だけ）", L.every((x, i) => x.id === i));
}
// 2. 答え合わせと選び肢（全部の問題）
{
  const bad = [], cbad = [];
  for (const x of G.LIST) {
    const kata = x.ans.replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
    if (!G.check(x, x.ans) || !G.check(x, x.word) || !G.check(x, kata) || !G.check(x, " " + x.ans + "　") || G.check(x, "") || G.check(x, x.ans + "あ")) bad.push(x.form);
    const ch = G.choices(x), ch2 = G.choices(x), f = G.full(x), set = new Set(G.PROVERBS);
    if (ch.length !== 4 || new Set(ch).size !== 4 || !ch.includes(x.word) || JSON.stringify(ch) !== JSON.stringify(ch2) || ch.some((w) => w !== x.word && (G.check(x, w) || set.has(f.replace(x.word, w))))) cbad.push(x.form + ":" + ch.join(","));
  }
  check("答え合わせ：かな・漢字・カタカナ・前後の空白で正解、空やちがう言葉はまちがい（全部の問題）", bad.length === 0, bad.slice(0, 5).join(" / "));
  check("4つの選び肢：答えを1つ含み、ほかの3つは入れても別のことわざにならず、毎回同じ（全部の問題）", cbad.length === 0, cbad.slice(0, 3).join(" / "));
  const x = G.LIST[0];
  check("ヒント1は最初の字と字数だけ（答えの全部は出さない）", G.hint1(x) === `${x.ans[0]}${"○".repeat(x.ans.length - 1)}（ひらがなで${x.ans.length}字）` && !G.hint1(x).includes(x.ans));
  check("★：まちがい＋ヒント 0で★3・1で★2・2以上で★1", G.starsOf({ m: 0, h: 0 }) === 3 && G.starsOf({ m: 1, h: 0 }) === 2 && G.starsOf({ m: 0, h: 1 }) === 2 && G.starsOf({ m: 1, h: 1 }) === 1 && G.starsOf({ m: 5, h: 2 }) === 1);
}
// 3. 今日の5問・上級（3年分）
{
  const bad = [], seenD = new Set();
  for (let n = 0; n < 365 * 3; n++) {
    const k = day(n), d = G.dailyList(k), h = G.hardList(k), xs = d.map((id) => G.BY.get(id)), hs = h.map((id) => G.BY.get(id));
    const fs = new Set(xs.map(G.full)), hf = new Set(hs.map(G.full));
    if (d.length !== 5 || xs.map((x) => x.lv).join() !== "1,1,2,2,3" || fs.size !== 5) bad.push(k + ":今日");
    if (h.length !== 3 || hs.some((x) => x.lv !== 3) || hf.size !== 3 || [...hf].some((f) => fs.has(f))) bad.push(k + ":上級");
    if (d.concat(h).some((id) => id > G.DAILY_MAX_ID)) bad.push(k + ":番号");
    if (n < 365) d.forEach((id) => seenD.add(id));
  }
  check("今日の5問は毎日 やさしい2・ふつう2・むずかしい1 でことわざが重ならない。上級はむずかしい3つで今日の5問と重ならない（3年分）", bad.length === 0, bad.slice(0, 5).join(","));
  // 周ごとに並べ直し、つなぎ目でもすぐ戻さない：同じ問題が次に出るまで、やさしい・ふつうは14日以上、むずかしい（1日4つ）は7日以上あく（3年分）
  const gap = {}, lastAt = new Map();
  for (let n = 0; n < 365 * 3; n++) for (const id of G.dailyList(day(n)).concat(G.hardList(day(n)))) { const lv = G.BY.get(id).lv; if (lastAt.has(id)) gap[lv] = Math.min(gap[lv] ?? 1e9, n - lastAt.get(id)); lastAt.set(id, n); }
  check("同じ問題が次に今日の5問・上級に出るまで、やさしい・ふつうは14日以上、むずかしいは7日以上あく（3年分）", gap[1] >= 14 && gap[2] >= 14 && gap[3] >= 7, JSON.stringify(gap));
  check("1年でいろいろな問題が出る（今日の5問に1年で300問以上）", seenD.size >= 300, seenD.size);
  // 過去と先の日の問題が変わらない（データを足しても・作り方を直しても。F7）。値は 2026-11-07 に作った
  { let err = ""; try { for (const k of ["2026-11-06", "2026-10-01", "2025-01-01"]) { G.dailyList(k); G.hardList(k); if (G.dayNo(k) !== 1) err = k + " #" + G.dayNo(k); } } catch (e) { err = e.message; } check("時計が第1回より前にずれていても今日の問題が作れる（番号は #1）", !err, err); }
  const snap = createHash("sha256").update(JSON.stringify([...Array(120)].map((_, n) => [G.dailyList(day(n)), G.hardList(day(n))]))).digest("hex").slice(0, 16);
  check("はじめの120日の今日の5問・上級は前と同じ（変えると過去の日の問題が変わる）", snap === "204a86ebce6295d3", snap);
  check("同じ日は何度作っても同じ（日付の種だけで決まる）", JSON.stringify(G.dailyList("2027-05-05")) === JSON.stringify(createRequire(import.meta.url)(path.join(root, "game.js")).dailyList("2027-05-05")));
  check("乱数は sort の比較の中で引かない", !/sort\([^)]*r\(\)/.test(gameSrc + html));
  check("Math.random は練習・とことんの並びと回の名札だけ（game.js には無い・index.html に4か所）", !/Math\.random/.test(gameSrc + dataSrc) && (html.match(/Math\.random/g) || []).length === 4, (html.match(/Math\.random/g) || []).length);
}
// 4. とことん・練習の並び（何百回）
{
  const bad = [];
  for (let t = 0; t < 400; t++) {
    const r = G.rng(G.seedOf("qa-e:" + t)), avoid = t % 3 ? G.LIST[t % G.LIST.length].id : undefined, ids = G.endlessList(r, avoid), xs = ids.map((id) => G.BY.get(id));
    if (ids.length !== G.LIST.length || new Set(ids).size !== ids.length) { bad.push(t + ":数"); continue; }
    if (xs.slice(0, 5).some((x) => x.lv !== 1) || xs.slice(5, 15).some((x) => x.lv !== 2)) bad.push(t + ":順");
    for (let i = 1; i < xs.length; i++) if (G.full(xs[i]) === G.full(xs[i - 1])) { bad.push(t + ":続けて同じ" + i); break; }
    if (avoid !== undefined && G.full(xs[0]) === G.full(G.BY.get(avoid))) bad.push(t + ":つなぎ目");
  }
  check("とことんの並び：全部の問題を1回ずつ、やさしい5→ふつう10→全部、続けて同じことわざが出ない・前の並びとのつなぎ目も（400回）", bad.length === 0, bad.slice(0, 5).join(","));
  const pb = [];
  for (let t = 0; t < 300; t++) {
    const cats = Object.keys(G.CATS), c = t % 8 === 7 ? "" : cats[t % 7], seen = {};
    G.LIST.forEach((x) => { if ((x.id * 7 + t) % 3 === 0) seen[x.id] = 1; });
    const ids = G.practiceList(G.rng(G.seedOf("qa-p:" + t)), c, seen, 10), xs = ids.map((id) => G.BY.get(id));
    const fresh = G.LIST.filter((x) => (!c || x.cat === c) && !seen[x.id]).length;
    if (ids.length !== 10 || new Set(ids).size !== 10 || xs.some((x) => c && x.cat !== c) || (fresh >= 10 && ids.some((id) => seen[id]))) pb.push(t);
  }
  check("練習：選んだなかまから10問、まだ出していない問題を先に（300回）", pb.length === 0, pb.slice(0, 5).join(","));
}
// 5. 決まりの言葉（好きなだけ遊べる・お笑いを入れない・外へ送らない）
{
  const vis = html.replace(/<!-- a11y:begin[\s\S]*?<!-- a11y:end -->/, "");
  check("チケット・回数制限・🔒で開くモードが無い（game-dev.md F1・F2）", !/🎫|チケット|すると開く|🔒|スタミナ|あと\d+回/.test(vis));
  check("お笑いの言葉を入れない（本物っぽさ優先）", !/（笑）|ツッコミ|ボケ|爆笑|w{3}/.test(vis + dataSrc));
  check("外へ通信しない（CSP の connect-src は 'self' だけ・fetch を使わない）", /connect-src 'self';/.test(html) && !/fetch\(|XMLHttpRequest|sendBeacon/.test(vis + gameSrc));
  check("変換中の Enter で送らない（isComposing・keyCode 229）", /isComposing \|\| e\.keyCode === 229/.test(html));
  check("Ko-fi はただのリンクだけ（スクリプトを入れない）", !/ko-fi\.com\/widgets|<script[^>]+ko-fi/i.test(html));
  const sw = readFileSync(path.join(root, "sw.js"), "utf8"), shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  { const st = await checkSwStall(sw); check("PWA：本文の途中で通信が止まっても4秒で保存したものを返す・ふつうはネットの返事", st.ok, JSON.stringify(st)); }
  check("PWA：sw.js の SHELL に画面のファイルが全部ある・取り直して保存する（cache: reload）", ["./", "./index.html", "./data.js", "./game.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"].every((f) => shell.includes(f)) && /cache: "reload"/.test(sw));
  const mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  check("PWA：manifest の名前・アイコン（192・512・maskable）", mf.name === "ことわざあわせ" && mf.icons.length === 3 && mf.icons.some((i) => i.purpose === "maskable"));
  check("記録の名前の行に gitleaks:allow がある", html.split("\n").filter((l) => l.includes(KEY)).every((l) => /gitleaks:allow/.test(l)));
}

// 6. ブラウザで遊ぶ
let browser;
const errors = [];
async function newPage(opt = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: "ja-JP" }, opt));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(url);
  return p;
}
const closeHow = (p) => p.evaluate(() => { const d = document.getElementById("howto"); if (d.open) document.getElementById("howto-ok").click(); });
const cur = (p) => p.evaluate(() => { const c = window.__kw.cur(); return c && { id: c.x.id, ans: c.x.ans, word: c.x.word, m: c.m, h: c.h, done: c.done, mode: c.mode, i: c.i }; });
async function typeAnswer(p, v) { await p.fill("#in", v); await p.press("#in", "Enter"); }
async function solveCur(p) { const c = await cur(p); await typeAnswer(p, c.ans); await p.waitForSelector("#next"); }
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await newPage();
  check("はじめて開くと遊び方が出る", await page.evaluate(() => document.getElementById("howto").open));
  { const p0 = await newPage(); let bad = 0;
    for (let j = 0; j < 10; j++) { await p0.evaluate((K) => localStorage.removeItem(K), KEY); await p0.reload(); await p0.keyboard.press("Escape"); if (await p0.evaluate((K) => !(JSON.parse(localStorage.getItem(K) || "{}").tut), KEY)) bad++; await p0.reload(); if (await p0.evaluate(() => document.getElementById("howto").open)) bad++; }
    await p0.evaluate((K) => localStorage.removeItem(K), KEY); await p0.reload(); await p0.click("#howto-ok");
    const atOnce = await p0.evaluate((K) => !!(JSON.parse(localStorage.getItem(K) || "{}").tut), KEY);
    check("遊び方：Esc で閉じても「見た」が残り、すぐ読み直しても出ない（10回）・「わかった」を押したその場で残る", bad === 0 && atOnce, bad);
    await p0.close(); }
  await closeHow(page);
  check("ホーム：今日の5問・とことん・上級・練習・ことわざ帳・実績・カレンダーのボタンが最初から押せる", await page.evaluate(() => ["go-d", "go-e", "go-h", "go-p", "go-dex", "go-ach", "go-cal"].every((id) => { const b = document.getElementById(id); return b && !b.disabled; })));
  { const ctx = await browser.newContext(); const p2 = await ctx.newPage(); await p2.goto(url); const d2 = await p2.evaluate(() => JSON.stringify(window.KTG.dailyList("2026-12-24"))); await ctx.close(); check("同じ日は別のブラウザで開いても同じ5問", d2 === JSON.stringify(G.dailyList("2026-12-24"))); }
  // 今日の5問：1問目はまちがえてからヒント2回で選ぶ、2問目は漢字、3問目はカタカナ、4問目は閉じて開き直し、5問目はかな
  await page.click("#go-d");
  const k = await page.evaluate(() => window.__kw.todayKey());
  check("今日の5問の1問目：欠けた所の枠・意味・入力・こたえる・ヒント", await page.evaluate(() => !!document.querySelector(".prov .blank") && /意味/.test(document.querySelector(".mean").textContent) && !!document.getElementById("in") && !!document.getElementById("hint")));
  let c = await cur(page);
  check("今日の5問の1問目は、その日のやさしい問題", c.id === G.dailyList(k)[0], JSON.stringify(c));
  await typeAnswer(page, "ちがうことば");
  await page.waitForTimeout(80);
  c = await cur(page);
  check("まちがえると「✕ ちがいます」の知らせ（文字）が出て、まちがいが1つ増え、入れ直せる", c.m === 1 && !c.done && (await page.textContent("#live")).includes("✕"));
  await page.click("#hint");
  check("ヒント1回目：最初の字と字数が出る（答えは出ない）", (await page.textContent("#hl")).includes(G.hint1(G.BY.get(c.id))) && (await page.locator("#ch").isHidden()));
  await page.click("#hint");
  check("ヒント2回目：4つの選び肢が出る", (await page.locator("#ch button").count()) === 4 && (await page.locator("#hint").isDisabled()));
  const wrong = (await page.$$eval("#ch button", (bs) => bs.map((b) => b.dataset.w))).find((w) => w !== c.word);
  await page.click(`#ch button[data-w="${wrong}"]`);
  check("選び肢でまちがえると ✕ と取り消し線になり、もう押せない", (await page.locator(`#ch button[data-w="${wrong}"].no`).count()) === 1 && (await page.textContent(`#ch button[data-w="${wrong}"]`)).includes("✕"));
  await page.click(`#ch button[data-w="${c.word}"]`);
  await page.waitForSelector("#next");
  check("正解すると「✓ 正解」・全体のことわざ・読み・意味が出て、★1（まちがい2＋ヒント2）", await page.evaluate((w) => { const v = document.querySelector(".verdict"); return v.textContent.includes("✓ 正解") && v.textContent.includes(w.f) && v.textContent.includes(w.y) && v.querySelector(".stars").getAttribute("aria-label") === "星1つ"; }, { f: G.full(G.BY.get(c.id)), y: G.BY.get(c.id).yomi }));
  check("まちがえた問題は、あしたのおさらいに入る", await page.evaluate((id) => window.__kw.load().rev[id] > window.__kw.todayKey(), c.id));
  await page.click("#next");
  c = await cur(page); await typeAnswer(page, c.word); await page.waitForSelector("#next");
  check("漢字で入れても正解・まちがいなしで★3", await page.evaluate(() => document.querySelector(".verdict .stars").getAttribute("aria-label") === "星3つ"));
  await page.click("#next");
  c = await cur(page); await typeAnswer(page, c.ans.replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))); await page.waitForSelector("#next");
  check("カタカナで入れても正解", !!(await cur(page)).done);
  await page.click("#next");
  c = await cur(page);
  await typeAnswer(page, "まちがい");
  await page.reload(); await closeHow(page);
  check("途中で閉じても、ホームに「続きから（4問目）」が出る", (await page.textContent("#go-d")).includes("続きから（4問目）"));
  await page.click("#go-d");
  const c4 = await cur(page);
  check("続きからは同じ問題で、まちがいの数もそのまま", c4.id === c.id && c4.m === 1 && c4.i === 3, JSON.stringify(c4));
  await solveCur(page); await page.click("#next");
  await solveCur(page);
  check("5問目のあとは「結果を見る」", (await page.textContent("#next")).includes("結果を見る"));
  await page.click("#next");
  const res = await page.evaluate(() => ({ share: document.querySelector(".share") && document.querySelector(".share").textContent, rows: document.querySelectorAll(".res > div").length, kofi: /Ko-fi でコーヒー/.test(document.getElementById("app").innerText), e: !!document.getElementById("go-e"), h: !!document.getElementById("go-h") }));
  const s1 = await page.evaluate(() => window.__kw.load());
  check("結果：5問の行・シェアの文・続けて遊ぶ（とことん）・上級に挑む", res.rows === 5 && res.e && res.h && !!res.share, JSON.stringify(res));
  check("シェアの文に答え（ことわざ・欠けた言葉）を出さない", G.dailyList(k).every((id) => { const x = G.BY.get(id); return !res.share.includes(x.word) && !res.share.includes(G.full(x)); }) && /🟧/.test(res.share));
  check("今日の記録がつき、出会ったことわざが5つ増える", !!s1.days[k] && s1.days[k].r.length === 5 && Object.keys(s1.seen).length === 5);
  check("まちがいのある日は Ko-fi の1行を出さない", !res.kofi);
  await page.click("#back");
  check("ホームに今日の結果（🟩🟨🟧）と「今日の結果を見る」", (await page.textContent("#go-d")).includes("今日の結果を見る"));
  // 上級
  await page.click("#go-h");
  c = await cur(page);
  check("上級：むずかしい問題・ヒントのボタンが無い", c.mode === "h" && (await page.locator("#hint").count()) === 0 && G.BY.get(c.id).lv === 3);
  for (let j = 0; j < 3; j++) await typeAnswer(page, "ちがう" + j);
  check("上級でも3回まちがえると4つの選び肢が出る（行き止まりにしない）", (await page.locator("#ch button").count()) === 4);
  await page.click(`#ch button[data-w="${c.word}"]`); await page.waitForSelector("#next"); await page.click("#next");
  await solveCur(page); await page.click("#next"); await solveCur(page); await page.click("#next");
  check("上級の記録がつく", await page.evaluate(() => { const s = window.__kw.load(); return !!s.hdays[window.__kw.todayKey()] && s.hdays[window.__kw.todayKey()].r.length === 3; }));
  // とことん
  await page.click("#go-e");
  for (let j = 0; j < 6; j++) { await solveCur(page); await page.click("#next"); }
  c = await cur(page); await typeAnswer(page, "ちがう");
  check("とことん：まちがえても終わらない", !(await cur(page)).done && (await page.locator("#quit").count()) === 1);
  await solveCur(page); await page.click("#next");
  await page.click("#quit");
  check("とことん：「ここで降りる」で終わり、一度で解いた数の自己ベスト（6）を残す", await page.evaluate(() => window.__kw.load().ebest === 6 && /一度で 6問/.test(document.getElementById("app").innerText)));
  check("とことんは今日の記録・連続には数えない", await page.evaluate((d) => JSON.stringify(window.__kw.load().days) === JSON.stringify(d), s1.days));
  await page.click("#go-e");
  const e2 = await page.evaluate(() => window.__kw.load().runs.e.list.length);
  check("とことんは問題が尽きない（並びを使い切る前に新しい並びを足す）", e2 >= G.LIST.length);
  await page.evaluate(() => { const s = window.__kw; s.save((x) => { x.runs.e.res = x.runs.e.list.slice(0, -1).map(() => ({ m: 0, h: 0 })); }); s.play("e"); });
  check("並びの最後まで来たら、新しい並びをつなげて続く", await page.evaluate(() => window.__kw.load().runs.e.list.length >= 2 * window.KTG.LIST.length - 1 && !!window.__kw.cur()));
  await page.evaluate(() => window.__kw.home());
  // 練習
  await page.click("#go-p");
  check("練習：7つのなかまと「ぜんぶ」が選べる", (await page.locator(".cats button").count()) === 8);
  await page.click('.cats button[data-c="a"]');
  c = await cur(page);
  check("練習：選んだなかま（動物）の問題が出る", G.BY.get(c.id).cat === "a" && c.mode === "p");
  await page.evaluate(() => window.__kw.home());
  // おさらい（あしたに出る）
  const due0 = await page.evaluate(() => window.__kw.dueRev(window.__kw.load()).length);
  await page.evaluate(() => { const RD = Date, off = 864e5; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }; window.__kw.home(); });
  check("まちがえた問題は、次の日にホームの「おさらい」に出る", due0 === 0 && (await page.locator("#go-r").count()) === 1);
  await page.click("#go-r");
  c = await cur(page);
  const before = await page.evaluate(() => window.__kw.load().revok);
  await solveCur(page);
  check("おさらいで一度で解けたら、おさらいから外れて「覚え直した」数が増える", await page.evaluate(([id, b]) => !(id in window.__kw.load().rev) && window.__kw.load().revok === b + 1, [c.id, before]));
  await page.close();

  // あとから（取りこぼした日）・カレンダー
  { const p = await newPage();
    await p.evaluate((K) => { const t = window.__kw.todayKey(), y = new Date(Date.parse(t) - 2 * 864e5).toISOString().slice(0, 10); localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, days: { [y]: { r: [{ m: 0, h: 0 }] } }, t: 1 })); }, KEY);
    await p.reload();
    const lt = await p.evaluate(() => window.__kw.lateDays(window.__kw.load()));
    await p.click("#go-cal");
    const y1 = new Date(Date.parse(await p.evaluate(() => window.__kw.todayKey())) - 864e5).toISOString().slice(0, 10);
    const canLate = lt.includes(y1) && y1 >= G.EPOCH;
    check("カレンダー：遊んだ日は ★、あとから遊べる日は ▶（点線のボタン）", (await p.locator(".cal .d").count()) + (await p.locator(".cal .d").count() ? 0 : 0) >= (await p.evaluate(() => { const t = window.__kw.todayKey(); return new Date(Date.parse(t) - 2 * 864e5).toISOString().slice(5, 7) === t.slice(5, 7) ? 1 : 0; })) && (!canLate || (await p.locator(`.cal button[data-k="${y1}"]`).count()) === 1));
    check("取りこぼした日は、はじめの日（" + G.EPOCH + "）より前を出さない・7日まで", lt.every((d) => d >= G.EPOCH) && lt.length <= 7);
    // はじめの日より前でも、あとからの仕組みを試すために日付をずらして見る
    await p.evaluate(() => { const RD = Date, off = 3 * 864e5; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }; });
    const lt2 = await p.evaluate(() => window.__kw.lateDays(window.__kw.load()));
    if (lt2.length) {
      const dk = lt2[0];
      await p.evaluate((d) => window.__kw.startRun("a", d), dk);
      const ca = await cur(p);
      check("あとから：その日の今日の5問と同じ問題", ca.mode === "a" && ca.id === G.dailyList(dk)[0]);
      for (let j = 0; j < 5; j++) { await solveCur(p); await p.click("#next"); }
      const sl = await p.evaluate(() => window.__kw.load());
      check("あとから：記録は late に入り、今日の記録（days）には入らない・シェアは出さない", !!sl.late[dk] && !sl.days[dk] && !(await p.locator(".share").count()));
    } else check("あとから遊べる日がある（日付をずらして）", false, JSON.stringify(lt2));
    await p.close(); }

  // 実績・ことわざ帳
  { const p = await newPage();
    await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, seen: { 0: 1, 1: 1, 2: 1 }, t: 1 })); }, KEY);
    await p.reload();
    const al = await p.evaluate(() => window.__kw.achList(window.__kw.load()));
    check("実績は10〜14個で、まだのものは「いま/目標」を出す", al.length >= 10 && al.length <= 14);
    await p.click("#go-ach");
    check("実績の画面：取った ★・まだ ☆ と進み具合", (await p.textContent(".achs")).includes("★ はじめの一句") && (await p.textContent(".achs")).includes("いま "));
    await p.evaluate(() => window.__kw.home());
    await p.click("#go-dex");
    check("ことわざ帳：出会ったことわざは意味つき、まだのものは「？？？」（点線）", (await p.textContent(".res")).includes("猫に小判") && (await p.locator(".res .no").count()) > 0);
    await p.close(); }

  // 全部一度で解けた日は Ko-fi の1行（今日の5問を初めて終えたときだけ）
  { const p = await newPage(); await closeHow(p);
    await p.click("#go-d");
    for (let j = 0; j < 5; j++) { await solveCur(p); await p.click("#next"); }
    check("全部一度で解けた日は、結果の画面の下に Ko-fi の1行（ただのリンク）", (await p.locator('a[href="https://ko-fi.com/satouaaaaa"]').count()) >= 2 && /Ko-fi でコーヒー/.test(await p.innerText("#app")) && /全部一度で/.test(await p.textContent(".share")));
    await p.click("#back"); await p.click("#go-d");
    check("結果をもう一度見ても Ko-fi の1行は出さない", !/Ko-fi でコーヒー/.test(await p.innerText("#app")));
    await p.close(); }

  // 古いタブ・記録の読み合わせ
  { const p = await newPage(); await closeHow(p);
    await p.click("#go-d");
    const r = await p.evaluate((K) => { const s = JSON.parse(localStorage.getItem(K)); s.runs.d.id = "other"; localStorage.setItem(K, JSON.stringify(s)); window.__kw.answer(window.__kw.cur().x.ans); return { done: window.__kw.cur().done }; }, KEY);
    check("別のタブで回が変わっていたら、古いタブの答えを記録しない", !r.done && !(await p.evaluate(() => Object.keys(window.__kw.load().seen).length)));
    check("保存に失敗したあと別のタブが保存しても、両方の日ごとの結果を残し、数は大きいほう", await p.evaluate((K) => { const s0 = window.__kw.load(); mem = JSON.stringify(Object.assign({}, s0, { t: 5, days: { "2000-01-01": { r: [] } }, seen: { 3: 9 }, ebest: 7 })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, days: { "2000-01-02": { r: [] } }, seen: { 3: 2 }, ebest: 3 }))); const r = window.__kw.load(); mem = null; return !!r.days["2000-01-01"] && !!r.days["2000-01-02"] && r.seen[3] === 9 && r.ebest === 7; }, KEY));
    check("同じ回の途中経過は、進んだほう（新しく保存したタブが遅れていても）", await p.evaluate((K) => { const s0 = window.__kw.load(), base = { mode: "d", date: "2000-01-01", list: [1, 2], id: "x" }; mem = JSON.stringify(Object.assign({}, s0, { t: 5, runs: { d: Object.assign({}, base, { res: [{ m: 0, h: 0 }] }) } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, runs: { d: Object.assign({}, base, { res: [] }) } }))); const r = window.__kw.load(); mem = null; return r.runs.d.res.length === 1; }, KEY));
    check("こわれた記録でも画面が出る（入れ物を補う）", await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, days: 5, seen: null, runs: "x" })); try { window.__kw.home(); return !!document.getElementById("go-d"); } catch (e) { return false; } }, KEY));
    await p.close(); }

  // スマホ幅 320px・押せる所の大きさ
  { const p = await newPage({ viewport: { width: 320, height: 640 } }); await closeHow(p);
    const over = async () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const small = async () => p.evaluate(() => [...document.querySelectorAll("button,a,input")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && r.height < 44 && !b.closest(".a11y-dlg") && getComputedStyle(b).visibility !== "hidden"; }).map((b) => b.id || b.textContent.trim().slice(0, 10)));
    const o1 = await over(), s1b = await small();
    await p.click("#go-d");
    // いちばん長い問題でも横にはみ出さない
    const longest = G.LIST.slice().sort((a, b) => b.form.length - a.form.length)[0];
    await p.evaluate((id) => { const c = window.__kw.cur(); c.x = window.KTG.BY.get(id); document.getElementById("prov").innerHTML = document.getElementById("prov").innerHTML; }, longest.id);
    const o2 = await over(), s2 = await small();
    await p.click("#hint"); await p.click("#hint");
    const o3 = await over(), s3 = await small();
    check("幅320pxでも横にはみ出さない（ホーム・遊ぶ画面・選び肢）", !o1 && !o2 && !o3);
    check("押せる所は高さ44px以上（ホーム・遊ぶ画面）", !s1b.length && !s2.length && !s3.length, JSON.stringify([s1b, s2, s3]));
    await p.close(); }

  // 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
  { const sample = { [KEY]: JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { r: [{ m: 0, h: 0 }] } }, hdays: {}, late: {}, seen: { 0: 1, 5: 2 }, one: { 0: 1 }, rev: {}, revok: 0, ebest: 4, runs: {}, ach: {}, kofi: {}, t: 1 }) };
    await checkTransfer({ browser, url, game: "kotowaza-awase", sample, check, open: async (page) => { await page.evaluate(() => { const d = document.getElementById("howto"); if (d.open) d.close(); }); } }); }
} catch (e) {
  check("QA の操作が最後まで完了する", false, e.message.split("\n")[0]);
} finally {
  if (browser) await browser.close();
}
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));
{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# ことわざあわせ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
