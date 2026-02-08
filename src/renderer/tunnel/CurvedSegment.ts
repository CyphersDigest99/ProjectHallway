import * as THREE from 'three';
import { TunnelPath, PathFrame } from './TunnelPath';

const SAMPLE_INTERVAL = 1; // meters between cross-section samples

/**
 * Generates rectangular tunnel geometry along a curved spline path.
 *
 * For each surface (left wall, right wall, floor, ceiling), we build a
 * quad-strip mesh by sampling cross-section positions along the path.
 * UVs: U = arc distance (for texture tiling), V = position across surface.
 */

export interface CurvedSegmentGeometry {
  leftWall: THREE.BufferGeometry;
  rightWall: THREE.BufferGeometry;
  floor: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
  wireframe: THREE.BufferGeometry;
  trimLeft: THREE.BufferGeometry;
  trimRight: THREE.BufferGeometry;
}

interface SamplePoint {
  frame: PathFrame;
  distance: number; // arc-length distance from segment start
}

/**
 * Generate curved tunnel segment geometry between tStart and tEnd on a path.
 */
export function generateCurvedSegment(
  path: TunnelPath,
  tStart: number,
  tEnd: number,
  width: number,
  height: number,
): CurvedSegmentGeometry {
  const halfW = width / 2;
  const halfH = height / 2;

  // Sample the path at regular intervals
  const distStart = path.distanceFromT(tStart);
  const distEnd = path.distanceFromT(tEnd);
  const segmentLength = distEnd - distStart;
  const numSamples = Math.max(2, Math.ceil(segmentLength / SAMPLE_INTERVAL) + 1);

  const samples: SamplePoint[] = [];
  for (let i = 0; i < numSamples; i++) {
    const frac = i / (numSamples - 1);
    const t = tStart + (tEnd - tStart) * frac;
    const distance = distStart + segmentLength * frac;
    samples.push({
      frame: path.getFrame(t),
      distance: distance - distStart, // relative to segment start
    });
  }

  return {
    leftWall: buildWallGeometry(samples, halfW, halfH, 'left', segmentLength),
    rightWall: buildWallGeometry(samples, halfW, halfH, 'right', segmentLength),
    floor: buildFloorCeilingGeometry(samples, halfW, halfH, 'floor', segmentLength),
    ceiling: buildFloorCeilingGeometry(samples, halfW, halfH, 'ceiling', segmentLength),
    wireframe: buildWireframeGeometry(samples, halfW, halfH),
    trimLeft: buildTrimGeometry(samples, halfW, halfH, 'left', segmentLength),
    trimRight: buildTrimGeometry(samples, halfW, halfH, 'right', segmentLength),
  };
}

function buildWallGeometry(
  samples: SamplePoint[],
  halfW: number,
  halfH: number,
  side: 'left' | 'right',
  segmentLength: number,
): THREE.BufferGeometry {
  const n = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pathDistances: number[] = [];
  const indices: number[] = [];

  const sign = side === 'left' ? -1 : 1;
  // Normal points inward: left wall normal = +x (right), right wall normal = -x (left)
  const normalSign = side === 'left' ? 1 : -1;

  for (let i = 0; i < n; i++) {
    const { frame, distance } = samples[i];
    const { position, normal, binormal } = frame;

    // Two vertices per sample: bottom and top of wall
    const wallOffset = new THREE.Vector3().copy(binormal).multiplyScalar(sign * halfW);

    const bottom = new THREE.Vector3().copy(position).add(wallOffset).addScaledVector(normal, -halfH);
    const top = new THREE.Vector3().copy(position).add(wallOffset).addScaledVector(normal, halfH);

    positions.push(bottom.x, bottom.y, bottom.z);
    positions.push(top.x, top.y, top.z);

    // Normal pointing inward
    const faceNormal = new THREE.Vector3().copy(binormal).multiplyScalar(normalSign);
    normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
    normals.push(faceNormal.x, faceNormal.y, faceNormal.z);

    // UV: U = distance along tunnel (for texture tiling), V = vertical position
    const u = distance / 10; // tile every 10m
    uvs.push(u, 0);
    uvs.push(u, 1);

    pathDistances.push(distance);
    pathDistances.push(distance);
  }

  // Build quad strip indices
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;

    // Two triangles per quad
    if (side === 'left') {
      indices.push(a, c, b);
      indices.push(b, c, d);
    } else {
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPathDistance', new THREE.Float32BufferAttribute(pathDistances, 1));
  geometry.setIndex(indices);

  return geometry;
}

function buildFloorCeilingGeometry(
  samples: SamplePoint[],
  halfW: number,
  halfH: number,
  surface: 'floor' | 'ceiling',
  segmentLength: number,
): THREE.BufferGeometry {
  const n = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pathDistances: number[] = [];
  const indices: number[] = [];

  const vertSign = surface === 'floor' ? -1 : 1;
  // Normal points inward: floor normal = +y (up), ceiling normal = -y (down)
  const normalSign = surface === 'floor' ? 1 : -1;

  for (let i = 0; i < n; i++) {
    const { frame, distance } = samples[i];
    const { position, normal, binormal } = frame;

    const vertOffset = new THREE.Vector3().copy(normal).multiplyScalar(vertSign * halfH);

    // Two vertices per sample: left and right edges of floor/ceiling
    const left = new THREE.Vector3().copy(position).add(vertOffset).addScaledVector(binormal, -halfW);
    const right = new THREE.Vector3().copy(position).add(vertOffset).addScaledVector(binormal, halfW);

    positions.push(left.x, left.y, left.z);
    positions.push(right.x, right.y, right.z);

    // Normal pointing inward
    const faceNormal = new THREE.Vector3().copy(normal).multiplyScalar(normalSign);
    normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
    normals.push(faceNormal.x, faceNormal.y, faceNormal.z);

    // UV: U = distance along tunnel, V = horizontal position
    const u = distance / 10;
    uvs.push(u, 0);
    uvs.push(u, 1);

    pathDistances.push(distance);
    pathDistances.push(distance);
  }

  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;

    if (surface === 'floor') {
      indices.push(a, b, c);
      indices.push(b, d, c);
    } else {
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aPathDistance', new THREE.Float32BufferAttribute(pathDistances, 1));
  geometry.setIndex(indices);

  return geometry;
}

function buildWireframeGeometry(
  samples: SamplePoint[],
  halfW: number,
  halfH: number,
): THREE.BufferGeometry {
  const positions: number[] = [];

  for (let i = 0; i < samples.length; i++) {
    const { frame } = samples[i];
    const { position, normal, binormal } = frame;

    // 4 corners of the cross-section
    const corners = [
      new THREE.Vector3().copy(position).addScaledVector(binormal, -halfW).addScaledVector(normal, -halfH),
      new THREE.Vector3().copy(position).addScaledVector(binormal, halfW).addScaledVector(normal, -halfH),
      new THREE.Vector3().copy(position).addScaledVector(binormal, halfW).addScaledVector(normal, halfH),
      new THREE.Vector3().copy(position).addScaledVector(binormal, -halfW).addScaledVector(normal, halfH),
    ];

    // Cross-section ring
    for (let j = 0; j < 4; j++) {
      const a = corners[j];
      const b = corners[(j + 1) % 4];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    // Longitudinal lines to next sample
    if (i < samples.length - 1) {
      const nextFrame = samples[i + 1].frame;
      const nextCorners = [
        new THREE.Vector3().copy(nextFrame.position).addScaledVector(nextFrame.binormal, -halfW).addScaledVector(nextFrame.normal, -halfH),
        new THREE.Vector3().copy(nextFrame.position).addScaledVector(nextFrame.binormal, halfW).addScaledVector(nextFrame.normal, -halfH),
        new THREE.Vector3().copy(nextFrame.position).addScaledVector(nextFrame.binormal, halfW).addScaledVector(nextFrame.normal, halfH),
        new THREE.Vector3().copy(nextFrame.position).addScaledVector(nextFrame.binormal, -halfW).addScaledVector(nextFrame.normal, halfH),
      ];

      for (let j = 0; j < 4; j++) {
        const a = corners[j];
        const b = nextCorners[j];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function buildTrimGeometry(
  samples: SamplePoint[],
  halfW: number,
  halfH: number,
  side: 'left' | 'right',
  segmentLength: number,
): THREE.BufferGeometry {
  const n = samples.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const sign = side === 'left' ? -1 : 1;
  const trimWidth = 0.1; // 10cm trim strip

  for (let i = 0; i < n; i++) {
    const { frame, distance } = samples[i];
    const { position, normal, binormal } = frame;

    // Trim at floor-wall junction
    const wallPos = new THREE.Vector3().copy(position)
      .addScaledVector(binormal, sign * (halfW - 0.05))
      .addScaledVector(normal, -halfH + 0.05);

    const innerPos = new THREE.Vector3().copy(wallPos).addScaledVector(binormal, -sign * trimWidth);

    positions.push(wallPos.x, wallPos.y, wallPos.z);
    positions.push(innerPos.x, innerPos.y, innerPos.z);

    const up = new THREE.Vector3(0, 1, 0);
    normals.push(up.x, up.y, up.z);
    normals.push(up.x, up.y, up.z);

    const u = distance / 10;
    uvs.push(u, 0);
    uvs.push(u, 1);
  }

  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = (i + 1) * 2;
    const d = c + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

// --- Geometry cache ---

interface CacheEntry {
  geometry: CurvedSegmentGeometry;
  accessTime: number;
}

const geometryCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;

function makeCacheKey(edgeId: string, tStart: number, tEnd: number): string {
  return `${edgeId}:${tStart.toFixed(6)}:${tEnd.toFixed(6)}`;
}

/**
 * Get or create cached curved segment geometry.
 */
export function getCurvedSegmentGeometry(
  edgeId: string,
  path: TunnelPath,
  tStart: number,
  tEnd: number,
  width: number,
  height: number,
): CurvedSegmentGeometry {
  const key = makeCacheKey(edgeId, tStart, tEnd);
  const cached = geometryCache.get(key);

  if (cached) {
    cached.accessTime = Date.now();
    return cached.geometry;
  }

  const geometry = generateCurvedSegment(path, tStart, tEnd, width, height);

  // Evict oldest if cache is full
  if (geometryCache.size >= MAX_CACHE_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of geometryCache) {
      if (v.accessTime < oldestTime) {
        oldestTime = v.accessTime;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      const old = geometryCache.get(oldestKey);
      if (old) {
        disposeSegmentGeometry(old.geometry);
        geometryCache.delete(oldestKey);
      }
    }
  }

  geometryCache.set(key, { geometry, accessTime: Date.now() });
  return geometry;
}

function disposeSegmentGeometry(geom: CurvedSegmentGeometry): void {
  geom.leftWall.dispose();
  geom.rightWall.dispose();
  geom.floor.dispose();
  geom.ceiling.dispose();
  geom.wireframe.dispose();
  geom.trimLeft.dispose();
  geom.trimRight.dispose();
}

export function clearGeometryCache(): void {
  for (const entry of geometryCache.values()) {
    disposeSegmentGeometry(entry.geometry);
  }
  geometryCache.clear();
}
