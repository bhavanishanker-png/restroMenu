# Diagram images

PNGs rendered from the Mermaid sources in `src/` (the same code that sits in a collapsible "Mermaid source" block under each image in `docs/architecture.md` and `docs/uml.md`).

To regenerate after editing a diagram, update both the `.mmd` file and the block in the doc, then run from the repo root:

```bash
for f in docs/diagrams/src/*.mmd; do
  npx -y @mermaid-js/mermaid-cli@11.12.0 -i "$f" -o "docs/diagrams/$(basename "$f" .mmd).png" -b white -s 2 -w 1600
done
```
