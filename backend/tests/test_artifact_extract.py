from zipfile import ZipFile

from services.artifact_extract import extract_artifact_pages
from services.pdf_upload import SUPPORTED_EXTENSIONS


def test_pptx_extracts_each_slide_as_a_page(tmp_path):
    path = tmp_path / "brief.pptx"
    slide = """<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Quarterly update</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>"""
    with ZipFile(path, "w") as archive:
        archive.writestr("ppt/slides/slide1.xml", slide)

    pages = extract_artifact_pages(path)

    assert pages[0]["title"] == "Slide 1"
    assert pages[0]["text"] == "Quarterly update"


def test_xlsx_extracts_shared_strings_and_sheet_names(tmp_path):
    path = tmp_path / "budget.xlsx"
    workbook = """<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets>
    </workbook>"""
    relationships = """<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
    </Relationships>"""
    shared_strings = """<?xml version="1.0" encoding="UTF-8"?>
    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <si><t>Revenue</t></si>
    </sst>"""
    worksheet = """<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1250</v></c></row></sheetData>
    </worksheet>"""
    with ZipFile(path, "w") as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/sharedStrings.xml", shared_strings)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)

    pages = extract_artifact_pages(path)

    assert pages[0]["title"] == "Budget"
    assert pages[0]["text"] == "Revenue | 1250"


def test_modern_office_formats_are_accepted_for_upload():
    assert {".docx", ".pptx", ".xlsx", ".csv"}.issubset(SUPPORTED_EXTENSIONS)
