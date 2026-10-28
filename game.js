import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const ui = {
  viewport: $('viewport'), loading: $('loading'), progress: $('load-progress'), loadStatus: $('load-status'),
  title: $('title-screen'), pause: $('pause-screen'), result: $('result-screen'), error: $('error-screen'),
  fightHud: $('fight-hud'), timer: $('timer'), round: $('round-number'), roundState: $('round-state'),
  p1Health: $('p1-health'), p2Health: $('p2-health'), p1Hp: $('p1-hp-label'), p2Hp: $('p2-hp-label'),
  p1Wins: $('p1-wins'), p2Wins: $('p2-wins'), p2Side: $('p2-side'), combo: $('combo'), comboNumber: $('combo-number'), toast: $('toast'),
  mobile: $('mobile-controls'), controlsHint: $('controls-hint'), sound: $('sound-toggle'), fullscreen: $('fullscreen-toggle')
};

const ARENA_LIMIT_X = 6.4;
const FIGHTER_CLEARANCE = 3.25;
const FIGHT_LANE_Z = 2.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x383b3a);
scene.fog = new THREE.Fog(0x9ccbf0, 78, 150);
const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 220);
camera.position.set(0, 6.3, 19.5);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.setAttribute('aria-label', 'Three dimensional fighting arena');
ui.viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd6eaff, 0x66513d, 1.75));
const sunLight = new THREE.DirectionalLight(0xffe3b5, 3.35);
sunLight.position.set(-8, 13, 7); sunLight.castShadow = true;
sunLight.shadow.mapSize.set(3072, 3072);
sunLight.shadow.camera.left = -15; sunLight.shadow.camera.right = 15;
sunLight.shadow.camera.top = 11; sunLight.shadow.camera.bottom = -11;
sunLight.shadow.camera.near = .5; sunLight.shadow.camera.far = 42;
sunLight.shadow.bias = -0.00018; sunLight.shadow.normalBias = 0.025;
sunLight.shadow.radius = 5;
scene.add(sunLight, sunLight.target);
const skyFill = new THREE.DirectionalLight(0xc5e1ff, .9); skyFill.position.set(7, 7, -8); scene.add(skyFill);
const warmFill = new THREE.PointLight(0xffd49a, 3.5, 24, 2); warmFill.position.set(-5, 5, 4); scene.add(warmFill);
const clock = new THREE.Clock();
const keys = new Set();
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const arena = new THREE.Group(); scene.add(arena);
const fighters = [];
const axisX = new THREE.Vector3(1, 0, 0);
const poseDelta = new THREE.Quaternion();
const effects = [];
let gameMode = 'cpu';
let gameState = 'loading';
let roundNumber = 1;
let secondsLeft = 90;
let roundWins = [0, 0];
let roundEndAt = 0;
let matchEndAt = 0;
let pausedAt = 0;
let soundOn = true;
let audioContext = null;
let audioMaster = null;
const providedAudio = {
  punch: new Audio('assets/audio/punch.mp3'),
  kick: new Audio('assets/audio/kick.mp3'),
  hurt: new Audio('assets/audio/hit-grunt.mp3'),
  ready: new Audio('assets/audio/fight-start.mp3'),
  music: new Audio('assets/audio/fight-music.mp3')
};
Object.values(providedAudio).forEach((clip) => { clip.preload = 'auto'; });
providedAudio.music.loop = true;
providedAudio.music.volume = .38;
let comboCount = 0;
let comboExpiry = 0;
let uiTick = 0;
let fxTime = 0;
let stageImage = null;

function setLoading(percent, text) {
  ui.progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  ui.loadStatus.textContent = `${text} · ${Math.round(percent)}%`;
}

async function buildArena() {
  setLoading(18, 'SETTING THE SUNLIT TEMPLE STAGE');
  const stageTexture = await new THREE.TextureLoader().loadAsync('assets/sunlit-mountain-temple-arena.png');
  stageTexture.colorSpace = THREE.SRGBColorSpace;
  stageTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  stageImage = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 27),
    new THREE.MeshBasicMaterial({ map: stageTexture, toneMapped: false })
  );
  stageImage.position.set(0, -.1, -18);
  stageImage.renderOrder = -1;
  scene.add(stageImage);

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(25, 20),
    new THREE.ShadowMaterial({ color: 0x20170f, opacity: .29 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.set(0, -.025, 2.1);
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);
  setLoading(74, 'WARM DAYLIGHT AND SOFT FIGHTER SHADOWS');
}

function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#665f53'; ctx.fillRect(0, 0, 1024, 1024);
  let seed = 2048;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rows = 9, rowH = 1024 / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? -50 : 0;
    const count = row % 2 ? 7 : 8, tileW = 1024 / count;
    for (let col = -1; col <= count; col++) {
      const x = col * tileW + offset, y = row * rowH;
      const shade = Math.floor(91 + rand() * 46);
      ctx.fillStyle = `rgb(${shade + 10},${shade + 6},${shade})`;
      ctx.fillRect(x + 3, y + 3, tileW - 6, rowH - 6);
      ctx.strokeStyle = 'rgba(232,216,184,.18)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 4, tileW - 8, rowH - 8);
      ctx.fillStyle = `rgba(34,29,23,${.03 + rand() * .09})`;
      for (let n = 0; n < 18; n++) ctx.fillRect(x + rand() * tileW, y + rand() * rowH, 2 + rand() * 8, 1 + rand() * 3);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function buildCourtyard() {
  const deckMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: .92, metalness: .01 });
  deckMat.map.wrapS = deckMat.map.wrapT = THREE.RepeatWrapping;
  deckMat.map.repeat.set(2.1, 2.1);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(36, .48, 34), deckMat);
  deck.position.set(0, -.28, -2.2); deck.receiveShadow = true; deck.castShadow = true; arena.add(deck);
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(36.3, .64, 34.3), new THREE.MeshStandardMaterial({ color: 0x39362f, roughness: .94 }));
  foundation.position.set(0, -.78, -2.2); foundation.castShadow = true; foundation.receiveShadow = true; arena.add(foundation);
  const gold = new THREE.MeshStandardMaterial({ color: 0xb79659, metalness: .3, roughness: .58 });
  const circle = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.54, 80), gold);
  circle.rotation.x = -Math.PI / 2; circle.position.set(0, -.028, .15); arena.add(circle);
}

function buildMountainBackdrop() {
  const rock = [0x697c83, 0x7d8d8c, 0x52666d, 0x9aa39b].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = side * (9.5 + i * 2.1);
      const z = -22 - (i % 3) * 3;
      const height = 10 + ((i * 7) % 9);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(3.5 + (i % 3) * .9, height, 7, 2), rock[i % rock.length]);
      peak.position.set(x, height * .42, z);
      peak.rotation.z = side * (i % 2 ? .11 : -.08);
      peak.castShadow = true;
      arena.add(peak);
      const snowCap = new THREE.Mesh(new THREE.ConeGeometry(1.3 + (i % 2) * .5, height * .27, 7, 1), new THREE.MeshStandardMaterial({ color: 0xd8e1dc, roughness: 1, flatShading: true }));
      snowCap.position.set(x, height * .79, z);
      arena.add(snowCap);
    }
  }
}

function buildTempleApproach() {
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b806d, roughness: .9 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x51483b, roughness: .94 });
  const pillar = (x, z, height = 4.2) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.72, .88, .32, 8), darkStone); base.position.set(x, .02, z); base.castShadow = true; base.receiveShadow = true; arena.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.48, .62, height, 8), stone); shaft.position.set(x, height / 2 + .18, z); shaft.castShadow = true; shaft.receiveShadow = true; arena.add(shaft);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.72, .6, .26, 8), darkStone); cap.position.set(x, height + .42, z); cap.castShadow = true; arena.add(cap);
  };
  for (const x of [-5.4, 5.4]) pillar(x, -5.4, 4.3);
  const crossbeam = new THREE.Mesh(new THREE.BoxGeometry(12.4, .48, .72), darkStone); crossbeam.position.set(0, 4.95, -5.4); crossbeam.castShadow = true; arena.add(crossbeam);
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x8c2824, roughness: .88, side: THREE.DoubleSide });
  for (const x of [-5.4, 5.4]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 2.55, 1, 4), bannerMat);
    banner.position.set(x, 3.15, -4.98); banner.castShadow = true; arena.add(banner);
  }
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(7.3 - i * .36, .18, .42), darkStone);
    step.position.set(0, .08 + i * .18, -6.9 - i * .42); step.castShadow = true; step.receiveShadow = true; arena.add(step);
  }
}

function buildLantern(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); arena.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: 0x746b5b, roughness: .82 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xffc96e, emissive: 0xe88e33, emissiveIntensity: .85, roughness: .4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .6, .24, 8), stone); base.position.y = .12; base.castShadow = true; group.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.16, .23, .78, 8), stone); stem.position.y = .58; stem.castShadow = true; group.add(stem);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(.52, .5, .5), warm); lamp.position.y = 1.18; group.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(.62, .28, 8), stone); roof.position.y = 1.58; roof.rotation.y = Math.PI / 8; roof.castShadow = true; group.add(roof);
  const light = new THREE.PointLight(0xffc36b, 3, 6, 2); light.position.y = 1.18; group.add(light);
}

function buildTempleFoliage() {
  const bark = new THREE.MeshStandardMaterial({ color: 0x564334, roughness: .94 });
  const leaves = [0x4d714c, 0x638458, 0x78905c].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .96 }));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (7.3 + i * .85), z = -4.4 - i * 2.1, height = 4.3 + (i % 2) * .8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.17, .34, height, 7), bark); trunk.position.set(x, height / 2, z); trunk.rotation.z = side * -.08; trunk.castShadow = true; arena.add(trunk);
      for (let n = 0; n < 7; n++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(.82 + (n % 3) * .12, 0), leaves[(i + n) % leaves.length]);
        puff.position.set(x + (randSign(n) * .72), height - .48 + (n % 3) * .48, z + (n % 2) * .42); puff.scale.set(1.34, .68, 1.08); puff.castShadow = true; arena.add(puff);
      }
    }
  }
}

function randSign(n) { return n % 2 ? 1 : -1; }

function buildWaterfalls() {
  const water = new THREE.MeshPhysicalMaterial({ color: 0x8ed4e8, roughness: .2, metalness: .08, transmission: .16, transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false });
  const foam = new THREE.MeshStandardMaterial({ color: 0xeaf7f6, emissive: 0x7daeb4, emissiveIntensity: .16, roughness: .3, transparent: true, opacity: .66 });
  for (const side of [-1, 1]) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 5.1, 1, 8), water);
    fall.position.set(side * 8.7, 2.4, -9.3); fall.rotation.y = side * -.1; fall.receiveShadow = true; arena.add(fall);
    const basin = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), foam);
    basin.rotation.x = -Math.PI / 2; basin.position.set(side * 8.7, -.012, -8.55); arena.add(basin);
    for (let i = 0; i < 7; i++) {
      const stream = new THREE.Mesh(new THREE.PlaneGeometry(.025 + (i % 2) * .02, .6 + (i % 3) * .22), foam);
      stream.position.set(side * 8.7 + (i - 3) * .22, 2.1 + (i % 2) * .38, -9.25); arena.add(stream);
    }
  }
}
function setCastShadow(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (Array.isArray(o.material)) o.material.forEach((m) => { if (m) { m.needsUpdate = true; } });
  });
}

function colorFighter(root, tint) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const apply = (m) => {
      const copy = m.clone();
      if (copy.color) copy.color.multiply(tint);
      if ('roughness' in copy) copy.roughness = Math.max(.34, copy.roughness * .9);
      if ('metalness' in copy) copy.metalness = Math.min(.55, copy.metalness + .08);
      return copy;
    };
    o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
  });
}

function createFighter(baseRig, clips, index) {
  const root = SkeletonUtils.clone(baseRig);
  const scale = .04;
  root.scale.setScalar(scale);
  root.rotation.y = index === 0 ? Math.PI / 2 : -Math.PI / 2;
  colorFighter(root, index === 0 ? new THREE.Color(0xa8ddec) : new THREE.Color(0xf0b09c));
  setCastShadow(root);
  root.position.set(index === 0 ? -2.1 : 2.1, 0, FIGHT_LANE_Z);
  arena.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [name, clip] of Object.entries(clips)) actions[name] = mixer.clipAction(clip);
  actions.kick = actions.heavy;
  actions.idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.update(0);
  const bone = (name) => root.getObjectByName(`mixamorig${name}`);
  const poseBones = {
    leftThigh: bone('LeftUpLeg'), rightThigh: bone('RightUpLeg'),
    leftShin: bone('LeftLeg'), rightShin: bone('RightLeg'),
    leftArm: bone('LeftArm'), rightArm: bone('RightArm'),
    leftForearm: bone('LeftForeArm'), rightForearm: bone('RightForeArm'),
    spine: bone('Spine2')
  };
  const poseRest = {};
  for (const [name, joint] of Object.entries(poseBones)) if (joint) poseRest[name] = joint.quaternion.clone();
  const fighter = {
    index, root, mixer, actions, idle: actions.idle, health: 100, maxHealth: 100,
    speed: 3.25, guard: false, jumping: false, jumpVelocity: 0, y: 0,
    attack: null, attackAge: 0, attackHits: [], cooldown: 0, hitTimer: 0, knockedDown: false,
    recoil: 0, wins: 0, aiThink: .7 + Math.random() * .3, lastHitAt: -10,
    moving: false, poseBones, poseRest, stride: 0, state: 'idle'
  };
  fighter.idle.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(.18).play();
  fighter.currentAction = fighter.idle;
  mixer.addEventListener('finished', (event) => {
    if (event.action !== fighter.currentAction) return;
    if (['punch', 'combo', 'heavy', 'kick'].includes(fighter.state)) {
      fighter.attack = null;
      fighter.attackAge = 0;
      settleFighterPose(fighter);
    } else if (fighter.state === 'hitLegs' && fighter.knockedDown) {
      fighter.hitTimer = 0;
      playPose(fighter, 'recover', false, .12);
    } else if (fighter.state === 'recover') {
      fighter.knockedDown = false;
      fighter.hitTimer = 0;
      settleFighterPose(fighter);
    } else if (fighter.state === 'hitHead' || fighter.state === 'hitBody') {
      fighter.hitTimer = 0;
      settleFighterPose(fighter);
    }
  });
  fighters.push(fighter);
  return fighter;
}

const ACTION_RATE = { idle: 1, run: .9, punch: 1.08, combo: 1.08, heavy: 1.38, kick: 1.48, guard: .9, hitHead: 1.8, hitBody: 1.8, hitLegs: 1.35, recover: 1.5 };

function playPose(fighter, actionName, loop = false, fade = .14, restart = false) {
  const next = fighter.actions[actionName] || fighter.idle;
  const current = fighter.currentAction || fighter.idle;
  if (current === next && next.isRunning() && !restart) return;
  next.reset();
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.setEffectiveTimeScale(ACTION_RATE[actionName] || 1);
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  next.clampWhenFinished = !loop;
  if (current === next) next.fadeIn(fade);
  else current.crossFadeTo(next, fade, true);
  next.play();
  fighter.currentAction = next;
  fighter.state = actionName;
}

function settleFighterPose(fighter, fade = .16) {
  if (fighter.health <= 0) { fighter.state = 'ko'; return; }
  if (fighter.guard) playPose(fighter, 'guard', true, fade);
  else if (fighter.moving && !fighter.jumping) playPose(fighter, 'run', true, fade);
  else playPose(fighter, 'idle', true, fade);
}

function removeClipPlanarRootMotion(clip, rig) {
  const hips = rig.getObjectByName('mixamorigHips');
  const rootTrack = clip.tracks.find((track) => track.name === 'mixamorigHips.position');
  if (!hips || !rootTrack) return clip;
  // Controller movement owns arena X/Z; retain the authored Y curve so falls and stand-ups still connect.
  for (let i = 0; i < rootTrack.values.length; i += 3) {
    rootTrack.values[i] = hips.position.x;
    rootTrack.values[i + 2] = hips.position.z;
  }
  return clip;
}

async function loadCharacterAndClips() {
  setLoading(61, 'BINDING WARRIOR SKELETON');
  const base = await fbxLoader.loadAsync(encodeURI('\u0627\u0644\u0634\u062e\u0635\u064a\u0629/Vanguard By T. Choonyung.fbx'));
  const skinned = base.getObjectByProperty('isSkinnedMesh', true);
  if (!skinned || !skinned.skeleton?.bones?.length) throw new Error('The Vanguard FBX has no usable skinned character rig.');
  // Keep only the rig and mesh as the fighters' shared base, then load compatible clips from the supplied Mixamo exports.
  const clips = {};
  setLoading(67, 'LOADING COMBAT MOTION');
  const animationFiles = [
    ['idle', 'Idle.fbx'], ['run', 'Running.fbx'],
    ['punch', 'Punching.fbx'], ['combo', 'Jab Cross.fbx'], ['heavy', 'Illegal Knee.fbx'],
    ['guard', 'Body Block.fbx'], ['hitHead', 'Head Hit.fbx'], ['hitBody', 'Big Stomach Hit.fbx'],
    ['hitLegs', 'Hit On Legs.fbx'], ['recover', 'Standing Up.fbx']
  ];
  for (let i = 0; i < animationFiles.length; i++) {
    const [name, file] = animationFiles[i];
    const path = `\u0627\u0644\u0634\u062e\u0635\u064a\u0629/${file}`;
    const asset = await fbxLoader.loadAsync(encodeURI(path));
    const clip = asset.animations.find((entry) => entry.tracks.some((track) => track.name.startsWith('mixamorig')));
    if (clip) clips[name] = removeClipPlanarRootMotion(clip, base);
    asset.clear();
    setLoading(67 + ((i + 1) / animationFiles.length) * 30, `MAPPING ${name.toUpperCase()} ANIMATION`);
  }
  const required = ['idle', 'run', 'punch', 'combo', 'heavy', 'guard', 'hitHead', 'hitBody', 'hitLegs', 'recover'];
  const missing = required.filter((name) => !clips[name]);
  if (missing.length) throw new Error(`Missing compatible fighter animations: ${missing.join(', ')}`);
  createFighter(base, clips, 0);
  createFighter(base, clips, 1);
}

function setHealth(fighter) {
  const ratio = Math.max(0, fighter.health / fighter.maxHealth);
  const bar = fighter.index === 0 ? ui.p1Health : ui.p2Health;
  const text = fighter.index === 0 ? ui.p1Hp : ui.p2Hp;
  bar.style.width = `${ratio * 100}%`;
  text.textContent = `${Math.ceil(fighter.health)} / 100`;
  bar.parentElement.classList.toggle('low-health', ratio < .25);
}

function updateWins() {
  for (let i = 0; i < 2; i++) {
    const host = i === 0 ? ui.p1Wins : ui.p2Wins;
    host.innerHTML = '<i></i><i></i>';
    [...host.children].forEach((el, n) => el.classList.toggle('filled', n < roundWins[i]));
  }
}

function updateHUD(force = false) {
  const now = performance.now();
  if (!force && now - uiTick < 80) return;
  uiTick = now;
  ui.timer.textContent = String(Math.max(0, Math.ceil(secondsLeft))).padStart(2, '0');
  ui.round.textContent = String(roundNumber).padStart(2, '0');
  if (fighters.length >= 2) { setHealth(fighters[0]); setHealth(fighters[1]); }
  updateWins();
  if (comboCount > 1 && now < comboExpiry) { ui.comboNumber.textContent = String(comboCount); ui.combo.classList.add('visible'); }
  else { ui.combo.classList.remove('visible'); if (now > comboExpiry) comboCount = 0; }
}

function toast(message, duration = 1000) {
  ui.toast.textContent = message;
  ui.toast.classList.add('visible');
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => ui.toast.classList.remove('visible'), duration);
}

function ensureAudio() {
  if (!soundOn) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const compressor = audioContext.createDynamicsCompressor();
    audioMaster = audioContext.createGain(); audioMaster.gain.value = .62;
    audioMaster.connect(compressor); compressor.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function sound(type = 'hit', volume = 1) {
  if (!soundOn) return;
  const sampleKey = ({ hit: 'punch', combo: 'punch', kick: 'kick', heavy: 'kick', hurt: 'hurt', ready: 'ready' })[type];
  if (sampleKey) {
    const sample = providedAudio[sampleKey];
    sample.pause(); sample.currentTime = 0;
    const sampleVolume = ({ hit: .68, combo: .62, kick: .78, heavy: .82, hurt: .74, ready: .85 })[type] * volume;
    sample.volume = Math.max(0, Math.min(1, sampleVolume));
    if (type === 'heavy') sample.playbackRate = .88;
    else sample.playbackRate = 1;
    sample.play().catch(() => {});
  }
  const ctx = ensureAudio(); if (!ctx) return;
  const t = ctx.currentTime;
  if (type === 'hurt' || type === 'ready') return;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  const heavy = type === 'heavy' || type === 'kick' || type === 'combo';
  osc.type = type === 'guard' ? 'triangle' : type === 'step' ? 'sine' : type === 'jump' ? 'triangle' : 'sawtooth';
  const start = type === 'guard' ? 410 : type === 'step' ? 105 : type === 'jump' ? 310 : heavy ? 140 : 225;
  osc.frequency.setValueAtTime(start, t);
  osc.frequency.exponentialRampToValueAtTime(type === 'guard' ? 175 : type === 'step' ? 52 : type === 'jump' ? 90 : 46, t + (type === 'heavy' ? .25 : type === 'kick' ? .21 : type === 'step' ? .09 : .15));
  gain.gain.setValueAtTime(volume * (type === 'step' ? .11 : type === 'guard' ? .12 : type === 'heavy' ? .28 : type === 'kick' ? .2 : .09), t);
  gain.gain.exponentialRampToValueAtTime(.001, t + (heavy ? .3 : .18));
  osc.connect(gain); gain.connect(audioMaster); osc.start(t); osc.stop(t + .32);
  if (type === 'heavy' || type === 'kick') battleCry(t, type === 'heavy' ? 1 : .62);
}

function battleCry(time, volume = 1) {
  const ctx = audioContext; if (!ctx || !audioMaster) return;
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .22), ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
  const source = ctx.createBufferSource(); source.buffer = noise;
  const formantA = ctx.createBiquadFilter(), formantB = ctx.createBiquadFilter(), envelope = ctx.createGain();
  formantA.type = 'bandpass'; formantA.frequency.value = 680; formantA.Q.value = 3.8;
  formantB.type = 'bandpass'; formantB.frequency.value = 1180; formantB.Q.value = 4.2;
  envelope.gain.setValueAtTime(.0001, time); envelope.gain.exponentialRampToValueAtTime(.12 * volume, time + .022);
  envelope.gain.exponentialRampToValueAtTime(.0001, time + .21);
  source.connect(formantA); formantA.connect(formantB); formantB.connect(envelope); envelope.connect(audioMaster);
  source.start(time); source.stop(time + .23);
}

function startBattleMusic() {
  if (!soundOn || gameState !== 'playing') return;
  const music = providedAudio.music;
  if (!music.paused) return;
  if (music.currentTime > 0) music.currentTime = 0;
  music.play().catch(() => {});
}

function stopBattleMusic() {
  const music = providedAudio.music;
  music.pause();
  music.currentTime = 0;
}

function burstAt(x, y, z, color = 0xf2ce83, heavy = false) {
  const group = new THREE.Group(); group.position.set(x, y, z); scene.add(group);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .86, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(heavy ? .12 : .08, .018, 6, 20), material.clone());
  ring.rotation.x = Math.PI / 2; group.add(ring);
  const count = heavy ? 16 : 10;
  const points = new THREE.BufferGeometry(), positions = new Float32Array(count * 3), velocities = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 2 * i / count + Math.random() * .3;
    const speed = (heavy ? 1.8 : 1.1) * (.65 + Math.random() * .7);
    positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
    velocities.push([Math.cos(angle) * speed, (.45 + Math.random() * 1.4) * speed, Math.sin(angle) * speed]);
  }
  points.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(points, new THREE.PointsMaterial({ color, size: heavy ? .075 : .055, transparent: true, opacity: 1, depthWrite: false }));
  group.add(sparks);
  effects.push({ group, ring, sparks, velocities, points, life: 0, duration: heavy ? .5 : .35 });
}

function requestAttack(fighter, kind = 'punch') {
  if (gameState !== 'playing' || fighter.health <= 0 || fighter.attack || fighter.knockedDown || fighter.cooldown > 0 || fighter.hitTimer > 0) return false;
  fighter.guard = false;
  fighter.attack = kind;
  fighter.attackAge = 0;
  fighter.attackHits = [];
  fighter.cooldown = kind === 'heavy' ? 1.15 : kind === 'kick' ? .86 : kind === 'combo' ? .85 : .58;
  playPose(fighter, kind, false, .09);
  sound('jump', .25);
  return true;
}

function setGuard(fighter, enabled) {
  if (enabled && (fighter.attack || fighter.knockedDown || fighter.hitTimer > 0 || fighter.health <= 0 || fighter.jumping || gameState !== 'playing')) return;
  if (enabled === fighter.guard) return;
  fighter.guard = enabled;
  if (enabled) playPose(fighter, 'guard', true, .12);
  else settleFighterPose(fighter, .18);
}

const ATTACK_WINDOWS = { punch: [[0.4, 0.57]], combo: [[0.2, 0.38], [0.64, 0.84]], kick: [[0.58, 0.91]], heavy: [[0.73, 1.08]] };

function attackTarget(attacker, defender, impactIndex = 0) {
  if (!attacker.attack || attacker.attackHits[impactIndex] || defender.knockedDown) return;
  const dx = defender.root.position.x - attacker.root.position.x;
  const dz = defender.root.position.z - attacker.root.position.z;
  const distance = Math.abs(dx);
  const facingDot = dx * Math.sin(attacker.root.rotation.y);
  const range = attacker.attack === 'heavy' ? 4.2 : attacker.attack === 'kick' ? 3.95 : 3.65;
  if (distance > range || facingDot <= 0) return;
  attacker.attackHits[impactIndex] = true;
  const guarded = defender.guard && !defender.jumping;
  const damage = guarded
    ? (attacker.attack === 'heavy' ? 8 : attacker.attack === 'kick' ? 6 : attacker.attack === 'combo' ? 4 : 5)
    : (attacker.attack === 'heavy' ? 25 : attacker.attack === 'kick' ? 17 : attacker.attack === 'combo' ? 8 : 12);
  defender.health = Math.max(0, defender.health - damage);
  const dir = Math.sign(dx) || (attacker.index === 0 ? 1 : -1);
  if (!guarded) {
    const pushX = defender.root.position.x + dir * (attacker.attack === 'heavy' ? .78 : attacker.attack === 'kick' ? .58 : attacker.attack === 'combo' ? .34 : .28);
    defender.root.position.x = THREE.MathUtils.clamp(pushX, -ARENA_LIMIT_X, ARENA_LIMIT_X);
    if (dir > 0) defender.root.position.x = Math.max(defender.root.position.x, attacker.root.position.x + FIGHTER_CLEARANCE);
    else defender.root.position.x = Math.min(defender.root.position.x, attacker.root.position.x - FIGHTER_CLEARANCE);
    defender.recoil = dir;
    defender.guard = false;
    defender.attack = null;
    defender.hitTimer = attacker.attack === 'heavy' ? .78 : attacker.attack === 'kick' ? .76 : .72;
    defender.knockedDown = attacker.attack === 'heavy' && defender.health > 0 && defender.health <= 30;
    const reaction = defender.knockedDown ? 'hitLegs' : (attacker.attack === 'heavy' || attacker.attack === 'kick') ? 'hitBody' : 'hitHead';
    playPose(defender, reaction, false, .07, true);
    burstAt((attacker.root.position.x + defender.root.position.x) / 2, 1.22, (attacker.root.position.z + defender.root.position.z) / 2, attacker.attack === 'heavy' ? 0xf2a666 : 0xf4dd9d, attacker.attack === 'heavy');
    sound(attacker.attack === 'heavy' ? 'heavy' : attacker.attack === 'kick' ? 'kick' : attacker.attack === 'combo' ? 'combo' : 'hit');
    sound('hurt', attacker.attack === 'heavy' ? .95 : .72);
    if (performance.now() - defender.lastHitAt < 1400) comboCount++; else comboCount = 1;
    defender.lastHitAt = performance.now(); comboExpiry = performance.now() + 1300;
    if (attacker.index === 0 && comboCount > 1) ui.combo.classList.add('visible');
  } else {
    defender.hitTimer = .16;
    burstAt(defender.root.position.x - dir * .35, 1.25, defender.root.position.z, 0x91dce0, false);
    sound('guard'); toast('GUARD', 420);
  }
  setHealth(defender);
}

function inputFor(fighter) {
  if (gameMode === 'cpu' && fighter.index === 1) return aiInput(fighter, fighters[0]);
  if (fighter.index === 0) return {
    x: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
    z: 0,
    guard: keys.has('l'), jump: keys.has(' ') || keys.has('w')
  };
  return {
    x: (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0),
    z: 0,
    guard: keys.has('0') || keys.has('numpad0') || keys.has('arrowdown'), jump: keys.has('arrowup') || keys.has('enter')
  };
}

function aiInput(fighter, opponent) {
  const dx = opponent.root.position.x - fighter.root.position.x;
  const dist = Math.abs(dx);
  fighter.aiThink -= fighter._delta || 0;
  if (fighter.aiThink <= 0) {
    fighter.aiThink = .24 + Math.random() * .38;
    const defensive = opponent.attack && Math.abs(dx) < FIGHTER_CLEARANCE + .55 && Math.random() < .42;
    const attack = !defensive && dist < FIGHTER_CLEARANCE + .35 && Math.random() < .22;
    fighter._ai = { guard: defensive, attack, heavy: attack && Math.random() < .14, kick: attack && Math.random() < .34 };
  }
  const decision = fighter._ai || {};
  return {
    x: dist > FIGHTER_CLEARANCE ? Math.sign(dx) : 0,
    z: 0,
    guard: !!decision.guard,
    jump: false,
    attack: decision.attack ? (decision.heavy ? 'heavy' : decision.kick ? 'kick' : 'punch') : null
  };
}

function startJump(fighter) {
  if (fighter.jumping || fighter.health <= 0 || fighter.attack || fighter.knockedDown || fighter.hitTimer > 0 || gameState !== 'playing') return;
  fighter.guard = false; fighter.jumping = true; fighter.jumpVelocity = 6.1; fighter.y = 0;
  sound('jump', .9);
  playPose(fighter, 'idle', true, .14);
}

function updateFighter(fighter, opponent, dt) {
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.hitTimer = Math.max(0, fighter.hitTimer - dt);
  fighter._delta = dt;
  const input = inputFor(fighter);
  if (input.attack) { requestAttack(fighter, input.attack); if (fighter._ai) fighter._ai.attack = false; }
  if (input.guard) setGuard(fighter, true); else if (fighter.guard) setGuard(fighter, false);
  if (input.jump && !fighter.wasJumping) startJump(fighter);
  fighter.wasJumping = input.jump;
  const dx = opponent.root.position.x - fighter.root.position.x;
  const dz = opponent.root.position.z - fighter.root.position.z;
  fighter.root.rotation.y = dx >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const locked = fighter.attack || fighter.knockedDown || fighter.state === 'recover' || fighter.state === 'hitHead' || fighter.state === 'hitBody' || fighter.state === 'hitLegs';
  const canMove = !locked && !fighter.guard;
  let vx = canMove ? input.x : 0, vz = canMove ? input.z : 0;
  const length = Math.hypot(vx, vz);
  if (length > 1) { vx /= length; vz /= length; }
  fighter.moving = length > .08;
  if (fighter.moving) {
    const sideToOpponent = Math.sign(dx) || (fighter.index === 0 ? 1 : -1);
    let nextX = THREE.MathUtils.clamp(fighter.root.position.x + vx * fighter.speed * dt, -ARENA_LIMIT_X, ARENA_LIMIT_X);
    if (sideToOpponent > 0) nextX = Math.min(nextX, opponent.root.position.x - FIGHTER_CLEARANCE);
    else nextX = Math.max(nextX, opponent.root.position.x + FIGHTER_CLEARANCE);
    fighter.root.position.x = THREE.MathUtils.clamp(nextX, -ARENA_LIMIT_X, ARENA_LIMIT_X);
    fighter.root.position.z = FIGHT_LANE_Z;
    fighter.stepTimer = (fighter.stepTimer || 0) - dt;
    if (fighter.stepTimer <= 0) { sound('step', .32); fighter.stepTimer = .38; }
  }
  if (fighter.jumping) {
    fighter.jumpVelocity -= 14 * dt;
    fighter.y += fighter.jumpVelocity * dt;
    if (fighter.y <= 0) { fighter.y = 0; fighter.jumping = false; }
  }
  if (!fighter.attack && !locked && !fighter.guard) {
    const desired = fighter.moving && !fighter.jumping ? 'run' : 'idle';
    if (fighter.state !== desired) playPose(fighter, desired, true, .16);
  }
  fighter.attackAge += fighter.attack ? dt : 0;
  if (fighter.attack) {
    const animationTime = fighter.attackAge * (ACTION_RATE[fighter.attack] || 1);
    const windows = ATTACK_WINDOWS[fighter.attack] || [];
    windows.forEach(([open, close], index) => {
      if (animationTime >= open && animationTime <= close && !fighter.attackHits[index]) attackTarget(fighter, opponent, index);
    });
  }
  const breathe = Math.sin(performance.now() * .0022 + fighter.index * 2) * .008;
  fighter.root.position.y = fighter.y + (fighter.moving && !fighter.jumping ? Math.abs(Math.sin(performance.now() * .013)) * .018 : breathe);
  fighter.root.rotation.z = fighter.hitTimer > 0 ? fighter.recoil * -.065 : (fighter.moving ? Math.sin(performance.now() * .012) * .012 : 0);
  fighter.mixer.update(dt);
  updateLocomotionPose(fighter, dt);
}

function updateLocomotionPose(fighter, dt) {
  // Idle and running have authored clips. Only jumping needs a lightweight procedural pose.
  if (!fighter.jumping || fighter.currentAction !== fighter.idle || fighter.guard || fighter.attack || fighter.hitTimer > 0) return;
  const { poseBones: joints, poseRest: rest } = fighter;
  if (!rest.leftThigh || !rest.rightThigh) return;
  fighter.stride += dt * (fighter.moving ? 10.5 : 2.25);
  const phase = fighter.stride;
  const swing = fighter.moving ? .48 : 0;
  const crouch = fighter.jumping ? .5 : 0;
  const l = Math.sin(phase), r = -l;
  const set = (name, angle) => {
    const joint = joints[name], authored = rest[name];
    if (!joint || !authored) return;
    poseDelta.setFromAxisAngle(axisX, angle);
    joint.quaternion.copy(authored).multiply(poseDelta);
  };
  set('leftThigh', l * swing + crouch * .45);
  set('rightThigh', r * swing + crouch * .45);
  set('leftShin', Math.max(0, -l) * swing * .62 + crouch * .72);
  set('rightShin', Math.max(0, -r) * swing * .62 + crouch * .72);
  set('leftArm', -l * swing * .48);
  set('rightArm', -r * swing * .48);
  set('leftForearm', fighter.jumping ? -.28 : 0);
  set('rightForearm', fighter.jumping ? -.28 : 0);
  set('spine', fighter.moving ? -.025 : Math.sin(phase) * .012);
}

function resolveRound() {
  if (gameState !== 'playing') return;
  gameState = 'roundEnd'; roundEndAt = performance.now() + 2650;
  for (const fighter of fighters) { fighter.moving = false; fighter.guard = false; }
  const [left, right] = fighters;
  let winner = -1;
  if (left.health > right.health) winner = 0; else if (right.health > left.health) winner = 1;
  if (winner >= 0) roundWins[winner]++;
  ui.roundState.textContent = winner < 0 ? 'DRAW' : winner === 0 ? 'KAZE WINS' : 'RAIJIN WINS';
  toast(winner < 0 ? 'ROUND DRAW' : `${winner === 0 ? 'KAZE' : 'RAIJIN'} TAKES THE ROUND`, 2100);
  sound('guard'); updateHUD(true);
  if (roundWins.some((wins) => wins >= 2)) {
    gameState = 'matchEnd'; matchEndAt = performance.now() + 2100;
  }
}

function resetRound() {
  roundNumber++;
  secondsLeft = 90;
  ui.roundState.textContent = 'FIGHT';
  for (const fighter of fighters) {
    fighter.health = 100; fighter.attack = null; fighter.attackAge = 0; fighter.attackHits = []; fighter.knockedDown = false;
    fighter.cooldown = .4; fighter.guard = false; fighter.hitTimer = 0; fighter.jumping = false; fighter.y = 0; fighter.moving = false;
    fighter.root.position.set(fighter.index === 0 ? -2.1 : 2.1, 0, FIGHT_LANE_Z);
    fighter.mixer.stopAllAction(); fighter.currentAction = fighter.idle; fighter.state = 'idle'; fighter.idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  }
  gameState = 'playing'; updateHUD(true); sound('ready'); toast(`ROUND ${roundNumber}`, 900);
}

function finishMatch() {
  stopBattleMusic();
  gameState = 'result';
  const winner = roundWins[0] >= 2 ? 0 : 1;
  $('result-title').textContent = winner === 0 ? 'VICTORY' : 'DEFEAT';
  $('result-subtitle').textContent = winner === 0 ? 'THE VANGUARD CLAIMS THE OATH' : 'THE SENTINEL KEEPS THE SHRINE';
  $('result-kicker').textContent = `${roundWins[0]} — ${roundWins[1]} · BEST OF THREE`;
  ui.result.classList.remove('hidden');
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i]; fx.life += dt;
    const t = fx.life / fx.duration;
    fx.ring.scale.setScalar(.5 + t * 3.4); fx.ring.material.opacity = Math.max(0, 1 - t);
    fx.sparks.material.opacity = Math.max(0, 1 - t);
    const pos = fx.points.attributes.position;
    for (let n = 0; n < fx.velocities.length; n++) {
      pos.array[n * 3] += fx.velocities[n][0] * dt;
      pos.array[n * 3 + 1] += fx.velocities[n][1] * dt;
      pos.array[n * 3 + 2] += fx.velocities[n][2] * dt;
      fx.velocities[n][1] -= 3.5 * dt;
    }
    pos.needsUpdate = true;
    if (t >= 1) { scene.remove(fx.group); fx.group.traverse((o) => { o.geometry?.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); } }); effects.splice(i, 1); }
  }
}

function updateCamera(dt) {
  if (fighters.length < 2) return;
  const [a, b] = fighters;
  const centerX = (a.root.position.x + b.root.position.x) / 2;
  const distance = Math.abs(a.root.position.x - b.root.position.x);
  const cameraX = THREE.MathUtils.clamp(centerX * .18, -1.8, 1.8);
  const cameraZ = THREE.MathUtils.clamp(19.5 + Math.max(0, distance - 5) * .32, 19.5, 22.1);
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraX, 1.25, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, 6.3, 1.25, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraZ, 1.25, dt);
  camera.lookAt(centerX * .12, 1.95, -4.5);
  fitStageBackdrop();
}

function fitStageBackdrop() {
  if (!stageImage) return;
  camera.updateMatrixWorld();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const distance = (stageImage.position.z - camera.position.z) / direction.z;
  const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const width = height * camera.aspect;
  const scale = Math.max(height / 27, width / 48) * 1.1;
  stageImage.scale.setScalar(scale);
  stageImage.position.x = camera.position.x + direction.x * distance;
  stageImage.position.y = camera.position.y + direction.y * distance;
}

function resize() {
  const width = innerWidth, height = innerHeight;
  camera.aspect = width / height;
  camera.fov = width < 600 ? 46 : 39;
  camera.updateProjectionMatrix(); renderer.setSize(width, height);
  const touchDevice = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchDevice ? 1.35 : width < 760 ? 1.4 : 1.8));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04);
  fxTime += dt;
  sunLight.intensity = 3.35 + Math.sin(fxTime * .12) * .025;
  if (gameState === 'playing') {
    secondsLeft = Math.max(0, secondsLeft - dt);
    updateFighter(fighters[0], fighters[1], dt);
    updateFighter(fighters[1], fighters[0], dt);
    if (fighters.some((f) => f.health <= 0) || secondsLeft <= 0) resolveRound();
  } else if (gameState === 'roundEnd' && performance.now() >= roundEndAt) {
    if (roundWins.some((wins) => wins >= 2)) finishMatch(); else resetRound();
  } else if (gameState === 'matchEnd' && performance.now() >= matchEndAt) finishMatch();
  if (gameState === 'roundEnd' || gameState === 'matchEnd') for (const fighter of fighters) fighter.mixer.update(dt);
  updateEffects(dt); updateCamera(dt); updateHUD();
  renderer.render(scene, camera);
}

function startGame(mode = gameMode) {
  gameMode = mode;
  $('p2-side').textContent = mode === 'cpu' ? 'CPU · THE SENTINEL' : 'P2 · THE SENTINEL';
  ui.controlsHint.innerHTML = mode === 'versus'
    ? '<span><kbd>A / D</kbd> P1 MOVE</span><span><kbd>W / SPACE</kbd> P1 JUMP</span><span><kbd>J / K / U / I</kbd> P1 ATTACK</span><span><kbd>← / →</kbd> P2 MOVE</span><span><kbd>↑</kbd> P2 JUMP</span><span><kbd>1 / 2 / 3 / 4</kbd> P2 ATTACK</span><span><kbd>L / 0</kbd> BLOCK</span>'
    : '<span><kbd>A / D</kbd> MOVE</span><span><kbd>W / SPACE</kbd> JUMP</span><span><kbd>J</kbd> PUNCH</span><span><kbd>K</kbd> KICK</span><span><kbd>U</kbd> COMBO</span><span><kbd>I</kbd> POWER</span><span><kbd>L</kbd> BLOCK</span>';
  ui.title.classList.add('hidden'); ui.result.classList.add('hidden'); ui.pause.classList.add('hidden');
  ui.fightHud.classList.add('active'); ui.mobile.classList.add('active');
  ui.controlsHint.style.opacity = '1';
  roundNumber = 1; secondsLeft = 90; roundWins = [0, 0];
  for (const fighter of fighters) {
    fighter.health = 100; fighter.attack = null; fighter.attackHits = []; fighter.knockedDown = false; fighter.hitTimer = 0; fighter.guard = false; fighter.cooldown = .4; fighter.moving = false; fighter.state = 'idle';
    fighter.root.position.set(fighter.index === 0 ? -1.8 : 1.8, 0, FIGHT_LANE_Z);
    fighter.mixer.stopAllAction(); fighter.idle.reset().setLoop(THREE.LoopRepeat, Infinity).play(); fighter.currentAction = fighter.idle;
  }
  gameState = 'playing'; updateHUD(true); ensureAudio(); startBattleMusic(); sound('ready'); toast('FIGHT', 900);
}

function togglePause(force) {
  if (gameState === 'playing' && force !== false) { gameState = 'paused'; pausedAt = performance.now(); stopBattleMusic(); ui.pause.classList.remove('hidden'); }
  else if (gameState === 'paused' && force !== true) {
    gameState = 'playing';
    startBattleMusic();
    const duration = performance.now() - pausedAt;
    if (roundEndAt) roundEndAt += duration;
    if (matchEndAt) matchEndAt += duration;
    ui.pause.classList.add('hidden');
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  if (key === 'escape' || key === 'p') { togglePause(); return; }
  if (key === 'enter' && gameState === 'paused') { togglePause(false); return; }
  if (gameState !== 'playing') { if (key === 'enter' && gameState === 'title') startGame(); return; }
  const wasDown = keys.has(key); keys.add(key);
  if (wasDown) return;
  if (key === 'j') requestAttack(fighters[0], 'punch');
  if (key === 'u') requestAttack(fighters[0], 'combo');
  if (key === 'k') requestAttack(fighters[0], 'kick');
  if (key === 'i') requestAttack(fighters[0], 'heavy');
  if (gameMode === 'versus') {
    if (key === 'numpad1' || key === '1') requestAttack(fighters[1], 'punch');
    if (key === 'numpad3' || key === '3') requestAttack(fighters[1], 'combo');
    if (key === 'numpad2' || key === '2') requestAttack(fighters[1], 'kick');
    if (key === 'numpad4' || key === '4') requestAttack(fighters[1], 'heavy');
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); if (gameState === 'playing') togglePause(); });

document.querySelectorAll('.mode-option').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.mode-option').forEach((item) => item.classList.toggle('selected', item === button));
  gameMode = button.dataset.mode;
}));
$('start-button').addEventListener('click', () => startGame());
$('resume-button').addEventListener('click', () => togglePause(false));
$('restart-button').addEventListener('click', () => startGame());
$('rematch-button').addEventListener('click', () => startGame());
$('menu-button').addEventListener('click', () => { ui.result.classList.add('hidden'); ui.fightHud.classList.remove('active'); ui.mobile.classList.remove('active'); ui.title.classList.remove('hidden'); gameState = 'title'; });
ui.sound.addEventListener('click', () => {
  soundOn = !soundOn; ui.sound.innerHTML = `${soundOn ? '♫' : '♪'} <span>SOUND ${soundOn ? 'ON' : 'OFF'}</span>`;
  Object.values(providedAudio).forEach((clip) => { clip.muted = !soundOn; });
  if (!soundOn) { if (audioContext) audioContext.suspend(); stopBattleMusic(); }
  else { if (audioContext) audioContext.resume(); startBattleMusic(); }
});
ui.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('game').requestFullscreen();
  } catch (error) {
    toast('FULLSCREEN IS NOT AVAILABLE IN THIS BROWSER', 1600);
  }
});
document.addEventListener('fullscreenchange', () => requestAnimationFrame(resize));
document.querySelectorAll('[data-key]').forEach((button) => {
  const key = button.dataset.key === 'space' ? ' ' : button.dataset.key;
  const attackForKey = { j: 'punch', u: 'combo', k: 'kick', i: 'heavy' };
  const down = (event) => {
    event.preventDefault();
    if (event.pointerId !== undefined && button.setPointerCapture) button.setPointerCapture(event.pointerId);
    keys.add(key);
    if (attackForKey[key]) requestAttack(fighters[0], attackForKey[key]);
  };
  const up = (event) => { event.preventDefault(); keys.delete(key); };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
});

window.addEventListener('resize', resize);
resize();

try {
  await buildArena();
  await loadCharacterAndClips();
  setLoading(100, 'THE SHRINE IS READY');
  gameState = 'title';
  updateHUD(true);
  window.setTimeout(() => { ui.loading.classList.add('hidden'); ui.title.classList.remove('hidden'); }, 420);
  animate();
} catch (error) {
  console.error(error);
  $('error-copy').textContent = `${error.message || error} Make sure the project is opened through an HTTP server and the included models are present.`;
  ui.loading.classList.add('hidden'); ui.error.classList.remove('hidden');
}
