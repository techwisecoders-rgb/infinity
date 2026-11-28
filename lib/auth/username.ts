export const INFINITY_USERNAME_PREFIX = "♾️";
const USERNAME_PREFIX_REGEX = /^(?:♾️|♾|∞|@)+/u;
const USERNAME_BODY_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export function stripUsernamePrefix(value: string): string {
  return value.trim().replace(USERNAME_PREFIX_REGEX, "");
}

export function isValidUsernameBody(value: string): boolean {
  return USERNAME_BODY_REGEX.test(stripUsernamePrefix(value));
}

export function normalizeInfinityUsername(value: string): string {
  const body = stripUsernamePrefix(value).toLowerCase();
  return `${INFINITY_USERNAME_PREFIX}${body}`;
}

export function formatInfinityUsername(value: string | null | undefined): string {
  if (!value) return `${INFINITY_USERNAME_PREFIX}user`;
  const body = stripUsernamePrefix(value);
  return body ? `${INFINITY_USERNAME_PREFIX}${body}` : `${INFINITY_USERNAME_PREFIX}user`;
}
