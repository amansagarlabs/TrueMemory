"""Text extraction for supported Kontext artifact formats."""

from __future__ import annotations

import csv
import json
import re
import time
import zipfile
from io import StringIO
from pathlib import Path
from xml.etree import ElementTree

from bs4 import BeautifulSoup
from services.pdf_pages import extract_pages as extract_pdf_pages
from services.text_normalize import normalize_pdf_text

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".py", ".js", ".jsx", ".ts", ".tsx", ".css",
    ".scss", ".sql", ".yaml", ".yml", ".xml", ".toml", ".ini", ".log", ".java",
    ".go", ".rs", ".c", ".h", ".cpp", ".hpp", ".sh", ".ps1",
}

WORD_NAMESPACE = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DRAWING_NAMESPACE = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
SPREADSHEET_NAMESPACE = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
OFFICE_RELATIONSHIP_NAMESPACE = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PACKAGE_RELATIONSHIP_NAMESPACE = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _natural_number(path: str) -> int:
    match = re.search(r"(\d+)(?=\.xml$)", path)
    return int(match.group(1)) if match else 0


def _page(page: int, text: str, title: str | None = None) -> dict:
    normalized = normalize_pdf_text(text)
    return {
        "page": page,
        "title": title,
        "text": normalized,
        "char_count": len(normalized),
        "preview": normalized[:280] + ("…" if len(normalized) > 280 else ""),
    }


def _extract_pptx_pages(path: Path) -> list[dict]:
    pages: list[dict] = []
    with zipfile.ZipFile(path) as archive:
        slide_paths = sorted(
            (
                name
                for name in archive.namelist()
                if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)
            ),
            key=_natural_number,
        )
        for index, slide_path in enumerate(slide_paths, start=1):
            root = ElementTree.fromstring(archive.read(slide_path))
            text = "\n".join(
                value
                for node in root.iter(f"{DRAWING_NAMESPACE}t")
                if (value := (node.text or "").strip())
            )
            pages.append(_page(index, text, f"Slide {index}"))
    return pages


def _extract_xlsx_pages(path: Path) -> list[dict]:
    pages: list[dict] = []
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.iter(f"{SPREADSHEET_NAMESPACE}si"):
                shared_strings.append("".join(node.text or "" for node in item.iter(f"{SPREADSHEET_NAMESPACE}t")))

        workbook_root = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        relationships_root = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relationship_targets = {
            relationship.attrib.get("Id", ""): relationship.attrib.get("Target", "")
            for relationship in relationships_root.iter(f"{PACKAGE_RELATIONSHIP_NAMESPACE}Relationship")
        }

        for index, sheet in enumerate(workbook_root.iter(f"{SPREADSHEET_NAMESPACE}sheet"), start=1):
            relationship_id = sheet.attrib.get(f"{OFFICE_RELATIONSHIP_NAMESPACE}id", "")
            target = relationship_targets.get(relationship_id, "")
            worksheet_path = target.lstrip("/")
            if not worksheet_path.startswith("xl/"):
                worksheet_path = f"xl/{worksheet_path}"
            if worksheet_path not in archive.namelist():
                continue

            worksheet_root = ElementTree.fromstring(archive.read(worksheet_path))
            rows: list[str] = []
            for row in worksheet_root.iter(f"{SPREADSHEET_NAMESPACE}row"):
                values: list[str] = []
                for cell in row.iter(f"{SPREADSHEET_NAMESPACE}c"):
                    cell_type = cell.attrib.get("t")
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter(f"{SPREADSHEET_NAMESPACE}t"))
                    else:
                        value_node = cell.find(f"{SPREADSHEET_NAMESPACE}v")
                        value = (value_node.text or "") if value_node is not None else ""
                        if cell_type == "s" and value.isdigit():
                            shared_index = int(value)
                            value = shared_strings[shared_index] if shared_index < len(shared_strings) else value
                    values.append(value.strip())
                rows.append(" | ".join(values).rstrip())

            sheet_name = sheet.attrib.get("name") or f"Sheet {index}"
            pages.append(_page(index, "\n".join(rows), sheet_name))
    return pages


def extract_artifact_pages(path: Path) -> list[dict]:
    extension = path.suffix.lower()
    if extension == ".pdf":
        return extract_pdf_pages(path)
    if extension == ".pptx":
        return _extract_pptx_pages(path)
    if extension == ".xlsx":
        return _extract_xlsx_pages(path)
    if extension == ".docx":
        with zipfile.ZipFile(path) as archive:
            document_xml = archive.read("word/document.xml")
        root = ElementTree.fromstring(document_xml)
        paragraphs = []
        for paragraph in root.iter(f"{WORD_NAMESPACE}p"):
            value = "".join(node.text or "" for node in paragraph.iter(f"{WORD_NAMESPACE}t")).strip()
            if value:
                paragraphs.append(value)
        text = "\n\n".join(paragraphs)
    elif extension in {".html", ".htm"}:
        text = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "lxml").get_text("\n", strip=True)
    elif extension == ".json":
        raw = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        text = json.dumps(raw, indent=2, ensure_ascii=False)
    elif extension == ".csv":
        rows = csv.reader(StringIO(path.read_text(encoding="utf-8-sig", errors="replace")))
        text = "\n".join(" | ".join(cell.strip() for cell in row) for row in rows)
    elif extension in TEXT_EXTENSIONS:
        text = path.read_text(encoding="utf-8", errors="replace")
    else:
        raise ValueError(f"Extraction is not available for {extension or 'this file type'}")

    return [_page(1, text)]


def extract_artifact_text(path: Path) -> dict:
    start = time.perf_counter()
    pages = extract_artifact_pages(path)
    return {
        "page_count": len(pages),
        "total_chars": sum(page["char_count"] for page in pages),
        "pages": pages,
        "duration_ms": round((time.perf_counter() - start) * 1000, 2),
    }
