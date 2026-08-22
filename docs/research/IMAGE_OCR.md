# Chat image OCR

Kontext accepts PNG, JPG, WebP, BMP, and TIFF images from the file picker or
clipboard. The browser shows a local thumbnail immediately, then sends the image
to the authenticated `/api/ocr/image` endpoint. Extracted text is attached to the
model request as untrusted document context rather than displayed as user-authored
text.

## Provider choice

- `OCR_PROVIDER=auto` uses PaddleOCR-VL when its optional runtime is installed,
  then falls back to Tesseract.
- `OCR_PROVIDER=tesseract` is the smallest CPU-first deployment. It is suitable
  for screenshots and plain documents, but it does not reconstruct complex
  tables, charts, or formula layout.
- `OCR_PROVIDER=paddleocr-vl` requires the structured VLM parser. Kontext targets
  PaddleOCR-VL 1.6, the current 0.9B revision, because it retains the compact model
  size while improving document, table, formula, chart, seal, and multilingual
  parsing.

PaddleOCR recommends isolating its document parser runtime and using a dedicated
inference service for production concurrency. Kontext therefore keeps it out of
the base backend requirements and loads it only when an image needs OCR.

Official references:

- https://github.com/PaddlePaddle/PaddleOCR
- https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/PaddleOCR-VL.html
- https://arxiv.org/abs/2606.03264

## Setup

The lightweight path needs Tesseract installed on the host. Set `TESSERACT_CMD`
when the executable is not on `PATH`.

For PaddleOCR-VL, create a dedicated environment and follow the engine-specific
installation command in the official documentation. The project dependency list
is in `backend/requirements-ocr-vl.txt`. After installation:

```env
OCR_PROVIDER=paddleocr-vl
PADDLEOCR_DEVICE=cpu
PADDLEOCR_PIPELINE_VERSION=v1.6
```

Use the matching GPU device in deployments with a supported accelerator. The
first local run downloads model files, so production images should warm or cache
the model before serving traffic.
