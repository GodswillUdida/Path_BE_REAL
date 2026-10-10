// src/utils/zodHelpers.ts
import { z } from "zod";

/**
 * Coerces multipart/form-data's stringified booleans ("true"/"false")
 * into real booleans. Multipart has no boolean type — every field is a
 * string on the wire, regardless of what the client's SDK claims to send.
 * Passes real booleans through unchanged (JSON body requests aren't affected).
 */
export const zBooleanLoose = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (val === "true") return true;
  if (val === "false") return false;
  return val; // let Zod's own type error fire for anything else — don't swallow bad input
}, z.boolean());

/**
 * Parses a field that may arrive as an actual array (JSON body) or as a
 * JSON-encoded string (multipart/form-data, where nested structures have
 * to be smuggled through as text). Throws a clear Zod issue on malformed
 * JSON rather than passing garbage further down the pipeline.
 */
export function zJsonArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return val; // let the array schema reject it with a proper Zod error
      }
    }
    return val;
  }, z.array(itemSchema));
}