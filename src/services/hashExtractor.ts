const HASH_PATTERN = /^([a-zA-Z0-9]{4,8})/;

/**
 * Extracts a valid hash prefix from a Bambu Studio job/project name.
 *
 * A valid hash is 4–8 alphanumeric characters at the start of the job name,
 * e.g. "a9k2j3" from "a9k2j3-toy-name".
 *
 * Returns null when the job name does not match the expected pattern.
 */
export function extractHash(jobName: string): string | null {
  const match = HASH_PATTERN.exec(jobName);
  return match ? match[1] : null;
}
