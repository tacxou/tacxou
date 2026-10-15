#!/usr/bin/env python3
"""Keep a last-good visible badge while the README pixel continues counting."""

from pathlib import Path
from urllib.request import Request, urlopen
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://komarev.com/ghpvc/?username=tacxou&label=Profile%20views&color=0d9488&style=flat-square"


def parse_count(data: bytes) -> int:
    if len(data) > 100_000 or b"<!ENTITY" in data.upper() or b"<!DOCTYPE" in data.upper():
        raise ValueError("Invalid counter response")
    root = ET.fromstring(data)
    if root.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError("Counter response is not an SVG")
    texts = ["".join(node.itertext()).strip() for node in root.iter()
             if node.tag == "{http://www.w3.org/2000/svg}text"]
    if "Profile views" not in texts:
        raise ValueError("Counter label is missing")
    counts = {int(text.replace(",", "")) for text in texts
              if re.fullmatch(r"\d+(?:,\d{3})*", text)}
    if len(counts) != 1:
        raise ValueError("Counter value is missing or inconsistent")
    return counts.pop()


def badge(count: int, locale: str) -> str:
    label = "Profile views" if locale == "en" else "Vues du profil"
    value = f"{count:,}" if locale == "en" else f"{count:,}".replace(",", " ")
    hint = "Approximate views; updated daily" if locale == "en" else "Vues estimées ; actualisation quotidienne"
    left = 82 if locale == "en" else 92
    right = max(40, len(value) * 7 + 12)
    width = left + right
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="20" role="img" aria-label="{label}: {value}">
  <title>{label}: {value} — {hint}</title>
  <rect width="{left}" height="20" fill="#555"/>
  <rect x="{left}" width="{right}" height="20" fill="#0d9488"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="{left / 2}" y="14">{label}</text>
    <text x="{left + right / 2}" y="14">{value}</text>
  </g>
</svg>
'''


def save_badges(count: int) -> None:
    target = ROOT / "assets" / "badges"
    target.mkdir(parents=True, exist_ok=True)
    for locale in ("en", "fr"):
        (target / f"profile-views-{locale}.svg").write_text(badge(count, locale))


def main() -> None:
    request = Request(ENDPOINT, headers={"User-Agent": "tacxou-profile-badges"})
    last_error = None
    for _ in range(2):
        try:
            with urlopen(request, timeout=30) as response:
                if response.headers.get_content_type() != "image/svg+xml":
                    raise ValueError("Counter did not return an SVG")
                count = parse_count(response.read(100_001))
            save_badges(count)
            print("Updated the English and French profile-view badges.")
            return
        except Exception as error:
            last_error = error
    raise RuntimeError("Counter unavailable; the last published badges were kept.") from last_error


if __name__ == "__main__":
    main()
