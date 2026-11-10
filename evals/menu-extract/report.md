# Menu import eval

Generated 2026-11-10T06:04:53.388Z · model `claude-opus-5-5` · 10 menus · 270 labelled dishes · name-match threshold 0.85

Micro-averaged over all dishes. *Raw model* is the structured output before code checks; *after code gate* is the draft the owner sees (reconcileDraft).

| Metric | Raw model | After code gate (shipped) |
|---|---|---|
| Dish precision | 100.0% | 100.0% |
| Dish recall | 95.9% | 95.9% |
| Dish F1 | 97.9% | 97.9% |
| Price accuracy (correct ÷ printed) | 98.1% | 98.1% |
| Price precision (correct ÷ given) | 98.1% | 98.1% |
| Invented prices (none printed) | 0 | 0 |
| Food-type coverage | 57.4% | 53.3% |
| Food-type accuracy when set | 100.0% | 100.0% |
| Veg precision | 100.0% | 100.0% |
| Veg recall | 44.0% | 37.7% |
| **Veg false-positive rate** | 0.0% | 0.0% |
| **Veg false positives (count)** | 0 | 0 |

Median extraction time 25.9s · 36587 input / 33458 output tokens in total.

## Per menu (after code gate)

| Menu | Veg markers | Status | Dishes P / R | Price acc. | Food coverage | Veg FP (raw → gated) |
|---|---|---|---|---|---|---|
| menu-01 | no | ok | 100.0% / 92.9% | 61.5% | 30.8% | 0 → 0 |
| menu-02 | no | ok | 100.0% / 100.0% | 100.0% | 46.2% | 0 → 0 |
| menu-03 | no | ok | 100.0% / 80.8% | 100.0% | 17.1% | 0 → 0 |
| menu-07 | no | ok | 100.0% / 100.0% | 100.0% | 28.6% | 0 → 0 |
| menu-08 | no | ok | 100.0% / 100.0% | 100.0% | 0.0% | 0 → 0 |
| menu-09 | no | ok | 100.0% / 100.0% | 100.0% | 64.7% | 0 → 0 |
| menu-11 | yes | ok | 100.0% / 100.0% | 100.0% | 100.0% | 0 → 0 |
| menu-13 | yes | ok | 100.0% / 100.0% | 100.0% | 71.4% | 0 → 0 |
| menu-14 | no | ok | 100.0% / 100.0% | 100.0% | 0.0% | 0 → 0 |
| menu-15 | no | ok | 100.0% / 100.0% | 100.0% | 66.1% | 0 → 0 |

## Veg false positives

Non-veg or egg dishes labelled veg. These are the errors the printed-marker rule exists to stop.

None, raw or gated.

## Dish-level misses

**menu-01**
- Missed (in label, not extracted): Bread Omlate

**menu-03**
- Missed (in label, not extracted): Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan, Chicken Parmesan

