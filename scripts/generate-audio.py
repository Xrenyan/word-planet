"""Generate bundled British and American pronunciation MP3s for unique terms."""

import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "audio"
VOICES = {"en-GB": "en-GB-SoniaNeural", "en-US": "en-US-JennyNeural"}


def runtime_words(directory: Path = ROOT / "public" / "data" / "books") -> list[dict]:
    words = [word for source in sorted(directory.glob("*.json")) for word in json.loads(source.read_text(encoding="utf-8"))["words"]]
    if not words:
        raise ValueError("No runtime vocabulary; build the curriculum before generating audio")
    return words


def spoken_text(term: str) -> str:
    term = term.strip()
    aliases = {"no.": "number", "mr": "Mister", "mr.": "Mister", "mrs": "Missus", "mrs.": "Missus", "tv": "TV", "pe": "P E", "uk": "U K", "half past one/two...": "half past one. half past two."}
    if term.casefold() in aliases:
        return aliases[term.casefold()]
    term = re.sub(r"\bsb\s*/\s*sth\b", "somebody or something", term, flags=re.I)
    term = re.sub(r"\bsb\b", "somebody", term, flags=re.I)
    term = re.sub(r"\bsth\b", "something", term, flags=re.I)
    if "=" in term or "(" in term:
        return ". ".join(part.strip() for part in re.split(r"[=(),]", term) if part.strip()) + "."
    return term


def context_clip(term: str, past_tense: bool = False) -> tuple[str, str] | None:
    if term == "read" and past_tense:
        return "Yesterday I... read.", "read"
    return {
        "live": ("I want to... live.", "live"),
        "close": ("I will... close.", "close"),
        "read": ("I can... read.", "read"),
        "wind": ("The... wind.", "wind"),
        "minute": ("One... minute.", "minute"),
        "use": ("I can... use.", "use"),
    }.get(term)


def find_ffmpeg() -> str:
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as error:
        raise RuntimeError("Context pronunciation clips require ffmpeg or imageio-ffmpeg.") from error


def leading_trim_samples(samples, sample_rate: int) -> int:
    # -60 dBFS retains quiet consonants; preserve another 30 ms before that.
    first = next((index for index, sample in enumerate(samples) if abs(sample) > 32768 * .001), None)
    if first is None:
        raise ValueError("Cannot publish silent pronunciation audio")
    return max(0, first - round(sample_rate * .03))


def context_start_sample(samples, expected_offset: float) -> int:
    first = max(0, round((expected_offset - .35) * 24000))
    last = min(len(samples), round((expected_offset + .12) * 24000))
    quiet_start = None
    candidates = []
    for index in range(first, last):
        if abs(samples[index]) <= 32768 * .001:
            if quiet_start is None:
                quiet_start = index
        else:
            if quiet_start is not None and index - quiet_start >= 960:
                candidates.append(index)
            quiet_start = None
    if not candidates:
        raise ValueError("No acoustic pause before the target word; refusing to cut speech")
    end = min(candidates, key=lambda index: abs(index / 24000 - expected_offset))
    return max(0, end - 720)


def decode_pcm(source: Path) -> array:
    result = subprocess.run([find_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source), "-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"], capture_output=True, check=True)
    return array("h", result.stdout)


def pcm_onset(samples: array) -> float:
    return next(index for index, value in enumerate(samples) if abs(value) > 164) / 24000


def trim_leading_silence(source: Path, destination: Path) -> dict:
    samples = decode_pcm(source)
    trim = leading_trim_samples(samples, 24000)
    expected = samples[trim:]
    if trim < 120:
        shutil.copyfile(source, destination)
        return {"before": pcm_onset(samples), "after": pcm_onset(samples), "removed": 0, "correlation": 1}
    # Higher bitrate than the source limits additional lossy encoding error.
    # LAME's Xing/gapless metadata prevents decoder delay adding silence back.
    subprocess.run([find_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ac", "1", "-ar", "24000", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "64k", "-write_xing", "1", str(destination)], input=expected.tobytes(), capture_output=True, check=True)
    decoded = decode_pcm(destination)
    missing_tail = expected[len(decoded):]
    if abs(len(decoded) - len(expected)) > 576 or any(abs(value) > 33 for value in missing_tail):
        raise ValueError(f"Trimming unexpectedly changed non-silent duration: {source}")
    pairs = zip(expected, decoded)
    dot = sum(left * right for left, right in pairs)
    magnitude = math.sqrt(sum(value * value for value in expected) * sum(value * value for value in decoded))
    correlation = dot / magnitude if magnitude else 0
    if correlation < .97:
        raise ValueError(f"Re-encoding altered pronunciation waveform: {source} ({correlation:.4f})")
    return {"before": pcm_onset(samples), "after": pcm_onset(decoded), "removed": trim / 24000, "correlation": correlation}


def trim_existing_bundle(preview: bool = False) -> int:
    started = time.perf_counter()
    manifest_path = OUTPUT / "map.json"
    mapping = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = {**mapping["terms"], **mapping.get("words", {})}
    if preview:
        selected = {term: entries[term] for term in ["live", "read", "close", "sport", "apple"]}
        selected.update(mapping.get("words", {}))
    else:
        selected = entries
    paths = sorted({ROOT / "public" / url.split("?")[0] for locales in selected.values() for url in locales.values()})

    def process(source):
        # Keep staging on the destination volume for an atomic replacement.
        with tempfile.TemporaryDirectory(prefix=".audio-trim-", dir=OUTPUT) as folder:
            staged = Path(folder) / "trimmed.mp3"
            result = trim_leading_silence(source, staged)
            if not preview and result["removed"] > 0:
                os.replace(staged, source)
            return result

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(process, paths))
    if not preview:
        for locales in entries.values():
            for locale, url in locales.items():
                locales[locale] = url.split("?")[0] + "?v=4"
        mapping["leadingSilence"] = {"version": 1, "thresholdDb": -60, "paddingMs": 30, "audioRevision": 4}
        with tempfile.TemporaryDirectory(prefix=".audio-map-", dir=OUTPUT) as folder:
            staged = Path(folder) / "map.json"
            staged.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(staged, manifest_path)
    before = sorted(result["before"] for result in results)
    after = sorted(result["after"] for result in results)
    print(json.dumps({
        "preview": preview,
        "files": len(results),
        "onsetBeforeP50P95Max": [before[len(before) // 2], before[int(len(before) * .95)], before[-1]],
        "onsetAfterP50P95Max": [after[len(after) // 2], after[int(len(after) * .95)], after[-1]],
        "minimumWaveformCorrelation": min(result["correlation"] for result in results),
        "seconds": round(time.perf_counter() - started, 2),
    }, indent=2))
    return 0


async def save_audio(term: str, locale: str, destination: Path, past_tense: bool = False):
    clip = context_clip(term, past_tense)
    if not clip:
        await edge_tts.Communicate(spoken_text(term), VOICES[locale], rate="-8%").save(str(destination))
        return
    # A sentence disambiguates homographs. Keep only the target word using
    # provider word boundaries; temporary sentence recordings never ship.
    phrase, target = clip
    with tempfile.TemporaryDirectory(prefix="wordplanet-audio-") as folder:
        source = Path(folder) / "context.mp3"
        metadata = Path(folder) / "boundaries.jsonl"
        await edge_tts.Communicate(phrase, VOICES[locale], rate="-8%", boundary="WordBoundary").save(str(source), str(metadata))
        events = [json.loads(line) for line in metadata.read_text(encoding="utf-8").splitlines() if line.strip()]
        match = next((event for event in events if event.get("type") == "WordBoundary" and event.get("text", "").strip(".,!?").casefold() == target), None)
        if not match:
            raise RuntimeError(f"No word boundary for {target!r} in {phrase!r}")
        samples = decode_pcm(source)
        start = context_start_sample(samples, match["offset"] / 10_000_000)
        # The target is the final word: preserve its complete acoustic tail.
        subprocess.run([find_ffmpeg(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ac", "1", "-ar", "24000", "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "64k", "-write_xing", "1", str(destination)], input=samples[start:].tobytes(), check=True, capture_output=True)


def audio_key(term: str) -> str:
    return hashlib.sha256(term.casefold().strip().encode("utf-8")).hexdigest()[:20]


async def generate(term: str, locale: str, semaphore: asyncio.Semaphore, force: bool = False, past_tense: bool = False) -> tuple[str, bool, str | None]:
    folder = "uk" if locale == "en-GB" else "us"
    destination = OUTPUT / folder / f"{audio_key(term + ('|past' if past_tense else ''))}.mp3"
    if not force and destination.exists() and destination.stat().st_size > 512:
        return term, True, None
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with semaphore:
        for attempt in range(4):
            try:
                # Preserve the existing valid clip if a regeneration fails.
                with tempfile.TemporaryDirectory(prefix="wordplanet-generated-") as temporary:
                    staged = Path(temporary) / "audio.mp3"
                    await save_audio(term, locale, staged, past_tense)
                    if staged.stat().st_size <= 512:
                        raise RuntimeError("Generated audio is empty")
                    trimmed = Path(temporary) / "trimmed.mp3"
                    trim_leading_silence(staged, trimmed)
                    shutil.copyfile(trimmed, destination)
                return term, destination.stat().st_size > 512, None
            except Exception as error:  # network service may briefly throttle
                if attempt == 3:
                    return term, False, str(error)
                await asyncio.sleep(1.5 * (attempt + 1))
    return term, False, "unknown"


async def main() -> int:
    words = runtime_words()
    terms = sorted({word["term"].casefold().strip() for word in words})
    semaphore = asyncio.Semaphore(30)
    previous = json.loads((OUTPUT / "map.json").read_text(encoding="utf-8")) if (OUTPUT / "map.json").exists() else {}
    normalization_version = 3
    changed_terms = {term for term in terms if spoken_text(term) != term or context_clip(term)}
    force_changed = previous.get("normalizationVersion") != normalization_version
    past_words = {word["id"]: word for word in words if word["term"].casefold() == "read" and "过去式" in word["meaningZh"]}
    regenerate_terms = changed_terms | set(previous.get("spokenText", {}))
    context_changed = previous.get("contextClipVersion") != 2
    tasks = [generate(term, locale, semaphore, (force_changed and term in regenerate_terms) or (context_changed and context_clip(term) is not None)) for term in terms for locale in VOICES]
    tasks += [generate("read", locale, semaphore, force_changed or context_changed, past_tense=True) for locale in VOICES] if past_words else []
    results = await asyncio.gather(*tasks)
    failures = [(term, reason) for term, success, reason in results if not success]
    audio_map = {
        term: {
            locale: f"audio/{'uk' if locale == 'en-GB' else 'us'}/{audio_key(term)}.mp3" + (f"?v={normalization_version}" if term in changed_terms else "")
            for locale in VOICES
        }
        for term in terms
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if failures:
        print(json.dumps(failures[:20], ensure_ascii=False), file=sys.stderr)
        return 1
    word_audio = {word_id: {locale: f"audio/{'uk' if locale == 'en-GB' else 'us'}/{audio_key('read|past')}.mp3?v={normalization_version}" for locale in VOICES} for word_id in past_words}
    manifest = {"voices": VOICES, "normalizationVersion": normalization_version, "contextClipVersion": 2, "spokenText": {term: spoken_text(term) for term in sorted(changed_terms)}, "contextClips": {term: context_clip(term)[0] for term in sorted(changed_terms) if context_clip(term)}, "wordContexts": {word_id: "Yesterday I... read." for word_id in past_words}, "words": word_audio, "terms": audio_map}
    if previous.get("leadingSilence"):
        manifest["leadingSilence"] = previous["leadingSilence"]
        for locales in [*audio_map.values(), *word_audio.values()]:
            for locale, url in locales.items():
                locales[locale] = url.split("?")[0] + "?v=4"
    (OUTPUT / "map.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated {len(results) - len(failures)}/{len(results)} pronunciation files for {len(terms)} unique terms.")
    return 0


if __name__ == "__main__":
    if "--trim-preview" in sys.argv or "--trim-bundle" in sys.argv:
        raise SystemExit(trim_existing_bundle(preview="--trim-preview" in sys.argv))
    raise SystemExit(asyncio.run(main()))
