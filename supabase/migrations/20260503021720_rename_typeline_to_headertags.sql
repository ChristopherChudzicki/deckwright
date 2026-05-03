-- 20260503021720_rename_typeline_to_headertags.sql
-- Drop legacy item-card typeLine (string) in favor of headerTags (string[]).
-- Splits any existing typeLine values on `,` and `·` (with surrounding
-- whitespace), trims, drops empties, and writes the result as headerTags.
-- Also re-issues cards_payload_valid with the regenerated JSON Schema.
--
-- The embedded JSON Schema below is generated from src/decks/schema.ts via
-- `npm run gen:schema`. To update it, regenerate the JSON file and write a
-- NEW migration that follows the same drop-then-add pattern below — never
-- edit this file in place.

create extension if not exists pg_jsonschema;

alter table public.cards drop constraint if exists cards_payload_valid;

-- Data migration: rewrite item-card payloads.
-- 1) Items with a typeLine: split on `,` or `·`, trim, drop empties,
--    write as headerTags, then drop the old key.
update public.cards
set payload = (payload - 'typeLine') || jsonb_build_object(
  'headerTags',
  coalesce(
    (
      select jsonb_agg(trimmed)
      from (
        select trim(t) as trimmed
        from regexp_split_to_table(payload->>'typeLine', '\s*[,·]\s*') as t
      ) s
      where s.trimmed <> ''
    ),
    '[]'::jsonb
  )
)
where payload->>'kind' = 'item' and payload ? 'typeLine';

-- 2) Items without typeLine: just add an empty headerTags array.
update public.cards
set payload = payload || jsonb_build_object('headerTags', '[]'::jsonb)
where payload->>'kind' = 'item' and not (payload ? 'headerTags');

alter table public.cards
  add constraint cards_payload_valid
  check (jsonb_matches_schema(
    $cardpayload$
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "body": {
          "type": "string"
        },
        "imageUrl": {
          "type": "string"
        },
        "source": {
          "type": "string",
          "enum": [
            "custom",
            "api"
          ]
        },
        "apiRef": {
          "type": "object",
          "properties": {
            "system": {
              "type": "string",
              "const": "dnd5eapi"
            },
            "slug": {
              "type": "string"
            },
            "ruleset": {
              "type": "string",
              "enum": [
                "2014",
                "2024"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset"
          ],
          "additionalProperties": false
        },
        "createdAt": {
          "type": "string"
        },
        "updatedAt": {
          "type": "string"
        },
        "iconKey": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "const": "item"
        },
        "headerTags": {
          "default": [],
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "footerTags": {
          "default": [],
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "name",
        "body",
        "source",
        "createdAt",
        "updatedAt",
        "kind",
        "headerTags",
        "footerTags"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "body": {
          "type": "string"
        },
        "imageUrl": {
          "type": "string"
        },
        "source": {
          "type": "string",
          "enum": [
            "custom",
            "api"
          ]
        },
        "apiRef": {
          "type": "object",
          "properties": {
            "system": {
              "type": "string",
              "const": "dnd5eapi"
            },
            "slug": {
              "type": "string"
            },
            "ruleset": {
              "type": "string",
              "enum": [
                "2014",
                "2024"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset"
          ],
          "additionalProperties": false
        },
        "createdAt": {
          "type": "string"
        },
        "updatedAt": {
          "type": "string"
        },
        "iconKey": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "const": "spell"
        }
      },
      "required": [
        "name",
        "body",
        "source",
        "createdAt",
        "updatedAt",
        "kind"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "body": {
          "type": "string"
        },
        "imageUrl": {
          "type": "string"
        },
        "source": {
          "type": "string",
          "enum": [
            "custom",
            "api"
          ]
        },
        "apiRef": {
          "type": "object",
          "properties": {
            "system": {
              "type": "string",
              "const": "dnd5eapi"
            },
            "slug": {
              "type": "string"
            },
            "ruleset": {
              "type": "string",
              "enum": [
                "2014",
                "2024"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset"
          ],
          "additionalProperties": false
        },
        "createdAt": {
          "type": "string"
        },
        "updatedAt": {
          "type": "string"
        },
        "iconKey": {
          "type": "string"
        },
        "kind": {
          "type": "string",
          "const": "ability"
        }
      },
      "required": [
        "name",
        "body",
        "source",
        "createdAt",
        "updatedAt",
        "kind"
      ],
      "additionalProperties": false
    }
  ]
}
    $cardpayload$::json,
    payload
  ));

comment on constraint cards_payload_valid on public.cards is
  'JSON Schema validation generated from src/decks/schema.ts via npm run gen:schema. Regen requires a new migration that drops + re-adds this constraint.';
