import { v4 as uuidv4 } from 'uuid';
import { TunnelTopology, TunnelNode, TunnelEdge, Vector3 } from '../../shared/types';
import { TunnelPath } from './TunnelPath';

/**
 * Graph traversal helpers for the tunnel topology.
 */

/**
 * Find all edges connected to a given node.
 */
export function getEdgesAtNode(topology: TunnelTopology, nodeId: string): TunnelEdge[] {
  return topology.edges.filter(
    e => e.fromNodeId === nodeId || e.toNodeId === nodeId
  );
}

/**
 * Get the node at the other end of an edge from the given node.
 */
export function getOtherNode(edge: TunnelEdge, nodeId: string): string {
  return edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
}

/**
 * Find a node by ID.
 */
export function getNode(topology: TunnelTopology, nodeId: string): TunnelNode | undefined {
  return topology.nodes.find(n => n.id === nodeId);
}

/**
 * Find an edge by ID.
 */
export function getEdge(topology: TunnelTopology, edgeId: string): TunnelEdge | undefined {
  return topology.edges.find(e => e.id === edgeId);
}

/**
 * Get the root (starting) edge of the topology.
 */
export function getRootEdge(topology: TunnelTopology): TunnelEdge | undefined {
  return topology.edges.find(e => e.id === topology.rootEdgeId);
}

/**
 * Check if a node is an intersection (3+ connected edges).
 */
export function isIntersection(topology: TunnelTopology, nodeId: string): boolean {
  return getEdgesAtNode(topology, nodeId).length >= 3;
}

/**
 * When the player reaches the end of an edge (t=0 or t=1),
 * determine which node they're at and what other edges are available.
 */
export function getNavigationOptions(
  topology: TunnelTopology,
  edgeId: string,
  atEnd: 'from' | 'to'
): { node: TunnelNode; edges: TunnelEdge[] } | null {
  const edge = getEdge(topology, edgeId);
  if (!edge) return null;

  const nodeId = atEnd === 'from' ? edge.fromNodeId : edge.toNodeId;
  const node = getNode(topology, nodeId);
  if (!node) return null;

  const edges = getEdgesAtNode(topology, nodeId).filter(e => e.id !== edgeId);
  return { node, edges };
}

/**
 * Create a default straight-line topology for legacy saves.
 * Two nodes connected by a single straight edge along -Z.
 */
export function createLegacyTopology(maxDepth: number = 10000): TunnelTopology {
  const originId = uuidv4();
  const endId = uuidv4();
  const edgeId = uuidv4();

  const length = Math.max(maxDepth, 1000); // At least 1km

  const nodes: TunnelNode[] = [
    { id: originId, position: { x: 0, y: 0, z: 0 }, label: 'Origin' },
    { id: endId, position: { x: 0, y: 0, z: -length }, label: 'End' },
  ];

  const edges: TunnelEdge[] = [
    {
      id: edgeId,
      fromNodeId: originId,
      toNodeId: endId,
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -length },
      ],
      length,
    },
  ];

  return { nodes, edges, rootEdgeId: edgeId };
}

/**
 * Compute the maximum depth across all objects in a scene state,
 * used to determine how long the legacy straight edge should be.
 */
export function computeMaxDepthFromObjects(
  signs: { depth: number }[],
  lights: { depth: number }[],
  wallSections: { zEnd: number }[],
): number {
  let maxDepth = 0;
  for (const s of signs) maxDepth = Math.max(maxDepth, s.depth);
  for (const l of lights) maxDepth = Math.max(maxDepth, l.depth);
  for (const ws of wallSections) maxDepth = Math.max(maxDepth, ws.zEnd);
  return maxDepth;
}

/**
 * Cache of TunnelPath instances, keyed by edge ID.
 * Avoids recomputing spline math when edges haven't changed.
 */
const pathCache = new Map<string, { path: TunnelPath; controlPointsKey: string }>();

function controlPointsKey(points: Vector3[]): string {
  return points.map(p => `${p.x},${p.y},${p.z}`).join('|');
}

/**
 * Get or create a TunnelPath for an edge, with caching.
 */
export function getPathForEdge(edge: TunnelEdge): TunnelPath {
  const key = controlPointsKey(edge.controlPoints);
  const cached = pathCache.get(edge.id);

  if (cached && cached.controlPointsKey === key) {
    return cached.path;
  }

  const path = TunnelPath.fromEdge(edge);
  pathCache.set(edge.id, { path, controlPointsKey: key });
  return path;
}

/**
 * Clear the path cache (e.g., after topology changes).
 */
export function clearPathCache(): void {
  pathCache.clear();
}
