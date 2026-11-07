// ことわざあわせの決まり（だれでも同じ今日の5問・上級・答え合わせ・ヒント・とことんの並び）。画面と検査（qa/run.mjs）の両方から使う。
(function () {
  const D = typeof module !== "undefined" ? require("./data.js") : window.KTW;
  const { LIST, CATS } = D;
  const BY = new Map(LIST.map((x) => [x.id, x]));
  // 今日の5問・上級に使うのは、この番号までのことわざだけ（あとから足しても過去の日の問題が変わらない）。足した分は練習・とことんに出る
  const DAILY_MAX_ID = 520;
  const EPOCH = "2026-11-07";
  const full = (x) => x.form.replace(/[{}]/g, "");
  const PROVERBS = [...new Set(LIST.map(full))];

  // ---- 種と乱数（日本時間の日付から作る。ブラウザの乱数は使わない）----
  function seedOf(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // 並べかえ（フィッシャー–イェーツ。sort の比較の中で乱数を引かない）
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const dayNo = (k) => Math.round((Date.parse(k) - Date.parse(EPOCH)) / 864e5) + 1;

  // むずかしさごとの山を、周ごとにちがう順に並べ、日の番号の所から取る。同じ日に同じことわざ（欠ける所ちがい）は出さない
  const pools = {};
  // 今日の問題の山：1つのことわざから1問だけ（はじめに書いた欠け方）。むずかしさの山どうしでことわざが重ならないので、同じ日に同じことわざは出ない
  const firstOf = new Map();
  LIST.forEach((x) => { if (x.id <= DAILY_MAX_ID && !firstOf.has(full(x))) firstOf.set(full(x), x.id); });
  const poolOf = (lv) => pools[lv] || (pools[lv] = [...firstOf.values()].filter((id) => BY.get(id).lv === lv));
  const perms = new Map();
  // 周のつなぎ目で同じ問題がすぐ戻らないよう、前の周の最後の3分の1にあった問題は、次の周のはじめの3分の1に置かない
  function permOf(tag, lv, cyc) {
    const id = tag + lv + ":" + cyc;
    if (perms.has(id)) return perms.get(id);
    for (let c = 0; c <= cyc; c++) {
      const k2 = tag + lv + ":" + c;
      if (perms.has(k2)) continue;
      let p = shuffle(poolOf(lv), rng(seedOf("kotowaza:" + k2)));
      if (c > 0) { const prev = perms.get(tag + lv + ":" + (c - 1)), Q = Math.floor(p.length / 3), tail = new Set(prev.slice(prev.length - Q)); p = p.filter((x) => !tail.has(x)).slice(0, Q).concat(p.filter((x) => tail.has(x)), p.filter((x) => !tail.has(x)).slice(Q)); }
      perms.set(k2, p);
    }
    return perms.get(id);
  }
  // 日の番号から決まった位置を取る（周ごとに並べ直した山の、start から k 個）
  function take(tag, lv, start, k) { const N = poolOf(lv).length, out = []; for (let p = start; p < start + k; p++) out.push(permOf(tag, lv, Math.floor(p / N))[((p % N) + N) % N]); return out; }
  const dmemo = new Map();
  // 今日の5問：やさしい2・ふつう2・むずかしい1。上級：むずかしい3。むずかしいは1日4つずつ同じ山から取り、1つ目を今日の5問、残りを上級に使う（重ならない）
  function dailyList(k) {
    if (dmemo.has(k)) return dmemo.get(k);
    const n = dayNo(k) - 1, out = [...take("d", 1, n * 2, 2), ...take("d", 2, n * 2, 2), ...take("d", 3, n * 4, 1)];
    dmemo.set(k, out);
    return out;
  }
  function hardList(k) { return take("d", 3, (dayNo(k) - 1) * 4 + 1, 3); }

  // ---- 答え合わせ（入力。かなでも漢字でも正解。カタカナ・全角半角・空白のゆれを許す）----
  const kana = (t) => String(t).normalize("NFKC").replace(/[\s　・]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  function check(x, input) { const a = kana(input); return !!a && (a === kana(x.ans) || a === kana(x.word)); }
  // ヒント1：かなの字数と最初の字
  const hint1 = (x) => `${x.ans[0]}${"○".repeat(x.ans.length - 1)}（ひらがなで${x.ans.length}字）`;
  // ヒント2（最後の段）：4つから選ぶ。ほかの答えの言葉から、入れても別のことわざにならないものを、問題ごとに決まった順で3つ
  function choices(x) {
    const r = rng(seedOf("ch:" + x.id)), f = full(x), set = new Set(PROVERBS);
    const near = (y) => Math.abs(y.ans.length - x.ans.length) <= 1;
    const cand = shuffle(LIST.filter((y) => y.id !== x.id && y.word !== x.word && y.ans !== x.ans && y.cat === x.cat && near(y)), r)
      .concat(shuffle(LIST.filter((y) => y.id !== x.id && y.word !== x.word && y.ans !== x.ans && near(y)), r));
    const out = [], seen = new Set([x.word]);
    for (const y of cand.concat(shuffle(LIST.filter((y) => y.id !== x.id && y.word !== x.word && y.ans !== x.ans), r))) {
      if (out.length >= 3) break;
      if (seen.has(y.word) || set.has(f.replace(x.word, y.word))) continue;
      seen.add(y.word); out.push(y.word);
    }
    return shuffle([x.word, ...out], r);
  }
  // 同じ意味のことわざ（答えのあとに「にた意味」として出す）
  function similar(x) { const f = full(x); return [...new Set(LIST.filter((y) => y.mean === x.mean && full(y) !== f).map(full))]; }
  // ★：まちがい＋ヒントの数（0で★3・1で★2・2以上で★1）
  const starsOf = (r) => { const n = (r.m || 0) + (r.h || 0); return n <= 0 ? 3 : n === 1 ? 2 : 1; };

  // ---- とことん：やさしい5→ふつう10→そのあとは全部を混ぜる。1つの並びの中で同じ問題は出さない。続けて同じことわざは出さない ----
  function endlessList(r, avoid) {
    const by = (lv) => shuffle(LIST.filter((x) => x.lv === lv).map((x) => x.id), r);
    const a = by(1), b = by(2), c = by(3);
    const head = a.slice(0, 5).concat(b.slice(0, 10));
    const rest = shuffle(a.slice(5).concat(b.slice(10), c), r);
    return spread(head.concat(rest), avoid);
  }
  // 続けて同じことわざ（欠ける所ちがい）にならないよう、後ろの問題と入れかえる。avoid は直前に出した問題の番号
  function spread(ids, avoid) {
    ids = ids.slice();
    const fx = (id) => full(BY.get(id));
    for (let i = 0; i < ids.length; i++) {
      const prev = i ? fx(ids[i - 1]) : avoid != null && BY.has(avoid) ? fx(avoid) : null;
      if (prev !== null && fx(ids[i]) === prev) { const j = ids.findIndex((id, q) => q > i && fx(id) !== prev && (i >= 15 || BY.get(id).lv === BY.get(ids[i]).lv)); if (j > i) [ids[i], ids[j]] = [ids[j], ids[i]]; }
    }
    return ids;
  }
  // 練習：なかま（または全部）から、まだ出していない問題を先に、新しい並びで
  function practiceList(r, cat, seen, n) {
    const all = LIST.filter((x) => !cat || x.cat === cat).map((x) => x.id);
    const fresh = shuffle(all.filter((id) => !seen[id]), r), old = shuffle(all.filter((id) => seen[id]), r);
    return spread(fresh.concat(old)).slice(0, n);
  }

  const api = { LIST, CATS, BY, EPOCH, DAILY_MAX_ID, PROVERBS, full, seedOf, rng, shuffle, dayNo, dailyList, hardList, kana, check, hint1, choices, similar, starsOf, endlessList, spread, practiceList };
  if (typeof module !== "undefined") module.exports = api; else window.KTG = api;
})();
