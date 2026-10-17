import { divFloor, divHalfUp } from "./math.js";
import { err, ok, type Result } from "./result.js";

/** Whole UZS (so'm). Transported as a decimal string, stored as BIGINT. */
export type Uzs = bigint;

/** "6000000" → 6000000n. Rejects signs, decimals, separators. */
export function parseUzs(text: string): Result<Uzs, "money.invalid"> {
  return /^\d{1,15}$/.test(text) ? ok(BigInt(text)) : err("money.invalid", { text });
}

export const serializeUzs = (v: Uzs): string => v.toString();

/** Round down to a positive step (rewards: never exceed budget or cap). */
export function roundDownToStep(v: Uzs, step: Uzs): Uzs {
  return divFloor(v, step) * step;
}

/** Round half-up to a positive step (salary range bounds). */
export function roundHalfUpToStep(v: Uzs, step: Uzs): Uzs {
  return divHalfUp(v, step) * step;
}
