"""Regression checks for the text actually sent to the speech provider."""

import importlib.util
import json
import math
import os
import subprocess
import tempfile
import time
import unittest
from array import array
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

spec = importlib.util.spec_from_file_location("generate_audio", Path(__file__).resolve().parents[2] / "scripts" / "generate-audio.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class SpokenTextTests(unittest.TestCase):
    def test_audio_vocabulary_comes_from_current_runtime_books(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            (directory / "g4-upper.json").write_text(json.dumps({"words": [{"id": "photo-sport", "term": "sport"}]}), encoding="utf-8")
            (directory / "g5-lower.json").write_text(json.dumps({"words": [{"id": "past-read", "term": "read"}]}), encoding="utf-8")
            self.assertEqual(sorted(word["term"] for word in generator.runtime_words(directory)), ["read", "sport"])

    def test_missing_runtime_books_cannot_publish_an_empty_audio_map(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "runtime"):
                generator.runtime_words(Path(folder))
    def test_silence_trim_keeps_thirty_milliseconds_before_even_a_quiet_consonant(self):
        quiet = [0] * 4800 + [34, -40] + [20] * 400 + [1000] * 3000
        self.assertEqual(generator.leading_trim_samples(quiet, 24000), 4080)
        self.assertEqual(generator.leading_trim_samples([0] * 300 + [50] * 2000, 24000), 0)
        with self.assertRaisesRegex(ValueError, "silent"):
            generator.leading_trim_samples([0] * 24000, 24000)

    def test_context_word_keeps_padding_after_the_actual_pause_not_the_estimated_tts_timestamp(self):
        waveform = [1000] * 4800 + [0] * 4800 + [50] * 3000
        self.assertEqual(generator.context_start_sample(waveform, .39), 8880)
        with self.assertRaisesRegex(ValueError, "pause"):
            generator.context_start_sample([1000] * 24000, .5)
    def test_expands_dictionary_placeholders_without_speaking_punctuation(self):
        cases = {
            "because of sb / sth": "because of somebody or something",
            "look at sb/sth": "look at somebody or something",
            "take care of sb/sth": "take care of somebody or something",
            "No.": "number",
            "a (an)": "a. an.",
            "be (am,is,are)": "be. am. is. are.",
            "dad (father)": "dad. father.",
            "couldn't=could not": "couldn't. could not.",
            "let's = let us": "let's. let us.",
            "half past one/two...": "half past one. half past two.",
            "TV": "TV",
            "Mr": "Mister",
            "us": "us",
        }
        for term, expected in cases.items():
            with self.subTest(term=term):
                self.assertEqual(generator.spoken_text(term), expected)

    def test_uses_context_for_verb_live_close_and_past_read(self):
        self.assertEqual(generator.context_clip("live"), ("I want to... live.", "live"))
        self.assertEqual(generator.context_clip("close"), ("I will... close.", "close"))
        self.assertEqual(generator.context_clip("read", past_tense=True), ("Yesterday I... read.", "read"))
        self.assertEqual(generator.context_clip("read"), ("I can... read.", "read"))
        self.assertIsNone(generator.context_clip("apple"))


class BundledAudioDecodeTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("WORDPLANET_DECODE_AUDIO") == "1", "Set WORDPLANET_DECODE_AUDIO=1 for the complete FFmpeg decode audit")
    def test_every_runtime_pronunciation_decodes_to_non_silent_audio(self):
        started = time.perf_counter()
        public = Path(__file__).resolve().parents[2] / "public"
        mapping = json.loads((public / "audio" / "map.json").read_text(encoding="utf-8"))
        words = [word for source in (public / "data" / "books").glob("*.json") for word in json.loads(source.read_text(encoding="utf-8"))["words"]]
        paths = set()
        for word in words:
            for locale in ["en-GB", "en-US"]:
                relative = mapping.get("words", {}).get(word["id"], {}).get(locale) or mapping["terms"][word["term"].casefold().strip()][locale]
                paths.add(public / relative.split("?")[0])
        ffmpeg = generator.find_ffmpeg()

        def decode(path):
            decoded = subprocess.run([ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"], capture_output=True, check=True)
            samples = array("h", decoded.stdout)
            self.assertGreater(len(samples), 1600, str(path))
            rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768
            self.assertGreater(rms, .001, f"Silent or near-silent audio: {path}")
            peak = max(abs(sample) for sample in samples) / 32768
            self.assertGreater(peak, .01, str(path))
            onset = next(index for index, sample in enumerate(samples) if abs(sample) > 164) / 16000
            conservative_onset = next(index for index, sample in enumerate(samples) if abs(sample) > 33) / 16000
            return len(samples) / 16000, rms, onset, conservative_onset

        with ThreadPoolExecutor(max_workers=8) as pool:
            measurements = list(pool.map(decode, sorted(paths)))
        durations = sorted(item[0] for item in measurements)
        onsets = sorted(item[2] for item in measurements)
        conservative_onsets = sorted(item[3] for item in measurements)
        print(json.dumps({"runtimeWords": len(words), "requestedAccents": len(words) * 2, "uniqueDecodedFiles": len(paths), "durationSecondsMinMax": [round(durations[0], 3), round(durations[-1], 3)], "minimumRms": round(min(item[1] for item in measurements), 5), "encodedOnsetSecondsP50P95Max": [round(onsets[len(onsets) // 2], 3), round(onsets[int(len(onsets) * .95)], 3), round(onsets[-1], 3)], "conservativeOnsetSecondsP50P95Max": [round(conservative_onsets[len(conservative_onsets) // 2], 3), round(conservative_onsets[int(len(conservative_onsets) * .95)], 3), round(conservative_onsets[-1], 3)], "auditSeconds": round(time.perf_counter() - started, 2)}, indent=2))


if __name__ == "__main__":
    unittest.main()
