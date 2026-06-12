/**
 * 메인 홈페이지
 */
(async function () {
  const grid = document.getElementById("stock-grid");
  const popularGrid = document.getElementById("popular-grid");
  const refreshBtn = document.getElementById("btn-refresh");
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const datalist = document.getElementById("stock-suggestions");
  const snapshotNote = document.getElementById("snapshot-note");
  const footerMeta = document.getElementById("footer-meta");

  const POPULAR_CODES = ["005930", "000660", "035420", "005380", "035720", "105560"];

  if (!grid) return;

  await loadStockSnapshot();
  await loadMeta();

  const buildDetailUrl = buildStockDetailUrl;
  const renderCard = renderStockCard;

  function renderRandomCards() {
    grid.innerHTML = "";
    pickRandomStocks(10, POPULAR_CODES).forEach((s) => grid.appendChild(renderCard(s, false)));
  }

  function renderPopularCards() {
    if (!popularGrid) return;
    popularGrid.innerHTML = "";
    POPULAR_CODES.forEach((code) => {
      const stock = findStockByCode(code);
      if (stock) popularGrid.appendChild(renderCard(stock, true));
    });
  }

  function fillDatalist() {
    if (!datalist) return;
    datalist.innerHTML = getActiveStocks()
      .map((s) => `<option value="${s.name} (${s.code})"></option>`)
      .join("");
  }

  function resolveSearchQuery(raw) {
    const value = raw.trim();
    if (!value) return null;
    const m = value.match(/\((\d{6})\)\s*$/);
    if (m) return findStockByCode(m[1]);
    if (/^\d{6}$/.test(value)) return findStockByCode(value);
    return findStockByName(value);
  }

  async function loadMeta() {
    try {
      const res = await fetch("data/meta.json");
      if (!res.ok) return;
      const meta = await res.json();
      const dateEl = document.getElementById("stat-date");
      const stocksEl = document.getElementById("stat-stocks");
      if (dateEl) dateEl.textContent = meta.updatedAt || meta.basDt || "—";
      if (stocksEl) stocksEl.textContent = `${meta.stockCount || 0}개`;
      if (snapshotNote && meta.updatedAt) {
        snapshotNote.textContent = `데이터 기준일: ${meta.updatedAt}`;
      }
      if (footerMeta) {
        footerMeta.textContent = `데이터 기준일 ${meta.updatedAt || "—"} · 시세 ${meta.basDt || "—"}`;
      }
    } catch (_) {}
  }

  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const stock = resolveSearchQuery(searchInput.value);
    if (!stock) {
      alert("종목을 찾을 수 없습니다. 기업명 또는 6자리 종목코드를 입력해 주세요.");
      searchInput.focus();
      return;
    }
    window.location.href = buildDetailUrl(stock);
  });

  refreshBtn?.addEventListener("click", renderRandomCards);

  fillDatalist();
  renderPopularCards();
  renderRandomCards();
})();
