/** DWG formatting is not part of a room name or storey title. */
export function cleanCadText(value: string): string {
  return value
    .replace(/\\?U\+([0-9a-f]{4})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/%%[uok]/gi, "")
    .replace(/\\P/g, " ")
    .replace(/\\[LlOo]/g, "")
    .trim();
}
