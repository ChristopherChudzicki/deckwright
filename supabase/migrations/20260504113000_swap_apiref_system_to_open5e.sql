-- 20260504113000_swap_apiref_system_to_open5e.sql
-- Swap apiRef.system literal from "dnd5eapi" to "open5e" to match the
-- migration to Open5e v2. Existing rows are backfilled in-place; their
-- slugs are now stale (dnd5eapi keys, not Open5e keys) but no code path
-- re-fetches from apiRef, so the rendered cards remain correct.
--
-- The embedded JSON Schema below is generated from src/decks/schema.ts via
-- `npm run gen:schema`. To update it, regenerate the JSON file and write a
-- NEW migration that follows the same drop-then-add pattern below — never
-- edit this file in place.

create extension if not exists pg_jsonschema;

alter table public.cards drop constraint if exists cards_payload_valid;

-- Data migration: rewrite api-sourced cards' apiRef.system from 'dnd5eapi' to 'open5e'.
update public.cards
set payload = jsonb_set(payload, '{apiRef,system}', '"open5e"'::jsonb, false)
where payload->'apiRef'->>'system' = 'dnd5eapi';

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
              "const": "open5e"
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
              "const": "open5e"
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
              "const": "open5e"
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
