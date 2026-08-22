# Curated knowledge base

Add one JSON object per line to `curated.jsonl` with `id`, `title`, `text`, and
an optional `source`, `url`, or `metadata` field. The chat retriever combines
BM25 lexical scores with dense sentence-transformer similarity, then applies an
optional cross-encoder reranker to the candidate set.

Set `CURATED_KB_PATH` to point at another JSON or JSONL file. Keep this corpus
reviewed and versioned; it is an answer source, not arbitrary user content.
