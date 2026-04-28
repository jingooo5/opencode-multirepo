mkdir -p src/repomap/tags/wasm
# 예시: TypeScript, Go, Python, Rust
for lang in typescript go python rust; do
  curl -L -o "src/repomap/tags/wasm/${lang}.wasm" \
    "https://github.com/tree-sitter/tree-sitter-${lang}/releases/latest/download/tree-sitter-${lang}.wasm"
done