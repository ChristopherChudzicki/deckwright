# Footer Tags Implementation Plan

> **Post-review revisions (applied during execution):** The task pseudocode below was superseded by review feedback. The landed shape on the `footer-tags` branch differs in five ways:
>
> 1. **Enter is the sole commit key.** The `e.key === ","` branch was removed from `TagInput` so values like `"5,000 gp"` can be typed without the comma triggering a chip commit.
> 2. **Migration splits on `·` only.** The data-migration regex is `'\s*·\s*'` (not `'\s*[,·]\s*'`) — splitting on `,` would corrupt thousands-comma values.
> 3. **TagGroup uses a fixed `aria-label="Tags"`.** The caller's `aria-label`/`aria-labelledby` is forwarded to the inner `<input>` only, so screen readers don't double-announce the field label when entering the chip list.
> 4. **`.list` is a real flex container.** It uses `display: flex; flex-wrap: wrap; align-items: center; gap` instead of `display: contents` so RAC's `role="grid"` semantics are preserved across browsers/AT.
> 5. **Zod defaults `footerTags` to `[]`.** `z.array(z.string()).default([])` so legacy deck JSON exports (which lack the field) remain importable. The DB constraint stays strictly `required`; the SQL migration backfills `[]` for rows missing the key.
>
> Original Task pseudocode is preserved unchanged below as historical record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the item card's freeform `costWeight: string` field with a `footerTags: string[]` chip-input, so users can enter multiple short labels (cost, weight, rarity, attunement, etc.) that the card footer renders separated by `·`.

**Architecture:** Rename `ItemCard.costWeight?: string` → `ItemCard.footerTags: string[]` end-to-end (TS type, Zod, JSON-Schema-on-DB, factories, e2e fixtures). Build a new `TagInput` primitive in `src/lib/ui/` composed from `react-aria-components`' `TagGroup` + a trailing `<input>`: typing + Enter (or comma) commits a chip; clicking the per-tag `×` (or pressing Backspace on an empty input) removes one. The card footer (and its measurer twin) renders tags as a single `tags.join(" · ")` span — visually identical to the prior single-string format. A SQL migration splits any existing `costWeight` strings on `,` and `·` and rewrites them into `footerTags` arrays.

**Tech Stack:** React 19 + TypeScript, react-aria-components 1.17, Zod 4, Vitest + RTL + user-event, Fishery + faker, Playwright, Supabase migrations + pg_jsonschema.

**Reference background:** Conversation in this branch (no separate spec). The chosen UX is "delete chip and retype to edit" — no inline tag editing in v1. No autocomplete suggestions.

**Reusability note:** `TagInput` is a *generic* primitive in `src/lib/ui/` and is expected to be reused elsewhere (the card header is the next likely consumer). It must not bake in any item-card-specific assumptions — no hard-coded labels, no domain placeholder text inside the component itself. Follow the conventions in `src/lib/ui/README.md` (CSS-module styling using screen tokens, RAC primitives under the hood, `className?: string` accepted on the outer element, tests via `getByRole`).

---

## File map

**Create:**
- `src/lib/ui/TagInput.tsx` — controlled chip-input primitive
- `src/lib/ui/TagInput.module.css` — styles
- `src/lib/ui/TagInput.test.tsx` — tests
- `supabase/migrations/<timestamp>_rename_costweight_to_footertags.sql` — data migration + JSON-Schema constraint refresh

**Modify:**
- `src/cards/types.ts` — `costWeight?: string` → `footerTags: string[]`
- `src/decks/schema.ts` — Zod equivalent
- `supabase/schemas/card-payload.json` — regenerated via `npm run gen:schema`
- `src/cards/factories.ts` — produce a 2-element `footerTags`
- `src/cards/Card.tsx` — render `footerTags.join(" · ")`
- `src/cards/Card.test.tsx` — update assertions
- `src/cards/measurer.ts` — `setFooter` accepts `string[]`
- `src/cards/measurer.test.ts` — update assertions
- `src/cards/ItemEditor.tsx` — swap `Input` for `TagInput`
- `src/cards/ItemEditor.test.tsx` — add a chip add/remove test
- `src/views/EditorView.tsx` — stub initializes `footerTags: []`; pristine check uses `length === 0`
- `src/lib/ui/README.md` — add `TagInput` to the catalog
- `e2e/fixtures.ts` — `SeedItem.costWeight?: string` → `footerTags?: string[]`; payload mapping; `longItem` value
- `e2e/print-pagination.spec.ts` — assert footer text built from joined tags

---

## Order of work

The type rename breaks compilation across the codebase atomically. We sequence tasks so the working tree compiles after each task:

1. `TagInput` primitive (new, isolated — no type churn)
2. Type/Zod/factory rename (introduces compile errors in consumers)
3. `Card.tsx` consumer fix
4. `measurer.ts` consumer fix
5. `ItemEditor.tsx` wiring (uses TagInput from Task 1, new type from Task 2)
6. `EditorView.tsx` consumer fix (stub + pristine check)
7. `README.md` catalog entry
8. JSON Schema regen + DB migration
9. e2e fixture + spec updates
10. Final verification

After Task 2 the build is broken; it returns to green at Task 6. That's acceptable — each task is its own commit but the suite is only fully green after the consumer-fix tasks land.

---

## Task 1: Build the `TagInput` primitive

**Files:**
- Create: `src/lib/ui/TagInput.tsx`
- Create: `src/lib/ui/TagInput.module.css`
- Create: `src/lib/ui/TagInput.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ui/TagInput.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { TagInput } from "./TagInput";

function Harness({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return <TagInput aria-label="footer tags" value={value} onChange={setValue} />;
}

describe("<TagInput>", () => {
  test("renders existing tags as chips", () => {
    render(<Harness initial={["500 gp", "10 lb"]} />);
    expect(screen.getByText("500 gp")).toBeInTheDocument();
    expect(screen.getByText("10 lb")).toBeInTheDocument();
  });

  test("typing and pressing Enter commits a new chip and clears the input", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "rare{Enter}");
    expect(screen.getByText("rare")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("typing a comma commits a chip", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "uncommon,");
    expect(screen.getByText("uncommon")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("Enter on an empty/whitespace input does nothing", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "   {Enter}");
    expect(screen.queryByText("   ")).not.toBeInTheDocument();
    expect(input).toHaveValue("   ");
  });

  test("Backspace on an empty input removes the last chip", async () => {
    render(<Harness initial={["a", "b"]} />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    input.focus();
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  test("Backspace with text in the input does NOT remove a chip", async () => {
    render(<Harness initial={["a"]} />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "x");
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("clicking the per-tag remove button removes that tag", async () => {
    render(<Harness initial={["500 gp", "10 lb"]} />);
    await userEvent.click(screen.getByRole("button", { name: /remove 500 gp/i }));
    expect(screen.queryByText("500 gp")).not.toBeInTheDocument();
    expect(screen.getByText("10 lb")).toBeInTheDocument();
  });

  test("trims whitespace around a committed chip", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "   spaced   {Enter}");
    expect(screen.getByText("spaced")).toBeInTheDocument();
  });

  test("blurring the input commits any pending text as a chip", async () => {
    render(
      <>
        <Harness />
        <button type="button">elsewhere</button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /footer tags/i });
    await userEvent.type(input, "draft");
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByText("draft")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`
Expected: FAIL — `Cannot find module './TagInput'`.

- [ ] **Step 3: Implement `TagInput.tsx`**

Create `src/lib/ui/TagInput.tsx`:

```tsx
import { type KeyboardEvent, useState } from "react";
import { Button, Tag, TagGroup, TagList } from "react-aria-components";
import styles from "./TagInput.module.css";

export type TagInputProps = {
  id?: string;
  className?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

export function TagInput({
  id,
  className,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") return;
    onChange([...value, trimmed]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  const items = value.map((v, i) => ({ id: `${i}-${v}`, value: v }));

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(" ")}>
      <TagGroup
        aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "tags")}
        aria-labelledby={ariaLabelledBy}
        onRemove={(keys) => {
          const next = value.filter((_, i) => !keys.has(`${i}-${value[i]}`));
          onChange(next);
        }}
        className={styles.group}
      >
        <TagList items={items} className={styles.list}>
          {(item) => (
            <Tag textValue={item.value} className={styles.tag}>
              <span className={styles.tagText}>{item.value}</span>
              <Button slot="remove" aria-label={`Remove ${item.value}`} className={styles.remove}>
                ×
              </Button>
            </Tag>
          )}
        </TagList>
      </TagGroup>
      <input
        id={id}
        type="text"
        aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? "tags")}
        aria-labelledby={ariaLabelledBy}
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={placeholder}
      />
    </div>
  );
}
```

> **Why `id+value` composite keys:** RAC's `TagGroup.onRemove` returns a `Set<Key>`. Using array index alone breaks if the user removes a middle tag because subsequent indices shift. Composite keys + value-equality filter avoids the foot-gun and tolerates duplicate values.

- [ ] **Step 4: Add CSS**

Create `src/lib/ui/TagInput.module.css`:

```css
.wrapper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  min-height: calc(var(--fs-md) + var(--space-2) * 2 + 2px);
}

.wrapper:focus-within {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.group {
  display: contents;
}

.list {
  display: contents;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1.6;
  outline: none;
}

.tag[data-focused] {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.tagText {
  white-space: nowrap;
}

.remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2em;
  height: 1.2em;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  cursor: pointer;
}

.remove:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.remove:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}

.input {
  flex: 1;
  min-width: 8ch;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-family: var(--font-body);
  font-size: var(--fs-md);
}
```

> **CSS-token sanity check:** Verify each `var(--…)` referenced above exists in `src/index.css`. If `--space-1`, `--color-surface-muted`, `--color-text-muted`, `--color-border`, or `--radius-sm` are absent, substitute the closest existing token (e.g., reuse `--color-border-strong` for `--color-border`). Don't introduce new tokens for this primitive.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- src/lib/ui/TagInput.test.tsx`
Expected: PASS — all 9 tests green.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: PASS, no findings in the new files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ui/TagInput.tsx src/lib/ui/TagInput.module.css src/lib/ui/TagInput.test.tsx
git commit -m "Add TagInput primitive (TagGroup + input)"
```

---

## Task 2: Rename `costWeight` → `footerTags` in types, Zod, and factories

**Files:**
- Modify: `src/cards/types.ts`
- Modify: `src/decks/schema.ts`
- Modify: `src/cards/factories.ts`

This task introduces compile errors in `Card.tsx`, `ItemEditor.tsx`, `measurer.ts`, `EditorView.tsx`, and `e2e/fixtures.ts`. Tasks 3-6 and 9 fix them. **Also add `footerTags: []` to `src/api/mappers/magicItems.ts` (both return branches of `magicItemDetailToCard`) and to `src/test/factories.ts`'s `makeItemPayload` factory** — both build `ItemCard`s directly and need the new required field. Commit those alongside the type/zod/factory rename, or in a follow-up commit on this same task.

- [ ] **Step 1: Update the TypeScript type**

Edit `src/cards/types.ts` — replace the `ItemCard` definition:

```ts
export type ItemCard = BaseCard & {
  kind: "item";
  typeLine: string;
  footerTags: string[];
};
```

(Note: `footerTags` is **not** optional. Empty array represents "no chips.")

- [ ] **Step 2: Update the Zod schema**

Edit `src/decks/schema.ts` — replace the `costWeight` line in `itemCardSchema`:

```ts
export const itemCardSchema = baseCardSchema.extend({
  kind: z.literal("item"),
  typeLine: z.string(),
  footerTags: z.array(z.string()),
});
```

- [ ] **Step 3: Update the factory**

Edit `src/cards/factories.ts` — replace the `costWeight` line:

```ts
import { faker } from "@faker-js/faker";
import { Factory } from "fishery";
import type { ItemCard } from "./types";

const rarities = ["common", "uncommon", "rare", "very rare", "legendary"];

export const itemCardFactory = Factory.define<ItemCard>(() => {
  const now = new Date().toISOString();
  return {
    id: faker.string.nanoid(),
    kind: "item",
    name: faker.commerce.productName(),
    typeLine: `Wondrous item, ${faker.helpers.arrayElement(rarities)}`,
    body: faker.lorem.paragraph(),
    footerTags: [
      `${faker.number.int({ min: 10, max: 5000 })} gp`,
      `${faker.number.int({ min: 1, max: 30 })} lb`,
    ],
    source: "custom",
    createdAt: now,
    updatedAt: now,
  };
});
```

- [ ] **Step 4: Verify the rename compiles in isolation**

Run: `npx tsc -b --noEmit src/cards/types.ts` (or, simpler, run the full build and confirm errors are *only* in the expected consumer files).

Run: `npm run build`
Expected: FAIL with TS errors in `Card.tsx`, `ItemEditor.tsx`, `measurer.ts`, `EditorView.tsx`, `e2e/fixtures.ts` — and *no errors* in `types.ts`, `schema.ts`, `factories.ts` themselves.

- [ ] **Step 5: Commit (broken build expected)**

```bash
git add src/cards/types.ts src/decks/schema.ts src/cards/factories.ts
git commit -m "Rename ItemCard.costWeight to footerTags (string[])"
```

---

## Task 3: Update `Card.tsx` to render `footerTags`

**Files:**
- Modify: `src/cards/Card.tsx`
- Modify: `src/cards/Card.test.tsx`

- [ ] **Step 1: Update existing tests to the new field**

Edit `src/cards/Card.test.tsx`. Find these tests and update them:

```tsx
  test("renders cost/weight when present", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.getByText(card.footerTags.join(" · "))).toBeInTheDocument();
  });

  test("omits footer when footerTags is empty", () => {
    const card = itemCardFactory.build({ footerTags: [] });
    render(<Card card={card} cardsPerPage={4} />);
    expect(screen.queryByTestId("card-footer")).not.toBeInTheDocument();
  });
```

And the two pagination cases:

```tsx
  test("retains footerTags on continuation pages alongside pagination", () => {
    const card = itemCardFactory.build();
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 2, total: 2 }} />);
    expect(screen.getByText(card.footerTags.join(" · "))).toBeInTheDocument();
    expect(screen.getByTestId("card-pagination")).toBeInTheDocument();
  });

  test("renders footer with pagination only when card has no footerTags", () => {
    const card = itemCardFactory.build({ footerTags: [] });
    render(<Card card={card} cardsPerPage={4} pagination={{ page: 1, total: 3 }} />);
    expect(screen.getByTestId("card-footer")).toBeInTheDocument();
    expect(screen.getByTestId("card-pagination")).toHaveTextContent(/^Card 1 of 3$/);
  });
```

- [ ] **Step 2: Run the updated tests and confirm they fail**

Run: `npm test -- src/cards/Card.test.tsx`
Expected: FAIL — these four tests fail (the field still doesn't exist on the rendered output, and `card.footerTags` is undefined when read by the helper).

> Other tests in this file may also fail at the type level since the factory now returns `footerTags`. Continue.

- [ ] **Step 3: Update `Card.tsx`**

Edit `src/cards/Card.tsx`:

```tsx
  const showFooter = card.footerTags.length > 0 || pagination !== undefined;
```

And:

```tsx
      {showFooter && (
        <div className={styles.footer} data-testid="card-footer">
          {card.footerTags.length > 0 && <span>{card.footerTags.join(" · ")}</span>}
          {pagination && (
            <span className={styles.footerRight} data-testid="card-pagination">
              Card {pagination.page} of {pagination.total}
            </span>
          )}
        </div>
      )}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/cards/Card.test.tsx`
Expected: PASS — all `Card` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cards/Card.tsx src/cards/Card.test.tsx
git commit -m "Render Card footer from footerTags array"
```

---

## Task 4: Update `measurer.ts` and its tests

**Files:**
- Modify: `src/cards/measurer.ts`
- Modify: `src/cards/measurer.test.ts`

- [ ] **Step 1: Update measurer tests**

Edit `src/cards/measurer.test.ts`. Replace these two tests:

```ts
  test("footer always renders pagination sentinel during measurement", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build({ footerTags: [] });
    measurer.measureFirst(card, "body chunk");

    const footerEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    expect(footerEl?.textContent).toContain("Card 9 of 9");
  });

  test("footer renders both footerTags and pagination sentinel when tags are set", () => {
    const measurer = getMeasurer(4);
    const card = itemCardFactory.build();
    measurer.measureFirst(card, "body chunk");

    const footerEl = document.querySelector<HTMLElement>(
      '[data-shape="first"] [data-slot="footer"]',
    );
    expect(footerEl?.textContent).toContain(card.footerTags.join(" · "));
    expect(footerEl?.textContent).toContain("Card 9 of 9");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- src/cards/measurer.test.ts`
Expected: FAIL — the two updated tests fail (and a TS error in `measurer.ts` itself from `card.costWeight` no longer existing).

- [ ] **Step 3: Update `measurer.ts`**

Edit `src/cards/measurer.ts`. Replace `setFooter` and its two call sites:

```ts
  const setFooter = (el: HTMLElement, footerTags: string[], pagination: string) => {
    el.replaceChildren();
    if (footerTags.length > 0) {
      const left = document.createElement("span");
      left.textContent = footerTags.join(" · ");
      el.appendChild(left);
    }
    const right = document.createElement("span");
    right.textContent = pagination;
    right.className = cardStyles.footerRight ?? "";
    el.appendChild(right);
  };

  return {
    measureFirst: (card, chunk) => {
      firstTitle.textContent = card.name;
      firstTypeLine.textContent = card.typeLine;
      setFooter(firstFooter, card.footerTags, SENTINEL_PAGINATION);
      setBodyContent(firstBody, chunk);
      return firstBody.scrollHeight <= firstBody.clientHeight;
    },
    measureContinuation: (card, chunk) => {
      contTitle.textContent = card.name;
      setFooter(contFooter, card.footerTags, SENTINEL_PAGINATION);
      setBodyContent(contBody, chunk);
      return contBody.scrollHeight <= contBody.clientHeight;
    },
  };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/cards/measurer.test.ts`
Expected: PASS — all measurer tests green.

- [ ] **Step 5: Commit**

```bash
git add src/cards/measurer.ts src/cards/measurer.test.ts
git commit -m "Measure footer using footerTags array"
```

---

## Task 5: Wire `TagInput` into `ItemEditor`

**Files:**
- Modify: `src/cards/ItemEditor.tsx`
- Modify: `src/cards/ItemEditor.test.tsx`

- [ ] **Step 1: Add a failing test for the chip flow**

Append to `src/cards/ItemEditor.test.tsx` (inside the existing `describe("<ItemEditor>", …)` block):

```tsx
  test("typing a tag and pressing Enter adds it to footerTags; clicking remove drops it", async () => {
    const card = itemCardFactory.build({ footerTags: [] });
    const seen: ItemCard[] = [];
    render(<Harness initial={card} onEach={(c) => seen.push(c)} />);

    const input = screen.getByRole("textbox", { name: /cost.*weight/i });
    await userEvent.type(input, "500 gp{Enter}10 lb{Enter}");

    expect(seen[seen.length - 1]?.footerTags).toEqual(["500 gp", "10 lb"]);

    await userEvent.click(screen.getByRole("button", { name: /remove 500 gp/i }));
    expect(seen[seen.length - 1]?.footerTags).toEqual(["10 lb"]);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/cards/ItemEditor.test.tsx`
Expected: FAIL — the textbox name regex doesn't match (current input has placeholder text, not the new chip input), and TS error: `EditableField` includes `"costWeight"`.

- [ ] **Step 3: Update `ItemEditor.tsx`**

Edit `src/cards/ItemEditor.tsx`. Three changes:

a) Update the imports — drop the `Input` use only for cost/weight isn't needed here, but `Input` is still used elsewhere; add `TagInput`:

```tsx
import { type ChangeEvent, useId } from "react";
import { nowIso } from "../lib/time";
import { IconPickerDialog } from "../lib/ui/IconPickerDialog";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { TagInput } from "../lib/ui/TagInput";
import { Textarea } from "../lib/ui/Textarea";
import styles from "./ItemEditor.module.css";
import { FALLBACK_ICON_KEY, pickIconKey } from "./iconRules";
import type { ItemCard } from "./types";
```

b) Drop `"costWeight"` from `EditableField`, rename the id key, replace the field block. The full updated component:

```tsx
type Props = {
  card: ItemCard;
  onChange: (next: ItemCard) => void;
};

type EditableField = "name" | "typeLine" | "body" | "imageUrl";

export function ItemEditor({ card, onChange }: Props) {
  const handle =
    (field: EditableField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...card, [field]: e.target.value, updatedAt: nowIso() });
    };

  const handleIconChange = (next: string | undefined) => {
    onChange({ ...card, iconKey: next, updatedAt: nowIso() });
  };

  const handleFooterTagsChange = (next: string[]) => {
    onChange({ ...card, footerTags: next, updatedAt: nowIso() });
  };

  const resolvedKey = card.iconKey ?? pickIconKey(card);
  const showHint = card.iconKey === undefined && resolvedKey !== FALLBACK_ICON_KEY;

  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    typeLine: `${idBase}-typeLine`,
    icon: `${idBase}-icon`,
    body: `${idBase}-body`,
    footerTags: `${idBase}-footerTags`,
    footerTagsLabel: `${idBase}-footerTagsLabel`,
    imageUrl: `${idBase}-imageUrl`,
  };

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <label className={styles.field} htmlFor={ids.name}>
        <span className={styles.label}>Name</span>
        <Input id={ids.name} value={card.name} onChange={handle("name")} />
      </label>
      <label className={styles.field} htmlFor={ids.typeLine}>
        <span className={styles.label}>Type line</span>
        <Input
          id={ids.typeLine}
          value={card.typeLine}
          onChange={handle("typeLine")}
          placeholder="Wondrous item, uncommon"
        />
      </label>
      <label className={styles.field} htmlFor={ids.icon}>
        <span className={styles.label}>Icon (optional)</span>
        <div className={styles.iconRow}>
          <IconPreview iconKey={resolvedKey} label={resolvedKey} size="md" />
          <IconPickerDialog id={ids.icon} value={card.iconKey} onChange={handleIconChange} />
        </div>
        {showHint && <div className={styles.iconHint}>Currently auto-picking: {resolvedKey}</div>}
      </label>
      <label className={styles.field} htmlFor={ids.body}>
        <span className={styles.label}>Body</span>
        <Textarea id={ids.body} value={card.body} onChange={handle("body")} rows={8} />
      </label>
      <div className={styles.field}>
        <span className={styles.label} id={ids.footerTagsLabel}>
          Cost / weight (optional)
        </span>
        <TagInput
          id={ids.footerTags}
          aria-labelledby={ids.footerTagsLabel}
          value={card.footerTags}
          onChange={handleFooterTagsChange}
          placeholder="Type and press Enter — e.g. 500 gp, 10 lb, rare"
        />
      </div>
      <label className={styles.field} htmlFor={ids.imageUrl}>
        <span className={styles.label}>Image URL (optional)</span>
        <Input
          id={ids.imageUrl}
          value={card.imageUrl ?? ""}
          onChange={handle("imageUrl")}
          placeholder="https://…"
        />
      </label>
    </form>
  );
}
```

> **Why a `<div>` instead of `<label>` for the tag field:** `<label htmlFor>` points at a single control. The chip area is a composite (TagGroup + input). We expose a labelling element via `aria-labelledby` instead so screen readers still announce the field name when the input is focused.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/cards/ItemEditor.test.tsx`
Expected: PASS — all editor tests green, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/cards/ItemEditor.tsx src/cards/ItemEditor.test.tsx
git commit -m "Wire TagInput into ItemEditor for footer tags"
```

---

## Task 6: Fix `EditorView` stub and pristine check

**Files:**
- Modify: `src/views/EditorView.tsx`

- [ ] **Step 1: Update the stub to initialize `footerTags`**

Edit `src/views/EditorView.tsx`. Find the `stub` `useMemo`:

```tsx
  const stub: ItemCard | null = useMemo(() => {
    if (!isNew) return null;
    const now = nowIso();
    return {
      id: newId(),
      kind: "item",
      name: "Untitled item",
      typeLine: "",
      body: "",
      footerTags: [],
      source: "custom",
      createdAt: now,
      updatedAt: now,
    };
  }, [isNew]);
```

- [ ] **Step 2: Update the pristine check**

In the same file:

```tsx
const isPristineNewCard = (card: ItemCard): boolean =>
  card.name === "Untitled item" &&
  card.typeLine === "" &&
  card.body === "" &&
  card.footerTags.length === 0 &&
  card.imageUrl === undefined &&
  card.createdAt === card.updatedAt;
```

- [ ] **Step 3: Run unit tests + build**

Run: `npm test`
Expected: PASS — full Vitest suite green (excluding e2e). If `EditorView.test.tsx` had a failure, fix it inline; the rename should be transparent at the editor-view level.

Run: `npm run build`
Expected: PASS — TS compile succeeds. (e2e fixtures still reference `costWeight`; they're not in `tsc -b` scope. Confirm by checking `tsconfig.json` if needed.)

> If the build still fails because `e2e/` is in the TS scope, defer the green build to Task 9 and proceed.

- [ ] **Step 4: Commit**

```bash
git add src/views/EditorView.tsx
git commit -m "Initialize footerTags in EditorView stub and pristine check"
```

---

## Task 7: Add `TagInput` to the UI catalog

**Files:**
- Modify: `src/lib/ui/README.md`

- [ ] **Step 1: Add the row**

Edit `src/lib/ui/README.md`. Insert this row in the `## Catalog` table, alphabetically after `Switch`:

```md
| `TagInput` | A controlled chip-input field. Users type freeform text + Enter (or comma) to commit chips; `×` per chip removes them. |
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ui/README.md
git commit -m "Document TagInput in src/lib/ui/README.md"
```

---

## Task 8: Regenerate JSON Schema and write the DB migration

**Files:**
- Modify: `supabase/schemas/card-payload.json` (regenerated)
- Create: `supabase/migrations/<timestamp>_rename_costweight_to_footertags.sql`

- [ ] **Step 1: Regenerate the JSON Schema**

Run: `npm run gen:schema`
Expected: writes `supabase/schemas/card-payload.json` with the item-card branch now declaring `"footerTags": { "type": "array", "items": { "type": "string" } }` instead of `"costWeight"`, and `"footerTags"` added to the `required` list.

- [ ] **Step 2: Verify the diff matches expectations**

Run: `git diff supabase/schemas/card-payload.json`
Expected diff (item-card branch only):
- `"costWeight": { "type": "string" }` removed.
- `"footerTags": { "type": "array", "items": { "type": "string" } }` added.
- `"footerTags"` added to the item-card branch's `required` array.

> If `required` does not include `footerTags`, double-check `src/decks/schema.ts` Step 2 from Task 2 — `z.array(z.string())` (not `.optional()`) is what makes it required in the generated JSON Schema.

- [ ] **Step 3: Create the new migration file**

Run: `npx supabase migration new rename_costweight_to_footertags`
Expected: creates `supabase/migrations/<timestamp>_rename_costweight_to_footertags.sql` (the `<timestamp>` is auto-generated by the CLI).

> If the supabase CLI is unavailable, create `supabase/migrations/20260502120000_rename_costweight_to_footertags.sql` manually using a fresh timestamp.

- [ ] **Step 4: Fill in the migration body**

Replace the file's contents with the following. The schema body in the heredoc is the current contents of `supabase/schemas/card-payload.json` — copy that file's contents verbatim into the heredoc.

```sql
-- <timestamp>_rename_costweight_to_footertags.sql
-- Drop legacy item-card costWeight (string) in favor of footerTags (string[]).
-- Splits any existing costWeight values on `,` and `·` (with surrounding
-- whitespace), trims, drops empties, and writes the result as footerTags.
-- Also re-issues cards_payload_valid with the regenerated JSON Schema.
--
-- The embedded JSON Schema below is generated from src/decks/schema.ts via
-- `npm run gen:schema`. To update it, regenerate the JSON file and write a
-- NEW migration that follows the same drop-then-add pattern below — never
-- edit this file in place.

create extension if not exists pg_jsonschema;

alter table public.cards drop constraint if exists cards_payload_valid;

-- Data migration: rewrite item-card payloads.
-- 1) Items with a costWeight: split on `,` or `·`, trim, drop empties,
--    write as footerTags, then drop the old key.
update public.cards
set payload = (payload - 'costWeight') || jsonb_build_object(
  'footerTags',
  coalesce(
    (
      select jsonb_agg(trimmed)
      from (
        select trim(t) as trimmed
        from regexp_split_to_table(payload->>'costWeight', '\s*[,·]\s*') as t
      ) s
      where s.trimmed <> ''
    ),
    '[]'::jsonb
  )
)
where payload->>'kind' = 'item' and payload ? 'costWeight';

-- 2) Items without costWeight: just add an empty footerTags array.
update public.cards
set payload = payload || jsonb_build_object('footerTags', '[]'::jsonb)
where payload->>'kind' = 'item' and not (payload ? 'footerTags');

alter table public.cards
  add constraint cards_payload_valid
  check (jsonb_matches_schema(
    $cardpayload$
<<<PASTE THE FULL CONTENTS OF supabase/schemas/card-payload.json HERE>>>
    $cardpayload$::json,
    payload
  ));

comment on constraint cards_payload_valid on public.cards is
  'JSON Schema validation generated from src/decks/schema.ts via npm run gen:schema. Regen requires a new migration that drops + re-adds this constraint.';
```

> Replace `<<<PASTE THE FULL CONTENTS OF supabase/schemas/card-payload.json HERE>>>` literally with the contents of `supabase/schemas/card-payload.json` (no surrounding quotes; the `$cardpayload$…$cardpayload$` heredoc handles delimiting). Mirror the indentation of `20260430081056_add_iconkey_to_cards.sql`.

- [ ] **Step 5: Apply the migration locally**

Run: `npx supabase db reset`
Expected: PASS — the local Supabase DB is rebuilt with all migrations including the new one. Output shows the new migration applied with no errors.

> If you don't have a local Supabase running, skip the apply but confirm SQL syntax with `npx supabase db lint` if available, or eyeball it against `20260430081056_add_iconkey_to_cards.sql`.

- [ ] **Step 6: Verify the schema-drift check passes**

Run: `npm run check:schema`
Expected: `No drift in supabase/schemas/card-payload.json`.

- [ ] **Step 7: Commit**

```bash
git add supabase/schemas/card-payload.json supabase/migrations/
git commit -m "Migrate item costWeight (string) to footerTags (string[])"
```

---

## Task 9: Update e2e fixtures and the print-pagination spec

**Files:**
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/print-pagination.spec.ts`

- [ ] **Step 1: Update `SeedItem` and the row mapper**

Edit `e2e/fixtures.ts`:

```ts
export type SeedItem = {
  id?: string;
  name: string;
  typeLine?: string;
  body: string;
  footerTags?: string[];
};
```

And the row construction inside `cardRows`:

```ts
  const cardRows = items.map((it, i) => ({
    id: it.id ?? `00000000-0000-4000-8000-${i.toString().padStart(12, "0")}`,
    deck_id: TEST_DECK_ID,
    position: i,
    payload: {
      kind: "item",
      name: it.name,
      typeLine: it.typeLine ?? "Wondrous item",
      body: it.body,
      footerTags: it.footerTags ?? [],
      source: "custom",
      createdAt: now,
      updatedAt: now,
    },
    created_at: now,
    updated_at: now,
  }));
```

(`footerTags: it.footerTags ?? []` — the schema requires it.)

- [ ] **Step 2: Update `longItem`**

In the same file:

```ts
export const longItem: SeedItem = {
  id: "00000000-0000-4000-8000-100000000001",
  name: "Wand of Wonder",
  typeLine: "Wand, rare (requires attunement by a spellcaster)",
  body: LONG_BODY,
  footerTags: ["5,000 gp", "1 lb"],
};
```

- [ ] **Step 3: Update the e2e spec**

Edit `e2e/print-pagination.spec.ts`. Replace the final assertion block:

```ts
  const expectedFooter = longItem.footerTags!.join(" · ");
  const footers = await sheet.getByText(expectedFooter, { exact: true }).count();
  expect(footers).toBe(total);
```

- [ ] **Step 4: Run the unit tests + build to confirm everything compiles**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS — entire Vitest suite green.

> Note: e2e tests are not run by `npm test` (they require Playwright + a real or mocked Supabase). Step 5 covers the e2e run.

- [ ] **Step 5: Run the e2e spec**

Run: `npm run test:e2e -- e2e/print-pagination.spec.ts`
Expected: PASS — the print-pagination spec is green.

> Skip this step if Playwright isn't installed or a fresh `npx playwright install` is required (it would need user approval). Document the skip in the PR description so a follow-up runs it.

- [ ] **Step 6: Commit**

```bash
git add e2e/fixtures.ts e2e/print-pagination.spec.ts
git commit -m "Update e2e fixtures and pagination spec for footerTags"
```

---

## Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite + lint + build**

Run all three; each should be green:

```bash
npm run lint
npm run build
npm test
```

- [ ] **Step 2: Schema-drift check**

Run: `npm run check:schema`
Expected: no drift.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

In the browser:
1. Sign in (or use an existing session) and open a deck.
2. Edit an existing item card. Confirm its previous `costWeight` text appears as one or more chips (split on `,` and `·`).
3. Add a new chip via Enter and via comma. Confirm it appears in the preview footer separated by `·`.
4. Remove a chip via the per-chip `×`. Confirm the preview footer updates.
5. Backspace on an empty input — confirm the last chip is removed.
6. Save the card; reload the page; confirm the chips persist.
7. Print preview (`/deck/<id>/print`): confirm the footer renders as `tag1 · tag2 · …`.

If any of these fail, fix inline before the final commit.

- [ ] **Step 4: Smoke-test report**

State the result of step 3 in the final commit message or PR description (which scenarios passed, which failed) — do not silently mark complete if any UI smoke step couldn't be exercised.

---

## Self-review (already performed)

- **Spec coverage:** Every concrete decision from the conversation appears in a task — rename to `string[]`, `·`-joined render, no autocomplete, delete-and-retype edits, comma + Enter commit, Backspace removes last, `×` per chip, data migration splits on `,` and `·`.
- **Placeholder scan:** No "TBD"/"add appropriate handling"/etc. The one explicit "paste this" instruction (Task 8 Step 4) is intentional — copying generated JSON verbatim is the established pattern in this repo.
- **Type consistency:** `footerTags: string[]` (not optional) is used consistently across types, Zod, factories, JSON Schema, migration, fixtures, and tests. `EditableField` correctly drops `"costWeight"` and does **not** add `"footerTags"` (the chip handler is wired separately, not via the generic `handle()` factory).
- **Hidden risk:** The CSS in Task 1 references tokens that may not all exist (`--color-surface-muted`, `--color-text-muted`, `--color-border`, `--space-1`, `--radius-sm`). Task 1 Step 4 includes a sanity check + fallback instructions.
