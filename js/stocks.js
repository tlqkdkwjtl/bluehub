/**
 * 전체 종목 목록 페이지
 */
(async function () {
  const grid = document.getElementById("stocks-grid");
  const filterInput = document.getElementById("stocks-filter");
  const sortSelect = document.getElementById("stocks-sort");
  const summaryEl = document.getElementById("stocks-summary");
  const emptyEl = document.getElementById("stocks-empty");
  const footerMeta = document.getElementById("footer-meta");

  if (!grid) return;

  await loadStockSnapshot();

  try {
    const res = await fetch("data/meta.json");
    if (res.ok) {
      const meta = await res.json();
      const count = meta.stockCount || getActiveStocks().length;
      if (summaryEl) {
        summaryEl.textContent = `시세·공시 연동 ${count}개 · 데이터 기준일 ${meta.updatedAt || "—"}`;
      }
      if (footerMeta) {
        footerMeta.textContent = `데이터 기준일 ${meta.updatedAt || "—"} · 시세 ${meta.basDt || "—"}`;
      }
    }
  } catch (_) {}

  function sortStocks(list, mode) {
    const items = [...list];
    switch (mode) {
      case "code":
        return items.sort((a, b) => a.code.localeCompare(b.code));
      case "price-desc":
        return items.sort((a, b) => b.price - a.price);
      case "change-desc":
        return items.sort((a, b) => b.changeRate - a.changeRate);
      default:
        return items.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
  }

  function filterStocks(list, query) {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.includes(q)
    );
  }

  function render() {
    const query = filterInput?.value || "";
    const mode = sortSelect?.value || "name";
    const filtered = filterStocks(getActiveStocks(), query);
    const sorted = sortStocks(filtered, mode);

    grid.innerHTML = "";
    sorted.forEach((s) => grid.appendChild(renderStockCard(s, false)));

    if (emptyEl) {
      emptyEl.hidden = sorted.length > 0;
    }
  }

  filterInput?.addEventListener("input", render);
  sortSelect?.addEventListener("change", render);
  render();
})();
