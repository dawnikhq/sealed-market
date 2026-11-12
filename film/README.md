# Sealed Market launch film

A 70-second motion-graphics film built with [HyperFrames](https://hyperframes.heygen.com):
HTML, CSS and one GSAP timeline, rendered to MP4 at 1920x1080, 30 fps.

| File | What it is |
| :--- | :--- |
| `renders/sealed-market-launch.mp4` | The film, with music and sound effects, no voiceover. |
| `VOICEOVER.md` | Voiceover script with a start, end and length for every line. |
| `index.html` | The composition: stage, objects, staged UI, type. |
| `assets/film.css` | The look: table, key light, paper, glass vault, UI slabs, type. |
| `assets/film.js` | The timeline: camera, ten shots, nine transitions. |
| `audio/make_audio.py` | Synthesises the soundtrack (music, effects, mix) with numpy. |

## Rebuild

```bash
cd film
python3 audio/make_audio.py     # writes audio/music.wav, sfx.wav, mix.wav (not committed)
npm run check                   # lint and runtime checks
npm run render                  # writes renders/sealed-market-launch.mp4
```

Fonts (Geist, Geist Mono, Instrument Serif) and GSAP are vendored in `assets/`, so a render
needs no network. `npx hyperframes snapshot --at 14.4,30.5` captures stills at given seconds.

## How it is put together

- **One world.** A black table, one key light from the upper left, film grain and dust.
  White paper is data, smoked glass is the vault, white light is an answer.
- **Real figures.** Every number comes from one run of the app on the bike-rentals sample:
  quality 96%, fair price $3.76 to $4.50, $4.13 per answer, three answers for $12.39,
  a $0.62 fee, and $11.77 paid as $5.99 / $3.59 / $2.19. They do not change between scenes.
- **Real interface.** The four UI slabs rebuild the app's seller panel, quality report, payout
  receipt and auto-buy activity list with the app's own fonts, colours and copy.
- **Deterministic.** No clocks and no `Math.random()`: every frame is a function of timeline
  time, including grain, dust, counters and camera motion blur, so frames can render in any order.

## Shot list

| Time | Shot | Transition out |
| :--- | :--- | :--- |
| 0.0 – 3.0 | A sheet slides out and fans into copies. *Show it. Lose it.* | Whip pan |
| 3.3 – 9.0 | A sealed folder tagged "pay first"; a coin that cannot commit. *Or buy it blind.* | Pan back as the copies collapse into one sheet |
| 9.6 – 16.2 | The vault rises, the sheet drops in, the lid shuts, the seal stamps. *Sealed Market.* | The seller's screen swings in |
| 16.2 – 21.6 | Rows turn to ciphertext and leave as light. *Locked before it leaves.* | Push through the glass |
| 21.6 – 29.4 | Scanned and measured inside; only a ring of light comes out. *Only the score leaves.* | Match cut: the ring becomes the report's ring |
| 30.3 – 36.2 | The real quality report. *Know before you pay.* | The score becomes a coin; the camera follows it |
| 37.2 – 45.3 | Escrow, one question in, one number out, a narrow question refused. | The slit's light opens to white |
| 45.9 – 53.0 | The payment splits three ways; or it goes back whole. | Fast tilt up |
| 53.7 – 59.7 | The auto-buy bot ticks through six steps. *For people. And agents.* | Dolly out |
| 60.6 – 70.0 | The vault becomes the dot of the seal mark. End card. | Fade |
