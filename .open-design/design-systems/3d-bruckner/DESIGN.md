# Design System Inspired by 3D Bruckner

> Category: Craft & Small Business
> White paper, graphite ink and one raspberry accent; Archivo headings over Hanken Grotesk text; the printed objects in the photos carry the colour.

## Color Palette
- Paper `#ffffff`: the page. Surface `#f5f5f6`: grouped sections, photo wells, sheets.
- Ink `#15171c`: text and icons. Muted `#5a606c`: hints, counts, metadata.
- Border `#e2e4e9`: separators and card edges. Line `#868c98`: a control's edge (inputs, secondary buttons), 3:1 on paper.
- Accent `#c2305e` (hover `#a3264d`, text on it `#ffffff`): the one thing to do on a screen (Save, Publish, New print) and the focus ring. Never decoration.
- Danger `#b42318`: deleting, only in a confirm step or a danger area at the end.
- Success `#1f7a4d`: "published", "saved".
- Dark: paper `#0f1115`, surface `#181b21`, ink `#f0eee9`, muted `#a6a9b1`, border `#2b2f38`, line `#727987`, accent `#f27d9d` with `#1b0a11` on it.

## Typography
- Display: Archivo, 700, tight tracking (-0.02em), for screen titles (28px) and section heads (17px, 700).
- Body: Hanken Grotesk, 400/500/600; 16px base on phones (never below, so iOS doesn't zoom inputs), 14px hints, 12px chips.
- Numbers (weight, time, price) in tabular figures.

## Voice & Tone
Short, plain, like a workshop label: "Fotos hinzufügen", "Aus 3MF-Datei ausfüllen". Say what happens, not how. German first; English equal.

## Imagery & Iconography
Photos of the prints are the colour: square thumbnails with 12px corners on a surface well. Icons: lucide, 1.75 stroke, 20px, always next to a word except in a tab bar.

## Layout & Spacing
Phone first at 390px with 16px gutters and safe areas. 8px grid. Sections are grouped cards on the surface colour (12px radius, hairline border) with a 17px head; numbers sit in a two-column grid. Primary actions live in a sticky bottom bar; navigation in a bottom tab bar. Touch targets ≥ 44px. Radius: 8px controls, 12px cards, pill chips.

## Agent Prompt Guide
Build calm phone screens: paper background, grouped surface cards, Archivo titles, Hanken body, one raspberry primary action per screen in a sticky bar, a bottom tab bar, photos as the only colour. Keep danger actions out of the main flow.
