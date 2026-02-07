import React, { useRef, useState, useMemo } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { CeilingLight as CeilingLightType, LightFixtureStyle } from '../../../shared/types';
import { useSceneStore } from '../../store/sceneStore';

const TUNNEL_WIDTH = 16;
const TUNNEL_HEIGHT = 10;

// Cache for temperature colors to avoid recalculation
const temperatureColorCache = new Map<number, string>();

// Color temperature to RGB conversion (cached)
const temperatureToColor = (kelvin: number): string => {
  // Round to nearest 100K for cache efficiency
  const roundedKelvin = Math.round(kelvin / 100) * 100;

  const cached = temperatureColorCache.get(roundedKelvin);
  if (cached) return cached;

  const temp = roundedKelvin / 100;
  let r, g, b;

  if (temp <= 66) {
    r = 255;
    g = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
  } else {
    r = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    g = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  }

  const color = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  temperatureColorCache.set(roundedKelvin, color);
  return color;
};

// Get fixture length constraints based on style
export const getFixtureLengthRange = (style: LightFixtureStyle): { min: number; max: number; default: number } => {
  switch (style) {
    case 'linear':
      return { min: 1, max: 8, default: 3 };
    case 'panel':
      return { min: 1, max: 4, default: 2 };
    case 'pendant':
      return { min: 0.3, max: 1.5, default: 0.5 };
    case 'spot':
      return { min: 0.2, max: 0.5, default: 0.3 };
    case 'industrial':
      return { min: 2, max: 6, default: 4 };
    default:
      return { min: 1, max: 8, default: 3 };
  }
};

interface CeilingLightProps {
  light: CeilingLightType;
  globalBrightness?: number;
  onContextMenu?: (e: ThreeEvent<MouseEvent>, light: CeilingLightType) => void;
}

// Linear fixture - elongated rectangular tube light
const LinearFixture: React.FC<{
  length: number;
  lightColor: string;
  emissiveIntensity: number;
  totalBrightness: number;
  hovered: boolean;
  isDragging: boolean;
  eventHandlers: any;
}> = ({ length, lightColor, emissiveIntensity, totalBrightness, eventHandlers }) => {
  const fixtureHeight = 0.15;
  const fixtureDepth = 0.8;

  return (
    <>
      {/* Light fixture housing */}
      <mesh {...eventHandlers}>
        <boxGeometry args={[length, fixtureHeight, fixtureDepth]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Light panel (emissive) */}
      <mesh position={[0, -fixtureHeight / 2 - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length - 0.2, fixtureDepth - 0.1]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={lightColor}
          emissiveIntensity={emissiveIntensity * totalBrightness * 2}
        />
      </mesh>

      {/* Mounting brackets */}
      {[-length / 2 + 0.2, length / 2 - 0.2].map((x, i) => (
        <mesh key={i} position={[x, fixtureHeight / 2 + 0.1, 0]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
};

// Panel fixture - square recessed panel
const PanelFixture: React.FC<{
  length: number;
  lightColor: string;
  emissiveIntensity: number;
  totalBrightness: number;
  eventHandlers: any;
}> = ({ length, lightColor, emissiveIntensity, totalBrightness, eventHandlers }) => {
  const panelThickness = 0.08;

  return (
    <>
      {/* Panel frame */}
      <mesh {...eventHandlers}>
        <boxGeometry args={[length, panelThickness, length]} />
        <meshStandardMaterial color="#2a2a3e" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Diffuser panel (emissive) */}
      <mesh position={[0, -panelThickness / 2 - 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length - 0.1, length - 0.1]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={lightColor}
          emissiveIntensity={emissiveIntensity * totalBrightness * 2.5}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Corner brackets */}
      {[
        [-length / 2 + 0.1, length / 2 - 0.1],
        [length / 2 - 0.1, length / 2 - 0.1],
        [-length / 2 + 0.1, -length / 2 + 0.1],
        [length / 2 - 0.1, -length / 2 + 0.1],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, panelThickness / 2 + 0.05, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
          <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </>
  );
};

// Pendant fixture - hanging fixture with drop rod and shade
const PendantFixture: React.FC<{
  length: number;
  lightColor: string;
  emissiveIntensity: number;
  totalBrightness: number;
  eventHandlers: any;
}> = ({ length, lightColor, emissiveIntensity, totalBrightness, eventHandlers }) => {
  const dropLength = 0.8;
  const shadeRadius = length / 2;
  const shadeHeight = length * 0.6;

  return (
    <>
      {/* Ceiling mount */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05, 16]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Drop rod */}
      <mesh position={[0, -dropLength / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, dropLength, 8]} />
        <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Shade (cone-shaped) */}
      <mesh
        position={[0, -dropLength - shadeHeight / 2, 0]}
        {...eventHandlers}
      >
        <coneGeometry args={[shadeRadius, shadeHeight, 24, 1, true]} />
        <meshStandardMaterial
          color="#2a2a3e"
          metalness={0.5}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Light bulb (emissive sphere) */}
      <mesh position={[0, -dropLength - shadeHeight * 0.3, 0]}>
        <sphereGeometry args={[length * 0.2, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={lightColor}
          emissiveIntensity={emissiveIntensity * totalBrightness * 3}
        />
      </mesh>
    </>
  );
};

// Spot fixture - circular spotlight
const SpotFixture: React.FC<{
  length: number;
  lightColor: string;
  emissiveIntensity: number;
  totalBrightness: number;
  eventHandlers: any;
}> = ({ length, lightColor, emissiveIntensity, totalBrightness, eventHandlers }) => {
  const spotRadius = length / 2;
  const spotDepth = length * 0.8;

  return (
    <>
      {/* Spot housing */}
      <mesh {...eventHandlers} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[spotRadius, spotRadius * 0.8, spotDepth, 24]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Inner reflector */}
      <mesh position={[0, -spotDepth / 2 + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[spotRadius * 0.7, spotRadius * 0.5, spotDepth * 0.3, 24]} />
        <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Light lens (emissive) */}
      <mesh position={[0, -spotDepth / 2 - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[spotRadius * 0.6, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive={lightColor}
          emissiveIntensity={emissiveIntensity * totalBrightness * 4}
        />
      </mesh>

      {/* Trim ring */}
      <mesh position={[0, -spotDepth / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[spotRadius * 0.6, spotRadius * 0.8, 24]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
      </mesh>
    </>
  );
};

// Industrial fixture - track with multiple tube lights
const IndustrialFixture: React.FC<{
  length: number;
  lightColor: string;
  emissiveIntensity: number;
  totalBrightness: number;
  eventHandlers: any;
}> = ({ length, lightColor, emissiveIntensity, totalBrightness, eventHandlers }) => {
  const trackHeight = 0.1;
  const trackWidth = 0.3;
  const tubeRadius = 0.05;
  const tubeCount = Math.max(2, Math.floor(length / 1.5));
  const tubeSpacing = length / (tubeCount + 1);

  return (
    <>
      {/* Main track */}
      <mesh {...eventHandlers}>
        <boxGeometry args={[length, trackHeight, trackWidth]} />
        <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Tube lights */}
      {Array.from({ length: tubeCount }).map((_, i) => {
        const xPos = -length / 2 + tubeSpacing * (i + 1);
        return (
          <group key={i} position={[xPos, -trackHeight / 2 - tubeRadius - 0.02, 0]}>
            {/* Tube holder */}
            <mesh position={[0, tubeRadius + 0.03, 0]}>
              <boxGeometry args={[0.08, 0.06, trackWidth * 0.8]} />
              <meshStandardMaterial color="#444" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Tube light */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[tubeRadius, tubeRadius, trackWidth * 0.9, 16]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={lightColor}
                emissiveIntensity={emissiveIntensity * totalBrightness * 2}
                transparent
                opacity={0.9}
              />
            </mesh>
            {/* End caps */}
            {[-trackWidth * 0.45, trackWidth * 0.45].map((z, j) => (
              <mesh key={j} position={[0, 0, z]}>
                <cylinderGeometry args={[tubeRadius * 1.1, tubeRadius * 1.1, 0.02, 16]} />
                <meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* End brackets */}
      {[-length / 2 + 0.1, length / 2 - 0.1].map((x, i) => (
        <mesh key={i} position={[x, trackHeight / 2 + 0.08, 0]}>
          <boxGeometry args={[0.15, 0.16, 0.15]} />
          <meshStandardMaterial color="#333" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
};

export const CeilingLight: React.FC<CeilingLightProps> = ({ light, globalBrightness = 1.0, onContextMenu }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { updateLight } = useSceneStore();
  const { camera, gl, raycaster } = useThree();

  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragPosition, setDragPosition] = useState<THREE.Vector3 | null>(null);

  // Get fixture style and length with defaults
  const fixtureStyle: LightFixtureStyle = light.fixtureStyle || 'linear';
  const fixtureLength = light.fixtureLength || 3;

  // Calculate light intensity based on fixture length (proportional scaling)
  const lengthMultiplier = fixtureLength / 3; // 3m is reference
  const totalBrightness = light.brightness * globalBrightness;
  const lightIntensity = totalBrightness * 60 * lengthMultiplier;
  const lightDistance = 50 * Math.sqrt(lengthMultiplier);

  // Calculate light color from color override or temperature (memoized)
  const lightColor = useMemo(
    () => light.color || temperatureToColor(light.temperature || 5500),
    [light.color, light.temperature]
  );

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 0) {
      e.stopPropagation();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;

    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);

    // Intersect with plane at light's Z position
    const intersection = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), light.depth);
    raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      const w = TUNNEL_WIDTH / 2 - 1;
      const h = TUNNEL_HEIGHT / 2 - 0.2;
      // Constrain to ceiling and within tunnel width
      const newPos = new THREE.Vector3(
        Math.max(-w, Math.min(w, intersection.x)),
        h,
        -light.depth
      );
      setDragPosition(newPos);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

      if (dragPosition) {
        updateLight(light.id, {
          position: { x: dragPosition.x, y: dragPosition.y, z: dragPosition.z },
        });
      }
      setDragPosition(null);
    }
  };

  const handlePointerEnter = () => {
    setHovered(true);
    document.body.style.cursor = 'grab';
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHovered(false);
      document.body.style.cursor = 'auto';
    }
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e, light);
    }
  };

  const currentPosition = isDragging && dragPosition
    ? [dragPosition.x, dragPosition.y, dragPosition.z] as [number, number, number]
    : [light.position.x, light.position.y, light.position.z] as [number, number, number];

  const emissiveIntensity = hovered || isDragging ? 2 : 1.5;

  // Event handlers to pass to fixture components
  const eventHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onContextMenu: handleContextMenu,
  };

  // Render appropriate fixture based on style
  const renderFixture = () => {
    const props = {
      length: fixtureLength,
      lightColor,
      emissiveIntensity,
      totalBrightness,
      hovered,
      isDragging,
      eventHandlers,
    };

    switch (fixtureStyle) {
      case 'panel':
        return <PanelFixture {...props} />;
      case 'pendant':
        return <PendantFixture {...props} />;
      case 'spot':
        return <SpotFixture {...props} />;
      case 'industrial':
        return <IndustrialFixture {...props} />;
      case 'linear':
      default:
        return <LinearFixture {...props} />;
    }
  };

  // Calculate point light position offset based on fixture style
  const getLightOffset = (): [number, number, number] => {
    switch (fixtureStyle) {
      case 'pendant':
        return [0, -1.2, 0];
      case 'spot':
        return [0, -fixtureLength * 0.5, 0];
      case 'panel':
        return [0, -0.3, 0];
      case 'industrial':
        return [0, -0.4, 0];
      case 'linear':
      default:
        return [0, -0.7, 0];
    }
  };

  return (
    <group ref={groupRef} position={currentPosition}>
      {renderFixture()}

      {/* Single optimized point light - combines main and fill light */}
      <pointLight
        position={getLightOffset()}
        intensity={lightIntensity}
        distance={lightDistance}
        color={lightColor}
        decay={1.8}
      />
    </group>
  );
};
