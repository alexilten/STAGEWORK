import * as THREE from 'three';
import type { MaterialKey } from '../core/engine/types';
import type { StageFinish } from '../core/schema';
import type { ViewMode } from '../ui/store';

export const ACCENT = new THREE.Color('#0a84ff');

interface Look { color: string; metalness: number; roughness: number; edge: number; edgeColor?: string; opacity?: number }

const FINISH: Record<StageFinish, string> = { white: '#f2f1ee', black: '#1b1b1d', graphite: '#3a3a3d', oak: '#b99a74' };

export function lookFor(key: MaterialKey, mode: ViewMode, finish: StageFinish, scenicFinish: StageFinish = 'white'): Look {
  if (mode === 'technical') {
    if (key === 'glass') return { color: '#cfe3f0', metalness: 0, roughness: 0.1, edge: 0, opacity: 0.35 };
    if (key === 'roofSkin') return { color: '#eef0f4', metalness: 0, roughness: 0.9, edge: 0, opacity: 0.3 };
    const tone: Partial<Record<MaterialKey, string>> = { crowd: '#c9cbd2', barricade: '#bdbdc2', stand: '#e6e6ea', structure: '#c9cbd0', booth: '#bcbcc2', camera: '#b9b9bf', platform: '#d6d6db', screen: '#9a9aa2', drape: '#d0d0d6', scenicFlat: '#ececef', speaker: '#d7d7dc', speakerGrille: '#bcbcc2', chairSeat: '#e4e4e8', chairFrame: '#c7c7cc', accessible: '#9db8e3', ledBody: '#dcdce1', truss: '#c9cbd0', hoist: '#bdbdc2', fixture: '#bdbdc2', presenter: '#e9e6e1', leg: '#c7c7cc', venueDark: '#e2e2e6', venueFloor: '#efefef', venueCarpet: '#ececee', venueSteel: '#c9cbd0', venueColumn: '#d9dade', venuePipe: '#b9bbc1', venueDoor: '#d4d5da', rigPoint: '#3a6bff', venueTier: '#e6e7eb', venueTurf: '#dfe6dc' };
    if (key === 'venueGlass') return { color: '#cfe3f0', metalness: 0, roughness: 0.1, edge: 0, opacity: 0.35 };
    return { color: tone[key] ?? '#f7f7f8', metalness: 0, roughness: 0.9, edge: 1, edgeColor: '#5d5d63' };
  }
  switch (key) {
    case 'deckTop': return { color: FINISH[finish], metalness: 0, roughness: finish === 'white' ? 0.55 : 0.42, edge: 0.55, edgeColor: finish === 'white' ? '#bdbab3' : '#0c0c0d' };
    case 'fascia': return { color: FINISH[finish], metalness: 0, roughness: 0.5, edge: 0 };
    case 'deckFrame': return { color: '#2b2b2e', metalness: 0.6, roughness: 0.45, edge: 0 };
    case 'leg': return { color: '#9a9aa0', metalness: 0.85, roughness: 0.35, edge: 0 };
    case 'ledBody': return { color: '#121214', metalness: 0.3, roughness: 0.55, edge: 0.5, edgeColor: '#000000' };
    case 'ledSupport': return { color: '#56565b', metalness: 0.7, roughness: 0.4, edge: 0 };
    case 'truss': return { color: '#d7d9dd', metalness: 0.95, roughness: 0.28, edge: 0 };
    case 'hoist': return { color: '#1f1f22', metalness: 0.4, roughness: 0.5, edge: 0 };
    case 'fixture': return { color: '#1d1d20', metalness: 0.35, roughness: 0.45, edge: 0 };
    case 'presenter': return { color: '#ebe8e3', metalness: 0, roughness: 0.85, edge: 0 };
    case 'chairSeat': return { color: '#c9c9ce', metalness: 0, roughness: 0.7, edge: 0 };
    case 'chairFrame': return { color: '#a3a3a9', metalness: 0.8, roughness: 0.35, edge: 0 };
    case 'accessible': return { color: '#2f6fd0', metalness: 0, roughness: 0.8, edge: 0 };
    case 'speaker': return { color: '#1a1a1d', metalness: 0.2, roughness: 0.6, edge: 0.4, edgeColor: '#000000' };
    case 'speakerGrille': return { color: '#0c0c0e', metalness: 0.5, roughness: 0.45, edge: 0 };
    case 'scenicFlat': return { color: FINISH[scenicFinish], metalness: 0, roughness: 0.8, edge: 0.35, edgeColor: scenicFinish === 'white' ? '#cfccc6' : '#0c0c0d' };
    case 'drape': return { color: '#121213', metalness: 0, roughness: 1, edge: 0 };
    case 'camera': return { color: '#2a2a2e', metalness: 0.45, roughness: 0.45, edge: 0 };
    case 'platform': return { color: '#1e1e21', metalness: 0, roughness: 0.92, edge: 0.4, edgeColor: '#000000' };
    case 'glass': return { color: '#cfe3f0', metalness: 0, roughness: 0.05, edge: 0, opacity: 0.3 };
    case 'screen': return { color: '#0d1422', metalness: 0.2, roughness: 0.18, edge: 0 };
    case 'crowd': return { color: '#8d93a3', metalness: 0, roughness: 0.9, edge: 0 };
    case 'barricade': return { color: '#a7a9b0', metalness: 0.8, roughness: 0.35, edge: 0 };
    case 'stand': return { color: '#d9d9de', metalness: 0, roughness: 0.75, edge: 0.4, edgeColor: '#b4b4ba' };
    case 'structure': return { color: '#c4c6cc', metalness: 0.9, roughness: 0.3, edge: 0 };
    case 'roofSkin': return { color: '#f4f4f6', metalness: 0, roughness: 0.6, edge: 0, opacity: 0.42 };
    case 'booth': return { color: '#151517', metalness: 0.3, roughness: 0.45, edge: 0.4, edgeColor: '#000000' };
    case 'venueWall': return { color: '#e7e5e0', metalness: 0, roughness: 0.95, edge: 0 };
    case 'venueDark': return { color: '#3a3c42', metalness: 0, roughness: 0.95, edge: 0 };
    case 'venueFloor': return { color: '#dcd9d2', metalness: 0, roughness: 0.95, edge: 0 };
    case 'venueCarpet': return { color: '#cfc6ba', metalness: 0, roughness: 1, edge: 0 };
    case 'venueSteel': return { color: '#8a8e96', metalness: 0.6, roughness: 0.5, edge: 0 };
    case 'venueColumn': return { color: '#b4b8bf', metalness: 0.2, roughness: 0.7, edge: 0 };
    case 'venuePipe': return { color: '#5f636b', metalness: 0.6, roughness: 0.5, edge: 0 };
    case 'venueDoor': return { color: '#9aa0aa', metalness: 0.4, roughness: 0.55, edge: 0 };
    case 'venueGlass': return { color: '#dbe7f1', metalness: 0, roughness: 0.1, edge: 0, opacity: 0.45 };
    case 'rigPoint': return { color: '#3a6bff', metalness: 0, roughness: 0.6, edge: 0 };
    case 'venueTier': return { color: '#d3d8e2', metalness: 0, roughness: 0.85, edge: 0 };
    case 'venueTurf': return { color: '#a7bb9c', metalness: 0, roughness: 1, edge: 0 };
  }
}

/** MeshStandardMaterial with a screen-space face-outline term (driven by box UVs), used for module seams and Technical mode. */
export function makeEdgeMaterial(): THREE.MeshStandardMaterial & { userData: { uniforms: { uEdge: { value: number }; uEdgeColor: { value: THREE.Color } } } } {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff' }) as any;
  const uniforms = { uEdge: { value: 0 }, uEdgeColor: { value: new THREE.Color('#000') } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader: any) => {
    shader.uniforms.uEdge = uniforms.uEdge;
    shader.uniforms.uEdgeColor = uniforms.uEdgeColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEdgeUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEdgeUv;\nuniform float uEdge;\nuniform vec3 uEdgeColor;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec2 fw = fwidth(vEdgeUv) * 1.1;
        vec2 e = smoothstep(vec2(0.0), fw, vEdgeUv) * smoothstep(vec2(0.0), fw, 1.0 - vEdgeUv);
        float edge = 1.0 - min(e.x, e.y);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdgeColor, edge * uEdge);`);
  };
  mat.customProgramCacheKey = () => 'sc-edge';
  return mat;
}

/**
 * Venue cutaway, shared by every venue material: walls (and anything within `margin` of a wall) on the
 * side the camera looks in from are discarded above uCutZ, so the room reads like a section model.
 * Positions are the model's own mm, Z-up frame (instance matrix applied, before the world wrapper).
 */
export const VENUE_CUT = {
  uCut: { value: 0 },
  uCutZ: { value: 1200 },
  uBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  uCam: { value: new THREE.Vector3() },
};
export function addVenueCut(mat: THREE.MeshStandardMaterial) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    Object.assign(shader.uniforms, VENUE_CUT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 cutP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutP = instanceMatrix * cutP;
        #endif
        vCutPos = cutP.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;\nuniform float uCut;\nuniform float uCutZ;\nuniform vec4 uBox;\nuniform vec3 uCam;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uCut > 0.5 && vCutPos.z > uCutZ) {
          const float m = 0.0;
          bool cut = (vCutPos.x < uBox.x + m && uCam.x < uBox.x) || (vCutPos.x > uBox.z - m && uCam.x > uBox.z)
            || (vCutPos.y < uBox.y + m && uCam.y < uBox.y) || (vCutPos.y > uBox.w - m && uCam.y > uBox.w);
          if (cut) discard;
        }`);
  };
  mat.customProgramCacheKey = () => 'sc-edge-venue';
  return mat;
}

/** LED pixel-surface shader: one global image across all cabinets of a wall (cell-indexed UVs). */
export function makeLedFaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrid: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uTech: { value: 0 },
      uSelected: { value: 0 },
      uAccent: { value: ACCENT.clone() },
      // uploaded screen content: world-space rect (x0, z0, width, height) in mm
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0 },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aCell;
      varying vec2 vUv; varying vec2 vG; varying vec2 vXZ;
      uniform vec2 uGrid;
      void main() {
        vUv = uv;
        vG = (aCell + uv) / uGrid;
        vXZ = (instanceMatrix * vec4(position, 1.0)).xz; // STAGECRAFT mm, front projection
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec2 vG; varying vec2 vXZ;
      uniform vec2 uGrid; uniform float uTime; uniform float uTech; uniform float uSelected; uniform vec3 uAccent;
      uniform sampler2D uMap; uniform float uHasMap; uniform vec4 uRect;
      float blob(vec2 p, vec2 c, float r) { return exp(-dot(p - c, p - c) / (r * r)); }
      void main() {
        float aspect = uGrid.x / max(uGrid.y, 1.0);
        vec2 p = vec2(vG.x * aspect, vG.y);
        float t = uTime * 0.06;
        vec3 col = vec3(0.012, 0.016, 0.03);
        col += vec3(0.10, 0.36, 1.00) * 0.95 * blob(p, vec2(aspect * (0.30 + 0.08 * sin(t * 3.1)), 0.42 + 0.10 * cos(t * 2.3)), 0.42);
        col += vec3(0.62, 0.32, 0.95) * 0.70 * blob(p, vec2(aspect * (0.66 + 0.07 * cos(t * 2.7)), 0.58 + 0.08 * sin(t * 1.9)), 0.36);
        col += vec3(1.00, 0.58, 0.36) * 0.45 * blob(p, vec2(aspect * (0.52 + 0.12 * sin(t * 1.3)), 0.12), 0.30);
        col = col / (1.0 + col * 0.6);
        if (uHasMap > 0.5) {
          vec2 m = (vXZ - uRect.xy) / uRect.zw;
          float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
          vec4 tx = texture2D(uMap, clamp(m, 0.0, 1.0));
          col = vec3(0.008, 0.009, 0.012) + tx.rgb * tx.a * inside; // transparent logo areas read as black LED
        }
        // cabinet seams
        vec2 fw = fwidth(vUv);
        vec2 e = smoothstep(vec2(0.0), fw * 1.2, vUv) * smoothstep(vec2(0.0), fw * 1.2, 1.0 - vUv);
        float seam = 1.0 - min(e.x, e.y);
        vec3 tech = mix(vec3(0.93, 0.94, 0.96), vec3(0.80, 0.86, 0.98), vG.y * 0.5 + 0.2);
        tech = mix(tech, vec3(0.22, 0.42, 0.85), seam * 0.9);
        col = mix(col * (1.0 - seam * 0.55), tech, uTech);
        col = mix(col, uAccent, uSelected * 0.12);
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
