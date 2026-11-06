# Diagram images

Mermaid sources for every diagram are in `src/`. Only the three PNGs shown in the top-level README are committed (`system-context`, `sequence-place-order`, `er-data-model`). The other PNGs are git-ignored; GitHub draws those diagrams straight from the Mermaid blocks in `docs/uml.md` (all UML diagrams) and `docs/architecture.md` (system context, ER, and copies of the order state machine and diner/kitchen sequences).

To regenerate after editing a diagram, update both the `.mmd` file and the block in the doc, then run from the repo root:

```bash
for f in docs/diagrams/src/*.mmd; do
  npx -y @mermaid-js/mermaid-cli@11.12.0 -i "$f" -o "docs/diagrams/$(basename "$f" .mmd).png" -b white -s 2 -w 1600
done
```
