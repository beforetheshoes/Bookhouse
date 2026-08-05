export type ProgressKind = "EBOOK" | "AUDIO" | "READALOUD";

/**
 * Lives here rather than beside the progress UI because the server functions
 * need it too, and importing a component module into a server function would
 * drag React into that bundle.
 */
export function progressKindForEdition(formatFamily: string): ProgressKind {
  if (formatFamily === "AUDIOBOOK") return "AUDIO";
  return "EBOOK";
}
