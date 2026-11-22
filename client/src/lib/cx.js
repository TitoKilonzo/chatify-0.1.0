/** Join truthy class names into a single string. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
