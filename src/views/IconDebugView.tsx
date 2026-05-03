import { useId, useState } from "react";
import { FALLBACK_ICON_KEY, ICON_RULES } from "../cards/iconRules";
import { IconPreview } from "../lib/ui/IconPreview";
import { Input } from "../lib/ui/Input";
import styles from "./IconDebugView.module.css";

function pickRule(name: string, headerTagsText: string) {
  const haystack = `${name} ${headerTagsText}`;
  let index = 0;
  for (const rule of ICON_RULES) {
    if (rule.pattern.test(haystack)) {
      return { rule, index };
    }
    index++;
  }
  return null;
}

export function IconDebugView() {
  const [name, setName] = useState("");
  const [headerTagsText, setHeaderTagsText] = useState("");
  const matched = pickRule(name, headerTagsText);
  const idBase = useId();
  const ids = {
    name: `${idBase}-name`,
    headerTags: `${idBase}-headerTags`,
  };

  return (
    <div className={styles.page}>
      <h1>Icon picker — debug</h1>

      <section className={styles.simulator}>
        <h2>Simulator</h2>
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
        <h2>Rules</h2>
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
            {ICON_RULES.map((rule, i) => (
              <tr key={rule.iconKey}>
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
    </div>
  );
}
