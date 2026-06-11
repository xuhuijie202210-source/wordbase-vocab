from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path("/Users/redamancy/Documents/Codex")
OUT = Path("/Users/redamancy/Documents/Codex/2026-06-10/github/outputs/vocab-app/vocab-data.js")

BOOKS = [
    {
        "id": "b1",
        "title": "必修第一册",
        "grade": "高一",
        "pdf": ROOT / "译林版·英语_高一年级_必修第一册.pdf",
        "pages": (108, 114),
        "units": [
            "Unit 1 Back to school",
            "Unit 2 Let's talk teens",
            "Unit 3 Getting along with others",
            "Unit 4 Looking good, feeling good",
        ],
    },
    {
        "id": "b2",
        "title": "必修第二册",
        "grade": "高一",
        "pdf": ROOT / "译林版·英语_高一年级_必修第二册.pdf",
        "pages": (109, 114),
        "units": [
            "Unit 1 Lights, camera, action!",
            "Unit 2 Be sporty, be healthy",
            "Unit 3 Festivals and customs",
            "Unit 4 Exploring literature",
        ],
    },
    {
        "id": "b3",
        "title": "必修第三册",
        "grade": "高一",
        "pdf": ROOT / "译林版·英语_高一年级_必修第三册 2.pdf",
        "pages": (109, 115),
        "units": [
            "Unit 1 Nature in the balance",
            "Unit 2 Natural disasters",
            "Unit 3 The world online",
            "Unit 4 Scientists who changed the world",
        ],
    },
    {
        "id": "x1",
        "title": "选择性必修第一册",
        "grade": "高二",
        "pdf": ROOT / "译林版·英语_高二年级_选择性必修第一册 2.pdf",
        "pages": (105, 112),
        "units": [
            "Unit 1 Food matters",
            "Unit 2 The universal language",
            "Unit 3 The art of painting",
            "Unit 4 Exploring poetry",
        ],
    },
    {
        "id": "x2",
        "title": "选择性必修第二册",
        "grade": "高二",
        "pdf": ROOT / "译林版·英语_高二年级_选择性必修第二册.pdf",
        "pages": (107, 113),
        "units": [
            "Unit 1 The mass media",
            "Unit 2 Sports culture",
            "Unit 3 Fit for life",
            "Unit 4 Living with technology",
        ],
    },
    {
        "id": "x3",
        "title": "选择性必修第三册",
        "grade": "高二",
        "pdf": ROOT / "译林版·英语_高二年级_选择性必修第三册.pdf",
        "pages": (104, 110),
        "units": [
            "Unit 1 Wish you were here",
            "Unit 2 Out of this world",
            "Unit 3 Back to the past",
            "Unit 4 Protecting our heritage sites",
        ],
    },
    {
        "id": "x4",
        "title": "选择性必修第四册",
        "grade": "高二",
        "pdf": ROOT / "译林版·英语_高二年级_选择性必修第四册.pdf",
        "pages": (110, 115),
        "units": [
            "Unit 1 Honesty and responsibility",
            "Unit 2 Understanding each other",
            "Unit 3 Careers and skills",
            "Unit 4 Never too old to learn",
        ],
    },
]

UNIT_RE = re.compile(r"\bUnit\s+([1-4])\b")
PAGE_REF_RE = re.compile(r"\(\s*\d+\s*\)")
CHINESE_RE = re.compile(r"[\u3400-\u9fff]")
POS_RE = re.compile(
    r"\b(?:abbr|adj|adv|conj|det|linking v|modal v|n|num|prep|pron|vi|vt|v)\.?"
)


def clean_text(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("\u2006", " ")
    text = text.replace("\t", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


def strip_unit_prefix(text: str) -> tuple[int | None, str]:
    found = None

    def repl(match: re.Match[str]) -> str:
        nonlocal found
        found = int(match.group(1))
        return " "

    cleaned = UNIT_RE.sub(repl, text)
    return found, cleaned


def chunk_entries(text: str) -> list[str]:
    entries = []
    last = 0
    for match in PAGE_REF_RE.finditer(text):
        chunk = text[last : match.start()].strip()
        last = match.end()
        if chunk:
            entries.append(chunk)
    return entries


def split_phonetic(text: str) -> tuple[str, str, str] | None:
    first = text.find("/")
    if first < 1:
        return None
    second = text.find("/", first + 1)
    if second < 0:
        return None
    return text[:first].strip(), text[first : second + 1].strip(), text[second + 1 :].strip()


def parse_entry(raw: str, source: str, book_id: str, unit_no: int, index: int) -> dict | None:
    text = clean_text(raw)
    text = re.sub(r"^[A-Z]\s+\|?\s*", "", text)
    text = text.lstrip("* ").strip()
    text = re.sub(r"^\d{2,3}\s+", "", text).strip()
    if not text or len(text) < 3:
        return None
    if text.startswith(("说明", "Base form", "Irregular verbs", "Grammar notes")):
        return None

    phonetic = ""
    part = ""
    item_type = "短语"
    phonetic_split = split_phonetic(text)

    if phonetic_split:
        term, phonetic, rest = phonetic_split
        item_type = "单词"
        term = clean_term(term)
        first_zh = CHINESE_RE.search(rest)
        if first_zh:
            part = clean_text(rest[: first_zh.start()])
            meaning = clean_text(rest[first_zh.start() :])
        else:
            meaning = clean_text(rest)
        pos_match = POS_RE.search(part)
        if pos_match and len(part) > 60:
            part = part[: pos_match.end()]
    else:
        first_zh = CHINESE_RE.search(text)
        if not first_zh:
            return None
        term = clean_term(text[: first_zh.start()])
        meaning = clean_text(text[first_zh.start() :])
        part = "短语"

    if not term or not meaning:
        return None
    if len(term) > 80 or len(meaning) > 220:
        meaning = meaning[:220].rstrip() + "..."
    if re.fullmatch(r"[A-Z]", term):
        return None

    safe_id = re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")[:48] or f"item-{index}"
    return {
        "id": f"{book_id}-u{unit_no}-{index:03d}-{safe_id}",
        "term": term,
        "phonetic": phonetic,
        "meaning": meaning,
        "partOfSpeech": clean_text(part)[:80],
        "source": source,
        "example": "",
        "type": item_type,
        "importance": "高频" if item_type == "短语" else "普通",
    }


def clean_term(term: str) -> str:
    term = clean_text(term)
    term = term.replace("|", " ")
    term = re.sub(r"^[*•\s]+", "", term)
    term = re.sub(r"\s+", " ", term)
    return term.strip(" ;,（(")


def extract_book(config: dict) -> dict:
    reader = PdfReader(str(config["pdf"]))
    units = [
        {"id": f"{config['id']}-u{i + 1}", "title": title, "status": "已发布", "words": []}
        for i, title in enumerate(config["units"])
    ]
    current_unit = 1
    counters = {1: 0, 2: 0, 3: 0, 4: 0}

    start, end = config["pages"]
    for printed_page in range(start, end + 1):
        text = reader.pages[printed_page - 1].extract_text() or ""
        text = clean_text(text)
        for chunk in chunk_entries(text):
            unit_found, chunk = strip_unit_prefix(chunk)
            if unit_found:
                current_unit = unit_found
            if not 1 <= current_unit <= 4:
                continue
            counters[current_unit] += 1
            source = f"{config['title']} Unit {current_unit}"
            item = parse_entry(chunk, source, config["id"], current_unit, counters[current_unit])
            if item:
                units[current_unit - 1]["words"].append(item)

    return {
        "id": config["id"],
        "title": config["title"],
        "grade": config["grade"],
        "units": units,
    }


def main() -> None:
    libraries = [extract_book(book) for book in BOOKS]
    summary = []
    for book in libraries:
        summary.append(
            {
                "title": book["title"],
                "units": [
                    {"title": unit["title"], "count": len(unit["words"])}
                    for unit in book["units"]
                ],
                "total": sum(len(unit["words"]) for unit in book["units"]),
            }
        )

    OUT.write_text(
        "window.seedLibraries = "
        + json.dumps(libraries, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
