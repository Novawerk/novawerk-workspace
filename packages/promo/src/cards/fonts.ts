// The card fonts, fetched from Google Fonts at render time and kept in memory per instance:
//   Noto Serif 400/900     Latin: the squeezed serif capitals and the text
//   Noto Serif SC 500/900  Chinese Mincho, subset to the characters on the card
//   IBM Plex Mono 500/600  the HUD
//
// Fonts are not committed to the repo. If one can't be fetched we render without it (satori
// falls back to its built-in face) rather than fail the picture.

export interface CardFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 900;
  style: "normal";
}

/** Returns the fonts for a card with this text on it. Injectable so tests stay offline. */
export type CardFontLoader = (text: string) => Promise<CardFont[]>;

export const SERIF_FONT = "Noto Serif";
export const SERIF_CJK_FONT = "Noto Serif SC";
export const MONO_FONT = "IBM Plex Mono";

const HAN = /[　-〿㐀-鿿＀-￯]/;

/** Distinct CJK characters (and CJK punctuation) in the text, in a stable order. */
export function cjkCharacters(text: string): string {
  return [...new Set([...text].filter((ch) => HAN.test(ch)))].sort().join("");
}

/** The first `format('truetype')` (else woff) URL in a @font-face stylesheet. */
export function fontUrlFromCss(css: string): string | null {
  const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]?(truetype|woff)['"]?\s*\)/g)];
  const pick = urls.find((m) => m[2] === "truetype") ?? urls.find((m) => m[2] === "woff");
  if (!pick) return null;
  const url = pick[1]!;
  return url.startsWith("//") ? `https:${url}` : url;
}

const TIMEOUT_MS = 8000;
const MAX_SUBSETS = 200;

export function createFontLoader(opts: { fetch?: typeof fetch; warn?: (message: string) => void } = {}): CardFontLoader {
  const fetchImpl = opts.fetch ?? fetch;
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const cache = new Map<string, Promise<ArrayBuffer | null>>();

  const fromCss = (cssUrl: string): Promise<ArrayBuffer | null> => {
    const cached = cache.get(cssUrl);
    if (cached) return cached;
    const load = (async () => {
      // No browser User-Agent: Google Fonts then answers with TrueType, which satori reads.
      const css = await fetchImpl(cssUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!css.ok) throw new Error(`${css.status} for ${cssUrl}`);
      const fontUrl = fontUrlFromCss(await css.text());
      if (!fontUrl) throw new Error(`no TrueType or WOFF font in ${cssUrl}`);
      const font = await fetchImpl(fontUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!font.ok) throw new Error(`${font.status} for ${fontUrl}`);
      return font.arrayBuffer();
    })().catch((err: unknown) => {
      warn(`[cards] font not loaded, rendering without it: ${err instanceof Error ? err.message : String(err)}`);
      cache.delete(cssUrl); // try again next time
      return null;
    });
    if (cache.size > MAX_SUBSETS) cache.delete(cache.keys().next().value!);
    cache.set(cssUrl, load);
    return load;
  };

  return async (text) => {
    const google = (family: string, weight: number, subset?: string) =>
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}` +
      (subset ? `&text=${encodeURIComponent(subset)}` : "");
    const wanted: [Omit<CardFont, "data">, string][] = [
      [{ name: SERIF_FONT, weight: 900, style: "normal" }, google(SERIF_FONT, 900)],
      [{ name: SERIF_FONT, weight: 400, style: "normal" }, google(SERIF_FONT, 400)],
      [{ name: MONO_FONT, weight: 500, style: "normal" }, google(MONO_FONT, 500)],
      [{ name: MONO_FONT, weight: 600, style: "normal" }, google(MONO_FONT, 600)],
    ];
    const cjk = cjkCharacters(text);
    if (cjk) {
      wanted.push([{ name: SERIF_CJK_FONT, weight: 900, style: "normal" }, google(SERIF_CJK_FONT, 900, cjk)]);
      wanted.push([{ name: SERIF_CJK_FONT, weight: 500, style: "normal" }, google(SERIF_CJK_FONT, 500, cjk)]);
    }
    const loaded = await Promise.all(wanted.map(async ([font, url]) => ({ ...font, data: await fromCss(url) })));
    return loaded.filter((f): f is CardFont => f.data !== null);
  };
}
