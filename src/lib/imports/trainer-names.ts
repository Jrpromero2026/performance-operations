/**
 * Splitting a scheduling system's single "team member" string into the
 * first/last name the trainer record requires.
 *
 * Scheduling exports carry one display string. `trainers` requires both
 * `first_name` and `last_name` (each min length 1). Rather than invent a
 * surname, this function reports honestly when it cannot produce one, and
 * the review screen asks the owner for it. Guessing here would put
 * fabricated names on payroll statements.
 */

export interface SplitName {
  firstName: string;
  lastName: string;
  /** Display name exactly as the source wrote it. */
  displayName: string;
  /**
   * True when the source gave only one token, so no surname exists to
   * derive. The owner must supply one before the trainer can be created.
   */
  needsLastName: boolean;
}

/** Suffixes that are not surnames. */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

export function splitTrainerName(sourceName: string): SplitName {
  const displayName = sourceName.trim().replace(/\s+/g, " ");

  // "Romero, JR" — comma form puts the surname first.
  const comma = displayName.indexOf(",");
  if (comma > 0) {
    const last = displayName.slice(0, comma).trim();
    const first = displayName.slice(comma + 1).trim();
    if (last && first) {
      return { firstName: first, lastName: last, displayName, needsLastName: false };
    }
  }

  const tokens = displayName.split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return { firstName: "", lastName: "", displayName, needsLastName: true };
  }

  if (tokens.length === 1) {
    // Mononym: a real and common case (a trainer known only as "Amanda").
    // We do not fabricate a surname.
    return {
      firstName: tokens[0],
      lastName: "",
      displayName,
      needsLastName: true,
    };
  }

  // Trailing generational suffix belongs with the surname, not alone.
  let lastIndex = tokens.length - 1;
  if (SUFFIXES.has(tokens[lastIndex].toLowerCase()) && tokens.length > 2) {
    lastIndex -= 1;
  }

  const firstName = tokens.slice(0, lastIndex).join(" ");
  const lastName = tokens.slice(lastIndex).join(" ");

  return { firstName, lastName, displayName, needsLastName: false };
}
