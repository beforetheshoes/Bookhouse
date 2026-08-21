import { useCallback, useRef, useState } from "react";

/** "#" collects digits and punctuation, which sort before "a". */
export const SCRUBBER_LETTERS = [
  "#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
] as const;

interface AlphabetScrubberProps {
  onJump: (letter: string) => void;
  /** Shown while the jump is being resolved. */
  pending?: string | null;
}

/**
 * The A-Z rail down the right edge of the list.
 *
 * The list loads as you scroll rather than paginating, so without this the
 * only way to reach the Ms is to keep scrolling until they arrive. Dragging a
 * finger down the rail jumps continuously, which is what a rail this size is
 * for - the individual letters are 20px tall and nobody hits them exactly.
 */
export function AlphabetScrubber({ onJump, pending }: AlphabetScrubberProps) {
  const lastSentRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Set when a press landed on a letter, so that letter's own click does not
  // send a second, different one. A keyboard activation has no press before
  // it and still goes through.
  const pressSentRef = useRef(false);

  // The rail comes from the event rather than a ref: the handlers only ever
  // fire on the rail itself, so there is no "no rail" case to guard.
  const sendFor = useCallback((rail: HTMLElement, clientY: number) => {
    const rect = rail.getBoundingClientRect();
    if (rect.height === 0) return;
    const ratio = (clientY - rect.top) / rect.height;
    const index = Math.floor(ratio * SCRUBBER_LETTERS.length);
    const clamped = Math.min(Math.max(index, 0), SCRUBBER_LETTERS.length - 1);
    // Clamped into range, so this index always lands on a letter.
    const letter = SCRUBBER_LETTERS[clamped] as string;
    // Dragging crosses a letter many times per second; only changes matter.
    if (letter === lastSentRef.current) return;
    lastSentRef.current = letter;
    onJump(letter);
  }, [onJump]);

  return (
    <div
      data-testid="alphabet-scrubber"
      role="toolbar"
      aria-label="Jump to letter"
      aria-orientation="vertical"
      // 36px wide so the drag surface is thumb-sized. The letters cannot also
      // be 36px tall - 27 of them would need 972px, more than any phone has -
      // which is why the rail is dragged rather than tapped.
      className="sticky top-2 flex w-9 shrink-0 select-none flex-col items-center justify-center self-start py-1 lg:hidden"
      onPointerDown={(e) => {
        // Capture so the drag keeps reporting once the finger leaves the rail.
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        lastSentRef.current = null;
        // A press that landed on a letter is that letter - no arithmetic. The
        // rail is 8px taller than the letters it holds, so the ratio can round
        // to a neighbour, and a tap that answers with the letter before the one
        // under the finger is indistinguishable from a broken jump.
        const pressed = (e.target as HTMLElement).closest("button");
        const letter = pressed?.dataset.letter;
        pressSentRef.current = letter !== undefined;
        if (letter !== undefined) {
          lastSentRef.current = letter;
          onJump(letter);
          return;
        }
        sendFor(e.currentTarget, e.clientY);
      }}
      onPointerMove={(e) => { if (dragging) sendFor(e.currentTarget, e.clientY); }}
      onPointerUp={() => { setDragging(false); lastSentRef.current = null; }}
      onPointerCancel={() => { setDragging(false); lastSentRef.current = null; }}
    >
      {SCRUBBER_LETTERS.map((letter) => (
        <button
          key={letter}
          type="button"
          // The rail owns the pointer; these exist for tapping and for anyone
          // arrowing through with a keyboard or a screen reader.
          onClick={() => {
            if (pressSentRef.current) {
              pressSentRef.current = false;
              return;
            }
            onJump(letter);
          }}
          data-letter={letter}
          data-active={pending === letter}
          className="flex h-[3.4vh] min-h-[14px] w-full items-center justify-center rounded text-[10px] leading-none font-medium text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
        >
          {letter}
        </button>
      ))}
    </div>
  );
}
