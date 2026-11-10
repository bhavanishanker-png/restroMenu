# Menu import eval

Measures how accurately AI menu import (`POST /api/ai/menu-extract`) reads real menus, and how much the code guardrails in `reconcileDraft` change the result.

Extraction goes through `src/lib/ai/menu-extract.ts`, the same function the production route calls. That means the numbers describe the shipped prompt, schema and model.

## Run it

```bash
npm run eval:menu                 # extract uncached cases, then score all of them
npm run eval:menu -- --bootstrap  # draft label files for photos that have none
npm run eval:menu -- --case 03-udupi
npm run eval:menu -- --fresh      # re-extract everything (API cost)
```

`ANTHROPIC_API_KEY` is read from `.env.local`. Model outputs are cached in `results/`, keyed on the photo, prompt, schema and model. Re-scoring after you fix a label is free. Changing the prompt or model re-extracts automatically.

Output goes to `report.md` (summary, per-menu table, every veg false positive, missed and extra dishes) and `report.json`.

## Add a case

1. Put the photo or PDF in `cases/`, named `<id>.<ext>`, e.g. `03-udupi.jpg`.
2. Run `npm run eval:menu -- --bootstrap`. This writes `cases/03-udupi.draft.json` with the model's dish names and prices.
3. With the photo open, fix the draft:
   - Correct every name and price. Add dishes the model missed and delete dishes it invented.
   - Fill in every `foodType` **yourself**. Bootstrap leaves it as `"TODO"` on purpose, so the model's guess can't anchor you on the field this eval cares about most.
   - Set `hasVegMarkers` and `source`.
4. Rename the file to `cases/03-udupi.json`. Files still containing `TODO` are skipped and the report explains why.

## Label rules

```json
{
  "source": "Photo taken at X, Oct 2026",
  "hasVegMarkers": true,
  "dishes": [
    { "name": "Paneer Tikka", "price": 220, "foodType": "veg" },
    { "name": "Dal Makhani", "price": 160, "foodType": "veg" },
    { "name": "Chef's Special Cutlet", "price": 150, "foodType": "non_veg" }
  ]
}
```

| Field | Rule |
|---|---|
| `name` | As printed. Small spelling slips by the model still match (similarity ≥ 0.85). |
| `price` | As printed, no currency symbol. If there are several sizes, use the **lowest** (the pipeline's convention). `null` if no price is printed. |
| `foodType` | The dish's **true** type, `veg` / `non_veg` / `egg`, not only what's printed. Ask the restaurant or check the dish. `null` if you genuinely don't know; such dishes are left out of food-type metrics. |
| `hasVegMarkers` | `true` if the menu prints veg/non-veg symbols or labels. Food-type coverage depends heavily on this. |

## Choosing the 10–15 menus

The set is only useful if it includes hard cases. Aim for a mix of:
- With and without printed veg/non-veg markers
- Ambiguous dish names (Manchurian, cutlet, momos, "chef's special", kebab platters)
- Egg dishes (the third class is easy to get wrong)
- Half/Full or size-based pricing, and dishes with no price ("market price")
- A poor photo: angled, glare, folded, low light
- A multi-column or multi-page PDF
- A Hindi or regional-language menu

## What the metrics mean

Every metric is reported twice: for the **raw model** output, and **after the code gate** (the draft the owner actually sees).

- **Dish precision / recall**: extracted dishes that are real / real dishes that were extracted.
- **Price accuracy**: printed prices extracted exactly right. **Price precision** ignores abstentions (`null`), and **invented prices** counts prices given where none is printed.
- **Food-type coverage**: share of dishes given any type. The rest are left for the owner to set, at the cost of one tap each.
- **Veg false-positive rate**: non-veg and egg dishes shown as veg, divided by all non-veg and egg dishes. This is the food-safety error, and the gate (veg only from a printed marker) exists to keep it at zero. The gap between the raw and gated columns is the gate's measured effect. The loss in coverage is its cost.

## Limits

- One run per menu. Model output varies between runs, so before quoting small differences, re-run with `--fresh` and check the numbers are stable.
- Duplicate detection against an existing menu isn't measured; the eval uses an empty catalog.
- The labels are only as good as your knowledge of each dish's true food type.
