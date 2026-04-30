export function isHermesDiagQuery(search: string): boolean {
  return new URLSearchParams(search).get('hermesdiag') === '1'
}
