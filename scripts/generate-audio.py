"""Generate bundled British and American pronunciation MP3s for unique terms."""

import asyncio
import hashlib
import json
import sys
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "sourced-vocabulary.json"
OUTPUT = ROOT / "public" / "audio"
VOICES = {"en-GB": "en-GB-SoniaNeural", "en-US": "en-US-JennyNeural"}


def audio_key(term: str) -> str:
    return hashlib.sha256(term.casefold().strip().encode("utf-8")).hexdigest()[:20]


async def generate(term: str, locale: str, semaphore: asyncio.Semaphore) -> tuple[str, bool, str | None]:
    folder = "uk" if locale == "en-GB" else "us"
    destination = OUTPUT / folder / f"{audio_key(term)}.mp3"
    if destination.exists() and destination.stat().st_size > 512:
        return term, True, None
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with semaphore:
        for attempt in range(4):
            try:
                await edge_tts.Communicate(term, VOICES[locale], rate="-8%").save(str(destination))
                return term, destination.stat().st_size > 512, None
            except Exception as error:  # network service may briefly throttle
                if destination.exists():
                    destination.unlink()
                if attempt == 3:
                    return term, False, str(error)
                await asyncio.sleep(1.5 * (attempt + 1))
    return term, False, "unknown"


async def main() -> int:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    terms = sorted({word["term"].casefold().strip() for book in payload["books"] for word in book["words"]})
    semaphore = asyncio.Semaphore(30)
    tasks = [generate(term, locale, semaphore) for term in terms for locale in VOICES]
    results = await asyncio.gather(*tasks)
    failures = [(term, reason) for term, success, reason in results if not success]
    audio_map = {
        term: {
            "en-GB": f"audio/uk/{audio_key(term)}.mp3",
            "en-US": f"audio/us/{audio_key(term)}.mp3",
        }
        for term in terms
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "map.json").write_text(
        json.dumps({"voices": VOICES, "terms": audio_map}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(results) - len(failures)}/{len(results)} pronunciation files for {len(terms)} unique terms.")
    if failures:
        print(json.dumps(failures[:20], ensure_ascii=False), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
