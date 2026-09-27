// Error taxonomy, modelled on Cqctxs/Pilot src/shared/errors.ts (caller / live site / recipe broken / AI).
// Reimplemented, not copied: that repo has no licence.
export type PilotErrorCode =
  | "INVALID_ARGUMENT" | "UNKNOWN_PILOT"                     // caller mistakes
  | "SOURCE_UNAVAILABLE" | "RATE_LIMITED" | "BLOCKED"       // the live site said no
  | "INVALID_SOURCE_RESPONSE"
  | "PILOT_BROKEN"                                          // the saved request no longer matches the site
  | "NO_ANSWER_REQUEST"                                     // learn: no JSON request carried the query
  | "AI_REQUEST_FAILED" | "VALIDATION_FAILED"
  | "INTERNAL_ERROR";

export class PilotError extends Error {
  code: PilotErrorCode;
  pilot?: string;
  constructor(code: PilotErrorCode, message: string, pilot?: string) {
    super(message);
    this.code = code;
    this.pilot = pilot;
  }
  toJSON() {
    return { code: this.code, message: this.message, pilot: this.pilot };
  }
}

export const fail = (code: PilotErrorCode, message: string, pilot?: string) => new PilotError(code, message, pilot);

export function toPilotError(e: unknown): PilotError {
  return e instanceof PilotError ? e : new PilotError("INTERNAL_ERROR", e instanceof Error ? e.message : String(e));
}
