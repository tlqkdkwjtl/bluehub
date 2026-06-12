/**
 * 기업 상세 — 스냅샷 기반 6탭
 */
(async function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "005930";
  const nameFromUrl = params.get("name");

  await loadStockSnapshot();

  const stock =
    findStockByCode(code) ||
    findStockByName(nameFromUrl || "") || {
      code,
      name: nameFromUrl || "알 수 없는 종목",
      price: 0,
      changeRate: 0,
    };

  const elName = document.getElementById("company-name");
  const elCode = document.getElementById("company-code");
  const elLogo = document.getElementById("company-logo");
  const elPrice = document.getElementById("company-price");
  const elChange = document.getElementById("company-change");
  const elDate = document.getElementById("company-date");
  const footerMeta = document.getElementById("footer-meta");

  if (elLogo) {
    elLogo.hidden = false;
    applyStockLogo(elLogo, stock.code, stock.name);
  }
  if (elName) elName.textContent = stock.name;
  if (elCode) elCode.textContent = `종목코드 ${stock.code}`;
  if (elPrice) elPrice.textContent = formatPrice(stock.price);
  if (elChange) {
    elChange.textContent = formatChangeRate(stock.changeRate);
    elChange.className = "company-hero__change " + changeClass(stock.changeRate);
  }
  if (elDate && SNAPSHOT_DATE) elDate.textContent = `시세 기준: ${SNAPSHOT_DATE}`;
  document.title = `${stock.name} | 기업보고서 허브`;

  function viewerPageUrl(row) {
    const rceptNo = row.rcept_no || "";
    if (!rceptNo) return "";
    const qs = new URLSearchParams({
      rcpNo: rceptNo,
      title: normalizeTitle(row.report_nm || row.title || "공시 원문"),
      date: formatDartDate(row.rcept_dt || row.date || ""),
      code: stock.code,
    });
    return `viewer.html?${qs.toString()}`;
  }

  function formatDartDate(dt) {
    if (!dt || dt.length !== 8) return dt || "-";
    return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
  }

  function normalizeTitle(name) {
    return (name || "").replace(/\s+/g, " ").trim();
  }

  function filterList(list, predicate) {
    return (list || []).filter(predicate);
  }

  function renderTableRows(tbody, rows, mode) {
    if (!tbody) return;
    if (!rows.length) {
      const msg =
        tbody.id === "securities-tbody"
          ? "최근 기간 증권신고서 공시가 없습니다. (IPO·공모가 없는 종목은 비어 있을 수 있음)"
          : "표시할 항목이 없습니다.";
      tbody.innerHTML = `<tr><td colspan="4">${msg}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((row) => {
        const date = formatDartDate(row.rcept_dt || row.date);
        const title = normalizeTitle(row.report_nm || row.title);
        const flr = row.flr_nm || "-";
        const viewLink = viewerPageUrl(row);
        if (!viewLink) {
          return `<tr><td>${date}</td><td colspan="3">원문 접수번호 없음</td></tr>`;
        }
        if (mode === "disclosure") {
          return `<tr class="row-link" data-href="${viewLink}"><td>${date}</td><td>${flr}</td><td><a href="${viewLink}">${title}</a></td><td><a class="btn-link" href="${viewLink}">원문 보기</a></td></tr>`;
        }
        return `<tr class="row-link" data-href="${viewLink}"><td>${date}</td><td><a href="${viewLink}">${title}</a></td><td>${flr}</td><td><a class="btn-link" href="${viewLink}">원문 보기</a></td></tr>`;
      })
      .join("");
  }

  function parseAmountNum(val) {
    const raw = String(val || "").trim();
    if (!raw || raw === "-") return 0;
    const paren = /^\((.+)\)$/.exec(raw.replace(/,/g, ""));
    if (paren) {
      const n = Number(paren[1]);
      return Number.isNaN(n) ? 0 : -n;
    }
    const n = Number(raw.replace(/,/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }

  const FINANCE_UNIT = { div: 1e8, suffix: "억원", short: "억", decimals: 1 };

  /** 표·그래프 공통 — 억원 통일 */
  function formatAmountSmart(val) {
    const n = parseAmountNum(val);
    if (!n) return val || "-";
    if (Math.abs(n) >= 1e8) {
      return `${(n / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
    }
    if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만원`;
    return `${n.toLocaleString("ko-KR")}원`;
  }

  function formatYoY(yoy) {
    if (yoy === null || Number.isNaN(yoy)) return "-";
    const sign = yoy > 0 ? "+" : "";
    return `${sign}${yoy.toFixed(1)}%`;
  }

  function yoyClass(yoy) {
    if (yoy === null || Number.isNaN(yoy)) return "";
    if (yoy > 0) return "ratio-up";
    if (yoy < 0) return "ratio-down";
    return "";
  }

  function formatAmountFull(val) {
    const n = parseAmountNum(val);
    if (!n) return val || "-";
    return `${n.toLocaleString("ko-KR")}원`;
  }

  function calcYoYPercent(current, previous) {
    const cur = parseAmountNum(current);
    const prev = parseAmountNum(previous);
    if (!prev) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  function pickChartUnit() {
    return FINANCE_UNIT;
  }

  function toChartAmount(val, unit) {
    return parseFloat((parseAmountNum(val) / unit.div).toFixed(unit.decimals));
  }

  function formatChartBarValue(val, unit) {
    const n = Number(val);
    const sign = n < 0 ? "-" : "";
    return `${sign}${Math.abs(n).toFixed(unit.decimals)}${unit.short}`;
  }

  function financeBarRadius(ctx) {
    const val = ctx.dataset.data[ctx.dataIndex];
    if (val < 0) {
      return { bottomLeft: 4, bottomRight: 4, topLeft: 0, topRight: 0 };
    }
    return { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
  }

  function financeBarColor(ctx) {
    const val = ctx.dataset.data[ctx.dataIndex];
    const isCurrent = ctx.datasetIndex === 0;
    if (val < 0) return isCurrent ? "#b91c1c" : "#fca5a5";
    return isCurrent ? "#1a4f8c" : "#94a3b8";
  }

  const FINANCE_BAR_LAYOUT = {
    maxBarThickness: 22,
    barPercentage: 0.55,
    categoryPercentage: 0.62,
  };

  const FINANCE_BALANCE_BAR_LAYOUT = {
    maxBarThickness: 64,
    barPercentage: 0.62,
    categoryPercentage: 0.38,
  };

  function getFinancePeriodLabels(financials) {
    const year = parseInt(financials?.bsns_year, 10);
    if (year) {
      return {
        current: `${year}년`,
        previous: `${year - 1}년`,
        compareTitle: `${year}년 vs ${year - 1}년`,
      };
    }
    return {
      current: "최근 연도",
      previous: "직전 연도",
      compareTitle: "최근 vs 직전",
    };
  }

  const financeBarLabelPlugin = {
    id: "financeBarLabels",
    afterDatasetsDraw(chart) {
      const unit = chart.options._financeUnit;
      if (!unit) return;
      const { ctx } = chart;

      if (chart.options._balanceStacked) {
        const balance = chart.options._balanceMeta;
        const equityMeta = chart.getDatasetMeta(1);
        const labelSize = chart.options._financeLabelSize || 13;

        equityMeta.data.forEach((bar, i) => {
          const assetVal = toChartAmount(
            i === 0 ? balance.asset.previous : balance.asset.current,
            unit
          );
          const text = formatChartBarValue(assetVal, unit);
          ctx.save();
          ctx.fillStyle = "#334155";
          ctx.font = `bold ${labelSize}px 'Noto Sans KR', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(text, bar.x, bar.y - 4);
          ctx.restore();
        });
        return;
      }

      const labelSize = chart.options._financeLabelSize || 10;

      chart.data.datasets.forEach((_, di) => {
        chart.getDatasetMeta(di).data.forEach((bar, i) => {
          const val = chart.data.datasets[di].data[i];
          if (val === 0 || val === null || val === undefined) return;
          const text = formatChartBarValue(val, unit);
          const negative = val < 0;
          ctx.save();
          ctx.fillStyle = negative ? "#b91c1c" : "#334155";
          ctx.font = `bold ${labelSize}px 'Noto Sans KR', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = negative ? "top" : "bottom";
          ctx.fillText(text, bar.x, negative ? bar.y + 4 : bar.y - 4);
          ctx.restore();
        });
      });
    },
  };

  function buildPeriodCompareChart(canvas, instanceRef, items, sectionTitle, periodLabels) {
    if (!canvas || typeof Chart === "undefined") return instanceRef;

    if (!items.length) {
      if (instanceRef) instanceRef.destroy();
      return null;
    }

    if (typeof Chart !== "undefined" && !window._financeBarLabelRegistered) {
      Chart.register(financeBarLabelPlugin);
      window._financeBarLabelRegistered = true;
    }

    if (instanceRef) instanceRef.destroy();

    const unit = pickChartUnit();
    const labels = items.map((i) => i.account_nm);
    const currentData = items.map((i) => toChartAmount(i.current, unit));
    const previousData = items.map((i) => toChartAmount(i.previous, unit));

    return new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: periodLabels?.current || "최근 연도",
            data: currentData,
            backgroundColor: financeBarColor,
            borderRadius: financeBarRadius,
            base: 0,
          },
          {
            label: periodLabels?.previous || "직전 연도",
            data: previousData,
            backgroundColor: financeBarColor,
            borderRadius: financeBarRadius,
            base: 0,
          },
        ],
      },
      options: {
        _financeUnit: unit,
        responsive: true,
        maintainAspectRatio: false,
        datasets: {
          bar: FINANCE_BAR_LAYOUT,
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
          title: {
            display: true,
            text: `${sectionTitle} (단위: ${unit.suffix})`,
            font: { size: 13, weight: "bold" },
          },
          tooltip: {
            callbacks: {
              afterTitle(ctx) {
                const item = items[ctx[0].dataIndex];
                const yoy = calcYoYPercent(item.current, item.previous);
                return `전년 대비 ${formatYoY(yoy)}`;
              },
              label(ctx) {
                const item = items[ctx.dataIndex];
                const raw = ctx.datasetIndex === 0 ? item.current : item.previous;
                const chartVal = toChartAmount(raw, unit);
                return [
                  ` ${ctx.dataset.label}: ${formatChartBarValue(chartVal, unit)} (${unit.suffix})`,
                  ` 정확한 금액: ${formatAmountFull(raw)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 11 }, maxRotation: 0 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grace: "6%",
            title: { display: true, text: unit.suffix },
            ticks: {
              callback: (v) => {
                const n = Number(v);
                const sign = n < 0 ? "-" : "";
                return `${sign}${Math.abs(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}${unit.short}`;
              },
            },
            grid: {
              color: (ctx) => (ctx.tick.value === 0 ? "#64748b" : "#e2e8f0"),
              lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.5 : 1),
            },
          },
        },
      },
    });
  }

  /** 자산 구성 — 부채+자본 누적, 막대 위에는 자산총계만 표시 */
  function buildBalanceAssetChart(canvas, instanceRef, finItems, periodLabels) {
    if (!canvas || typeof Chart === "undefined") return instanceRef;

    const asset = finItems.find((r) => r.account_nm === "자산총계");
    const debt = finItems.find((r) => r.account_nm === "부채총계");
    const equity = finItems.find((r) => r.account_nm === "자본총계");

    if (!asset || !debt || !equity) {
      if (instanceRef) instanceRef.destroy();
      return null;
    }

    if (typeof Chart !== "undefined" && !window._financeBarLabelRegistered) {
      Chart.register(financeBarLabelPlugin);
      window._financeBarLabelRegistered = true;
    }

    if (instanceRef) instanceRef.destroy();

    const unit = pickChartUnit();
    const labels = [periodLabels?.previous || "직전 연도", periodLabels?.current || "최근 연도"];
    const debtData = [debt.previous, debt.current].map((v) => toChartAmount(v, unit));
    const equityData = [equity.previous, equity.current].map((v) => toChartAmount(v, unit));

    return new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "부채총계",
            data: debtData,
            backgroundColor: "#64748b",
            stack: "asset",
            borderRadius: { bottomLeft: 4, bottomRight: 4, topLeft: 0, topRight: 0 },
          },
          {
            label: "자본총계",
            data: equityData,
            backgroundColor: "#1a4f8c",
            stack: "asset",
            borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          },
        ],
      },
      options: {
        _financeUnit: unit,
        _financeLabelSize: 13,
        _balanceStacked: true,
        _balanceMeta: { asset, debt, equity },
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, font: { size: 13 } } },
          title: {
            display: true,
            text: "자산 구성 — 부채+자본 (단위: 억원)",
            font: { size: 15, weight: "bold" },
          },
          tooltip: {
            callbacks: {
              afterTitle(ctx) {
                const idx = ctx[0].dataIndex;
                const rawAsset = idx === 0 ? asset.previous : asset.current;
                const yoy = calcYoYPercent(asset.current, asset.previous);
                return [
                  `자산총계: ${formatAmountSmart(rawAsset)}`,
                  `전년 대비(자산): ${formatYoY(yoy)}`,
                ];
              },
              label(ctx) {
                const idx = ctx.dataIndex;
                const rows = [debt, equity];
                const row = rows[ctx.datasetIndex];
                const raw = idx === 0 ? row.previous : row.current;
                const chartVal = toChartAmount(raw, unit);
                return [
                  ` ${ctx.dataset.label}: ${formatChartBarValue(chartVal, unit)} (${unit.suffix})`,
                  ` 정확한 금액: ${formatAmountFull(raw)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { font: { size: 14, weight: "600" } },
            grid: { display: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grace: "6%",
            title: { display: true, text: unit.suffix },
            ticks: {
              font: { size: 12 },
              callback: (v) =>
                `${Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}${unit.short}`,
            },
            grid: { color: "rgba(148, 163, 184, 0.25)" },
          },
        },
        datasets: {
          bar: FINANCE_BALANCE_BAR_LAYOUT,
        },
      },
    });
  }

  function buildQuarterlyTrendChart(canvas, instanceRef, quarterly, metricName) {
    if (!canvas || typeof Chart === "undefined") return instanceRef;

    const periods = (quarterly || []).filter((q) => (q.items || []).length > 0);
    if (periods.length < 2) {
      if (instanceRef) instanceRef.destroy();
      return null;
    }

    if (typeof Chart !== "undefined" && !window._financeBarLabelRegistered) {
      Chart.register(financeBarLabelPlugin);
      window._financeBarLabelRegistered = true;
    }

    if (instanceRef) instanceRef.destroy();

    const unit = pickChartUnit();
    const labels = periods.map((q) => q.label);
    const data = periods.map((q) => {
      const item = (q.items || []).find((i) => i.account_nm === metricName);
      return item ? toChartAmount(item.amount, unit) : 0;
    });

    return new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: metricName,
            data,
            backgroundColor: financeBarColor,
            borderRadius: financeBarRadius,
            base: 0,
          },
        ],
      },
      options: {
        _financeUnit: unit,
        responsive: true,
        maintainAspectRatio: false,
        datasets: {
          bar: { ...FINANCE_BAR_LAYOUT, maxBarThickness: 28 },
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `${metricName} 분기별 (단위: ${unit.suffix})`,
            font: { size: 13, weight: "bold" },
          },
          tooltip: {
            callbacks: {
              title(ctx) {
                const period = periods[ctx[0].dataIndex];
                return period ? `${period.label} · ${period.reprt_name || ""}` : "";
              },
              label(ctx) {
                const period = periods[ctx.dataIndex];
                const item = (period.items || []).find((i) => i.account_nm === metricName);
                const raw = item?.amount || "0";
                const chartVal = toChartAmount(raw, unit);
                return [
                  ` ${formatChartBarValue(chartVal, unit)} (${unit.suffix})`,
                  ` 정확한 금액: ${formatAmountFull(raw)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grace: "6%",
            title: { display: true, text: unit.suffix },
            ticks: {
              callback: (v) => {
                const n = Number(v);
                const sign = n < 0 ? "-" : "";
                return `${sign}${Math.abs(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}${unit.short}`;
              },
            },
            grid: {
              color: (ctx) => (ctx.tick.value === 0 ? "#64748b" : "#e2e8f0"),
              lineWidth: (ctx) => (ctx.tick.value === 0 ? 1.5 : 1),
            },
          },
        },
      },
    });
  }

  function renderFinanceChart(finItems, quarterly, financials) {
    const canvas = document.getElementById("finance-chart");
    const balanceCanvas = document.getElementById("finance-balance-chart");
    const noteEl = document.getElementById("finance-chart-note");
    const quarterlyTitle = document.getElementById("finance-quarterly-title");
    const quarterlyWrap = document.getElementById("finance-quarterly-wrap");
    const quarterlyControls = document.getElementById("finance-quarterly-controls");
    const quarterlyNote = document.getElementById("finance-quarterly-note");
    const quarterlyCanvas = document.getElementById("finance-quarterly-chart");
    if (typeof Chart === "undefined") return;

    const plMetrics = ["매출액", "영업이익", "당기순이익"];
    const plItems = plMetrics
      .map((name) => finItems.find((r) => r.account_nm === name))
      .filter(Boolean);
    const hasBalance =
      finItems.some((r) => r.account_nm === "자산총계") &&
      finItems.some((r) => r.account_nm === "부채총계") &&
      finItems.some((r) => r.account_nm === "자본총계");

    if (!plItems.length && !hasBalance) {
      if (financeChartInstance) {
        financeChartInstance.destroy();
        financeChartInstance = null;
      }
      if (financeBalanceChartInstance) {
        financeBalanceChartInstance.destroy();
        financeBalanceChartInstance = null;
      }
      if (financeQuarterlyChartInstance) {
        financeQuarterlyChartInstance.destroy();
        financeQuarterlyChartInstance = null;
      }
      if (noteEl) noteEl.textContent = "";
      hideQuarterlySection();
      return;
    }

    const periodLabels = getFinancePeriodLabels(financials || {});

    financeChartInstance = buildPeriodCompareChart(
      canvas,
      financeChartInstance,
      plItems,
      "손익",
      periodLabels
    );
    financeBalanceChartInstance = buildBalanceAssetChart(
      balanceCanvas,
      financeBalanceChartInstance,
      finItems,
      periodLabels
    );

    renderQuarterlyFinanceChart(quarterly || [], quarterlyCanvas, quarterlyTitle, quarterlyWrap, quarterlyControls, quarterlyNote);

    if (noteEl) {
      noteEl.textContent =
        `모든 금액은 억원 단위입니다. ${periodLabels.compareTitle} 재무를 비교합니다. ` +
        `손익 그래프는 0선 기준 위=흑자·아래=적자(빨간 막대)이며, 파란=${periodLabels.current}·회색=${periodLabels.previous}입니다. ` +
        `재무상태는 아래 회색=부채, 위 파랑=자본이며 막대 전체=자산총계입니다. ` +
        `막대 위 숫자는 자산총계만 표시하고, 부채·자본 금액은 범례·툴팁에서 확인할 수 있습니다. ` +
        `마우스를 올리면 원 단위 정확한 금액을 볼 수 있습니다.`;
    }
  }

  function hideQuarterlySection() {
    ["finance-quarterly-title", "finance-quarterly-wrap", "finance-quarterly-controls", "finance-quarterly-note"].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      }
    );
  }

  function renderQuarterlyFinanceChart(
    quarterly,
    canvas,
    titleEl,
    wrapEl,
    controlsEl,
    noteEl
  ) {
    const valid = (quarterly || []).filter((q) => (q.items || []).length >= 2);
    if (valid.length < 2) {
      if (financeQuarterlyChartInstance) {
        financeQuarterlyChartInstance.destroy();
        financeQuarterlyChartInstance = null;
      }
      lastQuarterlyPayload = null;
      hideQuarterlySection();
      return;
    }

    lastQuarterlyPayload = valid;
    if (titleEl) titleEl.hidden = false;
    if (wrapEl) wrapEl.hidden = false;
    if (controlsEl) controlsEl.hidden = false;
    if (noteEl) {
      noteEl.hidden = false;
      noteEl.textContent =
        "분기보고서·반기보고서 누적값에서 해당 분기 실적을 계산했습니다. " +
        "최근 8개 분기까지 표시합니다.";
    }

    financeQuarterlyChartInstance = buildQuarterlyTrendChart(
      canvas,
      financeQuarterlyChartInstance,
      valid,
      quarterlyMetric
    );

    if (!quarterlyControlsBound && controlsEl) {
      quarterlyControlsBound = true;
      controlsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".finance-metric-btn");
        if (!btn || !lastQuarterlyPayload) return;
        quarterlyMetric = btn.dataset.metric || "매출액";
        controlsEl.querySelectorAll(".finance-metric-btn").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        financeQuarterlyChartInstance = buildQuarterlyTrendChart(
          canvas,
          financeQuarterlyChartInstance,
          lastQuarterlyPayload,
          quarterlyMetric
        );
      });
    }
  }

  function formatHistoryDate(dt) {
    const s = String(dt || "").replace(/-/g, "");
    if (s.length !== 8) return dt || "-";
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  const PRICE_PERIODS = {
    "1w": { days: 5, label: "1주", maxTicks: 6 },
    "1m": { days: 22, label: "1개월", maxTicks: 6 },
    "3m": { days: 66, label: "3개월", maxTicks: 5 },
    "1y": { days: 252, label: "1년", maxTicks: 5 },
    all: { days: Infinity, label: "전체", maxTicks: 8 },
  };

  /** x축 눈금 — 기간별로 큰 단위만 표시 (나머지는 빈 칸) */
  function priceAxisLabel(history, index, periodKey) {
    const h = history[index];
    if (!h) return "";
    const s = String(h.date || "").replace(/-/g, "");
    if (s.length !== 8) return "";

    const prev = history[index - 1];
    const ym = s.slice(0, 6);
    const y = s.slice(0, 4);
    const m = parseInt(s.slice(4, 6), 10);
    const mm = s.slice(4, 6);
    const dd = s.slice(6, 8);
    const prevYm = prev ? String(prev.date).slice(0, 6) : "";
    const prevY = prev ? String(prev.date).slice(0, 4) : "";

    if (periodKey === "1w") {
      return `${mm}/${dd}`;
    }

    if (periodKey === "1m") {
      const step = Math.max(1, Math.floor(history.length / 5));
      if (index % step !== 0 && index !== history.length - 1) return "";
      return `${mm}/${dd}`;
    }

    if (periodKey === "3m") {
      if (prevYm === ym) return "";
      return `${y}.${mm}`;
    }

    if (periodKey === "1y") {
      if (prevYm === ym) return "";
      if (![1, 4, 7, 10].includes(m)) return "";
      return `${y}.${mm}`;
    }

    if (periodKey === "all") {
      if (y !== prevY) return y;
      if ((m === 4 || m === 7 || m === 10) && prevYm !== ym) {
        return `Q${Math.ceil(m / 3)}`;
      }
      return "";
    }

    return "";
  }

  function slicePriceHistory(history, periodKey) {
    const cfg = PRICE_PERIODS[periodKey] || PRICE_PERIODS["1y"];
    if (!cfg.days || cfg.days === Infinity) return history.slice();
    return history.slice(-Math.min(cfg.days, history.length));
  }

  function pricePeriodPointRadius(count) {
    if (count > 60) return 0;
    if (count > 20) return 1;
    return 3;
  }

  function updatePriceTrendChart(periodKey) {
    const canvas = document.getElementById("price-trend-chart");
    if (!canvas || typeof Chart === "undefined") return;

    const cfg = PRICE_PERIODS[periodKey] || PRICE_PERIODS.all;
    priceTrendActiveHistory = slicePriceHistory(priceTrendHistoryFull, periodKey);

    if (priceTrendChartInstance) {
      priceTrendChartInstance.destroy();
      priceTrendChartInstance = null;
    }

    if (!priceTrendActiveHistory.length) return;

    const activeHistory = priceTrendActiveHistory;
    const labels = activeHistory.map((h) => h.date);
    const closes = activeHistory.map((h) => h.close);

    priceTrendChartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "종가",
            data: closes,
            borderColor: "#1a4f8c",
            backgroundColor: "rgba(26, 79, 140, 0.1)",
            fill: true,
            tension: 0.12,
            pointRadius: pricePeriodPointRadius(activeHistory.length),
            pointHoverRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `종가 추세 · ${cfg.label} (영업일)`,
            font: { size: 13, weight: "bold" },
          },
          tooltip: {
            callbacks: {
              title(items) {
                const idx = items[0]?.dataIndex ?? 0;
                return formatHistoryDate(activeHistory[idx]?.date);
              },
              label(ctx) {
                const h = activeHistory[ctx.dataIndex];
                const ch =
                  h.changeRate != null && !Number.isNaN(h.changeRate)
                    ? ` · 전일 ${formatChangeRate(h.changeRate)}`
                    : "";
                return ` 종가 ${formatPrice(h.close)}${ch}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: cfg.maxTicks,
              maxRotation: 0,
              font: { size: 10 },
              autoSkip: true,
              callback(_value, index) {
                const text = priceAxisLabel(activeHistory, index, periodKey);
                return text || undefined;
              },
            },
          },
          y: {
            ticks: {
              callback: (v) => Number(v).toLocaleString("ko-KR"),
              font: { size: 10 },
            },
          },
        },
      },
    });
  }

  function initPricePeriodControls() {
    if (pricePeriodControlsBound) return;
    const container = document.getElementById("price-period");
    if (!container) return;
    pricePeriodControlsBound = true;

    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".price-period__btn");
      if (!btn) return;
      const period = btn.dataset.period;
      if (!period || period === priceTrendCurrentPeriod) return;

      priceTrendCurrentPeriod = period;
      container.querySelectorAll(".price-period__btn").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      updatePriceTrendChart(period);
    });
  }

  function renderPrice(stockData) {
    const summary = document.getElementById("price-summary");
    if (!summary) return;

    priceTrendHistoryFull = (stockData.priceHistory || []).filter((h) => h.close > 0);

    summary.innerHTML = `
      <div class="finance-summary__item"><span>현재가</span><strong>${formatPrice(stockData.price)}</strong></div>
      <div class="finance-summary__item"><span>전날 대비 등락율</span><strong class="${changeClass(stockData.changeRate)}">${formatChangeRate(stockData.changeRate)}</strong></div>
    `;

    initPricePeriodControls();
    updatePriceTrendChart(priceTrendCurrentPeriod);
  }

  function renderFinance(stockData, snapshot) {
    const summary = document.getElementById("finance-summary");
    const metricsBody = document.getElementById("finance-metrics-tbody");
    const lead = document.getElementById("finance-lead");
    const reportLink = document.getElementById("finance-report-link");
    if (!summary) return;

    const list = snapshot.list || [];
    const regular = snapshot.regular || [];
    const financials = snapshot.financials || {};
    const finItems = financials.items || [];

    const reportCount = filterList(regular.length ? regular : list, (r) =>
      /사업보고서|반기보고서|분기보고서/.test(r.report_nm || "")
    ).length;

    summary.innerHTML = `
      <div class="finance-summary__item"><span>정기보고서</span><strong>${reportCount}건</strong></div>
      <div class="finance-summary__item"><span>재무 기준</span><strong>${financials.bsns_year ? `${financials.bsns_year} ${financials.reprt_name || ""}` : "-"}</strong></div>
    `;

    if (lead) {
      let leadText = "DART 정기보고서에서 가져온 재무지표입니다.";
      if (finItems.length && financials.bsns_year) {
        const pl = getFinancePeriodLabels(financials);
        leadText =
          `${financials.bsns_year}년 ${financials.reprt_name || "정기보고서"} · ` +
          `${financials.fs_label || "연결"} 재무제표 기준입니다. ` +
          `그래프는 ${pl.current}과 ${pl.previous} 결산을 나란히 비교합니다.`;
      } else if (!finItems.length) {
        leadText += " update.ps1로 스냅샷을 갱신해 주세요.";
      }
      lead.textContent = leadText;
    }

    if (metricsBody) {
      if (!finItems.length) {
        metricsBody.innerHTML =
          `<tr><td colspan="4">재무지표 데이터 없음 · update.ps1로 스냅샷을 갱신해 주세요.</td></tr>`;
      } else {
        metricsBody.innerHTML = finItems
          .map((row) => {
            const yoy = calcYoYPercent(row.current, row.previous);
            return `
          <tr>
            <td><strong>${row.account_nm}</strong></td>
            <td title="${formatAmountFull(row.current)}">${formatAmountSmart(row.current)}</td>
            <td title="${formatAmountFull(row.previous)}">${formatAmountSmart(row.previous)}</td>
            <td class="${yoyClass(yoy)}">${formatYoY(yoy)}</td>
          </tr>`;
          })
          .join("");
      }
    }

    const pl = getFinancePeriodLabels(financials);
    const plTitle = document.getElementById("finance-pl-title");
    if (plTitle) plTitle.textContent = `손익 — ${pl.compareTitle}`;
    const metricsHead = document.getElementById("finance-metrics-head");
    if (metricsHead) {
      metricsHead.innerHTML =
        `<th>항목</th><th>${pl.current}</th><th>${pl.previous}</th><th>전년 대비</th>`;
    }

    renderFinanceChart(finItems, financials.quarterly || [], financials);

    if (reportLink) {
      const annual = (regular.length ? regular : list).find((r) =>
        /사업보고서/.test(r.report_nm || "")
      );
      const href = annual ? viewerPageUrl(annual) : "";
      reportLink.innerHTML = href
        ? `<a href="${href}">사업보고서 원문 보기 →</a>`
        : "";
    }
  }

  function formatNumber(n) {
    const num = Number(String(n).replace(/,/g, ""));
    if (Number.isNaN(num)) return n || "-";
    return num.toLocaleString("ko-KR");
  }

  function formatRatio(r) {
    if (r === null || r === undefined || r === "" || r === "-") return "-";
    const num = parseFloat(r);
    if (Number.isNaN(num)) return String(r);
    return `${num.toFixed(2)}%`;
  }

  function parseRatioNum(r) {
    const n = parseFloat(r);
    return Number.isNaN(n) ? 0 : n;
  }

  const INST_KEYWORDS = [
    "㈜", "(주)", "주식회사", "유한회사", "보험", "은행", "자산운용", "투자신탁",
    "펀드", "증권", "지주", "홀딩스", "Holdings", "Corp", "Inc", "LLC", "Ltd",
    "재단", "연금", "금융", "캐피탈", "Capital", "Asset", "Partners",
  ];

  function classifyHolderType(h) {
    if (h.holder_type) return h.holder_type;
    const name = (h.name || "").trim();
    const relation = (h.relation || "").trim();
    if (name === "계") return "합계";
    if (INST_KEYWORDS.some((k) => name.includes(k))) return "기관";
    if (relation.includes("계열회사") || relation.includes("법인")) return "기관";
    if (/[A-Za-z]/.test(name) && name.length > 3) return "기관";
    if (["특수관계인", "친족", "가족", "배우자", "자녀", "임원"].some((x) => relation.includes(x))) {
      return "개인";
    }
    if (!name.includes("㈜") && !name.includes("주식회사") && name.length >= 2 && name.length <= 5) {
      return "개인";
    }
    return "기관";
  }

  function typeBadge(type) {
    const cls =
      type === "기관" ? "badge-inst" : type === "개인" ? "badge-person" : "badge-total";
    return `<span class="holder-badge ${cls}">${type}</span>`;
  }

  /** DART API 합계 행 — nm 값이 "계"(뜻: total) */
  function displayHolderName(name) {
    const n = (name || "").trim();
    if (n === "계") return "총합";
    return n || "-";
  }

  /** 보통주·우선주·특별계정 등 → 같은 사람(법인) 키 */
  function holderAggregateKey(name) {
    const raw = (name || "").trim();
    if (raw === "계") return "총합";
    return raw.split("\n")[0].trim() || raw;
  }

  function isTotalRow(h) {
    return (h.name || "").trim() === "계";
  }

  let shareChartInstance = null;
  let controlChartInstance = null;
  let financeChartInstance = null;
  let financeBalanceChartInstance = null;
  let financeQuarterlyChartInstance = null;
  let lastQuarterlyPayload = null;
  let quarterlyMetric = "매출액";
  let quarterlyControlsBound = false;
  let priceTrendChartInstance = null;
  let priceTrendHistoryFull = [];
  let priceTrendActiveHistory = [];
  let priceTrendCurrentPeriod = "all";
  let pricePeriodControlsBound = false;
  let lastShareChartPayload = null;

  function isNarrowViewport() {
    return window.matchMedia("(max-width: 639px)").matches;
  }

  function compactChartNote(text) {
    if (!isNarrowViewport()) return text;
    const first = text.split(/(?<=[.!?])\s+/)[0];
    return first || text;
  }

  function legendLabelText(label, narrow) {
    const text = String(label ?? "");
    if (!text) return "-";
    if (narrow && text.length > 8) return `${text.slice(0, 7)}…`;
    return text;
  }

  function pieChartDisplayOptions(labelCount) {
    const narrow = isNarrowViewport();
    const showLegend = !(narrow && labelCount > 5);

    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: narrow ? "62%" : "55%",
      plugins: {
        legend: {
          display: showLegend,
          position: "bottom",
          labels: {
            boxWidth: narrow ? 6 : 8,
            padding: narrow ? 2 : 4,
            font: { size: narrow ? 7 : 9 },
            generateLabels(chart) {
              const dataset = chart.data.datasets[0];
              const chartLabels = chart.data.labels || [];
              const items = chartLabels.map((label, i) => ({
                text: legendLabelText(label, narrow),
                fillStyle: Array.isArray(dataset.backgroundColor)
                  ? dataset.backgroundColor[i]
                  : dataset.backgroundColor,
                strokeStyle: dataset.borderColor,
                lineWidth: dataset.borderWidth || 0,
                hidden: !chart.getDataVisibility(i),
                index: i,
                datasetIndex: 0,
              }));
              return items.sort(
                (a, b) => (dataset.data[b.index] || 0) - (dataset.data[a.index] || 0)
              );
            },
          },
        },
        title: { display: false },
      },
      layout: { padding: narrow ? 2 : 4 },
    };
  }

  function isPreferredStock(stockKind) {
    return (stockKind || "").includes("우선");
  }

  /** 같은 사람·법인 여러 줄 → 한 줄로 합산 (보통주·우선주 비율 따로 보관) */
  function aggregateHolders(holders) {
    const map = new Map();
    holders
      .filter((h) => !isTotalRow(h))
      .forEach((h) => {
        const key = holderAggregateKey(h.name);
        const prev = map.get(key) || {
          name: key,
          relation: h.relation || "-",
          holder_type: classifyHolderType(h),
          stock_kind: h.stock_kind || "-",
          ratio_end: 0,
          ratio_common: 0,
          ratio_preferred: 0,
          shares_end: 0,
          shares_common: 0,
          shares_preferred: 0,
        };
        const ratio = parseRatioNum(h.ratio_end);
        const shares = Number(String(h.shares_end).replace(/,/g, "")) || 0;
        prev.ratio_end += ratio;
        prev.shares_end += shares;
        if (isPreferredStock(h.stock_kind)) {
          prev.ratio_preferred += ratio;
          prev.shares_preferred += shares;
        } else {
          prev.ratio_common += ratio;
          prev.shares_common += shares;
        }
        if (ratio > 0) prev.relation = h.relation || prev.relation;
        map.set(key, prev);
      });
    return [...map.values()]
      .filter((h) => h.ratio_end > 0)
      .sort((a, b) => b.ratio_end - a.ratio_end);
  }

  const PIE_COLORS = [
    "#1a4f8c", "#2f7fd4", "#b45309", "#059669", "#7c3aed",
    "#db2777", "#0d9488", "#ea580c", "#4f46e5", "#64748b",
    "#475569", "#94a3b8", "#cbd5e1",
  ];

  function pieColors(count) {
    return Array.from({ length: count }, (_, i) => PIE_COLORS[i % PIE_COLORS.length]);
  }

  const MIN_PIE_SLICE_PCT = 0.4;

  /** 0.4% 미만은 한 조각으로 묶어 원 그래프에서도 보이게 (실제 %는 툴팁) */
  function groupSmallHolders(aggregated, minPct = MIN_PIE_SLICE_PCT) {
    const major = [];
    const small = [];
    aggregated.forEach((h) => {
      if (h.ratio_end >= minPct) major.push(h);
      else small.push(h);
    });
    if (!small.length) {
      return { list: aggregated, groupedCount: 0, groupedSum: 0 };
    }
    const groupedSum = small.reduce((s, h) => s + h.ratio_end, 0);
    const grouped = {
      name: "기타 소액 주주",
      relation: `${small.length}명`,
      holder_type: "합계",
      stock_kind: "-",
      ratio_end: parseFloat(groupedSum.toFixed(2)),
      ratio_common: parseFloat(small.reduce((s, h) => s + (h.ratio_common || 0), 0).toFixed(2)),
      ratio_preferred: parseFloat(small.reduce((s, h) => s + (h.ratio_preferred || 0), 0).toFixed(2)),
      shares_end: small.reduce((s, h) => s + (h.shares_end || 0), 0),
      members: small,
    };
    return {
      list: [...major, grouped].sort((a, b) => b.ratio_end - a.ratio_end),
      groupedCount: small.length,
      groupedSum: grouped.ratio_end,
    };
  }

  function getMajorSum(aggregated, totalRow) {
    if (totalRow) return parseRatioNum(totalRow.ratio_end);
    return aggregated.reduce((s, h) => s + h.ratio_end, 0);
  }

  function sortHoldersByRatio(list) {
    return [...list].sort((a, b) => b.ratio_end - a.ratio_end);
  }

  /** 파이 조각·범례 — 지분율 큰 순 */
  function sortPieSlices(slices) {
    return slices.slice().sort((a, b) => b.value - a.value);
  }

  function slicesToPieResult(slices, meta) {
    const ordered = sortPieSlices(slices);
    return {
      labels: ordered.map((s) => s.label),
      data: ordered.map((s) => s.value),
      holders: ordered.filter((s) => s.holder).map((s) => s.holder),
      ...meta,
    };
  }

  /** 보통주·우선주 등 여러 줄 → 이름 기준 한 사람(법인)당 한 조각 */
  function buildHolderPieSlices(aggregated, totalRow, {
    topN = null,
    restLabel = "기타 투자자",
    excludeGeneral = false,
  } = {}) {
    const sorted = sortHoldersByRatio(aggregated);
    const majorSum = getMajorSum(aggregated, totalRow);
    const generalPct = Math.max(0, 100 - majorSum);

    if (topN) {
      const top = sorted.slice(0, topN);
      const topSum = top.reduce((s, h) => s + h.ratio_end, 0);
      const restPct = parseFloat(Math.max(0, 100 - topSum).toFixed(2));
      const slices = [
        ...top.map((h) => ({
          label: h.name,
          value: parseFloat(h.ratio_end.toFixed(2)),
          holder: h,
        })),
        { label: restLabel, value: restPct, holder: null },
      ];
      return slicesToPieResult(slices, { majorSum, generalPct, restPct });
    }

    const slices = sorted.map((h) => ({
      label: h.name,
      value: parseFloat(h.ratio_end.toFixed(2)),
      holder: h,
    }));
    if (!excludeGeneral && generalPct > 0) {
      slices.push({
        label: "일반 주주",
        value: parseFloat(generalPct.toFixed(2)),
        holder: null,
      });
    }

    return slicesToPieResult(slices, { majorSum, generalPct });
  }

  /** 왼쪽 그래프 설명 — 실제 데이터에서 예시 이름·% 자동 생성 */
  function buildShareChartNote(pie, aggregated) {
    const mergedExamples = aggregated
      .filter((h) => h.ratio_common > 0 && h.ratio_preferred > 0)
      .sort((a, b) => b.ratio_end - a.ratio_end)
      .slice(0, 3);

    let examplePart = "";
    if (mergedExamples.length) {
      const names = mergedExamples
        .map((h) => `${h.name} ${formatRatio(h.ratio_end)}`)
        .join(", ");
      examplePart = `보통주·우선주를 같이 가진 경우(예: ${names}) 이름 기준으로 합산합니다. `;
    } else if (pie.holders?.length) {
      const names = sortHoldersByRatio(pie.holders)
        .slice(0, 3)
        .map((h) => `${h.name} ${formatRatio(h.ratio_end)}`)
        .join(", ");
      examplePart = `(예: ${names}) `;
    }

    return (
      `한 사람당 한 조각으로 보여 줍니다. ` +
      examplePart +
      `나머지 ${formatRatio(pie.restPct)}는 기타 투자자(상위 외 주주·미공시 보유분)입니다.`
    );
  }

  function holderTooltipLines(holder, totalPct, showStockBreakdown) {
    const name = holder.name;

    if (holder.members?.length) {
      const lines = [` ${name} 합계 ${totalPct}%`];
      holder.members
        .sort((a, b) => b.ratio_end - a.ratio_end)
        .forEach((m) => lines.push(`   ${m.name} ${formatRatio(m.ratio_end)}`));
      return lines;
    }

    if (!showStockBreakdown) {
      if (holder.shares_end) {
        return [` ${name}: ${totalPct}% · ${formatNumber(holder.shares_end)}주`];
      }
      return [` ${name}: ${totalPct}%`];
    }

    const lines = [` ${name} 합계 ${totalPct}%`];
    if (holder.ratio_common > 0) {
      lines.push(`   보통주 ${formatRatio(holder.ratio_common)}`);
    }
    if (holder.ratio_preferred > 0) {
      lines.push(`   우선주 ${formatRatio(holder.ratio_preferred)}`);
    }
    if (holder.shares_end) {
      lines.push(`   보유 ${formatNumber(holder.shares_end)}주`);
    }
    return lines;
  }

  function renderHolderPieChart(canvas, instanceRef, {
    labels,
    data,
    noteEl,
    noteText,
    holders,
    showStockBreakdown = false,
  }) {
    if (!canvas || typeof Chart === "undefined") return instanceRef;

    if (instanceRef) instanceRef.destroy();

    const generalColor = "#e2e8f0";
    const palette = pieColors(labels.length);
    let colorIdx = 0;
    const colors = labels.map((label) => {
      if (label === "일반 주주" || label === "기타 투자자") return generalColor;
      return palette[colorIdx++];
    });

    const displayOpts = pieChartDisplayOptions(labels.length);

    const chart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        ...displayOpts,
        plugins: {
          ...displayOpts.plugins,
          tooltip: {
            callbacks: {
              label(ctx) {
                const name = ctx.label || "";
                if (name === "일반 주주" || name === "기타 투자자") {
                  return ` ${name}: ${ctx.parsed}%`;
                }
                const holder = holders?.find((h) => h.name === name);
                if (!holder) return ` ${name}: ${ctx.parsed}%`;
                return holderTooltipLines(holder, ctx.parsed, showStockBreakdown);
              },
            },
          },
        },
      },
    });

    if (noteEl) {
      let note = compactChartNote(noteText);
      if (isNarrowViewport() && labels.length > 5 && !displayOpts.plugins.legend.display) {
        note += " 그래프를 누르면 주주별 비율을 볼 수 있습니다.";
      }
      noteEl.textContent = note;
    }
    return chart;
  }

  function renderControlChart(aggregated, totalRow) {
    const canvas = document.getElementById("control-chart");
    const noteEl = document.getElementById("control-chart-note");
    if (!canvas || !aggregated.length) return;

    const grouped = groupSmallHolders(aggregated);
    const pie = buildHolderPieSlices(grouped.list, totalRow, { excludeGeneral: true });
    const namedCount = aggregated.length;

    let groupNote = "";
    if (grouped.groupedCount > 0) {
      groupNote =
        ` ${MIN_PIE_SLICE_PCT}% 미만 ${grouped.groupedCount}명은 「기타 소액 주주」(` +
        `${formatRatio(grouped.groupedSum)})로 묶었습니다.`;
    }

    controlChartInstance = renderHolderPieChart(canvas, controlChartInstance, {
      ...pie,
      holders: grouped.list,
      showStockBreakdown: true,
      noteEl,
      noteText:
        `공시된 주요주주만 표시합니다(일반 주주 제외). ` +
        `합계 ${formatRatio(pie.majorSum)}, 총 ${namedCount}명(법인). ` +
        `마우스를 올리면 보통주·우선주 비율을 각각 볼 수 있습니다.${groupNote}`,
    });
  }

  function getListedShares() {
    const s = findStockByCode(stock.code);
    if (s?.listedShares > 0) return s.listedShares;
    return 0;
  }

  function renderShareChart(aggregated, totalRow) {
    const canvas = document.getElementById("share-chart");
    const noteEl = document.getElementById("share-chart-note");
    if (!canvas || !aggregated.length) return;

    const TOP_N = 7;
    const pie = buildHolderPieSlices(aggregated, totalRow, {
      topN: TOP_N,
      restLabel: "기타 투자자",
    });

    shareChartInstance = renderHolderPieChart(canvas, shareChartInstance, {
      ...pie,
      title: "주요주주 지분 (상위)",
      noteEl,
      noteText: buildShareChartNote(pie, aggregated),
    });
  }

  function renderShareholding(shareholding) {
    const tbody = document.getElementById("shareholding-tbody");
    const lead = document.getElementById("shareholding-lead");
    const totalEl = document.getElementById("shareholding-total");
    if (!tbody) return;

    const holders = shareholding?.holders || [];
    const year = shareholding?.bsns_year;
    const totalRow = holders.find(isTotalRow);

    const reprtName = shareholding?.reprt_name || "정기보고서";

    const listedShares = getListedShares();

    if (totalEl && totalRow) {
      totalEl.innerHTML = listedShares
        ? `상장주식수 <strong>${formatNumber(listedShares)}주</strong> · ` +
          `주요주주 보유 <strong>${formatNumber(totalRow.shares_end)}주 (${formatRatio(totalRow.ratio_end)})</strong>`
        : `주요주주 보유 <strong>${formatNumber(totalRow.shares_end)}주 (${formatRatio(totalRow.ratio_end)})</strong>`;
    } else if (totalEl) {
      totalEl.textContent = "";
    }

    if (!holders.length) {
      tbody.innerHTML = `<tr><td colspan="6">지분율 데이터가 없습니다. (사업보고서 미공시 기간일 수 있음)</td></tr>`;
      return;
    }

    const aggregated = aggregateHolders(holders);
    const instCount = aggregated.filter((h) => h.holder_type === "기관").length;
    const personCount = aggregated.filter((h) => h.holder_type === "개인").length;
    if (lead && year) {
      let leadText =
        `${year}년 ${reprtName} 기준 · 주요주주 ${aggregated.length}명 (기관 ${instCount} · 개인 ${personCount})`;
      if (personCount === 0 && aggregated.length > 0) {
        leadText +=
          " · 임원·주요주주 소유 현황은 아래 표에서 확인할 수 있습니다";
      }
      lead.textContent = leadText;
    }

    const tableRows = [];
    if (totalRow) {
      tableRows.push({
        name: "총합",
        relation: "표에 공시된 주요주주 합계",
        holder_type: "합계",
        stock_kind: totalRow.stock_kind || "-",
        ratio_end: parseRatioNum(totalRow.ratio_end),
        shares_end: Number(String(totalRow.shares_end).replace(/,/g, "")) || 0,
        isTotal: true,
      });
    }
    tableRows.push(...aggregated.map((h) => ({ ...h, isTotal: false })));

    tbody.innerHTML = tableRows
      .map((h) => {
        const ratio = formatRatio(h.ratio_end);
        const ratioCls = !h.isTotal && h.ratio_end >= 5 ? "ratio-up" : "";
        const rowCls = h.isTotal ? "row-total" : "";
        return `
          <tr class="${rowCls}">
            <td>${typeBadge(h.holder_type)}</td>
            <td><strong>${h.name}</strong></td>
            <td>${h.relation}</td>
            <td>${h.stock_kind}</td>
            <td class="${ratioCls}">${ratio}</td>
            <td>${formatNumber(h.shares_end)}</td>
          </tr>
        `;
      })
      .join("");

    lastShareChartPayload = { aggregated, totalRow };
    renderShareChart(aggregated, totalRow);
    renderControlChart(aggregated, totalRow);
  }

  let resizeChartTimer = null;
  window.addEventListener("resize", () => {
    if (!lastShareChartPayload) return;
    clearTimeout(resizeChartTimer);
    resizeChartTimer = setTimeout(() => {
      const { aggregated, totalRow } = lastShareChartPayload;
      renderShareChart(aggregated, totalRow);
      renderControlChart(aggregated, totalRow);
    }, 200);
  });

  function classifyStockKind(kind) {
    const k = (kind || "보통주").trim();
    if (k.includes("우선")) return "preferred";
    if (k === "보통주" || k === "-") return "common";
    return "special";
  }

  /** 사업보고서 주요주주 표에서 이름·주식종류별 보유 내역 */
  function getHolderStockLines(name, rawHolders) {
    const map = new Map();
    (rawHolders || [])
      .filter((h) => !isTotalRow(h) && holderAggregateKey(h.name) === name)
      .forEach((h) => {
        const kind = (h.stock_kind || "보통주").trim();
        const shares = Number(String(h.shares_end).replace(/,/g, "")) || 0;
        const ratio = parseRatioNum(h.ratio_end);
        if (shares <= 0 && ratio <= 0) return;
        const prev = map.get(kind) || { shares: 0, ratio: 0 };
        prev.shares += shares;
        prev.ratio += ratio;
        map.set(kind, prev);
      });
    return [...map.entries()]
      .map(([kind, v]) => [kind, v.shares, v.ratio])
      .sort((a, b) => b[1] - a[1]);
  }

  function renderHoldingLine(kind, shares, ratio) {
    const shareText = `${formatNumber(shares)}주`;
    const ratioNum = parseRatioNum(ratio);
    const ratioText = ratioNum > 0 ? ` <span class="holding-ratio">(${formatRatio(ratioNum)})</span>` : "";
    const stockCls = classifyStockKind(kind);

    if (stockCls === "common") {
      return `<div class="holding-line">${shareText}${ratioText}</div>`;
    }

    const badgeCls =
      stockCls === "preferred" ? "stock-kind--preferred" : "stock-kind--special";
    const label = (kind || "기타").trim();
    return (
      `<div class="holding-line">` +
      `<span class="stock-kind ${badgeCls}">${label}</span> ${shareText}${ratioText}` +
      `</div>`
    );
  }

  function renderExecutiveShareList(executiveHoldings, shareholdingHolders) {
    const tbody = document.getElementById("share-tbody");
    const lead = document.getElementById("executive-share-lead");
    if (!tbody) return;

    const rows = (executiveHoldings?.holders || []).slice();
    rows.sort((a, b) =>
      (b.rcept_dt || "").replace(/-/g, "").localeCompare((a.rcept_dt || "").replace(/-/g, ""))
    );

    if (lead) {
      lead.textContent = rows.length
        ? `임원·주요주주 소유보고 ${rows.length}명 · 최신 공시 기준 (0.00%는 소수 반올림)`
        : "소유보고 데이터가 없습니다. update.ps1 실행 후 다시 확인하세요.";
    }

    if (!rows.length) {
      tbody.innerHTML =
        `<tr><td colspan="5">표시할 임원·주요주주 소유 데이터가 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map((row) => {
        const lines = getHolderStockLines(row.name, shareholdingHolders);
        let holdingsHtml;
        if (lines.length) {
          holdingsHtml = lines
            .map(([kind, shares, ratio]) => renderHoldingLine(kind, shares, ratio))
            .join("");
        } else {
          holdingsHtml = renderHoldingLine("보통주", row.shares, row.ratio);
        }

        const viewLink = viewerPageUrl(row);
        const date = formatDartDate((row.rcept_dt || "").replace(/-/g, ""));
        return `
          <tr class="row-link" data-href="${viewLink}">
            <td>${date}</td>
            <td>${row.position || "-"}</td>
            <td><div class="holdings-cell">${holdingsHtml}</div></td>
            <td><strong>${row.name}</strong></td>
            <td><a class="btn-link" href="${viewLink}">원문 보기</a></td>
          </tr>`;
      })
      .join("");
  }

  function classifyAndRender(snapshot) {
    const all = snapshot.list || [];
    const updatedAt = snapshot.updatedAt || "";
    if (footerMeta && updatedAt) {
      footerMeta.textContent = `데이터 기준일 ${updatedAt}`;
    }

    const regular =
      snapshot.regular?.length > 0
        ? snapshot.regular
        : filterList(all, (r) =>
            /사업보고서|반기보고서|분기보고서|기업지배구조/.test(r.report_nm || "")
          );
    const share =
      snapshot.share?.length > 0
        ? snapshot.share
        : filterList(all, (r) => /지분|주주|소유|대주주/.test(r.report_nm || ""));
    const major =
      snapshot.major?.length > 0
        ? snapshot.major
        : filterList(all, (r) =>
            /주요사항|합병|분할|증자|영업양도/.test(r.report_nm || "")
          );
    const securities =
      snapshot.securities?.length > 0
        ? snapshot.securities
        : filterList(all, (r) =>
            /증권신고|공모|IPO|채권신고/.test(r.report_nm || "")
          );

    renderShareholding(snapshot.shareholding);
    renderExecutiveShareList(snapshot.executive_holdings, snapshot.shareholding?.holders || []);
    renderTableRows(document.getElementById("regular-tbody"), regular, "default");
    renderTableRows(document.getElementById("major-tbody"), major, "default");
    renderTableRows(document.getElementById("securities-tbody"), securities, "default");
    renderPrice(stock);
    renderFinance(stock, snapshot);
  }

  async function loadDisclosureSnapshot() {
    try {
      const res = await fetch(`data/disclosures/${stock.code}.json`);
      if (!res.ok) return false;
      const json = await res.json();
      classifyAndRender(json);
      return true;
    } catch (_) {
      return false;
    }
  }

  const ok = await loadDisclosureSnapshot();
  if (!ok) {
    const rows = getDisclosuresForCode(stock.code).map((r) => ({
      rcept_dt: r.date?.replace(/-/g, ""),
      report_nm: r.title,
      flr_nm: r.type,
      rcept_no: "",
    }));
    classifyAndRender({ list: rows, updatedAt: "" });
  }

  const tabButtons = document.querySelectorAll(".tabs__btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-selected", "false");
      });
      tabPanels.forEach((p) => {
        p.classList.remove("is-active");
        p.hidden = true;
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.add("is-active");
        panel.hidden = false;
      }
    });
  });

  tabPanels.forEach((p, i) => {
    if (i > 0) p.hidden = true;
  });

  document.querySelectorAll(".row-link").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const href = row.getAttribute("data-href");
      if (href) window.location.href = href;
    });
  });
})();
