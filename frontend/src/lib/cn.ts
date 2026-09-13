/** Tiny class-name joiner. Avoids a dependency for something this small. */
export type ClassValue = string | number | null | false | undefined

export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value) && typeof value === 'string').join(' ')
}
