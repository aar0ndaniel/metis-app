# metis — Color System

The palette is wooded, scholarly, warm, and restrained. It lives on `#181818` dark surfaces.

---

## Core Palette

| Token | Hex | Role | Contrast vs `#181818` |
|---|---|---|---:|
| `Night Soil` | `#181818` | app background | 1.00 |
| `Parchment Light` | `#F5F1E7` | primary text | 15.74 |
| `Field Note` | `#C8C1AE` | secondary text, labels | 9.89 |
| `Canopy Light` | `#AAB68A` | soft success, positive states | 8.26 |
| `metis Moss` | `#87976B` | trust accent, secondary, selected states | 5.64 |
| `Deep Leaf` | `#6F7D58` | large text only, strong icon accents | 4.02 |
| `Wattle Gold` | `#C6A24B` | primary accent, CTA background | 7.33 |
| `Seed Gold` | `#B7923F` | secondary accent, chart highlight | 6.09 |
| `Bloom Highlight` | `#D3B85F` | rare emphasis only | 9.12 |
| `Bark Bronze` | `#8E6D49` | borders, chips, separators | 3.75 |
| `Understory` | `#454C3D` | tinted nested surfaces only | 1.99 |

---

## Brand & Accent Colors (DO NOT neutralize)

| Token | Hex | Usage |
|---|---|---|
| Primary | `#C6A24B` | Buttons, active states, highlights |
| Secondary | `#87976B` | Selected states, trust accent, charts |
| Success | `#32D583` | Dataset CSV icon, missing-value badges |
| Danger | `#D96B4D` | Delete actions, close button hover, warnings |

### Workspace Color Swatches (user-assignable)
`#C6A24B` · `#A78BFA` · `#FFB547` · `#32D583` · `#6366F1` · `#60A5FA` · `#F97316` · `#E879F9`

---

## Semantic Token Mapping

### Base UI
- `--bg-app: #181818`
- `--bg-tint: #454C3D`
- `--text-primary: #F5F1E7`
- `--text-secondary: #C8C1AE`
- `--border-muted: #8E6D49`

### Accent System
- `--accent-primary: #C6A24B`
- `--accent-primary-hover: #B7923F`
- `--accent-secondary: #87976B`
- `--accent-positive: #AAB68A`

### CSS Custom Properties (index.css)
- `--color-accent: #C6A24B` (dark) / `#87976B` (light)
- `--color-text-primary: #F5F1E7` (dark)
- `--color-text-secondary: #C8C1AE` (dark)

---

## Chart / Data-Viz Order

1. `#C6A24B`
2. `#87976B`
3. `#C8C1AE`
4. `#B7923F`
5. `#AAB68A`
6. `#8E6D49`

Reserve `#D3B85F` for threshold moments or selected state emphasis only.

---

## Usage Ratios

- 70% dark neutrals
- 20% paper-like text and muted neutrals
- 10% accent color

---

## Neutral Gray Scale (all surfaces, text, borders)

### Backgrounds
| Hex | Usage |
|---|---|
| `#161616` | Active workspace expanded background |
| `#181818` | **App page background** (main bg behind all panels) |
| `#1A1A1A` | Input backgrounds |
| `#1E1E1E` | Elevated surfaces |
| `#202020` | Surface / panel background |
| `#262626` | Workspace expanded |
| `#282828` | Menu background, hover states |
| `#3A3A3A` | Borders |
| `#454C3D` | Tinted nested surfaces (Understory) |

### Optional Reserve Colors
| Token | Hex | Suggested Use | Contrast vs `#181818` |
|---|---|---|---:|
| `Signal Clay` | `#D96B4D` | warning / destructive emphasis | 5.21 |
| `Slate Iris` | `#7E89B7` | neutral info state | 5.20 |
