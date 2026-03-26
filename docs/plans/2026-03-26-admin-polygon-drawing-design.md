# Admin Polygon Drawing Tool Design

## Problem
Currently, the admin panel `admin-rooms.html` allows users to create 3D hotspots by clicking on the panorama to generate an array of points for a polygon. However, the exact shape of the polygon is not dynamically visualized during the drawing workflow (it only uses numbered generic point markers). Users cannot see the highlighted area until checking the frontend (`index.html`), and adjusting points is difficult (requires manual undo).

## Solution
We will implement an interactive, live SVG preview approach (WYSIWYG) in the admin panel. 

### Core Mechanics
1. **Live SVG Overlay:** When "Draw Mode" is activated, a full-screen `<svg>` element (styled with `pointer-events: none;`) will be overlaid on the Marzipano viewer.
2. **Rendering Vectors:** We will convert Marzipano's spherical coordinates (`yaw, pitch`) to 2D screen coordinates to draw the polygon in real-time.
3. **Draft Line:** As the user moves the mouse, a dynamic visually differentiated line will extend from the last finalized point to the current cursor position, previewing the next edge.
4. **Interactive Draggable Points (Handles):** At each vertex of the polygon, an interactable HTML element (handle) will be placed. Users can:
   - Click-and-drag these handles to adjust the shape dynamically.
   - Double-click a handle to delete that specific point without needing to undo chronologically.

### Implementation Details
- **Data State:** Keep `polygonPoints = [[yaw, pitch], ...]` as the source of truth parameter.
- **Render Loop:** Attach an event listener to the Marzipano `view`'s `change` event. Inside it:
  - Iterate through `polygonPoints`.
  - Use `viewer.view().coordinatesToScreen({ yaw, pitch })` to map points to 2D.
  - Generate the SVG `<polygon points="...">` string and update the SVG container content.
  - Position the handle nodes at the calculated `(x, y)` pixels via CSS transforms.
- **Draw Events:** 
  - On `mousedown` on the panorama (when dragging is false), capture `yaw`/`pitch` and push to `polygonPoints`.
  - On `mousemove` (when not dragging a point), capture `mouseX` and `mouseY` to render the draft line.
  - On `mousedown` on a handle, initiate dragging state. Convert mouse coordinates back to `yaw/pitch` during `mousemove` using `viewer.view().screenToCoordinates(...)` to redefine the point in the 3D space.

### Files Modified
- `public/admin-rooms.html`: 
  - Modify `togglePolygonDrawMode` and `handlePolygonClick`.
  - Add logic for rendering the SVG overlay (replacing Marzipano info hotspots for each point).
  - Add logic for DOM point handle dragging and draft lines.
