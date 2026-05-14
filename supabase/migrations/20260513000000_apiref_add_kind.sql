-- 20260513000000_apiref_add_kind.sql
-- Add a required `kind` discriminator to apiRef ("magic-items" | "mundane-items" | "spells").
-- Cards persist `Card.kind` ("item" | "spell" | "ability"), but for items that's
-- ambiguous between magic and mundane SRD sources. The new `apiRef.kind` is what
-- the upcoming reference-route / QR-code feature uses to construct
-- /reference/$kind/$key URLs without a runtime slug-to-kind lookup.
--
-- Backfill strategy: NULL OUT apiRef on every existing row instead of inferring
-- kind from the bundled SRD JSON. At time of writing prod holds ~16 cards
-- total, so the cost (losing the SRD slug pointer on those cards; QR codes
-- won't render until they're re-imported) is trivial compared to the
-- complexity of a slug→kind map embedded in this migration. Re-imports from
-- the SRD pickers will repopulate apiRef with the new shape automatically.
--
-- The embedded JSON Schema below is generated from src/decks/schema.ts via
-- `npm run gen:schema`. To update it, regenerate the JSON file and write a
-- NEW migration that follows the same drop-then-add pattern below — never
-- edit this file in place.

create extension if not exists pg_jsonschema;

alter table public.cards drop constraint if exists cards_payload_valid;

-- Strip apiRef from every existing card. Re-import to repopulate.
update public.cards
set payload = payload - 'apiRef'
where payload ? 'apiRef';

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
            },
            "kind": {
              "type": "string",
              "enum": [
                "magic-items",
                "mundane-items",
                "spells"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset",
            "kind"
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
        },
        "kind": {
          "type": "string",
          "const": "item"
        }
      },
      "required": [
        "name",
        "body",
        "source",
        "createdAt",
        "updatedAt",
        "headerTags",
        "footerTags",
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
            },
            "kind": {
              "type": "string",
              "enum": [
                "magic-items",
                "mundane-items",
                "spells"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset",
            "kind"
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
        "headerTags",
        "footerTags",
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
            },
            "kind": {
              "type": "string",
              "enum": [
                "magic-items",
                "mundane-items",
                "spells"
              ]
            }
          },
          "required": [
            "system",
            "slug",
            "ruleset",
            "kind"
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
        "headerTags",
        "footerTags",
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
