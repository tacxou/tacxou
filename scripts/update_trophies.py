#!/usr/bin/env python3
"""Refresh the profile's trophy images, preserving the last good set on failure."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://hacked-github-stat-trophies.flyn-nick.vercel.app/"
GROUPS = {
    "activity": ("Commit", "Issues", "PullRequest"),
    "community": ("Followers", "Repositories", "Stars"),
}
THEMES = {"dark": "onedark", "light": "flat"}
MAX_BYTES = 1_000_000


def validate_svg(data: bytes, titles: tuple[str, ...]) -> None:
    """Reject service errors, incomplete cards and active SVG content."""
    if len(data) > MAX_BYTES or b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("Invalid SVG size or document declaration")
    svg = ET.fromstring(data)
    if svg.tag != "{http://www.w3.org/2000/svg}svg":
        raise ValueError("Response is not an SVG")
    if svg.attrib.get("viewBox") != "0 0 350 110":
        raise ValueError("Unexpected trophy layout")
    texts = {
        "".join(node.itertext()).strip()
        for node in svg.iter()
        if node.tag.rsplit("}", 1)[-1] == "text"
    }
    if not set(titles).issubset(texts):
        raise ValueError("One or more expected trophies are missing")
    if {"AllSuperRank", "MultiLanguage"} & texts:
        raise ValueError("Unexpected secret trophy")
    for node in svg.iter():
        if node.tag.rsplit("}", 1)[-1].lower() in {"script", "foreignobject", "image"}:
            raise ValueError("Unexpected active or external SVG content")
        for key, value in node.attrib.items():
            key = key.rsplit("}", 1)[-1].lower()
            if key.startswith("on") or (key in {"href", "src"} and not value.startswith("#")):
                raise ValueError("Unexpected SVG event handler or external reference")
        if "url(" in (node.text or "").lower():
            raise ValueError("Unexpected external style reference")


def fetch_card(item: tuple[str, str]) -> tuple[Path, bytes]:
    group, mode = item
    titles = GROUPS[group]
    # This legacy endpoint also offers automatically unlocked secret trophies.
    # Explicitly request only the six base trophies calculated from GitHub data.
    params = urlencode({
        "username": "tacxou",
        "theme": THEMES[mode],
        "title": ",".join(titles),
        "column": 3,
        "row": 1,
        "margin-w": 10,
    })
    request = Request(f"{ENDPOINT}?{params}", headers={"User-Agent": "tacxou-profile-trophies"})
    with urlopen(request, timeout=30) as response:
        if response.headers.get_content_type() != "image/svg+xml":
            raise ValueError("Generator did not return an SVG image")
        data = response.read(MAX_BYTES + 1)
    validate_svg(data, titles)
    return ROOT / "assets" / f"trophies-{group}-{mode}.svg", data


def main() -> None:
    cards = [(group, mode) for group in GROUPS for mode in THEMES]
    # Complete and validate every request before replacing any checked-in image.
    with ThreadPoolExecutor(max_workers=4) as pool:
        rendered = list(pool.map(fetch_card, cards))
    for path, data in rendered:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        print(f"Updated {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
