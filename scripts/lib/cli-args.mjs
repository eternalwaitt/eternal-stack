/**
 * Return the value for a CLI flag from argv tokens.
 *
 * Supports both `--flag=value` and `--flag value` forms.
 * If the flag is missing, has no value, or is followed by another flag,
 * this returns `fallback`.
 * Duplicate flags resolve from the first occurrence.
 * `--flag=` is treated as an empty value and returns `fallback`.
 * Values that begin with `-` are treated as flags, so negative numerics like
 * `--count -5` are considered missing; use `--count=-5` when negatives are required.
 *
 * @example
 * argValue(["--name=Alice", "--age", "30"], "--name", "n/a") // "Alice"
 * argValue(["--name", "Alice", "--age", "30"], "--name", "n/a") // "Alice"
 * argValue(["--name", "--age"], "--name", "n/a") // "n/a"
 *
 * @param {string[]} args Command-line args (for example, `process.argv.slice(2)`).
 * @param {string} flag Exact flag name to resolve.
 * @param {string} [fallback=""] Value returned when no usable value is found.
 * @returns {string} Resolved flag value or fallback.
 */
export function argValue(args, flag, fallback = "") {
  if (!Array.isArray(args) || typeof flag !== "string") return fallback;
  const safeArgs = args.filter((arg) => typeof arg === "string");
  for (let index = 0; index < safeArgs.length; index += 1) {
    const token = safeArgs[index];
    if (token === flag) {
      const value = safeArgs[index + 1];
      return !value || value.startsWith("-") ? fallback : value;
    }
    if (token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1);
      return value === "" ? fallback : value;
    }
  }
  return fallback;
}
