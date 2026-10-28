# Audio assets and credits

The MP3 files below were supplied in the project's `sounds/` folder and are copied into `assets/audio/` with stable filenames used by the game:

- `punch.mp3` — punch impact (`تعمل عند اللكم.mp3`). The other supplied punch-named file is byte-identical, so it is not loaded twice.
- `kick.mp3` — kick impact (`alice_soundz-kick_m_05-تعمل عند الركل.mp3`). Heavy attacks use this sample at a lower playback speed.
- `hit-grunt.mp3` — fighter reaction when hit (`freesound_community-grunt-1-85280 صوت اللاعب عند تلقي ضربة.mp3`).
- `fight-start.mp3` — round start cue (`freesound_community-ready-fight-تعمل عند الضغط على بدأ المباراة.mp3`).
- `fight-music.mp3` — looping match music (`vaitsez-fight-fighting-boxing-music-الموسيقى التي ستعمل اثناء المباراة.mp3`).

Footsteps, jump, guard, and attack windup cues remain generated locally with the Web Audio API. `punch.ogg` is an earlier CC0 sample retained in the folder but is no longer used by gameplay.
