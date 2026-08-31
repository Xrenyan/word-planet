export type Accent = 'en-GB' | 'en-US'

export type VoiceLookup =
  | { status: 'available'; voice: SpeechSynthesisVoice }
  | { status: 'unavailable' }

function canonicalLocale(locale: string): string {
  return locale.trim().toLowerCase().replace('_', '-')
}

/**
 * Selects only an exact locale match. A different English locale must never
 * be presented to a child as a UK or US pronunciation.
 */
export function findVoice(
  accent: Accent,
  voices: readonly SpeechSynthesisVoice[] = [],
): VoiceLookup {
  const target = canonicalLocale(accent)
  const voice = voices.find((candidate) => canonicalLocale(candidate.lang) === target)

  return voice ? { status: 'available', voice } : { status: 'unavailable' }
}
