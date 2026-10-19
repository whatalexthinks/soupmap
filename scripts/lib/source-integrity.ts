/**
 * Git conflict markers are source corruption, not HTML or CSS syntax.
 * Reject merge and diff3 markers before they can reach a public build.
 */
export function assertNoConflictMarkers(source: string, path: string): void {
  const lines = source.split(/\r?\n/);
  const marker = /^[\t ]*(?:<{7,}|>{7,}|\|{7,}|={7,}[\t ]*$)/;
  for (let index = 0; index < lines.length; index++) {
    if (marker.test(lines[index]!)) {
      throw new Error(
        `Unresolved Git conflict marker in ${path}:${index + 1}. Resolve the conflict before building.`,
      );
    }
  }
}
