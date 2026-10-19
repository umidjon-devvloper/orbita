import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import ru from "../../messages/ru.json" with { type: "json" };
import uz from "../../messages/uz.json" with { type: "json" };

type Json = Record<string, unknown>;

function paths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  const o = obj as Json;
  const out: string[] = [];
  for (const k of Object.keys(o)) {
    out.push(...paths(o[k], prefix === "" ? k : `${prefix}.${k}`));
  }
  return out;
}

describe("locale messages", () => {
  it("every locale has the same set of message keys as uz (the authoritative source)", () => {
    const base = new Set(paths(uz));
    const ruKeys = new Set(paths(ru));
    const enKeys = new Set(paths(en));
    const missingInRu = [...base].filter((k) => !ruKeys.has(k));
    const extraInRu = [...ruKeys].filter((k) => !base.has(k));
    const missingInEn = [...base].filter((k) => !enKeys.has(k));
    const extraInEn = [...enKeys].filter((k) => !base.has(k));
    expect({ missingInRu, extraInRu, missingInEn, extraInEn }).toEqual({
      missingInRu: [],
      extraInRu: [],
      missingInEn: [],
      extraInEn: [],
    });
  });

  it("every leaf is a non-empty string", () => {
    for (const [name, msgs] of [
      ["uz", uz],
      ["ru", ru],
      ["en", en],
    ] as const) {
      walkStrings(msgs, (path, value) => {
        expect(value.trim().length, `${name}: ${path}`).toBeGreaterThan(0);
      });
    }
  });
});

function walkStrings(obj: unknown, visit: (path: string, value: string) => void, prefix = "") {
  if (typeof obj === "string") {
    visit(prefix, obj);
    return;
  }
  if (obj === null || typeof obj !== "object") return;
  const o = obj as Json;
  for (const k of Object.keys(o)) {
    walkStrings(o[k], visit, prefix === "" ? k : `${prefix}.${k}`);
  }
}
