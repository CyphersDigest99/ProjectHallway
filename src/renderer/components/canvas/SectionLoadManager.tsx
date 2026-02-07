import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useSceneStore } from '../../store/sceneStore';
import { useShallow } from 'zustand/react/shallow';

// Distance thresholds for loading/unloading sections
const LOAD_DISTANCE = 50; // Load sections within 50m of camera
const UNLOAD_DISTANCE = 100; // Unload sections beyond 100m from camera

interface SectionLoadManagerProps {
  cameraZ: number;
}

// Global texture cache for drawing textures - used for GPU memory management
const drawingTextureCache = new Map<
  string,
  {
    texture: THREE.CanvasTexture | null;
    canvas: HTMLCanvasElement | null;
    lastAccessed: number;
  }
>();

// Dispose a drawing texture and its canvas
export const disposeDrawingTexture = (sectionId: string) => {
  const cached = drawingTextureCache.get(sectionId);
  if (cached) {
    if (cached.texture) {
      cached.texture.dispose();
    }
    drawingTextureCache.delete(sectionId);
  }
};

// Mark a section's texture as recently accessed
export const touchDrawingTexture = (sectionId: string) => {
  const cached = drawingTextureCache.get(sectionId);
  if (cached) {
    cached.lastAccessed = Date.now();
  }
};

// Clean up textures that haven't been accessed recently
export const cleanupOldTextures = (maxAge: number = 60000) => {
  const now = Date.now();
  const toDelete: string[] = [];

  drawingTextureCache.forEach((value, key) => {
    if (now - value.lastAccessed > maxAge) {
      toDelete.push(key);
    }
  });

  toDelete.forEach((key) => {
    disposeDrawingTexture(key);
  });

  return toDelete.length;
};

export const SectionLoadManager: React.FC<SectionLoadManagerProps> = ({
  cameraZ,
}) => {
  const {
    wallSections,
    loadedSections,
    loadSection,
    unloadSection,
  } = useSceneStore(useShallow(s => ({
    wallSections: s.wallSections,
    loadedSections: s.loadedSections,
    loadSection: s.loadSection,
    unloadSection: s.unloadSection,
  })));

  const lastCameraZ = useRef(cameraZ);
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Determine which sections should be loaded/unloaded based on camera position
  const updateSectionLoading = useCallback(() => {
    const cameraDepth = Math.abs(cameraZ);

    wallSections.forEach((section) => {
      const sectionCenter = (section.zStart + section.zEnd) / 2;
      const distance = Math.abs(sectionCenter - cameraDepth);
      const isCurrentlyLoaded = loadedSections.get(section.id)?.loaded ?? false;

      if (distance <= LOAD_DISTANCE && !isCurrentlyLoaded) {
        // Load section
        loadSection(section.id);
        touchDrawingTexture(section.id);
      } else if (distance > UNLOAD_DISTANCE && isCurrentlyLoaded) {
        // Unload section
        unloadSection(section.id);
        // Don't dispose texture immediately - let cleanup handle it
      } else if (isCurrentlyLoaded) {
        // Touch the texture to keep it fresh
        touchDrawingTexture(section.id);
      }
    });
  }, [cameraZ, wallSections, loadedSections, loadSection, unloadSection]);

  // Update loading when camera moves significantly
  useEffect(() => {
    const cameraDelta = Math.abs(cameraZ - lastCameraZ.current);

    // Only update when camera has moved at least 5m
    if (cameraDelta >= 5) {
      updateSectionLoading();
      lastCameraZ.current = cameraZ;
    }
  }, [cameraZ, updateSectionLoading]);

  // Periodic cleanup of old textures
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      const cleaned = cleanupOldTextures();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} old drawing textures`);
      }
    }, 30000); // Check every 30 seconds

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    updateSectionLoading();
  }, []);

  // This is a logic-only component, no render
  return null;
};

// Hook for checking if a section is loaded
export const useSectionLoaded = (sectionId: string): boolean => {
  const loadedSections = useSceneStore(s => s.loadedSections);
  return loadedSections.get(sectionId)?.loaded ?? false;
};

// Hook for getting all loaded sections
export const useLoadedSections = (): string[] => {
  const loadedSections = useSceneStore(s => s.loadedSections);
  const loadedIds: string[] = [];

  loadedSections.forEach((value, key) => {
    if (value.loaded) {
      loadedIds.push(key);
    }
  });

  return loadedIds;
};

export default SectionLoadManager;
