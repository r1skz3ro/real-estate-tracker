"""Scrape https://altomodular.pl/katalog-domow/ into altomodular-katalog.csv.

Server-rendered Elementor page: one request, no browser. Cards carry hidden ACF mirror
widgets (js-cena, js-metraz, ...) holding raw numbers; the attic area exists only in the
visible icon box 9e901da, and the garage box 833a4f4 renders a bare digit that would be
indistinguishable from it by position -- hence widget ids, not positions.
"""

import csv
import html
import re
import urllib.request
from pathlib import Path

URL = "https://altomodular.pl/katalog-domow/"
OUT = Path(__file__).resolve().parent.parent / "altomodular-katalog.csv"
VAT = 1.08

CARD = re.compile(r'<div[^>]*class="elementor elementor-197 e-loop-item')
ACF = re.compile(r'js-([\w-]+)[^>]*>\s*<h2[^>]*>(.*?)</h2>', re.S)
ATTIC = re.compile(r'elementor-element-9e901da.*?icon-box-title">\s*<span[^>]*>(.*?)</span>', re.S)
NAME = re.compile(r'theme-post-title\.default">\s*<h3[^>]*>(.*?)</h3>', re.S)
LINK = re.compile(r'<a class="elementor-element elementor-element-6edf739[^"]*"[^>]*href="([^"]+)"')

FIELDS = [
    "name", "area_m2", "rooms", "bathrooms", "garages", "attic_m2",
    "price_pln_net", "price_per_m2_net", "price_pln_gross", "price_per_m2_gross",
    "promo", "na_zgloszenie", "url",
]


def text(raw):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()


def num(raw):
    """Leading number only: "82m2" is 82, not 822, but "267 999" is one grouped number."""
    m = re.match(r"\d[\d\s ]*", raw or "")
    return int(re.sub(r"\D", "", m.group(0))) if m else None


def parse(page):
    bounds = [m.start() for m in CARD.finditer(page)] + [len(page)]
    rows = []
    for start, end in zip(bounds, bounds[1:]):
        card = page[start:end]
        acf = {k: text(v) for k, v in ACF.findall(card)}
        name, link = NAME.search(card), LINK.search(card)
        attic, area, price = ATTIC.search(card), num(acf.get("metraz")), num(acf.get("cena"))
        rows.append({
            "name": text(name.group(1)) if name else "",
            "area_m2": area,
            "rooms": num(acf.get("ilosc_pokoi")),
            "bathrooms": num(acf.get("ilosc_lazienek")),
            "garages": num(acf.get("ilosc_garazy")),
            "attic_m2": num(text(attic.group(1))) if attic else None,
            "price_pln_net": price,
            "price_per_m2_net": round(price / area, 2) if price and area else None,
            "price_pln_gross": round(price * VAT, 2) if price else None,
            "price_per_m2_gross": round(price * VAT / area, 2) if price and area else None,
            "promo": 1 if acf.get("promocja") else 0,
            "na_zgloszenie": 1 if acf.get("na-zgloszenie") else 0,
            "url": link.group(1) if link else "",
        })
    return rows


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rows = parse(resp.read().decode("utf-8", "replace"))

    assert len(rows) >= 30, f"only {len(rows)} cards parsed -- page markup likely changed"
    for r in rows:
        assert all(r[k] for k in ("name", "url", "area_m2", "price_pln_net")), f"incomplete: {r}"
    golden = next(r for r in rows if r["name"] == "Alto Grandezza 67")
    assert (golden["area_m2"], golden["price_pln_net"]) == (67, 267999), golden
    assert golden["url"] == "https://altomodular.pl/dom/alto-grandezza/", golden
    attic = next(r for r in rows if r["name"] == "Alto Vento 103")
    assert attic["attic_m2"] == 82, attic  # "82m2" must not parse as 822

    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} houses -> {OUT}")


if __name__ == "__main__":
    main()
