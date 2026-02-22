import * as THREE from 'three';
import { TunnelNode, TunnelEdge, IntersectionStyle, Vector3 as V3Type } from '../../shared/types';

const DEFAULT_CHAMBER_RADIUS = 1.5; // Multiplier of tunnel size
const PORTAL_TRANSITION_LENGTH = 5; // meters to transition from chamber to tunnel size

export interface IntersectionGeometry {
  floor: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
  walls: THREE.BufferGeometry; // Chamber walls with portal openings
  wireframe: THREE.BufferGeometry;
}

export interface PortalInfo {
  edgeId: string;
  direction: THREE.Vector3; // Normalized direction from node center toward edge
  position: THREE.Vector3;  // World position of portal center
  width: number;
  height: number;
}

/**
 * Generate intersection chamber geometry at a node where 3+ edges meet.
 * The chamber is an enlarged rectangular room with portal openings
 * aligned to each outgoing edge direction.
 */
export function generateIntersectionChamber(
  node: TunnelNode,
  edges: TunnelEdge[],
  tunnelWidth: number,
  tunnelHeight: number,
): { geometry: IntersectionGeometry; portals: PortalInfo[] } {
  const style = node.style || {};
  const radiusMult = style.chamberRadius || DEFAULT_CHAMBER_RADIUS;
  const chamberW = tunnelWidth * radiusMult;
  const chamberH = tunnelHeight * radiusMult;
  const halfW = chamberW / 2;
  const halfH = chamberH / 2;

  const center = new THREE.Vector3(node.position.x, node.position.y, node.position.z);

  // Compute portal info for each edge
  const portals: PortalInfo[] = edges.map(edge => {
    // Determine direction: from node toward the other end of the edge
    const isFrom = edge.fromNodeId === node.id;
    const cp = edge.controlPoints;

    let dir: THREE.Vector3;
    if (isFrom) {
      // Edge goes away from node: direction toward first control segment
      const p0 = new THREE.Vector3(cp[0].x, cp[0].y, cp[0].z);
      const p1 = new THREE.Vector3(cp[Math.min(1, cp.length - 1)].x, cp[Math.min(1, cp.length - 1)].y, cp[Math.min(1, cp.length - 1)].z);
      dir = new THREE.Vector3().subVectors(p1, p0).normalize();
    } else {
      // Edge arrives at node: direction from last control segment
      const pN = new THREE.Vector3(cp[cp.length - 1].x, cp[cp.length - 1].y, cp[cp.length - 1].z);
      const pPrev = new THREE.Vector3(cp[Math.max(0, cp.length - 2)].x, cp[Math.max(0, cp.length - 2)].y, cp[Math.max(0, cp.length - 2)].z);
      dir = new THREE.Vector3().subVectors(pPrev, pN).normalize();
    }

    // Portal position: at the edge of the chamber in the direction of the edge
    const portalPos = new THREE.Vector3().copy(center).addScaledVector(dir, halfW * 0.8);

    return {
      edgeId: edge.id,
      direction: dir,
      position: portalPos,
      width: edge.width || tunnelWidth,
      height: edge.height || tunnelHeight,
    };
  });

  // Generate chamber geometry
  const geometry = buildChamberGeometry(center, halfW, halfH, chamberW, chamberH, portals);

  return { geometry, portals };
}

function buildChamberGeometry(
  center: THREE.Vector3,
  halfW: number,
  halfH: number,
  chamberW: number,
  chamberH: number,
  portals: PortalInfo[],
): IntersectionGeometry {
  // Simple box chamber — floor and ceiling are flat planes
  const floorGeom = new THREE.PlaneGeometry(chamberW, chamberW);
  floorGeom.rotateX(-Math.PI / 2);
  floorGeom.translate(center.x, center.y - halfH, center.z);

  const ceilingGeom = new THREE.PlaneGeometry(chamberW, chamberW);
  ceilingGeom.rotateX(Math.PI / 2);
  ceilingGeom.translate(center.x, center.y + halfH, center.z);

  // Walls: 4 sides of a box, each with potential portal cutouts
  // For simplicity, generate as a closed box and mark portal regions
  const wallPositions: number[] = [];
  const wallNormals: number[] = [];
  const wallUvs: number[] = [];
  const wallIndices: number[] = [];

  // Generate 4 wall faces (front, back, left, right relative to chamber center)
  const wallDefs = [
    { normal: [0, 0, 1], right: [1, 0, 0], pos: [center.x, center.y, center.z + halfW] },
    { normal: [0, 0, -1], right: [-1, 0, 0], pos: [center.x, center.y, center.z - halfW] },
    { normal: [1, 0, 0], right: [0, 0, -1], pos: [center.x + halfW, center.y, center.z] },
    { normal: [-1, 0, 0], right: [0, 0, 1], pos: [center.x - halfW, center.y, center.z] },
  ];

  for (const wallDef of wallDefs) {
    const n = new THREE.Vector3(...wallDef.normal as [number, number, number]);
    const r = new THREE.Vector3(...wallDef.right as [number, number, number]);
    const up = new THREE.Vector3(0, 1, 0);
    const wCenter = new THREE.Vector3(...wallDef.pos as [number, number, number]);

    // Check if any portal cuts through this wall
    // Portal direction points outward from node center toward edge,
    // wall normal also points outward — so high dot = portal aligns with this wall
    const hasPortal = portals.some(p => {
      const dot = p.direction.dot(n);
      return dot > 0.5; // Portal roughly faces this wall
    });

    if (hasPortal) {
      // Skip wall face where portal exists (leave opening)
      continue;
    }

    // Generate wall quad
    const baseIdx = wallPositions.length / 3;
    const corners = [
      new THREE.Vector3().copy(wCenter).addScaledVector(r, -halfW).addScaledVector(up, -halfH),
      new THREE.Vector3().copy(wCenter).addScaledVector(r, halfW).addScaledVector(up, -halfH),
      new THREE.Vector3().copy(wCenter).addScaledVector(r, halfW).addScaledVector(up, halfH),
      new THREE.Vector3().copy(wCenter).addScaledVector(r, -halfW).addScaledVector(up, halfH),
    ];

    for (const c of corners) {
      wallPositions.push(c.x, c.y, c.z);
      // Normal faces inward
      wallNormals.push(-n.x, -n.y, -n.z);
    }
    wallUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    wallIndices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  }

  const wallsGeom = new THREE.BufferGeometry();
  wallsGeom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
  wallsGeom.setAttribute('normal', new THREE.Float32BufferAttribute(wallNormals, 3));
  wallsGeom.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
  wallsGeom.setIndex(wallIndices);

  // Wireframe: outline of chamber
  const wirePositions: number[] = [];
  const corners3D = [
    [-halfW, -halfH, -halfW], [halfW, -halfH, -halfW],
    [halfW, -halfH, halfW], [-halfW, -halfH, halfW],
    [-halfW, halfH, -halfW], [halfW, halfH, -halfW],
    [halfW, halfH, halfW], [-halfW, halfH, halfW],
  ].map(([x, y, z]) => [x + center.x, y + center.y, z + center.z]);

  // Bottom ring
  for (let i = 0; i < 4; i++) {
    const a = corners3D[i];
    const b = corners3D[(i + 1) % 4];
    wirePositions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  // Top ring
  for (let i = 0; i < 4; i++) {
    const a = corners3D[i + 4];
    const b = corners3D[((i + 1) % 4) + 4];
    wirePositions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  // Verticals
  for (let i = 0; i < 4; i++) {
    wirePositions.push(corners3D[i][0], corners3D[i][1], corners3D[i][2]);
    wirePositions.push(corners3D[i + 4][0], corners3D[i + 4][1], corners3D[i + 4][2]);
  }

  const wireframeGeom = new THREE.BufferGeometry();
  wireframeGeom.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));

  return {
    floor: floorGeom,
    ceiling: ceilingGeom,
    walls: wallsGeom,
    wireframe: wireframeGeom,
  };
}

/**
 * Dispose intersection chamber geometry.
 */
export function disposeChamberGeometry(geom: IntersectionGeometry): void {
  geom.floor.dispose();
  geom.ceiling.dispose();
  geom.walls.dispose();
  geom.wireframe.dispose();
}
