# TODO - Project Hallway

## High Priority

### Drawing Mechanism Issues (Decorating Mode)
The 3D wall drawing system in `DecoratingDrawingSurface` (Scene.tsx) has several issues that need fixing:

1. **Stuttering/Laggy Drawing**
   - Drawing feels choppy instead of smooth
   - May need to throttle texture updates or batch stroke points
   - Consider using requestAnimationFrame for smoother rendering

2. **Straight Lines Instead of Curves**
   - Strokes are rendering as segmented straight lines
   - Need to implement proper curve interpolation (quadratic/bezier)
   - The `renderStrokeToContext` function has curve logic for 'pen' style but may not be applying correctly in real-time preview

3. **Paint Offset (~1m to the side)**
   - Strokes appear offset from cursor position
   - Likely a coordinate transformation issue in `worldToCanvas()` or raycasting
   - Check wall plane normal directions and intersection calculations
   - May need to account for camera position offset in decorating mode

**Files to investigate:**
- `src/renderer/components/Scene.tsx` - `DecoratingDrawingSurface` component
- Specifically: `worldToCanvas()`, `getCanvasPoint()`, `handlePointerMove()`

## Medium Priority

- [ ] Text boxes on walls (Feature 5 from plan)
- [ ] Multi-select with drag box (Feature 6 from plan)
- [ ] Memory optimization for distant sections (Feature 8 from plan)

## Low Priority

- [ ] Improve spray paint particle performance
- [ ] Add more brush styles
