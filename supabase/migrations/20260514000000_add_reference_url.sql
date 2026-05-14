-- 20260514000000_add_reference_url.sql
-- Add an optional `referenceUrl` string to every card-payload variant. The QR
-- code feature renders a code in the card footer/body corner that encodes this
-- URL. For SRD-imported cards the mappers auto-fill it with the in-app
-- /reference/$kind/$key absolute URL; users can override (paste a dndbeyond
-- link, etc.) or clear it to disable the QR.
--
-- No data backfill: existing rows without `referenceUrl` simply have no QR.
-- The prior migration (20260513000000_apiref_add_kind) already nulled out
-- every existing apiRef on prod, so we have nothing to derive referenceUrl
-- from anyway. Users re-import from the SRD pickers to get QR codes.
--
-- The embedded JSON Schema below is generated from src/decks/schema.ts via
-- `npm run gen:schema`. To update it, regenerate the JSON file and write a
-- NEW migration that follows the same drop-then-add pattern below — never
-- edit this file in place.

alter table public.cards drop constraint if exists cards_payload_valid;

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
        "referenceUrl": {
          "type": "string"
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
        "referenceUrl": {
          "type": "string"
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
        "referenceUrl": {
          "type": "string"
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
