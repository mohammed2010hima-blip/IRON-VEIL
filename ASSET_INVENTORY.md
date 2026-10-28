# Inspected project asset inventory

The workspace originally contained model files only: no scene, game code, package manifest, bundled engine, sound files, or standalone textures. GLB inspection read each embedded glTF JSON chunk; character FBXs were parsed in Three.js 0.180.0 and their skeletal clips inspected in the browser.

## Used by the game

| Asset | Format / inspected contents | Integration |
| --- | --- | --- |
| `الشخصية/Vanguard By T. Choonyung.fbx` | Binary FBX; 2 skinned meshes, 65-bone Mixamo rig (53 animation tracks), about 183 units tall | Base model and shared skeleton for both fighters. Cloned and lightly tinted to distinguish the two sides. |
| `الشخصية/Idle.fbx` | Binary FBX; same 65-bone Mixamo skeleton, 53 tracks, 1.97 s clip | Authored looping combat idle pose. |
| `الشخصية/Running.fbx` | Binary FBX; compatible 65-bone skeleton, 53 tracks, 0.70 s clip | In-place run loop blended with idle while moving; controller handles arena movement. |
| `الشخصية/Punching.fbx` | Binary FBX; compatible 53-track clip, 1.27 s | Single light strike; one hit window is synced to its extension. |
| `الشخصية/Jab Cross.fbx` | Binary FBX; compatible 53-track clip, 1.23 s | Two-hit combo; two separate hit windows match the jab and cross. |
| `الشخصية/Illegal Knee.fbx` | Binary FBX; compatible 53-track clip, 2.27 s | Heavy attack; timed knee impact causes stronger body reaction and knockback. |
| `الشخصية/Body Block.fbx` | Binary FBX; compatible 53-track clip, 3.43 s | Looping guard stance; blocked hits use guard sparks and reduced damage without switching to a damage reaction. |
| `الشخصية/Head Hit.fbx` | Binary FBX; compatible 53-track clip, 1.43 s | Hit reaction for light punches. |
| `الشخصية/Big Stomach Hit.fbx` | Binary FBX; compatible 53-track clip, 1.40 s | Hit reaction for the heavy knee. |
| `الشخصية/Hit On Legs.fbx` | Binary FBX; compatible 53-track clip, 4.07 s | Knockdown animation for a nonlethal heavy hit that leaves the opponent at critical health. |
| `الشخصية/Standing Up.fbx` | Binary FBX; compatible 53-track clip, 6.07 s | Plays after the knockdown clip, then returns the fighter to idle or run. |
| `assets/sunlit-mountain-temple-arena.png` | User-provided temple arena image | Full-screen stage backdrop; fighters remain animated 3D models in front of it. |
| Procedural shadow receiver | Three.js `ShadowMaterial` plane | Receives soft cast shadows beneath the 3D fighters without covering the stage image. |
| `assets/audio/punch.ogg` | OGG audio, CC0 | Impact sample for punches and heavier hit variations. See `AUDIO_CREDITS.md`. |
| Web Audio synthesis | Browser AudioContext | Background battle loop, movement, jump, block and attack sounds, plus heavy-strike cries. |

## Available but not used

| Asset | Format / inspected contents | Notes |
| --- | --- | --- |
| `الشخصية/character.fbx` | Binary FBX | FileVersion 6100; Three.js FBXLoader 0.180.0 rejects this older format. Vanguard is a usable rigged character in the same character folder, so no replacement model was needed. |
| `الشخصية/Boxing.fbx` | Binary FBX; compatible 53-track clip, 1.73 s | Parsed and compatible; not selected because Jab Cross provides a clearer authored combo with two synchronized impacts. |
| `الشخصية/Punching (1).fbx` | Binary FBX | Duplicate strike export; not loaded separately. |
| `الشخصية/Double Dagger Stab.fbx` | Binary FBX; compatible 53-track clip, 3.07 s | Not used: the supplied fighter model has no dagger props, so the animation would imply missing weapons. |
| `desert_mud_concrete_house_lowpoly.glb` | GLB 2.0; 1 scene, 27 nodes, 12 meshes, 2 embedded materials | Unused architectural set; its desert-house look does not match the shrine stage. |
| `japan_temple.glb` | GLB 2.0; embedded textures, 1 scene, 7 nodes, 1 mesh | Replaced in the stage view by the user-provided arena image. |
| `cyberpunk_ground.glb` | GLB 2.0; embedded textures, 1 scene, 5 nodes, 1 mesh | Not loaded; the reference image already contains the stone floor. |
| `chinese_lion.glb` | GLB 2.0; embedded texture, 1 scene, 14 nodes, 10 meshes | Not loaded; the reference image already includes stage props. |
| `japanese_shrine_-_traditional_temple.glb` | GLB 2.0; 1 scene, 21 nodes, 17 meshes, 3 embedded images | Alternate shrine; 96.7 MB file, not needed with the supplied image backdrop. |
| `medieval_fantasy_contest_asset_-_temple.glb` | GLB 2.0; 1 scene, 5 nodes, 1 mesh, 2 embedded images | Unused medieval-style structure. |
| `moon.glb` | GLB 2.0; 1 scene, 6 nodes, 1 mesh, 4 embedded images; 1 animation | Unused moon model. |
| `mud_grassland.glb` | GLB 2.0; 1 scene, 29 nodes, 24 meshes, 4 embedded images | Unused grassland environment. |
| `overgrown_courtyard_patio_ruin.glb` | GLB 2.0; 1 scene, 26 nodes, 22 meshes, 3 embedded images | Unused courtyard environment; 117 MB file, with a different overgrown look. |
| `rugged_mountain_landscape.glb` | GLB 2.0; 1 scene, 10 nodes, 6 meshes, 4 embedded images | Unused landscape backdrop. |
| `traditional_chinese_altar_table.glb` | GLB 2.0; 1 scene, 8 nodes, 4 meshes, 3 embedded images | Unused ceremonial prop. |

The user-provided arena reference is used directly as the stage background. One CC0 impact sound is bundled locally; other effects and music are generated in Web Audio. The game imports Three.js from the official CDN, so gameplay requires a network connection for the engine modules and optional web fonts.
