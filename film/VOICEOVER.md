# Sealed Market launch film: voiceover script

The delivered film has music and sound effects only. Times are in seconds from the first frame
(30 fps). Each line fits its window at about 2.6 words per second, a measured, unhurried read.
The biggest sound-effect hits are at 7.5, 13.85, 14.4, 21.45, 37.8, 43.78, 45.58 and 63.0 s;
no line starts on one.

| # | Start | End | Length | Line | On screen |
|---|------:|----:|-------:|------|-----------|
| 1 | 0.4 | 2.6 | 2.2 | Share your data, and it's gone. | Show it. Lose it. |
| 2 | 3.6 | 7.8 | 4.2 | Buyers have it no better. They pay first and check later. | Or buy it blind. |
| 3 | 9.9 | 12.0 | 2.1 | What if nobody had to look? | What if nobody had to look? |
| 4 | 14.6 | 17.4 | 2.8 | This is Sealed Market. Sell answers, not spreadsheets. | Sealed Market |
| 5 | 17.6 | 20.8 | 3.2 | Your file is encrypted before it leaves your browser. | Locked before it leaves. |
| 6 | 22.0 | 25.6 | 3.6 | Inside the vault, it is tested for the buyer's own goal. | Tested inside. |
| 7 | 26.6 | 29.2 | 2.6 | Only a signed score comes out. | Only the score leaves. |
| 8 | 30.8 | 35.2 | 4.4 | So a buyer sees the quality, and a fair price, before paying anything. | Know before you pay. |
| 9 | 38.0 | 40.0 | 2.0 | Payment waits in escrow. | Pay per answer. |
| 10 | 40.4 | 43.1 | 2.7 | Each question returns one answer. Never a row. | (the answer: 261.17) |
| 11 | 43.9 | 45.3 | 1.4 | Narrow questions are refused. | Under 20 rows: blocked. |
| 12 | 46.0 | 50.1 | 4.1 | When the order is finished, everyone who contributed data is paid their share. | Everyone who contributed, paid. |
| 13 | 50.4 | 53.1 | 2.7 | If quality falls short, every dollar goes back. | Or 100% back. |
| 14 | 54.2 | 58.8 | 4.6 | It works for people, and for software agents buying with a spending limit. | For people. And agents. |
| 15 | 63.4 | 66.0 | 2.6 | Sealed Market. Sell answers, not spreadsheets. | Sealed Market |

Total: 118 words, 45.2 s of speech in a 70 s film.

## Mixing notes

- The delivered mix measures about -19 LUFS integrated with a -1.5 dBFS peak, which leaves
  room for a voice. Bring the final programme to your platform's target after adding it.
- `audio/make_audio.py` also writes `music.wav` and `sfx.wav` as separate stems, so the music
  can be ducked under the voice without lowering the effects.
- The pad is low-passed and the arpeggio sits above 500 Hz with fast decays; a voice centred
  around 1 to 3 kHz should not need much ducking.

## Claims check

Every line is backed by the app as it runs today. Three are worded carefully on purpose:

- "Tested for the buyer's own goal": the check runs a holdout model for the stated goal.
- "Never a row": answers are noised aggregates; a question matching fewer than 20 rows is refused.
- "Every dollar goes back": only when the measured quality misses the guarantee.

The film does not say hardware-proven, unhackable or live on mainnet. The end card carries
"Testnet preview. Sample data is fictional."
