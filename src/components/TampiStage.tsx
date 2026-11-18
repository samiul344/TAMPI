import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { AssistantState, AvatarEmotion, LipSyncWeights } from '../types/tampi';

interface TampiStageProps {
  assistantState: AssistantState;
  emotion?: AvatarEmotion;
  isSleeping?: boolean;
  isAvatarResolving?: boolean;
  vrmUrl: string;
  customGlbUrl: string;
  miniWidget?: boolean;
  standbyListening?: boolean;
  wakePulseKey?: number;
  sleepPulseKey?: number;
  getLipSyncWeights: () => LipSyncWeights;
  onGlbError?: (message: string) => void;
}

const _targetRingColor = new THREE.Color();
const _targetHaloColor = new THREE.Color();
const _targetAccentColor = new THREE.Color();
const _standbyRingColor = new THREE.Color('#0284c7');
const _standbyHaloColor = new THREE.Color('#1e40af');
const _activeCyanColor = new THREE.Color('#22d3ee');
const _activeGoldColor = new THREE.Color('#f59e0b');
const _thinkRingColor = new THREE.Color('#a855f7');
const _speakCyanColor = new THREE.Color('#22d3ee');
const _speakGoldAccent = new THREE.Color('#f59e0b');
const _sulkyRoseColor = new THREE.Color('#fb7185');
const _sulkyAmberColor = new THREE.Color('#f59e0b');
const _wakeCyanRingColor = new THREE.Color('#22d3ee');
const _wakeGoldRingColor = new THREE.Color('#f59e0b');
const _sleepAmberRingColor = new THREE.Color('#f59e0b');
const _upperWorldVec = new THREE.Vector3();
const _lowerWorldVec = new THREE.Vector3();
const _handWorldVec = new THREE.Vector3();

interface HoloSilhouetteRig {
  root: THREE.Group;
  orbitRingA: THREE.Mesh;
  orbitRingB: THREE.Mesh;
  coreAura: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  scanMat: THREE.MeshBasicMaterial;
  disposables: Array<{ dispose: () => void }>;
}

function createRadialGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(256, 256, 36, 256, 256, 252);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.44)');
  grad.addColorStop(0.84, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCyberGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.48;

  ctx.clearRect(0, 0, size, size);

  // Deep dark-navy radial chamber backdrop
  const bgGrad = ctx.createRadialGradient(cx, cy, 24, cx, cy, maxR);
  bgGrad.addColorStop(0, 'rgba(10, 26, 54, 0.65)');
  bgGrad.addColorStop(0.55, 'rgba(5, 13, 30, 0.35)');
  bgGrad.addColorStop(1, 'rgba(2, 6, 15, 0)');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Concentric radial grid circles
  const ringCount = 9;
  for (let i = 1; i <= ringCount; i++) {
    const r = (i / ringCount) * maxR;
    const fade = 1 - (i / (ringCount + 1)) * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = i === ringCount || i === 4 ? 2 : 1;
    ctx.strokeStyle =
      i === 4
        ? `rgba(245, 158, 11, ${0.32 * fade})`
        : `rgba(34, 211, 238, ${0.34 * fade})`;
    ctx.stroke();
  }

  // Radial polar spokes
  const spokeCount = 24;
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const isMajor = i % 6 === 0;
    const rStart = isMajor ? maxR * 0.11 : maxR * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * rStart, cy + Math.sin(angle) * rStart);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.lineWidth = isMajor ? 1.6 : 1;
    ctx.strokeStyle = isMajor
      ? 'rgba(34, 211, 238, 0.34)'
      : 'rgba(34, 211, 238, 0.14)';
    ctx.stroke();
  }

  // Fine perimeter degree ticks
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const tickInner = i % 3 === 0 ? maxR * 0.94 : maxR * 0.965;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * tickInner, cy + Math.sin(angle) * tickInner);
    ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
    ctx.lineWidth = i % 9 === 0 ? 2 : 1;
    ctx.strokeStyle =
      i % 9 === 0 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(34, 211, 238, 0.25)';
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createParticleGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.75)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Clean glowing cyan holographic loading/standby silhouette shown ONLY while a .vrm
 * is loading or if no .vrm file has been uploaded yet. Contains zero dummy heads/faces.
 */
function buildHoloSilhouette(glowTex: THREE.CanvasTexture): HoloSilhouetteRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const root = new THREE.Group();
  root.name = 'HolographicSilhouette';

  const coreMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
    }),
  );

  const scanMat = track(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Abstract translucent cyan holographic core aura
  const coreGeo = track(new THREE.OctahedronGeometry(0.18, 2));
  const coreAura = new THREE.Mesh(coreGeo, coreMat);
  coreAura.position.set(0, 1.42, 0);
  root.add(coreAura);

  // Soft radial hologram backdrop inside the main ring
  const innerGlowMat = track(
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const innerGlowGeo = track(new THREE.PlaneGeometry(0.95, 0.95));
  const innerGlow = new THREE.Mesh(innerGlowGeo, innerGlowMat);
  innerGlow.position.set(0, 1.42, -0.05);
  root.add(innerGlow);

  // Sleek tilted holographic scan rings
  const ringAGeo = track(new THREE.TorusGeometry(0.32, 0.0045, 16, 96));
  const orbitRingA = new THREE.Mesh(ringAGeo, scanMat);
  orbitRingA.position.set(0, 1.42, 0);
  orbitRingA.rotation.set(Math.PI * 0.36, 0.2, 0);
  root.add(orbitRingA);

  const ringBGeo = track(new THREE.TorusGeometry(0.24, 0.0035, 14, 80));
  const orbitRingB = new THREE.Mesh(ringBGeo, scanMat);
  orbitRingB.position.set(0, 1.42, 0);
  orbitRingB.rotation.set(-Math.PI * 0.32, -0.35, 0);
  root.add(orbitRingB);

  // Subtle vertical holographic pillar rings below chest height
  const baseRingGeo = track(new THREE.TorusGeometry(0.28, 0.003, 12, 64));
  const baseRing = new THREE.Mesh(baseRingGeo, scanMat);
  baseRing.position.set(0, 1.02, 0);
  baseRing.rotation.x = Math.PI / 2;
  root.add(baseRing);

  return {
    root,
    orbitRingA,
    orbitRingB,
    coreAura,
    coreMat,
    scanMat,
    disposables,
  };
}

function tuneArmBonesToRestPose(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const bone = obj as THREE.Bone;
    if (!bone.isBone) return;
    const n = bone.name;
    if (/LeftArm$/i.test(n) || n === 'mixamorigLeftArm') {
      bone.rotation.z = 1.18;
      bone.rotation.x = 0.08;
    } else if (/RightArm$/i.test(n) || n === 'mixamorigRightArm') {
      bone.rotation.z = -1.18;
      bone.rotation.x = 0.08;
    } else if (/LeftForeArm$/i.test(n) || n === 'mixamorigLeftForeArm') {
      bone.rotation.z = 0.14;
      bone.rotation.y = 0.12;
    } else if (/RightForeArm$/i.test(n) || n === 'mixamorigRightForeArm') {
      bone.rotation.z = -0.14;
      bone.rotation.y = -0.12;
    }
  });
}

interface VrmRigCache {
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftDownSign: 1 | -1;
  rightDownSign: 1 | -1;
  leftElbowForwardSign: 1 | -1;
  rightElbowForwardSign: 1 | -1;
  usesNormalizedArms: boolean;
  faceMorphMeshes: THREE.Mesh[];
}

function getVrmBone(
  vrm: VRM,
  humanBoneName: Parameters<NonNullable<VRM['humanoid']>['getNormalizedBoneNode']>[0],
  fallbackName: string,
): THREE.Object3D | null {
  return (
    vrm.humanoid?.getNormalizedBoneNode(humanBoneName) ??
    vrm.scene.getObjectByName(fallbackName) ??
    null
  );
}

function detectDownwardZSign(
  vrm: VRM,
  upperArm: THREE.Object3D | null,
  lowerArm: THREE.Object3D | null,
  fallbackSign: 1 | -1,
): 1 | -1 {
  if (!upperArm || !lowerArm) return fallbackSign;

  upperArm.rotation.set(0, 0, -1.25);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  upperArm.getWorldPosition(_upperWorldVec);
  lowerArm.getWorldPosition(_lowerWorldVec);
  const negDeltaY = _lowerWorldVec.y - _upperWorldVec.y;

  upperArm.rotation.set(0, 0, 1.25);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  upperArm.getWorldPosition(_upperWorldVec);
  lowerArm.getWorldPosition(_lowerWorldVec);
  const posDeltaY = _lowerWorldVec.y - _upperWorldVec.y;

  return posDeltaY < negDeltaY ? 1 : -1;
}

function detectElbowForwardSign(
  vrm: VRM,
  lowerArm: THREE.Object3D | null,
  hand: THREE.Object3D | null,
  downSign: 1 | -1,
  fallbackSign: 1 | -1,
): 1 | -1 {
  if (!lowerArm || !hand) return fallbackSign;

  lowerArm.rotation.set(0, -0.25, downSign * 0.15);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  lowerArm.getWorldPosition(_lowerWorldVec);
  hand.getWorldPosition(_handWorldVec);
  const negDeltaZ = _handWorldVec.z - _lowerWorldVec.z;

  lowerArm.rotation.set(0, 0.25, downSign * 0.15);
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  lowerArm.getWorldPosition(_lowerWorldVec);
  hand.getWorldPosition(_handWorldVec);
  const posDeltaZ = _handWorldVec.z - _lowerWorldVec.z;

  return posDeltaZ >= negDeltaZ ? 1 : -1;
}

function buildVrmRigCache(vrm: VRM): VrmRigCache {
  const leftUpperArm = getVrmBone(vrm, 'leftUpperArm', 'J_Bip_L_UpperArm');
  const rightUpperArm = getVrmBone(vrm, 'rightUpperArm', 'J_Bip_R_UpperArm');
  const leftLowerArm = getVrmBone(vrm, 'leftLowerArm', 'J_Bip_L_LowerArm');
  const rightLowerArm = getVrmBone(vrm, 'rightLowerArm', 'J_Bip_R_LowerArm');
  const leftHand = getVrmBone(vrm, 'leftHand', 'J_Bip_L_Hand');
  const rightHand = getVrmBone(vrm, 'rightHand', 'J_Bip_R_Hand');
  const leftShoulder = getVrmBone(vrm, 'leftShoulder', 'J_Bip_L_Shoulder');
  const rightShoulder = getVrmBone(vrm, 'rightShoulder', 'J_Bip_R_Shoulder');
  const spine = getVrmBone(vrm, 'spine', 'J_Bip_C_Spine');
  const chest =
    vrm.humanoid?.getNormalizedBoneNode('upperChest') ??
    vrm.humanoid?.getNormalizedBoneNode('chest') ??
    vrm.scene.getObjectByName('J_Bip_C_UpperChest') ??
    vrm.scene.getObjectByName('J_Bip_C_Chest') ??
    null;
  const neck = getVrmBone(vrm, 'neck', 'J_Bip_C_Neck');
  const head = getVrmBone(vrm, 'head', 'J_Bip_C_Head');

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const leftDownSign = detectDownwardZSign(
    vrm,
    leftUpperArm,
    leftLowerArm,
    isVrm0 ? 1 : -1,
  );
  const rightDownSign = detectDownwardZSign(
    vrm,
    rightUpperArm,
    rightLowerArm,
    isVrm0 ? -1 : 1,
  );

  // Pose upper arms downward before testing forearm forward direction
  if (leftUpperArm) leftUpperArm.rotation.set(0.05, 0, leftDownSign * 1.25);
  if (rightUpperArm) rightUpperArm.rotation.set(0.05, 0, rightDownSign * 1.25);

  const leftElbowForwardSign = detectElbowForwardSign(
    vrm,
    leftLowerArm,
    leftHand,
    leftDownSign,
    1,
  );
  const rightElbowForwardSign = detectElbowForwardSign(
    vrm,
    rightLowerArm,
    rightHand,
    rightDownSign,
    -1,
  );

  if (leftLowerArm) {
    leftLowerArm.rotation.set(0.04, leftElbowForwardSign * 0.14, leftDownSign * 0.15);
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.set(0.04, rightElbowForwardSign * 0.14, rightDownSign * 0.15);
  }
  if (leftHand) leftHand.rotation.set(0, 0, leftDownSign * 0.05);
  if (rightHand) rightHand.rotation.set(0, 0, rightDownSign * 0.05);

  const faceMorphMeshes: THREE.Mesh[] = [];
  vrm.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
      faceMorphMeshes.push(mesh);
    }
  });

  return {
    leftShoulder,
    rightShoulder,
    leftUpperArm,
    rightUpperArm,
    leftLowerArm,
    rightLowerArm,
    leftHand,
    rightHand,
    spine,
    chest,
    neck,
    head,
    leftDownSign,
    rightDownSign,
    leftElbowForwardSign,
    rightElbowForwardSign,
    usesNormalizedArms: Boolean(vrm.humanoid?.getNormalizedBoneNode('leftUpperArm')),
    faceMorphMeshes,
  };
}

function setVrmExpression(
  exp: NonNullable<VRM['expressionManager']>,
  names: string[],
  value: number,
): void {
  for (const name of names) {
    if (exp.getExpression(name)) {
      exp.setValue(name, value);
      return;
    }
  }
  exp.setValue(names[0], value);
}

function setVrmBlink(
  exp: NonNullable<VRM['expressionManager']>,
  value: number,
): void {
  if (exp.getExpression('blink')) {
    exp.setValue('blink', value);
    return;
  }
  let applied = false;
  if (exp.getExpression('blinkLeft')) {
    exp.setValue('blinkLeft', value);
    applied = true;
  }
  if (exp.getExpression('blinkRight')) {
    exp.setValue('blinkRight', value);
    applied = true;
  }
  if (!applied) {
    exp.setValue('blink', value);
  }
}

export const TampiStage: React.FC<TampiStageProps> = ({
  assistantState,
  emotion = 'neutral',
  isSleeping = true,
  isAvatarResolving = false,
  vrmUrl,
  customGlbUrl,
  miniWidget = false,
  standbyListening = false,
  wakePulseKey = 0,
  sleepPulseKey = 0,
  getLipSyncWeights,
  onGlbError,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AssistantState>(assistantState);
  const emotionRef = useRef<AvatarEmotion>(emotion);
  const isSleepingRef = useRef<boolean>(isSleeping);
  const miniWidgetRef = useRef<boolean>(miniWidget);
  const standbyListeningRef = useRef<boolean>(standbyListening);
  const wakePulseTimerRef = useRef<number>(-1);
  const sleepPulseTimerRef = useRef<number>(-1);
  const cameraPresetActiveRef = useRef<boolean>(false);
  const lipSyncGetterRef = useRef(getLipSyncWeights);
  const glbErrorCbRef = useRef(onGlbError);

  const [glbLoading, setGlbLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hasLoadedAvatar, setHasLoadedAvatar] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const customModelSlotRef = useRef<{
    scene: THREE.Scene;
    holoRoot: THREE.Group;
    loadedModel: THREE.Object3D | null;
    loadedVrm: VRM | null;
    vrmRig: VrmRigCache | null;
    morphMeshes: THREE.Mesh[];
    headBone: THREE.Bone | null;
    spineBone: THREE.Bone | null;
    loader: GLTFLoader;
  } | null>(null);

  useEffect(() => {
    stateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    isSleepingRef.current = isSleeping;
  }, [isSleeping]);

  useEffect(() => {
    miniWidgetRef.current = miniWidget;
    cameraPresetActiveRef.current = true;
  }, [miniWidget]);

  useEffect(() => {
    standbyListeningRef.current = standbyListening;
  }, [standbyListening]);

  useEffect(() => {
    if (wakePulseKey > 0) {
      sleepPulseTimerRef.current = -1;
      wakePulseTimerRef.current = 0;
    }
  }, [wakePulseKey]);

  useEffect(() => {
    if (sleepPulseKey > 0) {
      wakePulseTimerRef.current = -1;
      sleepPulseTimerRef.current = 0;
    }
  }, [sleepPulseKey]);

  useEffect(() => {
    lipSyncGetterRef.current = getLipSyncWeights;
  }, [getLipSyncWeights]);

  useEffect(() => {
    glbErrorCbRef.current = onGlbError;
  }, [onGlbError]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL guard
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored,
    );

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060a12, 0.09);

    // Procedural studio IBL
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    // Chest-up portrait camera + damped OrbitControls
    const camera = new THREE.PerspectiveCamera(
      34,
      container.clientWidth / container.clientHeight,
      0.1,
      50,
    );
    camera.position.set(0, 1.47, 1.28);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.4, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 0.9;
    controls.maxDistance = 2.15;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.minAzimuthAngle = -Math.PI * 0.35;
    controls.maxAzimuthAngle = Math.PI * 0.35;
    controls.addEventListener('start', () => {
      cameraPresetActiveRef.current = false;
    });
    controls.update();

    // Cinematic 3-point studio lighting
    const hemiFill = new THREE.HemisphereLight(0x8ec5fc, 0x0b1220, 0.72);
    scene.add(hemiFill);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(1.8, 2.5, 2.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 8;
      keyLight.shadow.camera.left = -1.2;
      keyLight.shadow.camera.right = 1.2;
      keyLight.shadow.camera.top = 1.2;
      keyLight.shadow.camera.bottom = -1.2;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    // Soft Cyan Rim Light
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.9);
    rimLight.position.set(-1.6, 2.1, -1.8);
    scene.add(rimLight);

    // Subtle Secondary Rim/Bounce on opposite shoulder
    const sideAccent = new THREE.PointLight(0x0ea5e9, 0.9, 5, 2);
    sideAccent.position.set(1.4, 1.5, -0.9);
    scene.add(sideAccent);

    const stageDisposables: Array<{ dispose: () => void }> = [];
    const trackStage = <T extends { dispose: () => void }>(item: T): T => {
      stageDisposables.push(item);
      return item;
    };

    // Deep Dark-Navy Radial Cyber Grid Floor, Backdrop & Lower Emitter Disc
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const cyberGridTex = trackStage(createCyberGridTexture(maxAnisotropy));

    const floorGridGeo = trackStage(new THREE.CircleGeometry(3.4, 64));
    const floorGridMat = trackStage(
      new THREE.MeshBasicMaterial({
        map: cyberGridTex,
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    const floorGrid = new THREE.Mesh(floorGridGeo, floorGridMat);
    floorGrid.rotation.x = -Math.PI / 2;
    floorGrid.position.set(0, -0.02, 0);
    scene.add(floorGrid);

    const emitterGridGeo = trackStage(new THREE.RingGeometry(0.24, 0.92, 64));
    const emitterGridMat = trackStage(
      new THREE.MeshBasicMaterial({
        map: cyberGridTex,
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const emitterGrid = new THREE.Mesh(emitterGridGeo, emitterGridMat);
    emitterGrid.rotation.x = -Math.PI / 2;
    emitterGrid.position.set(0, 0.9, 0);
    scene.add(emitterGrid);

    const backdropGridGeo = trackStage(new THREE.PlaneGeometry(3.1, 3.1));
    const backdropGridMat = trackStage(
      new THREE.MeshBasicMaterial({
        map: cyberGridTex,
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const backdropGrid = new THREE.Mesh(backdropGridGeo, backdropGridMat);
    backdropGrid.position.set(0, 1.44, -1.08);
    scene.add(backdropGrid);

    // Multi-Layered Stark Concentric Segmented Holographic Rings Behind Tampi
    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 1.44, -0.58);
    scene.add(haloGroup);

    const primaryCyanMat = trackStage(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.5,
        roughness: 0.22,
        metalness: 0.65,
      }),
    );

    const accentGoldMat = trackStage(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.25,
        roughness: 0.25,
        metalness: 0.75,
        transparent: true,
        opacity: 0.85,
      }),
    );

    const outerRingMat = trackStage(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.05,
        transparent: true,
        opacity: 0.68,
        roughness: 0.3,
      }),
    );

    // Layer 1: Inner continuous core ring
    const innerCoreGeo = trackStage(new THREE.TorusGeometry(0.44, 0.005, 16, 110));
    const innerCoreRing = new THREE.Mesh(innerCoreGeo, outerRingMat);
    haloGroup.add(innerCoreRing);

    // Layer 2: Primary segmented electric cyan arcs (3 arcs rotating clockwise)
    const arcLayerCyan = new THREE.Group();
    const cyanArcGeo = trackStage(
      new THREE.TorusGeometry(0.54, 0.011, 20, 48, Math.PI * 0.48),
    );
    for (let i = 0; i < 3; i++) {
      const arcMesh = new THREE.Mesh(cyanArcGeo, primaryCyanMat);
      arcMesh.rotation.z = (i * Math.PI * 2) / 3;
      arcLayerCyan.add(arcMesh);
    }
    haloGroup.add(arcLayerCyan);

    // Layer 3: Warm gold segmented accent arcs + counter-rotating inner brackets
    const arcLayerGold = new THREE.Group();
    const goldArcGeo = trackStage(
      new THREE.TorusGeometry(0.59, 0.006, 16, 48, Math.PI * 0.56),
    );
    for (let i = 0; i < 2; i++) {
      const goldMesh = new THREE.Mesh(goldArcGeo, accentGoldMat);
      goldMesh.rotation.z = i * Math.PI + 0.35;
      arcLayerGold.add(goldMesh);
    }
    const goldInnerBracketGeo = trackStage(
      new THREE.TorusGeometry(0.49, 0.004, 12, 32, Math.PI * 0.24),
    );
    for (let i = 0; i < 2; i++) {
      const bracketMesh = new THREE.Mesh(goldInnerBracketGeo, accentGoldMat);
      bracketMesh.rotation.z = i * Math.PI + Math.PI / 2;
      arcLayerGold.add(bracketMesh);
    }
    haloGroup.add(arcLayerGold);

    // Layer 4: Outer segmented cyan telemetry arcs
    const arcLayerOuter = new THREE.Group();
    const outerArcGeo = trackStage(
      new THREE.TorusGeometry(0.67, 0.0038, 12, 40, Math.PI * 0.32),
    );
    for (let i = 0; i < 4; i++) {
      const outerArcMesh = new THREE.Mesh(outerArcGeo, outerRingMat);
      outerArcMesh.rotation.z = (i * Math.PI) / 2 + 0.2;
      arcLayerOuter.add(outerArcMesh);
    }
    haloGroup.add(arcLayerOuter);

    const glowTex = trackStage(createRadialGlowTexture());
    const glowPlaneGeo = trackStage(new THREE.PlaneGeometry(1.9, 1.9));
    const glowPlaneMat = trackStage(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const glowPlane = new THREE.Mesh(glowPlaneGeo, glowPlaneMat);
    glowPlane.position.z = -0.02;
    haloGroup.add(glowPlane);

    // Instanced subtle telemetry tick marks on the holographic ring
    const tickCount = 36;
    const tickGeo = trackStage(new THREE.BoxGeometry(0.0065, 0.026, 0.005));
    const tickMat = trackStage(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.58,
      }),
    );
    const ticksMesh = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * 0.625, Math.sin(angle) * 0.625, 0);
      dummy.rotation.set(0, 0, angle - Math.PI / 2);
      dummy.scale.set(1, i % 3 === 0 ? 1.45 : 0.85, 1);
      dummy.updateMatrix();
      ticksMesh.setMatrixAt(i, dummy.matrix);
    }
    ticksMesh.instanceMatrix.needsUpdate = true;
    ticksMesh.computeBoundingSphere();
    haloGroup.add(ticksMesh);

    // 3D Holographic Scan Ring (sweeps vertically across Tampi during 1.5s wake-up boot)
    const scanRingGeo = trackStage(new THREE.TorusGeometry(0.52, 0.007, 14, 96));
    const scanRingMat = trackStage(
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    scanRing.rotation.x = Math.PI / 2;
    scanRing.position.set(0, 1.44, 0);
    scanRing.visible = false;
    scene.add(scanRing);

    // Subtle Floating Cyan & Sparse Gold Holographic Light Particles
    const particleCount = 150;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const particleSpeeds = new Float32Array(particleCount);
    const particlePhases = new Float32Array(particleCount);
    const cyanBase = new THREE.Color('#22d3ee');
    const goldBase = new THREE.Color('#f59e0b');

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.42 + Math.random() * 1.25;
      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] = 0.45 + Math.random() * 1.85;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius * 0.75 - 0.22;
      particleSpeeds[i] = 0.06 + Math.random() * 0.11;
      particlePhases[i] = Math.random() * Math.PI * 2;

      const c = i % 6 === 0 ? goldBase : cyanBase;
      particleColors[i * 3] = c.r;
      particleColors[i * 3 + 1] = c.g;
      particleColors[i * 3 + 2] = c.b;
    }

    const particleGeo = trackStage(new THREE.BufferGeometry());
    const particlePosAttr = new THREE.BufferAttribute(particlePositions, 3);
    particleGeo.setAttribute('position', particlePosAttr);
    particleGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(particleColors, 3),
    );

    const particleTex = trackStage(createParticleGlowTexture());
    const particleMat = trackStage(
      new THREE.PointsMaterial({
        size: 0.024,
        map: particleTex,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        sizeAttenuation: true,
      }),
    );
    const holoParticles = new THREE.Points(particleGeo, particleMat);
    holoParticles.frustumCulled = false;
    scene.add(holoParticles);

    // Glowing Cyan Holographic Silhouette (replaces legacy dummy mesh when loading or awaiting .vrm)
    const holoRig = buildHoloSilhouette(glowTex);
    scene.add(holoRig.root);

    // Setup GLTFLoader + VRMLoaderPlugin for .vrm / .glb models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
    );
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

    customModelSlotRef.current = {
      scene,
      holoRoot: holoRig.root,
      loadedModel: null,
      loadedVrm: null,
      vrmRig: null,
      morphMeshes: [],
      headBone: null,
      spineBone: null,
      loader: gltfLoader,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Resize listener
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation state variables (zero GC inside loop)
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    let nextBlinkTime = 2.6;
    let blinkProgress = 0;
    let isBlinking = false;
    let wasSleepingLastFrame = isSleepingRef.current;
    let smoothedSleepPose = isSleepingRef.current ? 1.0 : 0.0;
    let sleepHoldBlink = isSleepingRef.current ? 1.0 : 0.0;
    let breathPhase = 0;

    let smoothedAmp = 0;
    let smoothedMouth = 0;
    let smoothedSmile = 0.2;

    let smoothedAa = 0;
    let smoothedIh = 0;
    let smoothedOu = 0;
    let smoothedEe = 0;
    let smoothedOh = 0;
    let smoothedHappy = 0.12;
    let smoothedAngry = 0;
    let smoothedSad = 0;
    let smoothedRelaxed = 0.08;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.08);
      const t = clock.getElapsedTime();
      const mode = stateRef.current;
      const emo = emotionRef.current;
      const sleeping = isSleepingRef.current;

      // Track active 1.5s Stark wake-up boot sequence (spin-lock rings + vertical scan ring + welcoming nod)
      let wakeElapsed = wakePulseTimerRef.current;
      let isWakeSequence = false;
      let wakeNodPitch = 0;
      let wakePulseEnv = 0;
      let wakeBootProgress = 0;
      if (wakeElapsed >= 0) {
        wakeElapsed += dt;
        if (wakeElapsed >= 1.5) {
          wakePulseTimerRef.current = -1;
          wakeElapsed = -1;
        } else {
          wakePulseTimerRef.current = wakeElapsed;
          isWakeSequence = true;
          wakeBootProgress = wakeElapsed / 1.5;
          wakePulseEnv = Math.sin(wakeBootProgress * Math.PI);
          if (wakeElapsed < 0.85) {
            wakeNodPitch = Math.sin((wakeElapsed / 0.85) * Math.PI) * 0.14;
          }
        }
      }

      // Track active shutdown sleep sequence (1.8s gentle sleepy transition + amber/cyan pulse)
      let sleepElapsed = sleepPulseTimerRef.current;
      let isSleepSequence = false;
      let sleepRoll = 0;
      let sleepPulseEnv = 0;
      if (sleepElapsed >= 0) {
        sleepElapsed += dt;
        if (sleepElapsed >= 1.8) {
          sleepPulseTimerRef.current = -1;
          sleepElapsed = -1;
        } else {
          sleepPulseTimerRef.current = sleepElapsed;
          isSleepSequence = true;
          sleepPulseEnv = Math.sin(Math.min(1, sleepElapsed / 1.7) * Math.PI);
          if (sleepElapsed < 1.35) {
            sleepRoll = Math.sin((sleepElapsed / 1.35) * Math.PI) * 0.05;
          }
        }
      }

      // Smoothly transition between Sleeping Pose (Standby) and Awake Pose
      smoothedSleepPose = THREE.MathUtils.damp(
        smoothedSleepPose,
        sleeping ? 1 : 0,
        sleeping ? 4.2 : 6.0,
        dt,
      );
      sleepHoldBlink = THREE.MathUtils.damp(
        sleepHoldBlink,
        sleeping ? 1.0 : 0.0,
        sleeping ? 5.5 : 8.5,
        dt,
      );

      if (wasSleepingLastFrame && !sleeping) {
        // Woke up: schedule next natural 3-4s blink after eyes open
        isBlinking = false;
        blinkProgress = 0;
        nextBlinkTime = t + 3.0 + Math.random() * 1.0;
      }
      wasSleepingLastFrame = sleeping;

      // Smooth breathing phase (slow peaceful breathing when asleep, natural cadence when awake)
      breathPhase += dt * THREE.MathUtils.lerp(1.55, 0.92, smoothedSleepPose);
      const breath = Math.sin(breathPhase);

      // Smoothly frame chest/face up in Mini Widget Mode (cancels if user orbits manually)
      if (cameraPresetActiveRef.current) {
        const wantMini = miniWidgetRef.current;
        const targetCamY = wantMini ? 1.49 : 1.47;
        const targetCamZ = wantMini ? 1.16 : 1.28;
        const targetLookY = wantMini ? 1.44 : 1.4;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 6, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 6, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 6, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, 0, 6, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, targetLookY, 6, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, 0, 6, dt);
        if (
          Math.abs(camera.position.z - targetCamZ) < 0.002 &&
          Math.abs(camera.position.y - targetCamY) < 0.002
        ) {
          cameraPresetActiveRef.current = false;
        }
      }

      // 1. Real-time Web Audio AnalyserNode amplitude & vowel weights
      const lipSync = lipSyncGetterRef.current();
      const targetAmp = !sleeping && mode === 'speaking' ? lipSync.amplitude : 0;

      smoothedAmp = THREE.MathUtils.damp(smoothedAmp, targetAmp, 16, dt);
      smoothedMouth = THREE.MathUtils.damp(
        smoothedMouth,
        !sleeping && mode === 'speaking' ? Math.min(1, smoothedAmp * 1.15) : 0,
        18,
        dt,
      );
      smoothedAa = THREE.MathUtils.damp(
        smoothedAa,
        !sleeping && mode === 'speaking' ? lipSync.aa : 0,
        22,
        dt,
      );
      smoothedIh = THREE.MathUtils.damp(
        smoothedIh,
        !sleeping && mode === 'speaking' ? lipSync.ih : 0,
        22,
        dt,
      );
      smoothedOu = THREE.MathUtils.damp(
        smoothedOu,
        !sleeping && mode === 'speaking' ? lipSync.ou : 0,
        22,
        dt,
      );
      smoothedEe = THREE.MathUtils.damp(
        smoothedEe,
        !sleeping && mode === 'speaking' ? lipSync.ee : 0,
        22,
        dt,
      );
      smoothedOh = THREE.MathUtils.damp(
        smoothedOh,
        !sleeping && mode === 'speaking' ? lipSync.oh : 0,
        22,
        dt,
      );

      // 2. Automatic Eye Blink every 3-4s while awake; eyes gently closed (1.0) while sleeping
      if (!sleeping && !isBlinking && t >= nextBlinkTime) {
        isBlinking = true;
        blinkProgress = 0;
        nextBlinkTime = t + 3.0 + Math.random() * 1.0;
      }
      let blinkWeight = 0;
      if (isBlinking && !sleeping) {
        blinkProgress += dt / 0.15;
        if (blinkProgress >= 1) {
          isBlinking = false;
          blinkWeight = 0;
        } else {
          blinkWeight = Math.sin(blinkProgress * Math.PI);
        }
      } else if (sleeping) {
        isBlinking = false;
        blinkProgress = 0;
      }
      const effectiveBlink = Math.min(1, Math.max(blinkWeight, sleepHoldBlink));

      const targetSmile = isWakeSequence
        ? 0.25
        : sleeping
          ? 0.12
          : mode === 'listening'
            ? 0.24
            : 0.2;
      smoothedSmile = THREE.MathUtils.damp(smoothedSmile, targetSmile, 6, dt);

      // 3. Animate Holographic Standby Silhouette OR Loaded VRM / Custom GLB
      const slot = customModelSlotRef.current;

      if (slot && !slot.loadedVrm && !slot.loadedModel) {
        holoRig.root.visible = true;
        holoRig.orbitRingA.rotation.z += dt * 0.45;
        holoRig.orbitRingB.rotation.z -= dt * 0.62;
        holoRig.coreAura.rotation.y += dt * 0.55;
        holoRig.coreAura.rotation.x = Math.sin(t * 0.9) * 0.18;
        const pulseScale = 0.96 + 0.06 * (0.5 + 0.5 * breath);
        holoRig.coreAura.scale.setScalar(pulseScale);
        holoRig.coreMat.opacity = 0.16 + 0.1 * (0.5 + 0.5 * breath);
        holoRig.scanMat.opacity = 0.34 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2.2));
      } else if (slot) {
        holoRig.root.visible = false;
      }

      if (slot?.loadedVrm) {
        const vrm = slot.loadedVrm;
        const rig = slot.vrmRig;
        const speechVol = !sleeping && mode === 'speaking' ? smoothedAmp : 0;

        // 1. Peaceful breathing on spine / chest (slower & gentler when asleep)
        const breathAmp = THREE.MathUtils.lerp(0.012, 0.018, smoothedSleepPose);
        if (rig?.spine) {
          rig.spine.rotation.x = breath * breathAmp + speechVol * 0.014;
          rig.spine.rotation.y =
            Math.sin(t * 0.45) * 0.01 * (1 - smoothedSleepPose);
        }
        if (rig?.chest) {
          rig.chest.rotation.x =
            Math.sin(breathPhase - 0.35) * (breathAmp * 1.45) +
            speechVol * 0.022;
          rig.chest.rotation.y =
            Math.sin(t * 0.58) * 0.014 * (1 - smoothedSleepPose);
        }

        // 2. Guaranteed downward arm & forearm pose + speaking micro-gestures
        const applyArmPose = () => {
          if (!rig) return;
          if (rig.leftShoulder) {
            rig.leftShoulder.rotation.z =
              rig.leftDownSign * (0.04 + breath * 0.01 + speechVol * 0.028);
          }
          if (rig.rightShoulder) {
            rig.rightShoulder.rotation.z =
              rig.rightDownSign * (0.04 + breath * 0.01 + speechVol * 0.028);
          }

          const armGestureL =
            Math.abs(Math.sin(t * 2.4)) * 0.045 * speechVol +
            Math.max(0, breath) * 0.01;
          const armGestureR =
            Math.abs(Math.sin(t * 2.4 + 0.9)) * 0.045 * speechVol +
            Math.max(0, breath) * 0.01;
          const angryTighten = !sleeping && emo === 'angry' ? 0.035 : 0;

          if (rig.leftUpperArm) {
            rig.leftUpperArm.rotation.z =
              rig.leftDownSign * (1.25 - armGestureL - angryTighten);
            rig.leftUpperArm.rotation.x =
              0.05 + speechVol * (0.05 + 0.04 * Math.sin(t * 2.9));
            rig.leftUpperArm.rotation.y = rig.leftDownSign * 0.03;
          }
          if (rig.rightUpperArm) {
            rig.rightUpperArm.rotation.z =
              rig.rightDownSign * (1.25 - armGestureR - angryTighten);
            rig.rightUpperArm.rotation.x =
              0.05 + speechVol * (0.05 + 0.04 * Math.cos(t * 2.6));
            rig.rightUpperArm.rotation.y = rig.rightDownSign * 0.03;
          }

          if (rig.leftLowerArm) {
            rig.leftLowerArm.rotation.z =
              rig.leftDownSign *
              (0.15 + speechVol * 0.055 * (0.5 + 0.5 * Math.sin(t * 3.3)));
            rig.leftLowerArm.rotation.y =
              rig.leftElbowForwardSign *
              (0.14 + speechVol * 0.15 * (0.5 + 0.5 * Math.sin(t * 3.1)));
            rig.leftLowerArm.rotation.x = 0.04;
          }
          if (rig.rightLowerArm) {
            rig.rightLowerArm.rotation.z =
              rig.rightDownSign *
              (0.15 + speechVol * 0.055 * (0.5 + 0.5 * Math.cos(t * 3.1)));
            rig.rightLowerArm.rotation.y =
              rig.rightElbowForwardSign *
              (0.14 + speechVol * 0.15 * (0.5 + 0.5 * Math.cos(t * 2.9)));
            rig.rightLowerArm.rotation.x = 0.04;
          }

          if (rig.leftHand) {
            rig.leftHand.rotation.z = rig.leftDownSign * 0.05;
          }
          if (rig.rightHand) {
            rig.rightHand.rotation.z = rig.rightDownSign * 0.05;
          }
        };

        applyArmPose();

        // 3. Head & neck pose: Sleeping (head tilted gently downward 0.12) vs Awake (looking at user)
        const vrmHead = rig?.head ?? vrm.humanoid?.getNormalizedBoneNode('head');
        if (vrmHead) {
          const emoYaw =
            emo === 'sulking' ? 0.14 : emo === 'shy' ? -0.09 : 0;
          const emoPitch =
            emo === 'sulking'
              ? 0.07
              : emo === 'shy'
                ? 0.05
                : emo === 'angry'
                  ? -0.04
                  : 0;
          const emoRoll =
            emo === 'shy' ? 0.08 : emo === 'sulking' ? -0.06 : 0;

          const awakeHeadY =
            emoYaw +
            (mode === 'listening'
              ? Math.sin(t * 0.85) * 0.05
              : mode === 'thinking'
                ? 0.09 + Math.sin(t * 0.6) * 0.03
                : mode === 'speaking'
                  ? Math.sin(t * 1.9) * (0.04 + speechVol * 0.04)
                  : Math.sin(t * 0.5) * 0.04);

          const awakeHeadX =
            wakeNodPitch +
            emoPitch +
            (mode === 'thinking'
              ? -0.05 + Math.sin(t * 0.9) * 0.015
              : mode === 'speaking'
                ? Math.sin(t * 4.2) * (0.02 + speechVol * 0.055) -
                  speechVol * 0.025
                : Math.sin(t * 0.7) * 0.018);

          const awakeHeadZ =
            emoRoll +
            (mode === 'listening'
              ? 0.045 + Math.sin(t * 0.65) * 0.015
              : mode === 'speaking'
                ? Math.sin(t * 2.3) * (0.02 + speechVol * 0.045)
                : Math.sin(t * 0.42) * 0.02);

          // Sleep pose: head tilted peacefully downward (x = 0.12) with subtle breathing sway
          const sleepHeadX = 0.12 + breath * 0.009;
          const sleepHeadY = 0;
          const sleepHeadZ = 0.025 + sleepRoll;

          const targetHeadY = THREE.MathUtils.lerp(
            awakeHeadY,
            sleepHeadY,
            smoothedSleepPose,
          );
          const targetHeadX = THREE.MathUtils.lerp(
            awakeHeadX,
            sleepHeadX,
            smoothedSleepPose,
          );
          const targetHeadZ = THREE.MathUtils.lerp(
            awakeHeadZ,
            sleepHeadZ,
            smoothedSleepPose,
          );

          vrmHead.rotation.y = THREE.MathUtils.damp(
            vrmHead.rotation.y,
            targetHeadY,
            5.0,
            dt,
          );
          vrmHead.rotation.x = THREE.MathUtils.damp(
            vrmHead.rotation.x,
            targetHeadX,
            5.0,
            dt,
          );
          vrmHead.rotation.z = THREE.MathUtils.damp(
            vrmHead.rotation.z,
            targetHeadZ,
            5.0,
            dt,
          );
        }

        if (rig?.neck) {
          const targetNeckY = sleeping
            ? 0
            : emo === 'sulking'
              ? 0.06
              : Math.sin(t * 0.55) * 0.02;
          const targetNeckX = sleeping
            ? 0.03
            : speechVol * 0.025 + (emo === 'angry' ? -0.02 : 0);
          rig.neck.rotation.y = THREE.MathUtils.damp(
            rig.neck.rotation.y,
            targetNeckY,
            4.0,
            dt,
          );
          rig.neck.rotation.x = THREE.MathUtils.damp(
            rig.neck.rotation.x,
            targetNeckX,
            4.0,
            dt,
          );
        }

        // 4. VRM Facial Expressions (Eyes closed on Standby/Sleep, smile on Wake)
        const MAX_EMOTION_WEIGHT = 0.25;
        let targetHappy = mode === 'thinking' ? 0.05 : 0.12;
        let targetAngry = 0;
        let targetSad = 0;
        let targetRelaxed = 0.08;

        if (isWakeSequence) {
          targetHappy = MAX_EMOTION_WEIGHT;
          targetRelaxed = 0.16;
        } else if (sleeping || isSleepSequence) {
          targetHappy = 0.08;
          targetRelaxed = 0.22;
        } else if (emo === 'angry') {
          targetAngry = Math.min(MAX_EMOTION_WEIGHT, 0.16 + speechVol * 0.09);
          targetHappy = 0;
          targetRelaxed = 0;
        } else if (emo === 'sulking') {
          targetSad = Math.min(MAX_EMOTION_WEIGHT, 0.16 + speechVol * 0.09);
          targetAngry = 0.08;
          targetHappy = 0;
          targetRelaxed = 0;
        } else if (emo === 'shy') {
          targetHappy = 0.18;
          targetRelaxed = 0.22;
        } else if (emo === 'happy') {
          targetHappy = Math.min(MAX_EMOTION_WEIGHT, 0.18 + speechVol * 0.07);
          targetRelaxed = 0.12;
        }

        smoothedHappy = THREE.MathUtils.damp(smoothedHappy, targetHappy, 6, dt);
        smoothedAngry = THREE.MathUtils.damp(smoothedAngry, targetAngry, 6, dt);
        smoothedSad = THREE.MathUtils.damp(smoothedSad, targetSad, 6, dt);
        smoothedRelaxed = THREE.MathUtils.damp(
          smoothedRelaxed,
          targetRelaxed,
          6,
          dt,
        );

        const joyWeight = Math.min(MAX_EMOTION_WEIGHT, Math.max(0, smoothedHappy));
        const funWeight = Math.min(MAX_EMOTION_WEIGHT, Math.max(0, smoothedRelaxed));
        const sorrowWeight = Math.min(MAX_EMOTION_WEIGHT, Math.max(0, smoothedSad));
        const angryWeight = Math.min(MAX_EMOTION_WEIGHT, Math.max(0, smoothedAngry));
        const naturalEyeWeight = Math.max(0, 1 - effectiveBlink);

        const exp = vrm.expressionManager;
        if (exp) {
          setVrmBlink(exp, effectiveBlink);
          if (exp.getExpression('Fcl_EYE_Natural')) {
            exp.setValue('Fcl_EYE_Natural', naturalEyeWeight);
          }
          setVrmExpression(exp, ['happy', 'joy'], joyWeight);
          setVrmExpression(exp, ['angry'], angryWeight);
          setVrmExpression(exp, ['sad', 'sorrow'], sorrowWeight);
          setVrmExpression(exp, ['relaxed', 'fun'], funWeight);
          setVrmExpression(exp, ['aa'], smoothedAa);
          setVrmExpression(exp, ['ih'], smoothedIh);
          setVrmExpression(exp, ['ou'], smoothedOu);
          setVrmExpression(exp, ['ee'], smoothedEe);
          setVrmExpression(exp, ['oh'], smoothedOh);
        }

        vrm.update(dt);
        if (rig && !rig.usesNormalizedArms) {
          applyArmPose();
        }
        if (rig && !exp?.getExpression('Fcl_EYE_Natural')) {
          for (const mesh of rig.faceMorphMeshes) {
            const natIdx = mesh.morphTargetDictionary?.['Fcl_EYE_Natural'];
            if (natIdx !== undefined && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[natIdx] = naturalEyeWeight;
            }
          }
        }
      } else if (slot?.loadedModel) {
        // Animate optional custom GLB avatar
        if (slot.spineBone) {
          slot.spineBone.rotation.x = breath * 0.015;
        }
        if (slot.headBone) {
          const awakeX =
            wakeNodPitch +
            (mode === 'speaking'
              ? Math.sin(t * 3.0) * 0.025
              : Math.sin(t * 0.7) * 0.015);
          const awakeY = mode === 'thinking' ? 0.08 : Math.sin(t * 0.5) * 0.04;
          slot.headBone.rotation.y = THREE.MathUtils.damp(
            slot.headBone.rotation.y,
            THREE.MathUtils.lerp(awakeY, 0, smoothedSleepPose),
            4.5,
            dt,
          );
          slot.headBone.rotation.x = THREE.MathUtils.damp(
            slot.headBone.rotation.x,
            THREE.MathUtils.lerp(awakeX, 0.12 + breath * 0.008, smoothedSleepPose),
            4.5,
            dt,
          );
          slot.headBone.rotation.z = THREE.MathUtils.damp(
            slot.headBone.rotation.z,
            THREE.MathUtils.lerp(0, 0.025 + sleepRoll, smoothedSleepPose),
            4.5,
            dt,
          );
        }
        for (const mesh of slot.morphMeshes) {
          const dict = mesh.morphTargetDictionary;
          const infl = mesh.morphTargetInfluences;
          if (!dict || !infl) continue;

          const setMorph = (name: string, val: number) => {
            const idx = dict[name];
            if (idx !== undefined) infl[idx] = val;
          };

          const cappedSmile = Math.min(0.25, smoothedSmile);
          setMorph('eyeBlinkLeft', effectiveBlink);
          setMorph('eyeBlinkRight', effectiveBlink);
          setMorph('Fcl_EYE_Natural', Math.max(0, 1 - effectiveBlink));
          setMorph('mouthSmile', cappedSmile);
          setMorph('mouthSmileLeft', cappedSmile);
          setMorph('mouthSmileRight', cappedSmile);
          setMorph('browInnerUp', mode === 'thinking' ? 0.25 : 0.06);
          setMorph('mouthOpen', smoothedMouth * 0.72);
          setMorph('jawOpen', smoothedMouth * 0.42);
          setMorph('viseme_aa', smoothedAa);
          setMorph('viseme_ih', smoothedIh);
          setMorph('viseme_ou', smoothedOu);
          setMorph('viseme_E', smoothedEe);
          setMorph('viseme_O', smoothedOh);
        }
      }

      // 4. Multi-Layered Stark Holographic Rings, Cyber Grid & Floating Particles
      const isStandby = standbyListeningRef.current && mode === 'idle';
      const isSulkyMood = !sleeping && (emo === 'sulking' || emo === 'angry');

      if (isWakeSequence) {
        _targetRingColor.copy(_wakeCyanRingColor);
        _targetHaloColor.copy(_wakeCyanRingColor);
        _targetAccentColor.copy(_wakeGoldRingColor);
      } else if (isSleepSequence) {
        _targetRingColor.copy(_sleepAmberRingColor).lerp(_standbyRingColor, 0.4);
        _targetHaloColor.copy(_standbyHaloColor).lerp(_sleepAmberRingColor, 0.35);
        _targetAccentColor.copy(_sleepAmberRingColor);
      } else if (isSulkyMood) {
        _targetRingColor.copy(_sulkyRoseColor).lerp(_activeCyanColor, 0.22);
        _targetHaloColor.copy(_sulkyRoseColor);
        _targetAccentColor.copy(_sulkyAmberColor);
      } else if (mode === 'thinking') {
        _targetRingColor.copy(_activeCyanColor).lerp(_thinkRingColor, 0.45);
        _targetHaloColor.copy(_thinkRingColor);
        _targetAccentColor.copy(_activeGoldColor);
      } else if (mode === 'speaking') {
        _targetRingColor.copy(_speakCyanColor).lerp(_speakGoldAccent, smoothedMouth * 0.25);
        _targetHaloColor.copy(_speakCyanColor);
        _targetAccentColor.copy(_speakGoldAccent);
      } else if (mode === 'listening' || !sleeping) {
        _targetRingColor.copy(_activeCyanColor);
        _targetHaloColor.copy(_activeCyanColor);
        _targetAccentColor.copy(_activeGoldColor);
      } else if (isStandby) {
        _targetRingColor.copy(_standbyRingColor);
        _targetHaloColor.copy(_standbyHaloColor);
        _targetAccentColor.copy(_standbyRingColor).lerp(_activeGoldColor, 0.22);
      } else {
        _targetRingColor.copy(_standbyRingColor);
        _targetHaloColor.copy(_standbyHaloColor);
        _targetAccentColor.copy(_standbyRingColor);
      }

      const colorLerp = Math.min(1, dt * 7);
      primaryCyanMat.color.lerp(_targetRingColor, colorLerp);
      primaryCyanMat.emissive.lerp(_targetRingColor, colorLerp);
      accentGoldMat.color.lerp(_targetAccentColor, colorLerp);
      accentGoldMat.emissive.lerp(_targetAccentColor, colorLerp);
      outerRingMat.color.lerp(_targetHaloColor, colorLerp);
      outerRingMat.emissive.lerp(_targetHaloColor, colorLerp);
      glowPlaneMat.color.lerp(_targetHaloColor, colorLerp);
      tickMat.color.lerp(_targetHaloColor, colorLerp);
      floorGridMat.color.lerp(_targetHaloColor, colorLerp);
      emitterGridMat.color.lerp(_targetRingColor, colorLerp);
      backdropGridMat.color.lerp(_targetHaloColor, colorLerp);
      holoRig.coreMat.color.lerp(_targetHaloColor, colorLerp);
      holoRig.scanMat.color.lerp(_targetRingColor, colorLerp);
      rimLight.color.lerp(_targetRingColor, colorLerp);

      const targetIntensity = isWakeSequence
        ? 2.1 + wakePulseEnv * 2.4
        : isSleepSequence
          ? 1.1 + sleepPulseEnv * 1.3
          : mode === 'idle' && sleeping
            ? isStandby
              ? 1.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.4))
              : 0.95
            : mode === 'listening'
              ? 1.9 + Math.sin(t * 4) * 0.25
              : mode === 'thinking'
                ? 2.1 + Math.sin(t * 5.5) * 0.4
                : 1.95 + smoothedMouth * 1.45;
      primaryCyanMat.emissiveIntensity = THREE.MathUtils.damp(
        primaryCyanMat.emissiveIntensity,
        targetIntensity,
        10,
        dt,
      );
      accentGoldMat.emissiveIntensity = THREE.MathUtils.damp(
        accentGoldMat.emissiveIntensity,
        isWakeSequence ? 2.4 + wakePulseEnv * 1.6 : sleeping ? 0.65 : 1.35 + smoothedMouth * 0.7,
        10,
        dt,
      );

      glowPlaneMat.opacity = THREE.MathUtils.damp(
        glowPlaneMat.opacity,
        isWakeSequence
          ? 0.48 + wakePulseEnv * 0.34
          : isSleepSequence
            ? 0.28 + sleepPulseEnv * 0.24
            : sleeping
              ? isStandby
                ? 0.26 + 0.1 * (0.5 + 0.5 * Math.sin(t * 2.4))
                : 0.2
              : 0.4 + smoothedMouth * 0.26,
        10,
        dt,
      );

      backdropGridMat.opacity = THREE.MathUtils.damp(
        backdropGridMat.opacity,
        isWakeSequence ? 0.46 : sleeping ? 0.2 : 0.32,
        6,
        dt,
      );
      emitterGrid.rotation.z += dt * (isWakeSequence ? 1.8 : sleeping ? 0.08 : 0.22);

      const targetScale = isWakeSequence
        ? 1.0 + wakePulseEnv * 0.12
        : isSleepSequence
          ? 1.0 - sleepPulseEnv * 0.05
          : mode === 'speaking'
            ? 1.0 + smoothedMouth * 0.075
            : mode === 'listening'
              ? 1.02 + Math.sin(t * 3.5) * 0.015
              : isStandby
                ? 1.0 + Math.sin(t * 2.4) * 0.02
                : 1.0 + Math.sin(t * 1.4) * 0.008;
      haloGroup.scale.setScalar(
        THREE.MathUtils.damp(haloGroup.scale.x, targetScale, 12, dt),
      );

      // Multi-speed concentric ring rotations + rapid 1.5s spin-to-lock deceleration on boot
      const spinLockBoost = isWakeSequence
        ? Math.pow(1 - wakeBootProgress, 2) * 14.5
        : 0;
      const baseSpeedMul =
        mode === 'thinking' ? 2.2 : mode === 'speaking' ? 1.45 : sleeping ? 0.45 : 1.0;

      arcLayerCyan.rotation.z += dt * (0.28 * baseSpeedMul + spinLockBoost);
      arcLayerGold.rotation.z -= dt * (0.42 * baseSpeedMul + spinLockBoost * 1.25);
      arcLayerOuter.rotation.z += dt * (0.16 * baseSpeedMul + spinLockBoost * 0.8);
      ticksMesh.rotation.z -= dt * (0.12 * baseSpeedMul + spinLockBoost * 0.55);

      // 3D vertical scan ring sweep during 1.5s wake-up boot sequence
      if (isWakeSequence) {
        scanRing.visible = true;
        scanRing.position.y = THREE.MathUtils.lerp(1.94, 0.92, wakeBootProgress);
        scanRingMat.opacity = Math.sin(wakeBootProgress * Math.PI) * 0.85;
      } else {
        scanRing.visible = false;
      }

      // Drift floating cyan/gold holographic particles smoothly upward
      const posArr = particlePosAttr.array as Float32Array;
      const particleSpeedFactor = isWakeSequence ? 2.6 : sleeping ? 0.55 : 1.0;
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        posArr[idx + 1] += dt * particleSpeeds[i] * particleSpeedFactor;
        posArr[idx] += Math.sin(t * 0.9 + particlePhases[i]) * dt * 0.018;
        if (posArr[idx + 1] > 2.3) {
          posArr[idx + 1] = 0.45;
        }
      }
      particlePosAttr.needsUpdate = true;
      particleMat.opacity = THREE.MathUtils.damp(
        particleMat.opacity,
        isWakeSequence ? 0.82 : sleeping ? 0.34 : 0.62,
        6,
        dt,
      );

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost,
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored,
      );

      controls.dispose();
      for (const d of holoRig.disposables) d.dispose();
      for (const d of stageDisposables) d.dispose();
      envTexture.dispose();
      dracoLoader.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      customModelSlotRef.current = null;
    };
  }, []);

  // Load custom IndexedDB .vrm, custom URL, or permanent built-in /tampi.vrm
  useEffect(() => {
    const slot = customModelSlotRef.current;
    if (!slot) return;
    if (isAvatarResolving) return;

    const cleanupLoaded = () => {
      if (slot.loadedVrm) {
        slot.scene.remove(slot.loadedVrm.scene);
        VRMUtils.deepDispose(slot.loadedVrm.scene);
        slot.loadedVrm = null;
        slot.vrmRig = null;
      }
      if (slot.loadedModel) {
        slot.scene.remove(slot.loadedModel);
        VRMUtils.deepDispose(slot.loadedModel);
        slot.loadedModel = null;
      }
      slot.morphMeshes = [];
      slot.headBone = null;
      slot.spineBone = null;
      setHasLoadedAvatar(false);
    };

    const activeUrl = (vrmUrl || customGlbUrl || '/tampi.vrm').trim();

    let cancelled = false;
    setGlbLoading(true);

    const loadModelUrl = (urlToLoad: string, allowBuiltinFallback: boolean) => {
      setLoadProgress(0);
      slot.loader.load(
        urlToLoad,
        (gltf) => {
          if (cancelled) return;
          cleanupLoaded();

          const vrm = gltf.userData.vrm as VRM | undefined;
          if (vrm) {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);
            VRMUtils.rotateVRM0(vrm);

            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
              if ((obj as THREE.Mesh).isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });

            const vrmRig = buildVrmRigCache(vrm);

            // Apply sleeping pose immediately on first frame if starting in Standby mode
            if (isSleepingRef.current) {
              const headNode = vrmRig.head ?? vrm.humanoid?.getNormalizedBoneNode('head');
              if (headNode) {
                headNode.rotation.x = 0.12;
                headNode.rotation.z = 0.025;
              }
              if (vrm.expressionManager) {
                setVrmBlink(vrm.expressionManager, 1.0);
                if (vrm.expressionManager.getExpression('Fcl_EYE_Natural')) {
                  vrm.expressionManager.setValue('Fcl_EYE_Natural', 0);
                }
              }
            }

            vrm.update(0);

            // Scale & frame neatly from the chest up aligned to portrait camera & halo ring
            const box = new THREE.Box3().setFromObject(vrm.scene);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            if (size.y > 0.05) {
              const scale = 1.66 / size.y;
              vrm.scene.scale.setScalar(scale);
              box.setFromObject(vrm.scene);
              box.getCenter(center);
              vrm.scene.position.x -= center.x;
              vrm.scene.position.z -= center.z;
              vrm.scene.updateMatrixWorld(true);

              const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
              if (headNode) {
                const headWorldPos = new THREE.Vector3();
                headNode.getWorldPosition(headWorldPos);
                vrm.scene.position.y += 1.48 - headWorldPos.y;
              } else {
                vrm.scene.position.y -= box.min.y;
              }
            }

            slot.scene.add(vrm.scene);
            slot.loadedVrm = vrm;
            slot.vrmRig = vrmRig;
            slot.holoRoot.visible = false;
            setHasLoadedAvatar(true);
            setGlbLoading(false);
            return;
          }

          // Standard GLB fallback
          const model = gltf.scene;
          tuneArmBonesToRestPose(model);

          const morphMeshes: THREE.Mesh[] = [];
          let headBone: THREE.Bone | null = null;
          let spineBone: THREE.Bone | null = null;

          model.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                morphMeshes.push(mesh);
              }
            }
            const bone = obj as THREE.Bone;
            if (bone.isBone) {
              if (/^head$/i.test(bone.name) || /mixamorigHead/i.test(bone.name)) {
                headBone = bone;
              }
              if (
                /^spine2?$/i.test(bone.name) ||
                /mixamorigSpine2/i.test(bone.name)
              ) {
                spineBone = bone;
              }
            }
          });

          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          if (size.y > 0.01) {
            const scale = 1.72 / size.y;
            model.scale.setScalar(scale);
            box.setFromObject(model);
            box.getCenter(center);
            model.position.x -= center.x;
            model.position.z -= center.z;
            model.position.y -= box.min.y;
          }

          slot.scene.add(model);
          slot.loadedModel = model;
          slot.morphMeshes = morphMeshes;
          slot.headBone = headBone;
          slot.spineBone = spineBone;
          slot.holoRoot.visible = false;
          setHasLoadedAvatar(true);
          setGlbLoading(false);
        },
        (xhr) => {
          if (cancelled) return;
          if (xhr.lengthComputable && xhr.total > 0) {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            setLoadProgress(pct);
          } else {
            setLoadProgress((prev) => Math.min(95, prev + 12));
          }
        },
        (err) => {
          if (cancelled) return;
          if (allowBuiltinFallback && urlToLoad !== '/tampi.vrm') {
            glbErrorCbRef.current?.(
              'Could not load custom avatar — restored built-in Tampi.',
            );
            loadModelUrl('/tampi.vrm', false);
            return;
          }
          cleanupLoaded();
          slot.holoRoot.visible = true;
          setGlbLoading(false);
          const reason = err instanceof Error ? err.message : 'Network load or GLTF parse failure';
          glbErrorCbRef.current?.(`Could not load Tampi 3D avatar: ${reason}`);
        },
      );
    };

    loadModelUrl(activeUrl, activeUrl !== '/tampi.vrm');

    return () => {
      cancelled = true;
    };
  }, [isAvatarResolving, vrmUrl, customGlbUrl]);

  const showHoloLoading = isAvatarResolving || glbLoading;
  const showNoAvatarHint = !showHoloLoading && !hasLoadedAvatar && !webglUnavailable;

  return (
    <div className="relative w-full h-full studio-backdrop select-none">
      <div ref={mountRef} className="w-full h-full" />

      {showHoloLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-56">
          <div className="rounded-xl bg-[#071120]/88 border border-cyan-400/35 px-4 py-2 text-xs font-medium tracking-wide text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
            Loading 3D Model... {loadProgress > 0 ? `${loadProgress}%` : 'Connecting...'}
          </div>
        </div>
      )}

      {showNoAvatarHint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-56">
          <div className="rounded-xl bg-[#071120]/85 border border-cyan-400/25 px-4 py-2 text-xs text-cyan-200/85">
            Holographic standby active · Built-in avatar unavailable
          </div>
        </div>
      )}

      {webglUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl bg-[#0d121c]/95 border border-white/10 p-6 text-center">
            <h2 className="font-display text-xl font-semibold text-white">
              Tampi Voice Studio
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              3D WebGL acceleration is paused right now, but voice conversation,
              personal memory, and study timers remain fully active.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
