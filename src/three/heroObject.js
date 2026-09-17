import * as THREE from 'three';

/**
 * HeroObject — a noise-displaced icosahedron with a fresnel rim shader
 * (GPU-driven morph: zero per-frame CPU cost) plus a thin wireframe shell
 * rotating counter to it for parallax depth.
 *
 * Cost budget (triangles incl. shell): high ≈ 21k, medium ≈ 5.5k, low ≈ 1.5k.
 * No textures, no lights, no post-processing.
 */

const SNOISE = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
${'' /* NOISE_DEF placeholder replaced below */}
__SNOISE__
void main() {
  vec3 nrm = normalize(position);
  float t = uTime;

  float n = snoise(nrm * uFreq + vec3(0.0, t, t * 0.6));
  n += 0.5 * snoise(nrm * uFreq * 2.13 - vec3(t * 1.35, 0.0, t * 0.8));
  n *= 1.0 / 1.5;

  vec3 displaced = position + normal * n * uAmp;

  #ifdef CORRECT_NORMALS
    // Re-derive the normal from two displaced tangent samples —
    // smooth shading on a morphed surface, cheap at our polycounts.
    vec3 tangent = normalize(cross(nrm, abs(nrm.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = normalize(cross(nrm, tangent));
    float e = 0.22;
    vec3 p1 = position + tangent * e;
    vec3 p2 = position + bitangent * e;
    vec3 n1 = normalize(p1);
    vec3 n2 = normalize(p2);
    float d1 = snoise(n1 * uFreq + vec3(0.0, t, t * 0.6)) + 0.5 * snoise(n1 * uFreq * 2.13 - vec3(t * 1.35, 0.0, t * 0.8));
    float d2 = snoise(n2 * uFreq + vec3(0.0, t, t * 0.6)) + 0.5 * snoise(n2 * uFreq * 2.13 - vec3(t * 1.35, 0.0, t * 0.8));
    p1 += n1 * (d1 * 1.0 / 1.5) * uAmp;
    p2 += n2 * (d2 * 1.0 / 1.5) * uAmp;
    nrm = normalize(cross(p1 - displaced, p2 - displaced));
  #endif

  vNoise = n;
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vViewDir = normalize(-mv.xyz);
  vNormal = normalize(normalMatrix * nrm);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uAccent;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  float shade = vNoise * 0.5 + 0.5;

  vec3 base = mix(vec3(0.030, 0.034, 0.045), vec3(0.105, 0.12, 0.145), shade);

  // Simple two-light wrap so form reads without a lighting rig.
  float key = max(dot(N, normalize(vec3(0.55, 0.8, 0.65))), 0.0);
  float fill = max(dot(N, normalize(vec3(-0.7, -0.3, 0.5))), 0.0);
  base += vec3(0.045) * key + vec3(0.016, 0.018, 0.026) * fill;

  vec3 col = base
    + uAccent * fresnel * 0.95
    + uAccent * smoothstep(0.62, 1.0, shade) * 0.07;

  gl_FragColor = vec4(col, 1.0);
}
`;

const DETAIL = { high: 4, medium: 3, low: 2 };   // icosahedron subdivisions
const SHELL_DETAIL = { high: 2, medium: 1, low: 1 };

export class HeroObject extends THREE.Group {
  /**
   * @param {import('../core/perf.js').PerformanceManager} perf
   */
  constructor(perf, accentColor = 0xd5ff3f) {
    super();
    this.reducedMotion = perf.reducedMotion;
    const tier = perf.tier;

    const geometry = new THREE.IcosahedronGeometry(1.42, DETAIL[tier]);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT.replace('__SNOISE__', SNOISE),
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: this.reducedMotion ? 0.1 : 0.34 },
        uFreq: { value: 1.15 },
        uAccent: { value: new THREE.Color(accentColor) },
      },
      defines: tier === 'low' ? {} : { CORRECT_NORMALS: '' },
    });
    this.blob = new THREE.Mesh(geometry, this.material);
    this.blob.position.set(1.15, 0.12, 0);

    // Thin wire shell — reads as structure, costs almost nothing.
    this.shell = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.05, SHELL_DETAIL[tier])),
      new THREE.LineBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: tier === 'low' ? 0.1 : 0.13,
      }),
    );
    this.shell.position.copy(this.blob.position);
    this.shell.rotation.set(0.4, 0.2, 0.1);

    this.add(this.blob, this.shell);
  }

  /**
   * @param {number} t   elapsed seconds (already scaled by caller)
   * @param {number} dt  clamped delta seconds
   */
  update(t, dt) {
    this.material.uniforms.uTime.value = t * 0.16;
    // Delta-based rotation: identical speed at 60 Hz and 240 Hz.
    const speed = this.reducedMotion ? 0.35 : 1;
    this.blob.rotation.y += dt * 0.11 * speed;
    this.blob.rotation.z += dt * 0.045 * speed;
    this.shell.rotation.y -= dt * 0.05 * speed;
    this.shell.rotation.x += dt * 0.023 * speed;
  }

  dispose() {
    this.blob.geometry.dispose();
    this.material.dispose();
    this.shell.geometry.dispose();
    this.shell.material.dispose();
  }
}
