import { useId, useState } from "react";
import { FALLBACK_ICON_KEY, ITEM_RULES, SCHOOL_ICONS, SPELL_NAME_RULES } from "../cards/iconRules";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import styles from "./IconDebugView.module.css";

type Kind = "item" | "spell";

const SCHOOL_NAMES = Object.keys(SCHOOL_ICONS) as (keyof typeof SCHOOL_ICONS)[];

function pickRule(rules: typeof ITEM_RULES, name: string, headerTagsText: string) {
  const haystack = `${name} ${headerTagsText}`;
  let index = 0;
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) return { rule, index };
    index++;
  }
  return null;
}

function pickSchool(headerTagsText: string) {
  const lower = headerTagsText.toLowerCase();
  for (const school of SCHOOL_NAMES) {
    if (new RegExp(`\\b${school}\\b`).test(lower)) {
      return { school, iconKey: SCHOOL_ICONS[school] };
    }
  }
  return null;
}

export function IconDebugView() {
  const [kind, setKind] = useState<Kind>("item");
  const [name, setName] = useState("");
  const [headerTagsText, setHeaderTagsText] = useState("");
  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    headerTags: `${idBase}-headerTags`,
    kind: `${idBase}-kind`,
  };

  const rules = kind === "item" ? ITEM_RULES : SPELL_NAME_RULES;
  const matched = pickRule(rules, name, headerTagsText);
  const schoolMatch = kind === "spell" && !matched ? pickSchool(headerTagsText) : null;

  return (
    <div className={styles.page}>
      <h1>Icon picker — debug</h1>

      <section className={styles.simulator}>
        <h2>Simulator</h2>
        <fieldset className={styles.row}>
          <legend>Kind</legend>
          <label>
            <input
              type="radio"
              name={ids.kind}
              value="item"
              checked={kind === "item"}
              onChange={() => setKind("item")}
            />
            Item
          </label>
          <label>
            <input
              type="radio"
              name={ids.kind}
              value="spell"
              checked={kind === "spell"}
              onChange={() => setKind("spell")}
            />
            Spell
          </label>
        </fieldset>
        <label className={styles.row} htmlFor={ids.name}>
          <span>Name</span>
          <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.row} htmlFor={ids.headerTags}>
          <span>Header tags</span>
          <Input
            id={ids.headerTags}
            value={headerTagsText}
            onChange={(e) => setHeaderTagsText(e.target.value)}
          />
        </label>
        <div className={styles.result} data-testid="simulator-result">
          {matched ? (
            <>
              <IconPreview iconKey={matched.rule.iconKey} label={matched.rule.iconKey} size="md" />
              <div>
                rule #{matched.index}: <code>{matched.rule.pattern.source}</code> —{" "}
                {matched.rule.description} → <strong>{matched.rule.iconKey}</strong>
              </div>
            </>
          ) : schoolMatch ? (
            <>
              <IconPreview iconKey={schoolMatch.iconKey} label={schoolMatch.iconKey} size="md" />
              <div>
                school: <strong>{schoolMatch.school}</strong> →{" "}
                <strong>{schoolMatch.iconKey}</strong>
              </div>
            </>
          ) : (
            <>
              <IconPreview iconKey={FALLBACK_ICON_KEY} label={FALLBACK_ICON_KEY} size="md" />
              <div>
                No match → fallback (<strong>{FALLBACK_ICON_KEY}</strong>)
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <h2>{kind === "item" ? "Item rules" : "Spell name rules"}</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Pattern</th>
              <th>Description</th>
              <th>Icon</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, i) => (
              <tr key={rule.pattern.source}>
                <td>{i}</td>
                <td className={styles.regex}>{rule.pattern.source}</td>
                <td>{rule.description}</td>
                <td>
                  <IconPreview iconKey={rule.iconKey} label={rule.iconKey} size="md" />
                </td>
              </tr>
            ))}
            <tr>
              <td>(fallback)</td>
              <td className={styles.regex}>—</td>
              <td>no match → fallback</td>
              <td>
                <IconPreview iconKey={FALLBACK_ICON_KEY} label={FALLBACK_ICON_KEY} size="md" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {kind === "spell" && (
        <section>
          <h2>Schools</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>School</th>
                <th>Icon</th>
              </tr>
            </thead>
            <tbody>
              {SCHOOL_NAMES.map((school) => (
                <tr key={school}>
                  <td>{school}</td>
                  <td>
                    <IconPreview
                      iconKey={SCHOOL_ICONS[school]}
                      label={SCHOOL_ICONS[school]}
                      size="md"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
