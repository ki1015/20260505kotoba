const hiragana = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょー";
const katakana = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョー";
const markLabels = { n: "×", b: "△", h: "○" };
const markTitles = { n: "なし（答えに含まれない）", b: "位置違い（含まれるが位置が違う）", h: "ヒット（位置も正しい）" };
const sampleWords = [
  "ヒルゴハン", "アサゴハン", "ユウショク", "オベントウ", "カキゴオリ",
  "シオラーメ", "ミズタマリ", "ナツヤスミ", "フユヤスミ", "ハルヤスミ",
  "アオゾラ", "ヤマノボリ", "カゼグスリ", "オトシモノ", "カミヒコウ",
  "トモダチ", "マヨナカ", "ヒマワリ", "サクラモチ", "タカラモノ"
];

const INITIAL_RECOMMENDATIONS = [
  { word: "イクウカン", average: 538.3, worst: 1519, possible: false, entropy: 0, patterns: 0 },
  { word: "ショウイン", average: 553.3, worst: 1685, possible: true,  entropy: 0, patterns: 0 },
  { word: "インショウ", average: 555.0, worst: 1685, possible: true,  entropy: 0, patterns: 0 },
  { word: "インシュウ", average: 586.7, worst: 1714, possible: true,  entropy: 0, patterns: 0 },
  { word: "シュウイン", average: 593.6, worst: 1714, possible: false, entropy: 0, patterns: 0 },
  { word: "インリョウ", average: 600.7, worst: 1688, possible: true,  entropy: 0, patterns: 0 },
  { word: "シドウイン", average: 604.7, worst: 1657, possible: true,  entropy: 0, patterns: 0 },
  { word: "リョウイン", average: 608.7, worst: 1688, possible: true,  entropy: 0, patterns: 0 },
  { word: "シンリョウ", average: 623.4, worst: 1814, possible: true,  entropy: 0, patterns: 0 },
  { word: "リンショウ", average: 637.6, worst: 1814, possible: true,  entropy: 0, patterns: 0 },
  { word: "ショウリン", average: 641.6, worst: 1814, possible: true,  entropy: 0, patterns: 0 },
  { word: "リョウシン", average: 645.9, worst: 1814, possible: true,  entropy: 0, patterns: 0 },
  { word: "リュウイン", average: 648.2, worst: 1722, possible: true,  entropy: 0, patterns: 0 },
  { word: "カンショウ", average: 654.3, worst: 1922, possible: true,  entropy: 0, patterns: 0 },
  { word: "ショクイン", average: 656.4, worst: 1869, possible: true,  entropy: 0, patterns: 0 },
  { word: "シンリュウ", average: 656.6, worst: 1850, possible: false, entropy: 0, patterns: 0 },
  { word: "シトウカン", average: 657.6, worst: 1760, possible: true,  entropy: 0, patterns: 0 },
  { word: "ショウクン", average: 661.4, worst: 1931, possible: false, entropy: 0, patterns: 0 },
  { word: "インショク", average: 661.6, worst: 1869, possible: true,  entropy: 0, patterns: 0 },
  { word: "クンショウ", average: 661.8, worst: 1931, possible: true,  entropy: 0, patterns: 0 },
];

const AUTO_SOLVE_THRESHOLD = 400;
let solveDebounceTimer = null;

const state = {
  dictionary: [],
  candidates: [],
  recommendations: [],
  probeRecommendations: [],
  selectedWord: "",
  activeTab: "answer"
};

const rowsEl = document.getElementById("rows");
const rowTemplate = document.getElementById("rowTemplate");
const dictionaryInput = document.getElementById("dictionaryInput");
const candidateCount = document.getElementById("candidateCount");
const recommendationsEl = document.getElementById("recommendations");
const confirmedDeadLettersEl = document.getElementById("confirmedDeadLetters");
const manualDeadLettersInput = document.getElementById("manualDeadLetters");

async function copyText(text) {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function selectWord(word) {
  document.querySelectorAll(".rec.selected, .candidate.selected").forEach((el) => el.classList.remove("selected"));
  state.selectedWord = word;
}

function normalizeKana(value) {
  return Array.from(value.trim()).map((char) => {
    const hIndex = hiragana.indexOf(char);
    if (hIndex >= 0) return katakana[hIndex];
    if (katakana.includes(char)) return char;
    return "";
  }).join("");
}

function parseDictionary(text) {
  return Array.from(new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.split(",")[0])
      .map(normalizeKana)
      .filter((word) => Array.from(word).length === 5)
  ));
}

function judgeGuess(guess, answer) {
  const marks = ["n","n","n","n","n"];
  const rk = [], rv = [];

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = "h";
    } else {
      const idx = rk.indexOf(answer[i]);
      if (idx >= 0) rv[idx]++; else { rk.push(answer[i]); rv.push(1); }
    }
  }

  for (let i = 0; i < 5; i++) {
    if (marks[i] === "h") continue;
    const idx = rk.indexOf(guess[i]);
    if (idx >= 0 && rv[idx] > 0) { marks[i] = "b"; rv[idx]--; }
  }

  return marks.join("");
}

function collectHistory() {
  return Array.from(rowsEl.querySelectorAll(".guess-row"))
    .map((row) => ({
      word: normalizeKana(row.querySelector(".word-input").value),
      mark: Array.from(row.querySelectorAll(".char-tile")).map((tile) => tile.dataset.mark).join("")
    }))
    .filter((item) => item.word.length === 5);
}

function getConfirmedDeadLetters(history = collectHistory()) {
  const alive = new Set();
  const gray = new Set();

  for (const { word, mark } of history) {
    Array.from(word).forEach((char, index) => {
      if (mark[index] === "h" || mark[index] === "b") {
        alive.add(char);
      } else if (mark[index] === "n") {
        gray.add(char);
      }
    });
  }

  for (const char of alive) {
    gray.delete(char);
  }

  return gray;
}

function renderConfirmedDeadLetters(history = collectHistory()) {
  const letters = Array.from(getConfirmedDeadLetters(history)).sort((a, b) => a.localeCompare(b, "ja"));
  confirmedDeadLettersEl.textContent = letters.length ? letters.join(" ") : "なし";
}

function collectDeadLetters(history = collectHistory()) {
  const letters = getConfirmedDeadLetters(history);
  Array.from(normalizeKana(manualDeadLettersInput.value))
    .filter((char) => char.trim() !== "")
    .forEach((char) => letters.add(char));
  return letters;
}

function filterCandidates(dictionary, history) {
  const deadLetters = collectDeadLetters(history);
  return dictionary.filter((answer) =>
    Array.from(answer).every((char) => !deadLetters.has(char)) &&
    history.every(({ word, mark }) => judgeGuess(word, answer) === mark)
  );
}

function scoreGuess(guess, candidates) {
  if (candidates.length <= 1) {
    return { worst: candidates.length, average: candidates.length, patterns: candidates.length, entropy: 0 };
  }

  const buckets = new Map();
  for (const answer of candidates) {
    const key = judgeGuess(guess, answer);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  let worst = 0;
  let weighted = 0;
  let entropy = 0;
  for (const count of buckets.values()) {
    worst = Math.max(worst, count);
    weighted += count * count;
    const probability = count / candidates.length;
    entropy -= probability * Math.log2(probability);
  }

  return {
    worst,
    average: weighted / candidates.length,
    patterns: buckets.size,
    entropy
  };
}

function heuristicScores(candidates) {
  const position = Array.from({ length: 5 }, () => new Map());
  const present = new Map();

  for (const word of candidates) {
    const chars = Array.from(word);
    const unique = new Set(chars);
    chars.forEach((char, index) => {
      position[index].set(char, (position[index].get(char) || 0) + 1);
    });
    unique.forEach((char) => {
      present.set(char, (present.get(char) || 0) + 1);
    });
  }

  return (word) => {
    const chars = Array.from(word);
    const unique = new Set(chars);
    let score = 0;
    chars.forEach((char, index) => {
      score += position[index].get(char) || 0;
    });
    unique.forEach((char) => {
      score += (present.get(char) || 0) * 0.65;
    });
    return score;
  };
}

function recommendProbeWords(dictionary, candidates) {
  const history = collectHistory();
  const triedChars = new Set();
  for (const { word } of history) for (let i = 0; i < word.length; i++) triedChars.add(word[i]);

  const deadLetters = collectDeadLetters();
  const candidateSet = new Set(candidates);

  const pool = [];
  outer: for (const w of dictionary) {
    if (candidateSet.has(w)) continue;
    for (let i = 0; i < w.length; i++) if (deadLetters.has(w[i])) continue outer;
    pool.push(w);
  }

  // Heuristic: count unique untried letters
  const heuristicTop = 500;
  const withScore = pool.map((w) => {
    let score = 0;
    const seen = new Set();
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      if (!seen.has(c) && !triedChars.has(c)) { score++; seen.add(c); }
    }
    return { word: w, score };
  });
  withScore.sort((a, b) => b.score - a.score);
  const narrowed = withScore.slice(0, heuristicTop).map((x) => x.word);

  // Exact entropy on narrowed set (dynamic limit same as recommendGuesses)
  const exactLimit = Math.min(narrowed.length, Math.max(20, Math.floor(500_000 / Math.max(candidates.length, 1))));

  return narrowed
    .slice(0, exactLimit)
    .map((word) => ({ word, ...scoreGuess(word, candidates), possible: false }))
    .sort((a, b) => b.entropy - a.entropy || a.average - b.average || a.worst - b.worst)
    .slice(0, 20);
}

function recommendGuesses(dictionary, candidates) {
  // Keep total judgeGuess calls ≤ ~1.5M for consistent speed
  const limit = Math.min(900, Math.max(20, Math.floor(500_000 / Math.max(candidates.length, 1))));
  let pool;
  if (candidates.length > limit) {
    const heuristic = heuristicScores(candidates);
    pool = candidates
      .map((w) => ({ word: w, score: heuristic(w) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.word);
  } else {
    pool = candidates;
  }

  return pool
    .map((word) => ({ word, ...scoreGuess(word, candidates), possible: true, estimated: false }))
    .sort((a, b) =>
      a.average - b.average ||
      a.worst - b.worst ||
      b.entropy - a.entropy ||
      b.patterns - a.patterns ||
      a.word.localeCompare(b.word, "ja")
    )
    .slice(0, 20);
}

function renderRecommendations(items) {
  recommendationsEl.innerHTML = "";
  if (!items.length) {
    recommendationsEl.innerHTML = '<p class="empty">おすすめを出せません。辞書か判定を確認してください。</p>';
    return;
  }

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "rec";

    const wordEl = document.createElement("span");
    wordEl.className = "word";
    wordEl.textContent = item.word;

    const metaEl = document.createElement("span");
    metaEl.className = "meta";
    metaEl.innerHTML = `平均で約 ${item.average.toFixed(1)} 語まで減る<br>悪くても ${item.worst} 語`;

    const sendBtn = document.createElement("button");
    sendBtn.className = "send-inline-btn";
    sendBtn.textContent = "↑ 入力履歴に送る";
    sendBtn.hidden = true;
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const emptyRow = Array.from(rowsEl.querySelectorAll(".guess-row")).find(
        (row) => row.querySelector(".word-input").value.trim() === ""
      );
      if (emptyRow) {
        const input = emptyRow.querySelector(".word-input");
        input.value = item.word;
        input.dispatchEvent(new Event("input"));
        emptyRow.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        addRow(item.word);
        rowsEl.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      selectWord("");
      updateCandidatesOnly();
    });

    div.append(wordEl, sendBtn, metaEl);

    div.addEventListener("click", () => {
      const isSelected = div.classList.contains("selected");
      document.querySelectorAll(".rec.selected").forEach((el) => {
        el.classList.remove("selected");
        el.querySelector(".send-inline-btn").hidden = true;
        el.querySelector(".meta").hidden = false;
      });
      if (!isSelected) {
        div.classList.add("selected");
        sendBtn.hidden = false;
        metaEl.hidden = true;
        state.selectedWord = item.word;
      } else {
        state.selectedWord = "";
      }
    });

    recommendationsEl.appendChild(div);
  }
}

function renderActiveTab() {
  if (state.activeTab === "probe") {
    if (state.probeRecommendations.length > 0) {
      renderRecommendations(state.probeRecommendations);
    } else {
      renderRecommendationHint();
    }
  } else {
    renderRecommendations(state.recommendations);
  }
}

function renderRecommendationHint() {
  recommendationsEl.innerHTML = '<p class="empty">「再計算」を押すと計算します。</p>';
}

function updateCandidateCount(candidates) {
  candidateCount.textContent = candidates.length.toLocaleString();
  if (!candidates.length) {
    recommendationsEl.innerHTML = '<p class="empty">候補がありません。判定色か辞書を見直してください。</p>';
  }
}

function updateCandidatesOnly() {
  const history = collectHistory();
  const answerPool = document.getElementById("useAnswerOnly").checked && Array.isArray(window.DEFAULT_ANSWERS)
    ? window.DEFAULT_ANSWERS
    : state.dictionary;
  state.candidates = filterCandidates(answerPool, history);
  state.recommendations = [];
  renderConfirmedDeadLetters(history);
  updateCandidateCount(state.candidates);
  selectWord("");

  clearTimeout(solveDebounceTimer);
  if (state.candidates.length > 0 && state.candidates.length <= AUTO_SOLVE_THRESHOLD) {
    recommendationsEl.innerHTML = '<div class="computing">計算中<span class="computing-dots"><span></span><span></span><span></span></span></div>';
    solveDebounceTimer = setTimeout(() => {
      state.recommendations = recommendGuesses(state.dictionary, state.candidates);
      state.probeRecommendations = recommendProbeWords(state.dictionary, state.candidates);
      renderActiveTab();
    }, 600);
  } else {
    renderRecommendationHint();
  }
}

function solve() {
  clearTimeout(solveDebounceTimer);
  const solveBtn = document.getElementById("solve");
  const history = collectHistory();
  const answerPool = document.getElementById("useAnswerOnly").checked && Array.isArray(window.DEFAULT_ANSWERS)
    ? window.DEFAULT_ANSWERS
    : state.dictionary;
  state.candidates = filterCandidates(answerPool, history);
  renderConfirmedDeadLetters(history);
  updateCandidateCount(state.candidates);
  selectWord("");

  if (!state.candidates.length) {
    return;
  }

  solveBtn.disabled = true;
  solveBtn.textContent = "計算中...";
  recommendationsEl.innerHTML = '<div class="computing">計算中<span class="computing-dots"><span></span><span></span><span></span></span></div>';
  setTimeout(() => {
    state.recommendations = recommendGuesses(state.dictionary, state.candidates);
    state.probeRecommendations = recommendProbeWords(state.dictionary, state.candidates);
    renderActiveTab();
    solveBtn.disabled = false;
    solveBtn.textContent = "再計算";
  }, 0);
}

function addRow(word = "", mark = "nnnnn") {
  const node = rowTemplate.content.firstElementChild.cloneNode(true);
  const input = node.querySelector(".word-input");
  const tiles = Array.from(node.querySelectorAll(".char-tile"));

  function updateTiles(value) {
    const chars = Array.from(value);
    tiles.forEach((tile, i) => {
      tile.textContent = chars[i] || "";
    });
  }

  input.value = word;
  updateTiles(word);

  let composing = false;

  const finalizeValue = () => {
    if (composing) return;
    const normalized = normalizeKana(input.value).slice(0, 5);
    if (input.value !== normalized) input.value = normalized;
    updateTiles(input.value);
    updateCandidatesOnly();
  };

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => {
    composing = false;
    setTimeout(finalizeValue, 0);
  });
  input.addEventListener("input", () => {
    if (composing) return;
    updateTiles(normalizeKana(input.value).slice(0, 5));
    updateCandidatesOnly();
  });
  input.addEventListener("blur", finalizeValue);

  tiles.forEach((tile, index) => {
    tile.dataset.mark = mark[index] || "n";
    tile.title = markTitles[tile.dataset.mark];
    tile.addEventListener("click", () => {
      const next = tile.dataset.mark === "n" ? "b" : tile.dataset.mark === "b" ? "h" : "n";
      tile.dataset.mark = next;
      tile.title = markTitles[next];
      updateCandidatesOnly();
    });
  });

  node.querySelector(".remove-row").addEventListener("click", () => {
    node.remove();
    updateCandidatesOnly();
  });

  rowsEl.appendChild(node);
}

function applyDictionary() {
  state.dictionary = parseDictionary(dictionaryInput.value);
  updateCandidatesOnly();
}

document.getElementById("loadSample").addEventListener("click", () => {
  dictionaryInput.value = sampleWords.join("\n");
  applyDictionary();
});

document.getElementById("applyDictionary").addEventListener("click", applyDictionary);
document.getElementById("dictionaryFile").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  dictionaryInput.value = await file.text();
  applyDictionary();
});
{
  let composing = false;
  const finalize = () => {
    if (composing) return;
    const normalized = normalizeKana(manualDeadLettersInput.value);
    if (manualDeadLettersInput.value !== normalized) manualDeadLettersInput.value = normalized;
    updateCandidatesOnly();
  };
  manualDeadLettersInput.addEventListener("compositionstart", () => { composing = true; });
  manualDeadLettersInput.addEventListener("compositionend", () => {
    composing = false;
    setTimeout(finalize, 0);
  });
  manualDeadLettersInput.addEventListener("input", () => {
    if (composing) return;
    updateCandidatesOnly();
  });
  manualDeadLettersInput.addEventListener("blur", finalize);
}
document.getElementById("clearManualDeadLetters").addEventListener("click", () => {
  manualDeadLettersInput.value = "";
  updateCandidatesOnly();
});
document.getElementById("tabAnswer").addEventListener("click", () => {
  state.activeTab = "answer";
  document.getElementById("tabAnswer").classList.add("active");
  document.getElementById("tabProbe").classList.remove("active");
  renderActiveTab();
});
document.getElementById("tabProbe").addEventListener("click", () => {
  state.activeTab = "probe";
  document.getElementById("tabProbe").classList.add("active");
  document.getElementById("tabAnswer").classList.remove("active");
  renderActiveTab();
});
document.getElementById("solve").addEventListener("click", solve);
document.getElementById("allowAllGuesses").addEventListener("change", (e) => {
  if (e.target.checked) document.getElementById("useAnswerOnly").checked = false;
  updateCandidatesOnly();
});
document.getElementById("useAnswerOnly").addEventListener("change", (e) => {
  if (e.target.checked) document.getElementById("allowAllGuesses").checked = false;
  updateCandidatesOnly();
});
document.getElementById("addRow").addEventListener("click", () => addRow());
document.getElementById("clearRows").addEventListener("click", () => {
  rowsEl.innerHTML = "";
  addRow();
  updateCandidatesOnly();
});


dictionaryInput.value = Array.isArray(window.DEFAULT_WORDS) && window.DEFAULT_WORDS.length
  ? window.DEFAULT_WORDS.join("\n")
  : sampleWords.join("\n");
addRow();
applyDictionary();
state.recommendations = INITIAL_RECOMMENDATIONS;
renderRecommendations(INITIAL_RECOMMENDATIONS);
