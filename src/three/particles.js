import * as THREE from 'three';

/**
 * Particles — a single THREE.Points field.
 *
 * - Buffers are allocated ONCE at the maximum count; quality tiers (and any
 *   runtime downgrades) only move `setDrawRange`, so we never realloc or
 *   re-upload GPU memory after init.
 * - Rendering is a tiny custom shader: soft round sprite computed from
 *   gl_PointCoord — no texture fetch at all.
 * - Additive blending into a near-black background, depthWrite off.
 */

const MAX_COUNT = 1600;
const COUNT = { high: 1600, medium: 900, low: 420 };

const VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aScale;
attribute float aSeed;
varying float vSeed;
varying float vFade;
void main() {
  vSeed = aSeed;
  vec3 p = position;
  // Gentle drift — time is in seconds, identical on every refresh rate.
  p.y += sin(aSeed * 6.2831 + uTime * 0.35) * 0.22;
  p.x += cos(aSeed * 12.566 + uTime * 0.22) * 0.16;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Fade particles into the background for depth.
  vFade = 1.0 - smoothstep(6.0, 13.5, -mv.z);
  float size = aScale * uPixelRatio * (30.0 / -mv.z);
  gl_PointSize = clamp(size, 1.0, 22.0 * uPixelRatio); // soft cap: no giant blobs
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uAccent;
varying float vSeed;
varying float vFade;
void main() {
  float d = distance(gl_PointCoord, vec2(0.5));
  float alpha = smoothstep(0.5, 0.06, d) * vFade;
  if (alpha < 0.004) discard;             // skip fully-invisible fragments
  // Mostly dim white dust, a few accent sparks.
  vec3 col = mix(vec3(0.55, 0.57, 0.62), uAccent, step(0.9, vSeed));
  gl_FragColor = vec4(col, alpha * 0.62);
}
`;

export class Particles extends THREE.Points {
  constructor(perf, accentColor = 0xd5ff3f) {
    const positions = new Float32Array(MAX_COUNT * 3);
    const scales = new Float32Array(MAX_COUNT);
    const seeds = new Float32Array(MAX_COUNT);

    for (let i = 0; i < MAX_COUNT; i++) {
      // Even-ish shell distribution, biased wide so the center stays clear.
      const r = 3.4 + Math.pow(Math.random(), 0.72) * 4.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.72;
      positions[i * 3 + 2] = r * Math.cos(phi) * 0.85;
      scales[i] = 1.4 + Math.random() * 5.4;
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setDrawRange(0, COUNT[perf.tier]);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: perf.dpr },
        uAccent: { value: new THREE.Color(accentColor) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    super(geometry, material);
    this.reducedMotion = perf.reducedMotion;
    this.frustumCulled = false;
  }

  setQualityTier(tier) {
    this.geometry.setDrawRange(0, COUNT[tier] ?? COUNT.medium);
  }

  setPixelRatio(dpr) {
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  update(t, dt) {
    this.material.uniforms.uTime.value = t;
    const speed = this.reducedMotion ? 0.25 : 1;
    this.rotation.y += dt * 0.016 * speed;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
