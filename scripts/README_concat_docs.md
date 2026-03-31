scripts/concat_docs.py — combine docs into a single markdown file ✅

Usage examples:

- Default (reads `docs/`, writes `docs/combined_docs.md`):

  python scripts/concat_docs.py

- Include filenames and strip YAML frontmatter:

  python scripts/concat_docs.py --include-filenames --strip-frontmatter

Options:
- --docs: path to docs directory (default: docs)
- --output: output file (default: docs/combined_docs.md)
- --include-filenames: add a small heading before each file's content
- --strip-frontmatter: remove YAML frontmatter from each file before concatenation
- --extensions: comma-separated list of extensions to include (default: .md,.mdx,.markdown)

Note: the script skips the output file if it would be read back in during traversal.