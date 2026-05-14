import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { fetchMagicItemIndex, type Ruleset } from "../api/endpoints/magicItems";
import { fetchMundaneItemIndex } from "../api/endpoints/mundaneItems";
import { fetchSpellIndex } from "../api/endpoints/spells";
import { renderBody } from "../cards/renderBody";
import type { MagicItem, MundaneItem, Spell } from "../data/srd-schema";
import { spellBodyMarkdown } from "../lib/srd-format/spells";
import { LoadingState } from "../lib/ui/LoadingState";
import styles from "./ReferenceView.module.css";
import { MagicItemStatBlock } from "./reference/MagicItemStatBlock";
import { MundaneItemStatBlock } from "./reference/MundaneItemStatBlock";
import { SpellStatBlock } from "./reference/SpellStatBlock";

const DEFAULT_TITLE = "Deckwright";

export type ReferenceKind = "magic-items" | "mundane-items" | "spells";

type Props = { kind: ReferenceKind; cardKey: string };

const rulesetFromKey = (key: string): Ruleset => (key.startsWith("srd-2024_") ? "2024" : "2014");

type Loaded =
  | { kind: "magic-items"; record: MagicItem }
  | { kind: "mundane-items"; record: MundaneItem }
  | { kind: "spells"; record: Spell };

async function loadRecord(kind: string, key: string): Promise<Loaded | null> {
  const ruleset = rulesetFromKey(key);
  if (kind === "magic-items") {
    const idx = await fetchMagicItemIndex(ruleset);
    const record = idx.results.find((r) => r.key === key);
    return record ? { kind: "magic-items", record } : null;
  }
  if (kind === "mundane-items") {
    const idx = await fetchMundaneItemIndex(ruleset);
    const record = idx.results.find((r) => r.key === key);
    return record ? { kind: "mundane-items", record } : null;
  }
  if (kind === "spells") {
    const idx = await fetchSpellIndex(ruleset);
    const record = idx.results.find((r) => r.key === key);
    return record ? { kind: "spells", record } : null;
  }
  return null;
}

function NotFound() {
  useEffect(() => {
    document.title = "Not found · Deckwright";
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);
  return (
    <article className={styles.notFound}>
      <h1>Not found</h1>
      <p>That reference page doesn't exist.</p>
      <p>
        <Link to="/">Back to Deckwright</Link>
      </p>
    </article>
  );
}

function StatBlockForKind({ loaded }: { loaded: Loaded }) {
  if (loaded.kind === "magic-items") return <MagicItemStatBlock item={loaded.record} />;
  if (loaded.kind === "mundane-items") return <MundaneItemStatBlock item={loaded.record} />;
  return <SpellStatBlock spell={loaded.record} />;
}

function bodyMarkdown(loaded: Loaded): string {
  if (loaded.kind === "spells") {
    return spellBodyMarkdown(loaded.record.desc, loaded.record.higher_level);
  }
  return loaded.record.desc;
}

export function ReferenceView({ kind, cardKey }: Props) {
  const query = useQuery({
    queryKey: ["reference", kind, cardKey],
    queryFn: () => loadRecord(kind, cardKey),
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (query.data) {
      document.title = `${query.data.record.name} · Deckwright`;
      return () => {
        document.title = DEFAULT_TITLE;
      };
    }
  }, [query.data]);

  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <NotFound />;

  const html = renderBody(bodyMarkdown(query.data));
  return (
    <article>
      <h1 className={styles.title}>{query.data.record.name}</h1>
      <StatBlockForKind loaded={query.data} />
      <div
        className={styles.body}
        // The string came from DOMPurify-sanitized markdown — see src/cards/renderBody.ts.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
