import { useEffect, useId, useMemo, useState } from "react";
import { FALLBACK_ICON_KEY, ITEM_RULES, SCHOOL_ICONS, SPELL_NAME_RULES } from "../cards/iconRules";
import { SHUFFLE_SEED, shuffleSeeded } from "../data/iconShuffle";
import { loadIconDescriptions } from "../data/loadIconDescriptions";
import { Button } from "../lib/ui/Button";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import { LoadingState } from "../lib/ui/LoadingState";
import { Radio, RadioGroup } from "../lib/ui/RadioGroup";
import styles from "./IconDebugView.module.css";

type Kind = "item" | "spell";
type Scope = "rules" | "random";

const SCHOOL_NAMES = Object.keys(SCHOOL_ICONS) as (keyof typeof SCHOOL_ICONS)[];

const SAMPLE_SIZE = 24;

// Random sampling over 4,134 would essentially never surface the icons the
// app actually shows today.
const RULE_ICON_KEYS = [
  ...new Set([
    FALLBACK_ICON_KEY,
    ...ITEM_RULES.map((rule) => rule.iconKey),
    ...SPELL_NAME_RULES.map((rule) => rule.iconKey),
    ...Object.values(SCHOOL_ICONS),
  ]),
].sort();

function useDescriptions() {
  const [descriptions, setDescriptions] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    void loadIconDescriptions().then(setDescriptions);
  }, []);
  return descriptions;
}

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

  const descriptions = useDescriptions();
  const [scope, setScope] = useState<Scope>("rules");
  const [reroll, setReroll] = useState(0);

  const sample = useMemo(() => {
    if (!descriptions) return [];
    if (scope === "rules") return RULE_ICON_KEYS.filter((key) => key in descriptions);
    return shuffleSeeded(Object.keys(descriptions), SHUFFLE_SEED + reroll).slice(0, SAMPLE_SIZE);
  }, [descriptions, scope, reroll]);

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
        <h2>Descriptions</h2>
        <div className={styles.row}>
          <RadioGroup
            aria-label="Sample"
            value={scope}
            onChange={(next) => setScope(next as Scope)}
          >
            <Radio value="rules">Icons used by rules ({RULE_ICON_KEYS.length})</Radio>
            <Radio value="random">Random {SAMPLE_SIZE}</Radio>
          </RadioGroup>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={scope === "rules"}
            onPress={() => setReroll((n) => n + 1)}
          >
            Reroll
          </Button>
        </div>
        {descriptions === null ? (
          <LoadingState label="Loading descriptions…" />
        ) : sample.length === 0 ? (
          <p>No descriptions yet — run `npm run gen:icon-descriptions`.</p>
        ) : (
          <ul className={styles.descriptions}>
            {sample.map((key) => (
              <li
                key={key}
                className={styles.described}
                data-testid="described-icon"
                data-icon-key={key}
              >
                <IconPreview iconKey={key} label={key} size="lg" />
                <div>
                  <code>{key}</code>
                  <p>{descriptions[key]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
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
