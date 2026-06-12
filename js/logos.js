/**
 * 종목별 기업 로고 — images/logos/{종목코드}.png (scripts/fetch_logos.py로 수집)
 */
const STOCK_LOGO_DOMAINS = {
  "005930": "samsung.com",
  "000660": "skhynix.com",
  "035420": "navercorp.com",
  "051910": "lgchem.com",
  "006400": "samsungsdi.co.kr",
  "035720": "kakaocorp.com",
  "005380": "hyundai.com",
  "000270": "kia.com",
  "105560": "kbfg.com",
  "055550": "shinhan.com",
  "003550": "lg.com",
  "012330": "mobis.co.kr",
  "034730": "sk-inc.com",
  "028260": "samsungcnt.com",
  "032830": "samsunglife.com",
  "003670": "posco.co.kr",
  "207940": "samsungbiologics.com",
  "068270": "celltrion.com",
  "373220": "lgensol.com",
  "086790": "hanafn.com",
  "005490": "poscoholdings.com",
  "009150": "samsungsem.com",
  "017670": "sktelecom.com",
  "033780": "ktng.com",
  "051900": "lghnh.com",
  "096770": "skinnovation.com",
  "010130": "koreazinc.co.kr",
  "000810": "samsungfire.com",
  "018260": "samsungsds.com",
  "316140": "woorifg.com",
};

function getStockLogoSrc(code) {
  return `images/logos/${code}.png`;
}

function createStockLogoFallback(name, sizeClass) {
  const el = document.createElement("span");
  el.className = `stock-logo-fallback ${sizeClass || "stock-logo--md"}`;
  const label = (name || "?").trim();
  el.textContent = label ? label.charAt(0) : "?";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function applyStockLogo(imgEl, code, name) {
  if (!imgEl) return;
  const sizeClass = imgEl.className.match(/stock-logo--\w+/)?.[0] || "stock-logo--md";
  imgEl.src = getStockLogoSrc(code);
  imgEl.alt = `${name || code} 로고`;
  imgEl.onerror = () => {
    imgEl.replaceWith(createStockLogoFallback(name, sizeClass));
  };
}

function buildStockLogoElement(code, name, sizeClass) {
  const size = sizeClass || "stock-logo--md";
  const img = document.createElement("img");
  img.className = `stock-logo ${size}`;
  img.loading = "lazy";
  img.decoding = "async";
  applyStockLogo(img, code, name);
  return img;
}
