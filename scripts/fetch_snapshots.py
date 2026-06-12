# -*- coding: utf-8 -*-
"""
로컬에서 API 데이터를 받아 web/data/ JSON 스냅샷으로 저장.
GitHub Pages는 이 JSON을 읽어 표시 (키 불필요).

환경변수: DART_API_KEY, DATA_GO_KR_KEY
또는 상위 폴더 txt 파일에서 키 자동 탐색.
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, timedelta
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = WEB_DIR / "data"
DISCLOSURE_DIR = DATA_DIR / "disclosures"

STOCK_CODES = [
    "005930", "000660", "035420", "051910", "006400",
    "035720", "005380", "000270", "105560", "055550",
    "003550", "012330", "034730", "028260", "032830",
    "003670", "207940", "068270", "373220", "086790",
    "005490", "009150", "017670", "033780", "051900",
    "096770", "010130", "000810", "018260", "316140",
]

# 수집 시작일 통일 (API 한도·용량 고려, 2020년~)
SNAPSHOT_BEGIN = "20200101"
PRICE_HISTORY_MAX_POINTS = 1600
DART_PAGE_SIZE = 100

STOCK_NAMES = {
    "005930": "삼성전자", "000660": "SK하이닉스", "035420": "NAVER",
    "051910": "LG화학", "006400": "삼성SDI", "035720": "카카오",
    "005380": "현대차", "000270": "기아", "105560": "KB금융",
    "055550": "신한지주", "003550": "LG", "012330": "현대모비스",
    "034730": "SK", "028260": "삼성물산", "032830": "삼성생명",
    "003670": "포스코퓨처엠", "207940": "삼성바이오로직스",
    "068270": "셀트리온", "373220": "LG에너지솔루션", "086790": "하나금융지주",
    "005490": "POSCO홀딩스", "009150": "삼성전기", "017670": "SK텔레콤",
    "033780": "KT&G", "051900": "LG생활건강", "096770": "SK이노베이션",
    "010130": "고려아연", "000810": "삼성화재", "018260": "삼성에스디에스",
    "316140": "우리금융지주",
}


def load_keys() -> tuple[str, str]:
    dart = os.getenv("DART_API_KEY", "").strip()
    data_go = os.getenv("DATA_GO_KR_KEY", "").strip()
    if dart and data_go:
        return dart, data_go

    parent = WEB_DIR.parent
    key_file = None
    for f in parent.glob("*.txt"):
        try:
            text = f.read_text(encoding="utf-8")
            if "opendart" in text or "apis.data.go.kr" in text:
                key_file = f
                break
        except OSError:
            continue

    if not key_file:
        raise SystemExit("API key file not found. Set DART_API_KEY / DATA_GO_KR_KEY.")

    text = key_file.read_text(encoding="utf-8").lstrip("\ufeff")
    hex64 = re.findall(r"[0-9a-fA-F]{64}", text)
    hex40 = re.findall(r"[0-9a-fA-F]{40}", text)
    if not hex64 or not hex40:
        raise SystemExit("Could not parse keys from txt file.")
    return hex40[-1], hex64[0]


def fetch_url(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "mata-project/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def load_corp_code_map(dart_key: str, targets: set[str]) -> dict[str, str]:
    url = "https://opendart.fss.or.kr/api/corpCode.xml?" + urllib.parse.urlencode(
        {"crtfc_key": dart_key}
    )
    raw = fetch_url(url)
    zf = zipfile.ZipFile(io.BytesIO(raw))
    xml_name = zf.namelist()[0]
    root = ET.fromstring(zf.read(xml_name))

    mapping: dict[str, str] = {}
    for item in root.findall("list"):
        stock = (item.findtext("stock_code") or "").strip()
        corp = (item.findtext("corp_code") or "").strip()
        if stock in targets and corp:
            mapping[stock] = corp
    return mapping


def fetch_dart_list_page(
    dart_key: str,
    corp_code: str,
    bgn_de: str,
    end_de: str,
    *,
    pblntf_ty: str | None = None,
    page_no: int = 1,
    page_count: int = DART_PAGE_SIZE,
) -> dict:
    params = {
        "crtfc_key": dart_key,
        "corp_code": corp_code,
        "bgn_de": bgn_de,
        "end_de": end_de,
        "page_no": str(page_no),
        "page_count": str(page_count),
    }
    if pblntf_ty:
        params["pblntf_ty"] = pblntf_ty
    url = "https://opendart.fss.or.kr/api/list.json?" + urllib.parse.urlencode(params)
    return json.loads(fetch_url(url).decode("utf-8"))


def fetch_dart_list_all(
    dart_key: str,
    corp_code: str,
    bgn_de: str,
    end_de: str,
    *,
    pblntf_ty: str | None = None,
    max_pages: int = 50,
) -> list[dict]:
    """공시 목록 전 페이지 수집 (rcept_no 기준 중복 제거)"""
    merged: list[dict] = []
    seen: set[str] = set()
    page_no = 1

    while page_no <= max_pages:
        data = fetch_dart_list_page(
            dart_key,
            corp_code,
            bgn_de,
            end_de,
            pblntf_ty=pblntf_ty,
            page_no=page_no,
            page_count=DART_PAGE_SIZE,
        )
        batch = extract_list(data)
        if not batch:
            break

        for item in batch:
            key = (item.get("rcept_no") or "").strip()
            if not key:
                key = f"{item.get('rcept_dt')}_{item.get('report_nm')}"
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)

        total_page = int(data.get("total_page") or 0)
        if total_page and page_no >= total_page:
            break
        if len(batch) < DART_PAGE_SIZE:
            break
        page_no += 1

    merged.sort(key=lambda r: (r.get("rcept_dt") or ""), reverse=True)
    return merged


def extract_list(data: dict) -> list:
    if data.get("status") != "000":
        return []
    return data.get("list") or []


def fetch_dart_api(dart_key: str, endpoint: str, **kwargs: str) -> dict:
    params = {"crtfc_key": dart_key, **kwargs}
    url = f"https://opendart.fss.or.kr/api/{endpoint}?" + urllib.parse.urlencode(params)
    return json.loads(fetch_url(url).decode("utf-8"))


INST_KEYWORDS = (
    "㈜", "(주)", "주식회사", "유한회사", "보험", "은행", "자산운용", "투자신탁",
    "펀드", "증권", "지주", "홀딩스", "Holdings", "Corp", "Inc", "LLC", "Ltd",
    "재단", "연금", "금융", "캐피탈", "Capital", "Asset", "Partners",
)


def classify_holder_type(name: str, relation: str) -> str:
    """DART에 기관/개인 필드 없음 → 이름·관계로 추정"""
    name = (name or "").strip()
    relation = (relation or "").strip()
    if name == "계":
        return "합계"
    if any(k in name for k in INST_KEYWORDS):
        return "기관"
    if "계열회사" in relation or "법인" in relation:
        return "기관"
    if re.search(r"[A-Za-z]", name) and len(name) > 3:
        return "기관"
    if any(x in relation for x in ("특수관계인", "친족", "가족", "배우자", "자녀", "임원")):
        return "개인"
    if "㈜" not in name and "주식회사" not in name and 2 <= len(name) <= 5:
        return "개인"
    return "기관"


def fetch_shareholding(dart_key: str, corp_code: str, today: date) -> dict:
    """최대주주 현황(hyslrSttus) — 성명·관계·지분율(%)"""
    # reprt_code: 11011 사업, 11012 반기, 11013 1분기, 11014 3분기
    report_codes = [
        ("11011", "사업보고서"),
        ("11012", "반기보고서"),
        ("11014", "3분기보고서"),
        ("11013", "1분기보고서"),
    ]

    for year in range(today.year - 1, today.year - 4, -1):
        for reprt_code, reprt_name in report_codes:
            data = fetch_dart_api(
                dart_key,
                "hyslrSttus.json",
                corp_code=corp_code,
                bsns_year=str(year),
                reprt_code=reprt_code,
            )
            rows = extract_list(data)
            if not rows:
                continue

            holders = []
            for item in rows:
                nm = (item.get("nm") or "").strip()
                relate = (item.get("relate") or "").strip()
                holders.append(
                    {
                        "name": nm,
                        "relation": relate,
                        "holder_type": classify_holder_type(nm, relate),
                        "stock_kind": (item.get("stock_knd") or "").strip(),
                        "shares_end": item.get("trmend_posesn_stock_co", ""),
                        "ratio_end": item.get("trmend_posesn_stock_qota_rt", ""),
                        "shares_begin": item.get("bsis_posesn_stock_co", ""),
                        "ratio_begin": item.get("bsis_posesn_stock_qota_rt", ""),
                    }
                )

            def _ratio_num(val: str) -> float:
                try:
                    if val in (None, "", "-"):
                        return 0.0
                    return float(val)
                except (TypeError, ValueError):
                    return 0.0

            holders.sort(key=lambda h: _ratio_num(h["ratio_end"]), reverse=True)
            return {
                "bsns_year": str(year),
                "reprt_code": reprt_code,
                "reprt_name": reprt_name,
                "holders": holders,
            }

    return {"bsns_year": None, "reprt_code": None, "reprt_name": None, "holders": []}


FIN_ACCOUNT_ORDER = [
    ("매출액", "매출액"),
    ("영업이익", "영업이익"),
    ("당기순이익(손실)", "당기순이익"),
    ("자산총계", "자산총계"),
    ("부채총계", "부채총계"),
    ("자본총계", "자본총계"),
]

PL_METRIC_LABELS = ("매출액", "영업이익", "당기순이익")

QUARTERLY_REPORT_SEQUENCE = [
    ("11013", "1분기보고서", "1분기"),
    ("11012", "반기보고서", "2분기"),
    ("11014", "3분기보고서", "3분기"),
    ("11011", "사업보고서", "4분기"),
]

QUARTERLY_REPORT_SORT = {"11013": 1, "11012": 2, "11014": 3, "11011": 4}


def parse_amount_num(val: str) -> float:
    raw = str(val or "").strip()
    if not raw or raw == "-":
        return 0.0
    compact = raw.replace(",", "")
    paren = re.match(r"^\((.+)\)$", compact)
    if paren:
        try:
            return -float(paren.group(1))
        except ValueError:
            return 0.0
    try:
        return float(compact)
    except ValueError:
        return 0.0


def format_amount_for_json(n: float) -> str:
    sign = "-" if n < 0 else ""
    return f"{sign}{abs(int(round(n))):,}"


def fetch_financials_period(
    dart_key: str,
    corp_code: str,
    bsns_year: str,
    reprt_code: str,
    fs_div: str,
) -> list[dict]:
    data = fetch_dart_api(
        dart_key,
        "fnlttSinglAcnt.json",
        corp_code=corp_code,
        bsns_year=bsns_year,
        reprt_code=reprt_code,
        fs_div=fs_div,
    )
    return extract_financial_metrics(extract_list(data))


def fetch_quarterly_financials(
    dart_key: str, corp_code: str, today: date, fs_div: str
) -> list[dict]:
    """분기·반기·사업보고 누적값에서 분기 단위 손익 추출 (최근 8개 분기)."""
    periods: list[dict] = []

    for year in range(today.year, today.year - 4, -1):
        year_str = str(year)
        prev_cum: dict[str, float] = {}

        for reprt_code, reprt_name, quarter_label in QUARTERLY_REPORT_SEQUENCE:
            metrics = fetch_financials_period(
                dart_key, corp_code, year_str, reprt_code, fs_div
            )
            if len(metrics) < 3:
                continue

            cum = {
                m["account_nm"]: parse_amount_num(m["current"])
                for m in metrics
                if m["account_nm"] in PL_METRIC_LABELS
            }
            if len(cum) < 2:
                continue

            inc_items: list[dict] = []
            for acc in PL_METRIC_LABELS:
                if acc not in cum:
                    continue
                cur = cum[acc]
                prev = prev_cum.get(acc, 0.0)
                inc = cur if reprt_code == "11013" else cur - prev
                inc_items.append(
                    {
                        "account_nm": acc,
                        "amount": format_amount_for_json(inc),
                        "currency": "KRW",
                    }
                )

            prev_cum = dict(cum)
            periods.append(
                {
                    "label": f"{year_str} {quarter_label}",
                    "bsns_year": year_str,
                    "reprt_code": reprt_code,
                    "reprt_name": reprt_name,
                    "items": inc_items,
                }
            )

    periods.sort(
        key=lambda p: (
            int(p["bsns_year"]),
            QUARTERLY_REPORT_SORT.get(p["reprt_code"], 9),
        )
    )
    return periods[-8:]


def extract_financial_metrics(rows: list) -> list[dict]:
    """단일회사 주요계정 — 당기·전기 금액"""
    found: dict[str, dict] = {}
    for item in rows:
        raw_nm = (item.get("account_nm") or "").strip()
        if raw_nm not in {k for k, _ in FIN_ACCOUNT_ORDER}:
            continue
        if raw_nm in found:
            continue
        label = next(lbl for key, lbl in FIN_ACCOUNT_ORDER if key == raw_nm)
        found[raw_nm] = {
            "account_nm": label,
            "current": (item.get("thstrm_amount") or "").strip(),
            "previous": (item.get("frmtrm_amount") or "").strip(),
            "currency": (item.get("currency") or "KRW").strip(),
        }
        if len(found) == len(FIN_ACCOUNT_ORDER):
            break

    return [found[key] for key, _ in FIN_ACCOUNT_ORDER if key in found]


def fetch_financials(dart_key: str, corp_code: str, today: date) -> dict:
    """주요계정(fnlttSinglAcnt) — 매출·영업이익·순이익·재무상태표 요약"""
    report_codes = [
        ("11011", "사업보고서"),
        ("11012", "반기보고서"),
        ("11014", "3분기보고서"),
        ("11013", "1분기보고서"),
    ]
    fs_options = [("CFS", "연결"), ("OFS", "별도")]

    result: dict = {
        "bsns_year": None,
        "reprt_code": None,
        "reprt_name": None,
        "fs_div": None,
        "fs_label": None,
        "items": [],
        "quarterly": [],
    }

    for year in range(today.year, today.year - 4, -1):
        for reprt_code, reprt_name in report_codes:
            for fs_div, fs_label in fs_options:
                metrics = fetch_financials_period(
                    dart_key, corp_code, str(year), reprt_code, fs_div
                )
                if len(metrics) >= 3:
                    result = {
                        "bsns_year": str(year),
                        "reprt_code": reprt_code,
                        "reprt_name": reprt_name,
                        "fs_div": fs_div,
                        "fs_label": fs_label,
                        "items": metrics,
                        "quarterly": [],
                    }
                    break
            if result.get("items"):
                break
        if result.get("items"):
            break

    if result.get("items"):
        fs_div = result.get("fs_div") or "CFS"
        result["quarterly"] = fetch_quarterly_financials(
            dart_key, corp_code, today, fs_div
        )

    return result


def _parse_share_count(val: str) -> int:
    try:
        return int(str(val or "0").replace(",", "").strip())
    except (TypeError, ValueError):
        return 0


def _pick_executive_position(item: dict) -> str:
    """직위명 + (등기여부) — 예: 리더(비등기임원)"""
    office = (item.get("isu_exctv_ofcps") or "").strip()
    if not office or office == "-":
        office = (item.get("isu_main_shrholdr") or "").strip()
    rgist = (item.get("isu_exctv_rgist_at") or "").strip()

    if not office or office == "-":
        return rgist if rgist and rgist != "-" else "-"

    if rgist and rgist != "-" and rgist not in office:
        return f"{office}({rgist})"

    return office


def fetch_executive_holdings(dart_key: str, corp_code: str) -> dict:
    """임원·주요주주 특정증권 소유보고(elestock) — 최신 보고 기준"""
    data = fetch_dart_api(dart_key, "elestock.json", corp_code=corp_code)
    rows = extract_list(data)
    if not rows:
        return {"holders": []}

    latest: dict[str, dict] = {}
    for item in rows:
        name = (item.get("repror") or "").strip()
        if not name:
            continue
        sort_dt = (item.get("rcept_dt") or "").replace("-", "")
        shares = _parse_share_count(item.get("sp_stock_lmp_cnt"))
        prev = latest.get(name)
        if prev and sort_dt <= prev["_sort_dt"]:
            continue
        latest[name] = {
            "name": name,
            "position": _pick_executive_position(item),
            "shares": shares,
            "ratio": (item.get("sp_stock_lmp_rate") or "0").strip(),
            "rcept_no": item.get("rcept_no") or "",
            "rcept_dt": item.get("rcept_dt") or "",
            "report_nm": "임원·주요주주 특정증권등 소유상황보고서",
            "_sort_dt": sort_dt,
        }

    holders = sorted(latest.values(), key=lambda h: h["shares"], reverse=True)
    for h in holders:
        del h["_sort_dt"]

    return {"holders": [h for h in holders if h["shares"] > 0][:100]}


def fetch_stock_price(data_go_key: str, stock_code: str, bas_dt: str) -> dict | None:
    base = (
        "https://apis.data.go.kr/1160100/service/"
        "GetStockSecuritiesInfoService/getStockPriceInfo"
    )
    params = {
        "serviceKey": data_go_key,
        "numOfRows": "1",
        "pageNo": "1",
        "resultType": "json",
        "basDt": bas_dt,
        "likeSrtnCd": stock_code,
    }
    url = base + "?" + urllib.parse.urlencode(params)
    try:
        data = json.loads(fetch_url(url).decode("utf-8"))
    except Exception:
        return None

    body = data.get("response", {}).get("body", {})
    items = body.get("items")
    if not items:
        return None
    item = items.get("item") if isinstance(items, dict) else None
    if isinstance(item, list):
        item = item[0] if item else None
    if not item or not isinstance(item, dict):
        return None

    price = int(float(item.get("clpr") or 0))
    rate = float(item.get("fltRt") or item.get("prdy_ctrt") or 0)
    name = (item.get("itmsNm") or STOCK_NAMES.get(stock_code, stock_code)).strip()
    listed = int(float(item.get("lstgStCnt") or 0))
    return {
        "code": stock_code,
        "name": name,
        "price": price,
        "changeRate": rate,
        "listedShares": listed,
    }


def _parse_price_items(body: dict) -> list[dict]:
    items = body.get("items")
    if not items:
        return []
    item = items.get("item") if isinstance(items, dict) else items
    if isinstance(item, dict):
        return [item]
    if isinstance(item, list):
        return item
    return []


def fetch_stock_price_history(
    data_go_key: str,
    stock_code: str,
    begin_bas_dt: str,
    end_bas_dt: str,
    *,
    max_points: int = PRICE_HISTORY_MAX_POINTS,
) -> list[dict]:
    """영업일 종가 이력 — beginBasDt~endBasDt (최대 max_points 영업일)"""
    base = (
        "https://apis.data.go.kr/1160100/service/"
        "GetStockSecuritiesInfoService/getStockPriceInfo"
    )
    page_size = 100
    page_no = 1
    rows: list[dict] = []

    while len(rows) < max_points:
        params = {
            "serviceKey": data_go_key,
            "numOfRows": str(page_size),
            "pageNo": str(page_no),
            "resultType": "json",
            "likeSrtnCd": stock_code,
            "beginBasDt": begin_bas_dt,
            "endBasDt": end_bas_dt,
        }
        url = base + "?" + urllib.parse.urlencode(params)
        try:
            data = json.loads(fetch_url(url).decode("utf-8"))
        except Exception:
            break

        body = data.get("response", {}).get("body", {})
        batch = _parse_price_items(body)
        if not batch:
            break

        for item in batch:
            close = int(float(item.get("clpr") or 0))
            bas = (item.get("basDt") or "").strip()
            if not bas or close <= 0:
                continue
            rate = float(item.get("fltRt") or 0)
            rows.append({"date": bas, "close": close, "changeRate": rate})

        total = int(body.get("totalCount") or 0)
        if page_no * page_size >= total:
            break
        page_no += 1

    by_date = {r["date"]: r for r in rows}
    sorted_rows = sorted(by_date.values(), key=lambda r: r["date"])
    if len(sorted_rows) > max_points:
        sorted_rows = sorted_rows[-max_points:]
    return sorted_rows


def find_latest_bas_dt(data_go_key: str, stock_code: str = "005930") -> str | None:
    today = date.today()
    for i in range(1, 15):
        d = today - timedelta(days=i)
        bas = d.strftime("%Y%m%d")
        if fetch_stock_price(data_go_key, stock_code, bas):
            return bas
    return None


def main() -> None:
    dart_key, data_go_key = load_keys()
    today = date.today()
    end_de = today.strftime("%Y%m%d")
    updated_at = today.isoformat()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DISCLOSURE_DIR.mkdir(parents=True, exist_ok=True)

    print("[1/3] corp_code mapping...")
    corp_map = load_corp_code_map(dart_key, set(STOCK_CODES))
    (DATA_DIR / "corp_codes.json").write_text(
        json.dumps(
            {"updatedAt": updated_at, "mapping": corp_map},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"      mapped {len(corp_map)} / {len(STOCK_CODES)} stocks")

    print("[2/3] stock prices + history...")
    bas_dt = find_latest_bas_dt(data_go_key) or end_de
    history_begin = SNAPSHOT_BEGIN
    stocks = []
    for code in STOCK_CODES:
        row = fetch_stock_price(data_go_key, code, bas_dt)
        if row and row["price"] > 0:
            history = fetch_stock_price_history(
                data_go_key,
                code,
                history_begin,
                bas_dt,
                max_points=PRICE_HISTORY_MAX_POINTS,
            )
            row["priceHistory"] = history
            stocks.append(row)
            print(f"      OK {code} {row['name']} {row['price']} hist={len(history)}")
        else:
            fallback = {
                "code": code,
                "name": STOCK_NAMES.get(code, code),
                "price": 0,
                "changeRate": 0.0,
                "priceHistory": [],
            }
            stocks.append(fallback)
            print(f"      -- {code} (no data, placeholder)")

    (DATA_DIR / "stocks.json").write_text(
        json.dumps(
            {
                "updatedAt": updated_at,
                "basDt": bas_dt,
                "historyFrom": history_begin,
                "historyTo": bas_dt,
                "stocks": stocks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("[3/3] DART disclosures...")
    ok = 0
    for code in STOCK_CODES:
        corp = corp_map.get(code)
        out = DISCLOSURE_DIR / f"{code}.json"
        if not corp:
            out.write_text(
                json.dumps(
                    {
                        "updatedAt": updated_at,
                        "stock_code": code,
                        "corp_code": None,
                        "status": "no_corp_code",
                        "list": [],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            continue

        try:
            list_all = fetch_dart_list_all(
                dart_key, corp, SNAPSHOT_BEGIN, end_de
            )
            list_regular = fetch_dart_list_all(
                dart_key, corp, SNAPSHOT_BEGIN, end_de, pblntf_ty="A"
            )
            list_share = fetch_dart_list_all(
                dart_key, corp, SNAPSHOT_BEGIN, end_de, pblntf_ty="D"
            )
            list_major = fetch_dart_list_all(
                dart_key, corp, SNAPSHOT_BEGIN, end_de, pblntf_ty="B"
            )
            list_securities = fetch_dart_list_all(
                dart_key, corp, SNAPSHOT_BEGIN, end_de, pblntf_ty="C"
            )

            if not list_securities:
                merged = list_all + list_regular + list_major
                list_securities = [
                    item
                    for item in merged
                    if re.search(r"증권신고|공모|IPO|채권신고", item.get("report_nm", ""))
                ]

            try:
                shareholding = fetch_shareholding(dart_key, corp, today)
            except Exception as exc:  # noqa: BLE001
                print(f"      WARN {code} shareholding: {exc}")
                shareholding = {
                    "bsns_year": None,
                    "reprt_code": None,
                    "reprt_name": None,
                    "holders": [],
                }

            try:
                financials = fetch_financials(dart_key, corp, today)
            except Exception as exc:  # noqa: BLE001
                print(f"      WARN {code} financials: {exc}")
                financials = {
                    "bsns_year": None,
                    "reprt_code": None,
                    "reprt_name": None,
                    "fs_div": None,
                    "fs_label": None,
                    "items": [],
                    "quarterly": [],
                }

            try:
                executive_holdings = fetch_executive_holdings(dart_key, corp)
            except Exception as exc:  # noqa: BLE001
                print(f"      WARN {code} executive_holdings: {exc}")
                executive_holdings = {"holders": []}

            payload = {
                "updatedAt": updated_at,
                "stock_code": code,
                "corp_code": corp,
                "status": "000" if list_all else "013",
                "message": "",
                "disclosureFrom": SNAPSHOT_BEGIN,
                "list": list_all,
                "regular": list_regular,
                "share": list_share,
                "major": list_major,
                "securities": list_securities,
                "shareholding": shareholding,
                "financials": financials,
                "executive_holdings": executive_holdings,
            }
            out.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            ok += 1
            sh_cnt = len(shareholding.get("holders") or [])
            fin_cnt = len(financials.get("items") or [])
            exec_cnt = len(executive_holdings.get("holders") or [])
            print(
                f"      OK {code} (all={len(payload['list'])} "
                f"regular={len(payload['regular'])} holders={sh_cnt} fin={fin_cnt} exec={exec_cnt})"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"      ERR {code}: {exc}")

    meta = {
        "updatedAt": updated_at,
        "basDt": bas_dt,
        "stockCount": len(stocks),
        "disclosureCount": ok,
        "snapshotFrom": SNAPSHOT_BEGIN,
        "note": "GitHub Pages displays this snapshot. Re-run update.ps1 locally to refresh.",
    }
    (DATA_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("")
    print("Done.")
    print(f"  data/stocks.json ({len(stocks)} stocks, basDt={bas_dt})")
    print(f"  data/disclosures/*.json ({ok} with DART data)")
    print(f"  data/meta.json")


if __name__ == "__main__":
    main()
