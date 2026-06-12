# -*- coding: utf-8 -*-
"""기업 로고를 images/logos/{종목코드}.png 으로 저장 (update.ps1과 별도 실행 가능)"""

from __future__ import annotations

import urllib.request
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent
LOGO_DIR = WEB_DIR / "images" / "logos"

# clearbit 등에서 품질이 나쁜 종목 — Wikimedia 등 직접 URL
LOGO_DIRECT_URLS: dict[str, str] = {
    "035420": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/"
        "Naver_logo_initial.svg/330px-Naver_logo_initial.svg.png"
    ),
    "012330": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/"
        "Hyundai_Mobis_Logo.svg/330px-Hyundai_Mobis_Logo.svg.png"
    ),
    "096770": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/"
        "SK_Innovation.svg/330px-SK_Innovation.svg.png"
    ),
    "010130": (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/"
        "Korea_Zinc_Logo.svg/330px-Korea_Zinc_Logo.svg.png"
    ),
}

LOGO_DOMAINS: dict[str, list[str]] = {
    "005930": ["samsung.com"],
    "000660": ["skhynix.com"],
    "035420": ["navercorp.com"],
    "051910": ["lgchem.com"],
    "006400": ["samsungsdi.co.kr"],
    "035720": ["kakaocorp.com"],
    "005380": ["hyundai.com"],
    "000270": ["kia.com"],
    "105560": ["kbfg.com"],
    "055550": ["shinhan.com", "shinhanfinancial.com", "bank.shinhan.com"],
    "003550": ["lg.com"],
    "012330": ["mobis.co.kr", "hyundai-mobis.com", "mobis.com"],
    "034730": ["sk-inc.com"],
    "028260": ["samsungcnt.com"],
    "032830": ["samsunglife.com"],
    "003670": ["posco.co.kr"],
    "207940": ["samsungbiologics.com"],
    "068270": ["celltrion.com"],
    "373220": ["lgensol.com"],
    "086790": ["hanafn.com"],
    "005490": ["poscoholdings.com", "posco.com"],
    "009150": ["samsungsem.com", "samsung.com"],
    "017670": ["sktelecom.com"],
    "033780": ["ktng.com", "kt.com"],
    "051900": ["lghnh.com", "lgcorp.com"],
    "096770": ["skinnovation.com"],
    "010130": ["koreazinc.co.kr"],
    "000810": ["samsungfire.com"],
    "018260": ["samsungsds.com"],
    "316140": ["woorifg.com", "wooribank.com"],
}


def fetch_bytes(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "mata-project/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
    except Exception:
        return None
    if len(data) < 120:
        return None
    return data


def save_direct_logo(url: str, dest: Path) -> bool:
    data = fetch_bytes(url)
    if not data:
        return False
    dest.write_bytes(data)
    return True


def save_logo(code: str, domains: list[str], dest: Path) -> bool:
    for domain in domains:
        sources = [
            f"https://logo.clearbit.com/{domain}",
            f"https://www.google.com/s2/favicons?domain={domain}&sz=128",
        ]
        for url in sources:
            data = fetch_bytes(url)
            if data:
                dest.write_bytes(data)
                return True
    return False


def main() -> None:
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    for code, domains in LOGO_DOMAINS.items():
        dest = LOGO_DIR / f"{code}.png"
        direct = LOGO_DIRECT_URLS.get(code)
        if direct:
            if save_direct_logo(direct, dest):
                print(f"      OK {code} -> {dest.name} (direct)")
                ok += 1
            else:
                print(f"      -- {code} (direct download failed)")
            continue
        if dest.exists() and dest.stat().st_size > 200:
            print(f"      skip {code} (exists)")
            ok += 1
            continue
        if save_logo(code, domains, dest):
            print(f"      OK {code} -> {dest.name}")
            ok += 1
        else:
            print(f"      -- {code} (download failed)")
    print(f"\nDone. {ok}/{len(LOGO_DOMAINS)} logos in images/logos/")


if __name__ == "__main__":
    main()
