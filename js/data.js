/**
 * 3주차: API 연동 전 더미 데이터
 * 이후 DART / 금융위원회 API 응답으로 교체 예정
 */
const SAMPLE_STOCKS = [
  { code: "005930", name: "삼성전자", price: 71500, changeRate: 1.42 },
  { code: "000660", name: "SK하이닉스", price: 198500, changeRate: -0.85 },
  { code: "035420", name: "NAVER", price: 212000, changeRate: 0.24 },
  { code: "051910", name: "LG화학", price: 385000, changeRate: -1.15 },
  { code: "006400", name: "삼성SDI", price: 412000, changeRate: 2.1 },
  { code: "035720", name: "카카오", price: 48500, changeRate: -2.3 },
  { code: "005380", name: "현대차", price: 248500, changeRate: 0.61 },
  { code: "000270", name: "기아", price: 98500, changeRate: 1.03 },
  { code: "105560", name: "KB금융", price: 74200, changeRate: -0.4 },
  { code: "055550", name: "신한지주", price: 46800, changeRate: 0.0 },
  { code: "003550", name: "LG", price: 89200, changeRate: 0.78 },
  { code: "012330", name: "현대모비스", price: 256000, changeRate: -0.52 },
  { code: "034730", name: "SK", price: 178500, changeRate: 1.25 },
  { code: "028260", name: "삼성물산", price: 142000, changeRate: 0.35 },
  { code: "032830", name: "삼성생명", price: 89500, changeRate: -0.11 },
  { code: "003670", name: "포스코퓨처엠", price: 245000, changeRate: 3.2 },
  { code: "207940", name: "삼성바이오로직스", price: 785000, changeRate: -0.95 },
  { code: "068270", name: "셀트리온", price: 178500, changeRate: 0.56 },
  { code: "373220", name: "LG에너지솔루션", price: 385000, changeRate: -1.8 },
  { code: "086790", name: "하나금융지주", price: 52100, changeRate: 0.19 },
  { code: "005490", name: "POSCO홀딩스", price: 0, changeRate: 0 },
  { code: "009150", name: "삼성전기", price: 0, changeRate: 0 },
  { code: "017670", name: "SK텔레콤", price: 0, changeRate: 0 },
  { code: "033780", name: "KT&G", price: 0, changeRate: 0 },
  { code: "051900", name: "LG생활건강", price: 0, changeRate: 0 },
  { code: "096770", name: "SK이노베이션", price: 0, changeRate: 0 },
  { code: "010130", name: "고려아연", price: 0, changeRate: 0 },
  { code: "000810", name: "삼성화재", price: 0, changeRate: 0 },
  { code: "018260", name: "삼성에스디에스", price: 0, changeRate: 0 },
  { code: "316140", name: "우리금융지주", price: 0, changeRate: 0 },
];

/** 종목코드 → DART corp_code (샘플, 실제는 corp_code.xml 매핑) */
const CORP_CODE_MAP = {
  "005930": "00126380",
  "000660": "00164779",
  "035420": "00266961",
};

/** 공시 목록 더미 (Tab1) */
const SAMPLE_DISCLOSURES = {
  "005930": [
    { date: "2024-03-15", title: "사업보고서 (2023.12)", type: "정기공시", link: "#" },
    { date: "2024-02-28", title: "주요사항보고서(자기주식취득결정)", type: "주요사항", link: "#" },
    { date: "2024-01-26", title: "분기보고서 (2023.09)", type: "정기공시", link: "#" },
  ],
  default: [
    { date: "2024-03-01", title: "사업보고서 (2023.12)", type: "정기공시", link: "#" },
    { date: "2024-01-15", title: "주요사항보고서", type: "주요사항", link: "#" },
  ],
};

let ACTIVE_STOCKS = SAMPLE_STOCKS.slice();
let SNAPSHOT_DATE = "";

async function loadStockSnapshot() {
  try {
    const res = await fetch("data/stocks.json");
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json.stocks) && json.stocks.length > 0) {
      ACTIVE_STOCKS = json.stocks;
      SNAPSHOT_DATE = json.updatedAt || json.basDt || "";
    }
  } catch (_) {
    /* fallback to SAMPLE_STOCKS */
  }
}

function getActiveStocks() {
  return ACTIVE_STOCKS;
}

function findStockByCode(code) {
  return ACTIVE_STOCKS.find((s) => s.code === code);
}

function findStockByName(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return ACTIVE_STOCKS.find(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.code === q ||
      s.name === query.trim()
  );
}

function getDisclosuresForCode(code) {
  return SAMPLE_DISCLOSURES[code] || SAMPLE_DISCLOSURES.default;
}

function pickRandomStocks(count, excludeCodes = []) {
  const exclude = new Set(excludeCodes);
  const pool = ACTIVE_STOCKS.filter((s) => s.price > 0 && !exclude.has(s.code));
  const fallback = ACTIVE_STOCKS.filter((s) => !exclude.has(s.code));
  const source = pool.length > 0 ? pool : fallback;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function formatPrice(n) {
  return n.toLocaleString("ko-KR") + "원";
}

function formatChangeRate(rate) {
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function changeClass(rate) {
  if (rate > 0) return "stock-card__change--up";
  if (rate < 0) return "stock-card__change--down";
  return "stock-card__change--flat";
}

function buildStockDetailUrl(stock) {
  return `detail.html?${new URLSearchParams({ code: stock.code, name: stock.name })}`;
}

function renderStockCard(stock, featured) {
  const el = document.createElement("a");
  el.className = "stock-card" + (featured ? " stock-card--featured" : "");
  el.href = buildStockDetailUrl(stock);

  const head = document.createElement("div");
  head.className = "stock-card__head";
  head.appendChild(buildStockLogoElement(stock.code, stock.name, "stock-logo--sm"));

  const meta = document.createElement("div");
  meta.className = "stock-card__meta";
  meta.innerHTML = `
    <p class="stock-card__name">${stock.name}</p>
    <p class="stock-card__code">${stock.code}</p>
  `;
  head.appendChild(meta);
  el.appendChild(head);

  const price = document.createElement("p");
  price.className = "stock-card__price";
  price.textContent = formatPrice(stock.price);
  el.appendChild(price);

  const change = document.createElement("p");
  change.className = `stock-card__change ${changeClass(stock.changeRate)}`;
  change.textContent = formatChangeRate(stock.changeRate);
  el.appendChild(change);

  return el;
}
