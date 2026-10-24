import * as THREE from 'three';
import type { MaterialKey } from '../core/engine/types';
import type { StageFinish } from '../core/schema';
import type { ViewMode } from '../ui/store';

export const ACCENT = new THREE.Color('#0a84ff');

interface Look { color: string; metalness: number; roughness: number; edge: number; edgeColor?: string }

const FINISH: Record<StageFinish, string> = { white: '#f2f1ee', black: '#1b1b1d', graphite: '#3a3a3d', oak: '#b99a74' };

export function lookFor(key: MaterialKey, mode: ViewMode, finish: StageFinish): Look {
  if (mode === 'technical') {
    const tone: Partial<Record<MaterialKey, string>> = { chairSeat: '#e4e4e8', chairFrame: '#c7c7cc', ledBody: '#dcdce1', truss: '#c9cbd0', hoist: '#bdbdc2', fixture: '#bdbdc2', presenter: '#e9e6e1', leg: '#c7c7cc' };
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

/** LED pixel-surface shader: one global image across all cabinets of a wall (cell-indexed UVs). */
export function makeLedFaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGrid: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uTech: { value: 0 },
      uSelected: { value: 0 },
      uAccent: { value: ACCENT.clone() },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aCell;
      varying vec2 vUv; varying vec2 vG;
      uniform vec2 uGrid;
      void main() {
        vUv = uv;
        vG = (aCell + uv) / uGrid;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec2 vG;
      uniform vec2 uGrid; uniform float uTime; uniform float uTech; uniform float uSelected; uniform vec3 uAccent;
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
