import * as THREE from 'three';
import { Vector3 as V3Type, TunnelEdge } from '../../shared/types';

const SAMPLES_PER_METER = 1; // Arc-length lookup table resolution

/**
 * Rotation Minimizing Frame along a 3D curve.
 * Uses double-reflection parallel transport to avoid the twist
 * instability of raw Frenet frames at inflection points.
 */
export interface PathFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}

/**
 * Result of projecting a world point onto the spline.
 */
export interface LocalCoord {
  t: number;
  offset: THREE.Vector2; // x = horizontal (left/right), y = vertical (up/down) relative to path frame
  distance: number;      // arc-length distance from start
}

/**
 * Core spline engine wrapping THREE.CatmullRomCurve3 with:
 * - Rotation Minimizing Frames (RMF) via double-reflection
 * - Arc-length ↔ parameter conversion
 * - World ↔ local coordinate transforms
 */
export class TunnelPath {
  readonly curve: THREE.CatmullRomCurve3;
  readonly arcLength: number;

  // Arc-length lookup table
  private arcLengths: number[];
  private arcLengthParams: number[];

  // Cached RMF frames
  private rmfFrames: PathFrame[];
  private rmfParams: number[];

  constructor(controlPoints: V3Type[], curveType: 'catmullrom' | 'centripetal' | 'chordal' = 'centripetal') {
    const threePoints = controlPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
    this.curve = new THREE.CatmullRomCurve3(threePoints, false, curveType);

    // Build arc-length lookup table
    this.arcLength = this.curve.getLength();
    const numSamples = Math.max(10, Math.ceil(this.arcLength * SAMPLES_PER_METER));
    const lengths = this.curve.getLengths(numSamples);

    this.arcLengths = lengths;
    this.arcLengthParams = lengths.map((_, i) => i / numSamples);

    // Build RMF frames at same resolution
    this.rmfFrames = [];
    this.rmfParams = [];
    this.buildRMF(numSamples);
  }

  /**
   * Create a TunnelPath from a TunnelEdge.
   */
  static fromEdge(edge: TunnelEdge): TunnelPath {
    return new TunnelPath(edge.controlPoints);
  }

  /**
   * Create a straight tunnel path along negative Z (legacy compatibility).
   */
  static straight(length: number): TunnelPath {
    return new TunnelPath([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: -length },
    ]);
  }

  // --- Core queries ---

  getPoint(t: number): THREE.Vector3 {
    return this.curve.getPointAt(this.clampT(t));
  }

  getTangent(t: number): THREE.Vector3 {
    return this.curve.getTangentAt(this.clampT(t)).normalize();
  }

  /**
   * Get Rotation Minimizing Frame at parameter t.
   * Interpolates between precomputed RMF samples.
   */
  getFrame(t: number): PathFrame {
    t = this.clampT(t);
    const n = this.rmfParams.length - 1;
    const idx = t * n;
    const i = Math.min(Math.floor(idx), n - 1);
    const frac = idx - i;

    if (frac < 0.001 || i >= n) {
      return this.rmfFrames[Math.min(i, n)];
    }

    // Interpolate between adjacent frames
    const f0 = this.rmfFrames[i];
    const f1 = this.rmfFrames[i + 1];

    const position = new THREE.Vector3().lerpVectors(f0.position, f1.position, frac);
    const tangent = new THREE.Vector3().lerpVectors(f0.tangent, f1.tangent, frac).normalize();
    const normal = new THREE.Vector3().lerpVectors(f0.normal, f1.normal, frac).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    return { position, tangent, normal, binormal };
  }

  // --- Arc-length conversion ---

  /**
   * Convert arc-length distance (meters) to parameter t.
   */
  tFromDistance(meters: number): number {
    if (meters <= 0) return 0;
    if (meters >= this.arcLength) return 1;

    // Binary search in arc-length table
    const table = this.arcLengths;
    let lo = 0;
    let hi = table.length - 1;

    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid] < meters) lo = mid;
      else hi = mid;
    }

    const segLength = table[hi] - table[lo];
    const frac = segLength > 0 ? (meters - table[lo]) / segLength : 0;
    const tLo = this.arcLengthParams[lo];
    const tHi = this.arcLengthParams[hi];

    return tLo + (tHi - tLo) * frac;
  }

  /**
   * Convert parameter t to arc-length distance (meters).
   */
  distanceFromT(t: number): number {
    t = this.clampT(t);
    // Interpolate in arc-length table
    const n = this.arcLengths.length - 1;
    const idx = t * n;
    const i = Math.min(Math.floor(idx), n - 1);
    const frac = idx - i;
    return this.arcLengths[i] + (this.arcLengths[Math.min(i + 1, n)] - this.arcLengths[i]) * frac;
  }

  // --- Coordinate transforms ---

  /**
   * Project a world-space point onto the spline.
   * Returns the closest t parameter and the offset in the local frame.
   */
  worldToLocal(worldPoint: THREE.Vector3): LocalCoord {
    // Coarse search: find closest sample point
    const n = this.rmfParams.length;
    let bestT = 0;
    let bestDist = Infinity;

    for (let i = 0; i < n; i++) {
      const d = worldPoint.distanceToSquared(this.rmfFrames[i].position);
      if (d < bestDist) {
        bestDist = d;
        bestT = this.rmfParams[i];
      }
    }

    // Fine search: Newton-style refinement around best sample
    const step = 1 / (n - 1);
    const tMin = Math.max(0, bestT - step);
    const tMax = Math.min(1, bestT + step);
    const refinements = 8;

    for (let iter = 0; iter < refinements; iter++) {
      const tA = tMin + (tMax - tMin) * 0.382;
      const tB = tMin + (tMax - tMin) * 0.618;
      const dA = worldPoint.distanceToSquared(this.getPoint(tA));
      const dB = worldPoint.distanceToSquared(this.getPoint(tB));
      if (dA < dB) {
        bestT = tA;
      } else {
        bestT = tB;
      }
    }

    // Compute local offset in the frame at bestT
    const frame = this.getFrame(bestT);
    const delta = new THREE.Vector3().subVectors(worldPoint, frame.position);
    const offsetX = delta.dot(frame.binormal); // horizontal offset
    const offsetY = delta.dot(frame.normal);   // vertical offset

    return {
      t: bestT,
      offset: new THREE.Vector2(offsetX, offsetY),
      distance: this.distanceFromT(bestT),
    };
  }

  /**
   * Convert path-local coordinates back to world position.
   */
  localToWorld(t: number, offset: THREE.Vector2 = new THREE.Vector2()): THREE.Vector3 {
    const frame = this.getFrame(t);
    return new THREE.Vector3()
      .copy(frame.position)
      .addScaledVector(frame.binormal, offset.x)
      .addScaledVector(frame.normal, offset.y);
  }

  // --- RMF construction (double-reflection parallel transport) ---

  private buildRMF(numSamples: number): void {
    this.rmfFrames = [];
    this.rmfParams = [];

    // Initial frame at t=0
    const t0Tangent = this.curve.getTangentAt(0).normalize();
    const t0Position = this.curve.getPointAt(0);

    // Choose initial normal perpendicular to tangent
    let initNormal: THREE.Vector3;
    if (Math.abs(t0Tangent.y) < 0.9) {
      initNormal = new THREE.Vector3().crossVectors(t0Tangent, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      initNormal = new THREE.Vector3().crossVectors(t0Tangent, new THREE.Vector3(1, 0, 0)).normalize();
    }

    // For a straight path along -Z, we want normal = (0,1,0) and binormal = (1,0,0)
    // This ensures the cross section aligns with the tunnel's conventional orientation
    if (this.isStraight()) {
      initNormal = new THREE.Vector3(0, 1, 0);
    }

    const initBinormal = new THREE.Vector3().crossVectors(t0Tangent, initNormal).normalize();

    this.rmfFrames.push({
      position: t0Position.clone(),
      tangent: t0Tangent.clone(),
      normal: initNormal.clone(),
      binormal: initBinormal.clone(),
    });
    this.rmfParams.push(0);

    // Propagate frames using double-reflection method
    for (let i = 1; i <= numSamples; i++) {
      const t = i / numSamples;
      const prev = this.rmfFrames[i - 1];

      const pi = this.curve.getPointAt(t);
      const ti = this.curve.getTangentAt(t).normalize();

      // Double reflection (parallel transport)
      const v1 = new THREE.Vector3().subVectors(pi, prev.position);
      const c1 = v1.dot(v1);

      if (c1 < 1e-10) {
        // Degenerate — just copy previous frame
        this.rmfFrames.push({
          position: pi.clone(),
          tangent: ti.clone(),
          normal: prev.normal.clone(),
          binormal: prev.binormal.clone(),
        });
        this.rmfParams.push(t);
        continue;
      }

      // First reflection
      const rL = new THREE.Vector3().copy(prev.normal).addScaledVector(v1, -2 * v1.dot(prev.normal) / c1);
      const tL = new THREE.Vector3().copy(prev.tangent).addScaledVector(v1, -2 * v1.dot(prev.tangent) / c1);

      // Second reflection
      const v2 = new THREE.Vector3().subVectors(ti, tL);
      const c2 = v2.dot(v2);

      let ni: THREE.Vector3;
      if (c2 < 1e-10) {
        ni = rL.clone();
      } else {
        ni = new THREE.Vector3().copy(rL).addScaledVector(v2, -2 * v2.dot(rL) / c2);
      }

      ni.normalize();
      const bi = new THREE.Vector3().crossVectors(ti, ni).normalize();

      this.rmfFrames.push({
        position: pi.clone(),
        tangent: ti.clone(),
        normal: ni,
        binormal: bi,
      });
      this.rmfParams.push(t);
    }
  }

  /**
   * Check if this path is essentially straight (2 control points, or all collinear).
   */
  isStraight(): boolean {
    const pts = this.curve.points;
    if (pts.length <= 2) return true;

    // Check collinearity
    const dir = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]).normalize();
    for (let i = 1; i < pts.length - 1; i++) {
      const v = new THREE.Vector3().subVectors(pts[i], pts[0]);
      const proj = v.dot(dir);
      const perp = v.clone().addScaledVector(dir, -proj);
      if (perp.length() > 0.01) return false;
    }
    return true;
  }

  private clampT(t: number): number {
    return Math.max(0, Math.min(1, t));
  }
}
