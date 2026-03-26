# Admin Polygon Drawing Tool Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a WYSIWYG live SVG polygon drawing tool with handles in the admin panel to replace the blind point-click system.

**Architecture:** We will add an SVG overlay to the Pannellum viewer. Since Pannellum handles 3D-to-2D projection of hotspots, we will intercept the DOM elements created by Pannellum (`handleDivs`) and use their screen positions to draw an SVG `<polygon>` dynamically via a `requestAnimationFrame` loop.

**Tech Stack:** HTML, Vanilla JavaScript, Pannellum API

---

### Task 1: Add SVG Overlay Containers and Sync Loop

**Files:**
- Modify: `public/admin-rooms.html`

**Step 1: Write the minimal implementation for UI elements**
In `public/admin-rooms.html`, locate `function togglePolygonDrawMode()` (around line 2046).
Add code to insert the SVG overlay if it doesn't exist, and show/hide it based on `isPolygonDrawMode`:
```javascript
// Add global variable for animation frame
window.handleDivs = [];
window.syncPolygonRaf = null;

function syncPolygonLoop() {
  if (!isPolygonDrawMode) return;
  const polygon = document.getElementById('adminPolygonShape');
  const viewerNode = document.getElementById('panoramaViewer');
  if (!viewerNode) return;
  const viewerRect = viewerNode.getBoundingClientRect();
  
  if (polygon && window.handleDivs && window.handleDivs.length >= 1) {
    let pts = [];
    for (let i = 0; i < window.handleDivs.length; i++) {
        const div = window.handleDivs[i];
        if (!div || div.style.display === 'none' || div.style.opacity === '0') continue;
        const rect = div.getBoundingClientRect();
        // Calculate center of hotspot relative to viewer
        const x = rect.left - viewerRect.left + rect.width / 2;
        const y = rect.top - viewerRect.top + rect.height / 2;
        pts.push(`${x},${y}`);
    }
    polygon.setAttribute('points', pts.join(' '));
  } else if (polygon) {
    polygon.setAttribute('points', '');
  }
  window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
}
```

Update `togglePolygonDrawMode` to manage the SVG:
```javascript
      if (isPolygonDrawMode) {
        // ... existing code ...
        let svgOverlay = document.getElementById('adminPolygonOverlay');
        if (!svgOverlay) {
          const viewerNode = document.getElementById('panoramaViewer');
          viewerNode.style.position = 'relative';
          
          svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgOverlay.id = 'adminPolygonOverlay';
          svgOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
          
          const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          polygon.id = 'adminPolygonShape';
          polygon.setAttribute('fill', 'rgba(80, 80, 200, 0.4)');
          polygon.setAttribute('stroke', 'rgba(100, 150, 255, 0.8)');
          polygon.setAttribute('stroke-width', '2');
          polygon.setAttribute('stroke-linejoin', 'round');
          
          svgOverlay.appendChild(polygon);
          viewerNode.appendChild(svgOverlay);
        }
        svgOverlay.style.display = 'block';
        window.syncPolygonRaf = requestAnimationFrame(syncPolygonLoop);
      } else {
        // ... existing code ...
        const svgOverlay = document.getElementById('adminPolygonOverlay');
        if (svgOverlay) svgOverlay.style.display = 'none';
        if (window.syncPolygonRaf) cancelAnimationFrame(window.syncPolygonRaf);
      }
```

**Step 2: Commit**
```bash
git add public/admin-rooms.html
git commit -m "feat(admin): add SVG overlay and sync loop for dynamic polygon preview"
```

### Task 2: Update Hotspot Rendering to Track Handles

**Files:**
- Modify: `public/admin-rooms.html`

**Step 1: Write the minimal implementation**
Find `function updatePolygonPreviewHotspots()` (around line 2097).
Update it to accurately store `handleDivs`:
```javascript
    function updatePolygonPreviewHotspots() {
      if (!panoramaViewer) return;
      for (let i = 0; i < 50; i++) {
        try { panoramaViewer.removeHotSpot(`poly-pt-${i}`); } catch {}
      }
      window.handleDivs = []; // Reset handle tracking
      polygonPoints.forEach(([yaw, pitch], i) => {
        try {
          panoramaViewer.addHotSpot({
            id: `poly-pt-${i}`,
            pitch: pitch, 
            yaw: yaw,
            type: 'info',
            text: `${i+1}`,
            cssClass: 'custom-hotspot',
            createTooltipFunc: function(div) {
              window.handleDivs[i] = div; // Track the DOM element
              // Styling for the handle (yellow dot)
              div.innerHTML = '';
              div.style.width = '14px';
              div.style.height = '14px';
              div.style.background = '#ffeb3b';
              div.style.borderRadius = '50%';
              div.style.border = '2px solid #000';
              div.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
              // Double click to delete this point
              div.style.pointerEvents = 'auto';
              div.style.cursor = 'pointer';
              div.ondblclick = (e) => {
                 e.stopPropagation();
                 polygonPoints.splice(i, 1);
                 updatePolygonPreviewHotspots();
                 const status = document.getElementById('polygonStatus');
                 if (status) status.textContent = polygonPoints.length > 0 ? `✏️ Đã xoá điểm. Còn ${polygonPoints.length} điểm.` : 'Chưa có điểm nào.';
              };
            }
          });
        } catch (e) { console.error('Error adding hotspot', e); }
      });
    }
```

**Step 2: Commit**
```bash
git add public/admin-rooms.html
git commit -m "feat(admin): track hotspot nodes to sync with SVG and allow point deletion"
```

### Task 3: Add Live Draft Line Tracking Mouse Cursor

**Files:**
- Modify: `public/admin-rooms.html`

**Step 1: Write the minimal implementation**
In `togglePolygonDrawMode()`, add the draft line during creation:
```javascript
          // Inside SVG creation...
          const draftLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          draftLine.id = 'adminPolygonDraftLine';
          draftLine.setAttribute('stroke', 'rgba(255, 100, 100, 0.8)');
          draftLine.setAttribute('stroke-width', '2');
          draftLine.setAttribute('stroke-dasharray', '4');
          draftLine.style.display = 'none';
          svgOverlay.appendChild(draftLine);
```

Add a `mousemove` event listener to `panoramaViewer` container to update the draft line's end point if there is at least one point in `window.handleDivs`.
```javascript
// Ensure this runs only once globally outside functions
window.addEventListener('load', () => {
  const viewerNode = document.getElementById('panoramaViewer');
  if(viewerNode){
    viewerNode.addEventListener('mousemove', (e) => {
      if (!isPolygonDrawMode) return;
      const draftLine = document.getElementById('adminPolygonDraftLine');
      const viewerRect = viewerNode.getBoundingClientRect();
      const mouseX = e.clientX - viewerRect.left;
      const mouseY = e.clientY - viewerRect.top;

      if (window.handleDivs && window.handleDivs.length > 0) {
        // Get last visible valid point
        const lastDiv = window.handleDivs[window.handleDivs.length - 1];
        if (lastDiv && lastDiv.style.opacity !== '0' && lastDiv.style.display !== 'none') {
           const rect = lastDiv.getBoundingClientRect();
           const lastX = rect.left - viewerRect.left + rect.width / 2;
           const lastY = rect.top - viewerRect.top + rect.height / 2;
           
           draftLine.setAttribute('x1', lastX);
           draftLine.setAttribute('y1', lastY);
           draftLine.setAttribute('x2', mouseX);
           draftLine.setAttribute('y2', mouseY);
           draftLine.style.display = 'block';
           return;
        }
      }
      draftLine.style.display = 'none';
    });
    
    // Hide line when mouse leaves
    viewerNode.addEventListener('mouseleave', () => {
      const draftLine = document.getElementById('adminPolygonDraftLine');
      if (draftLine) draftLine.style.display = 'none';
    });
  }
});
```

And update `togglePolygonDrawMode`'s else branch (`!isPolygonDrawMode`) to hide the draft line:
```javascript
      } else {
        // ... existing code ...
        const draftLine = document.getElementById('adminPolygonDraftLine');
        if (draftLine) draftLine.style.display = 'none';
      }
```

**Step 2: Commit**
```bash
git add public/admin-rooms.html
git commit -m "feat(admin): add draft line cursor tracking for live drawing preview"
```
