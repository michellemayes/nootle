# Test fixtures

`call_mic.flac` and `call_system.flac` are the two sides of a simulated call:
one voice on the microphone ("You") and two voices taking turns on system
audio. `call.json` lists each turn with its speaker, channel, timing and
reference text.

The speech is from [LibriSpeech](https://www.openslr.org/12) test-clean
(speakers 260, 3575 and 7127; utterance ids in `call.json`), © Vassil
Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The clips were
resampled to 16 kHz mono, placed on separate channels, and joined with
0.7 s of silence between turns.
