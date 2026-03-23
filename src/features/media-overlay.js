export const MEDIA_ICONS = { image: "🖼️", pdf: "📄", video: "🎥", "3d": "🧊", gallery: "📸", youtube: "▶️", facebook: "", web: "🌐", note: "i" };

// Media overlay elements
let mediaOverlay, mediaOverlayTitle, mediaOverlayDescription, mediaOverlayContent, mediaOverlayLink, mediaOverlayClose;

// Store active media hotspot overlay reference
let activeMediaHotspotOverlay = null;
let active3DModal = null;

export function initMediaOverlay() {
  mediaOverlay = document.getElementById("mediaOverlay");
  mediaOverlayTitle = document.getElementById("mediaOverlayTitle");
  mediaOverlayDescription = document.getElementById("mediaOverlayDescription");
  mediaOverlayContent = document.getElementById("mediaOverlayContent");
  mediaOverlayLink = document.getElementById("mediaOverlayLink");
  mediaOverlayClose = document.getElementById("mediaOverlayClose");

  if (mediaOverlayClose) {
    mediaOverlayClose.addEventListener("click", hideMediaOverlay);
  }

  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") {
      hideMediaOverlay();
    }
  });

  document.addEventListener("click", () => {
    clearActiveNoteHotspot();
  });
}

function normalizeMediaUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `${window.location.origin}${url}`;
}

// Show a full-screen 3D modal (fixed, not a Marzipano hotspot)
function show3DModal(media) {
  close3DModal();
  const url = normalizeMediaUrl(media.mediaUrl);
  
  const backdrop = document.createElement("div");
  backdrop.className = "museum-modal-backdrop";
  backdrop.onclick = close3DModal;

  const card = document.createElement("div");
  card.className = "museum-card-overlay museum-card-fullscreen";
  card.onclick = (e) => e.stopPropagation();

  const leftCol = document.createElement("div");
  leftCol.className = "museum-card-left";

  const model = document.createElement("model-viewer");
  model.src = url;
  model.alt = media.title || "3D Model";
  model.setAttribute("auto-rotate", "");
  model.setAttribute("camera-controls", "");
  model.style.width = "100%";
  model.style.height = "100%";
  model.style.display = "block";
  ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((ev) => {
    model.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  });
  leftCol.appendChild(model);

  const rightCol = document.createElement("div");
  rightCol.className = "museum-card-right";

  const closeWrap = document.createElement("div");
  closeWrap.style.cssText = "display:flex;justify-content:flex-end;margin-bottom:5px;";
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "×";
  closeBtn.style.cssText = "background:transparent;border:none;font-size:28px;color:#333;cursor:pointer;line-height:1;";
  closeBtn.onclick = close3DModal;
  closeWrap.appendChild(closeBtn);

  const title = document.createElement("h3");
  title.className = "museum-card-title";
  title.textContent = media.title || "Mô hình 3D";

  const desc = document.createElement("div");
  desc.className = "museum-card-desc";
  desc.innerHTML = (media.description || "").replace(/\n/g, "<br>");

  const buttons = document.createElement("div");
  buttons.className = "museum-card-buttons";
  const playBtn = document.createElement("button");
  playBtn.className = "btn-icon";
  playBtn.innerHTML = "🔈";
  const view3DBtn = document.createElement("button");
  view3DBtn.className = "btn-primary";
  view3DBtn.textContent = "TRẢI NGHIỆM 3D";
  view3DBtn.onclick = () => { if (model.requestFullscreen) model.requestFullscreen(); };
  buttons.appendChild(playBtn);
  buttons.appendChild(view3DBtn);

  rightCol.appendChild(closeWrap);
  rightCol.appendChild(title);
  rightCol.appendChild(desc);
  rightCol.appendChild(buttons);

  card.appendChild(leftCol);
  card.appendChild(rightCol);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
  active3DModal = backdrop;
}

function close3DModal() {
  if (active3DModal) {
    active3DModal.remove();
    active3DModal = null;
  }
}

// Create media overlay as a Marzipano hotspot
export function createMediaHotspotOverlay(media, container, yaw, pitch) {
  // 3D: show as full-screen fixed modal instead
  if (media.mediaType === "3d") {
    show3DModal(media);
    return;
  }

  // Close existing overlay if any
  if (activeMediaHotspotOverlay) {
    container.destroyHotspot(activeMediaHotspotOverlay);
    activeMediaHotspotOverlay = null;
  }

  const url = normalizeMediaUrl(media.mediaUrl);

  
  // Create overlay element
  const overlayEl = document.createElement("div");
  overlayEl.className = "media-hotspot-overlay";
  
  // Header
  const header = document.createElement("div");
  header.className = "media-overlay-header";
  
  const title = document.createElement("h3");
  title.className = "media-overlay-title";
  title.textContent = media.title || "Tư liệu";
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "media-overlay-close-btn";
  closeBtn.textContent = "×";
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    container.destroyHotspot(activeMediaHotspotOverlay);
    activeMediaHotspotOverlay = null;
  };
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  overlayEl.appendChild(header);
  
  // Description
  if (media.description) {
    const desc = document.createElement("p");
    desc.className = "media-overlay-description";
    desc.textContent = media.description;
    overlayEl.appendChild(desc);
  }
  
  // Content
  const content = document.createElement("div");
  content.className = "media-overlay-content";
  
  // Helper to extract YouTube video ID
  function getYouTubeVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^?&\n]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }
  
  // Helper to extract Facebook video ID
  function getFacebookEmbedUrl(url) {
    // Facebook videos can be embedded directly using iframe
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
  }
  
  if (media.mediaType === "image") {
    const img = new Image();
    img.src = url;
    img.alt = media.title || "Media";
    content.appendChild(img);
  } else if (media.mediaType === "3d") {
    const model = document.createElement("model-viewer");
    model.src = url;
    model.alt = media.title || "3D Model";
    model.autoRotate = true;
    model.cameraControls = true;
    model.style.width = "100%";
    model.style.height = "320px";
    model.style.background = "linear-gradient(#ffffff, #ada996)"; 
    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
      model.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
    });
    content.appendChild(model);
  } else if (media.mediaType === "gallery") {
    let urls = [];
    if (media.gallery && Array.isArray(media.gallery)) {
      urls = media.gallery;
    } else if (media.mediaUrl) {
      urls = media.mediaUrl.split(',').map(u => u.trim()).filter(u => u);
    }
    
    if (urls.length > 0) {
      let currentIndex = 0;
      
      const galleryWrapper = document.createElement("div");
      galleryWrapper.style.position = "relative";
      galleryWrapper.style.width = "100%";
      galleryWrapper.style.height = "320px";
      galleryWrapper.style.display = "flex";
      galleryWrapper.style.alignItems = "center";
      galleryWrapper.style.justifyContent = "center";
      galleryWrapper.style.background = "#000";
      
      const img = new Image();
      img.src = normalizeMediaUrl(urls[0]);
      img.style.maxHeight = "100%";
      img.style.maxWidth = "100%";
      img.style.objectFit = "contain";
      
      galleryWrapper.appendChild(img);
      
      if (urls.length > 1) {
        const createBtn = (text, isPrev) => {
          const btn = document.createElement("button");
          btn.textContent = text;
          btn.style.position = "absolute";
          btn.style[isPrev ? 'left' : 'right'] = "10px";
          btn.style.background = "rgba(0,0,0,0.5)";
          btn.style.color = "white";
          btn.style.border = "none";
          btn.style.borderRadius = "50%";
          btn.style.width = "40px";
          btn.style.height = "40px";
          btn.style.cursor = "pointer";
          btn.style.zIndex = "10";
          return btn;
        };

        const prevBtn = createBtn("◀", true);
        prevBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex - 1 + urls.length) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        const nextBtn = createBtn("▶", false);
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex + 1) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        galleryWrapper.appendChild(prevBtn);
        galleryWrapper.appendChild(nextBtn);
      }
      content.appendChild(galleryWrapper);
    } else {
      const err = document.createElement("div");
      err.textContent = "Gallery trống";
      content.appendChild(err);
    }
  } else if (media.mediaType === "video") {
    const video = document.createElement("video");
    video.controls = true;
    video.src = url;
    video.style.maxHeight = "320px";
    content.appendChild(video);
  } else if (media.mediaType === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = media.title || "PDF";
    iframe.height = "320";
    content.appendChild(iframe);
  } else if (media.mediaType === "youtube") {
    const videoId = getYouTubeVideoId(media.mediaUrl);
    if (videoId) {
      const iframeWrapper = document.createElement("div");
      iframeWrapper.style.width = "100%";
      iframeWrapper.style.position = "relative";
      iframeWrapper.style.paddingBottom = "56.25%"; // 16:9 aspect ratio
      iframeWrapper.style.height = "0";
      iframeWrapper.style.overflow = "hidden";
      iframeWrapper.style.borderRadius = "6px";
      
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.title = media.title || "YouTube Video";
      iframe.style.position = "absolute";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "6px";
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      
      iframeWrapper.appendChild(iframe);
      content.appendChild(iframeWrapper);
    } else {
      const note = document.createElement("div");
      note.style.color = "#d7d7d7";
      note.style.fontSize = "13px";
      note.textContent = "❌ URL YouTube không hợp lệ. Nhấn 🔗 để mở trong tab mới.";
      content.appendChild(note);
    }
  } else if (media.mediaType === "facebook") {
    // Facebook doesn't allow profile/page embeds, show a nice preview with cover image
    const fbPreview = document.createElement("div");
    fbPreview.style.background = "linear-gradient(135deg, #1877f2 0%, #0a66c2 100%)";
    fbPreview.style.padding = "24px";
    fbPreview.style.borderRadius = "6px";
    fbPreview.style.textAlign = "center";
    fbPreview.style.color = "white";
    fbPreview.style.minHeight = "200px";
    fbPreview.style.display = "flex";
    fbPreview.style.flexDirection = "column";
    fbPreview.style.justifyContent = "center";
    fbPreview.style.alignItems = "center";
    fbPreview.style.gap = "12px";
    fbPreview.style.backgroundSize = "cover";
    fbPreview.style.backgroundPosition = "center";
    fbPreview.style.position = "relative";
    
    // Create overlay for text
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.background = "linear-gradient(135deg, rgba(24, 119, 242, 0.95) 0%, rgba(10, 102, 194, 0.95) 100%)";
    overlay.style.borderRadius = "6px";
    overlay.style.zIndex = "1";
    fbPreview.appendChild(overlay);
    
    // Content wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.style.position = "relative";
    contentWrapper.style.zIndex = "2";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.alignItems = "center";
    contentWrapper.style.gap = "12px";
    
    // Try to load thumbnail from Facebook
    const url = media.mediaUrl;
    const thumbUrl = url.includes('facebook.com/') ? 
      `https://www.facebook.com/favicon.ico` : url;
    
    // Extract username from URL for better matching
    const usernameMatch = url.match(/facebook\.com\/([a-zA-Z0-9._-]+)/);
    const username = usernameMatch ? usernameMatch[1] : null;
    
    // Create decorative image container with Facebook icon
    const imageContainer = document.createElement("div");
    imageContainer.style.width = "100px";
    imageContainer.style.height = "100px";
    imageContainer.style.borderRadius = "50%";
    imageContainer.style.background = "rgba(255, 255, 255, 0.2)";
    imageContainer.style.display = "flex";
    imageContainer.style.alignItems = "center";
    imageContainer.style.justifyContent = "center";
    imageContainer.style.fontSize = "48px";
    imageContainer.style.border = "3px solid white";
    imageContainer.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    
    // Try to load actual avatar
    const avatar = document.createElement("img");
    avatar.style.width = "100%";
    avatar.style.height = "100%";
    avatar.style.borderRadius = "50%";
    avatar.style.objectFit = "cover";
    avatar.src = `https://graph.facebook.com/v18.0/${username || 'facebook'}/picture?width=100&height=100&access_token=`;
    
    avatar.onerror = () => {
      avatar.style.display = "none";
      imageContainer.textContent = "f";
      imageContainer.style.background = "#1877f2";
      imageContainer.style.fontSize = "50px";
      imageContainer.style.fontWeight = "bold";
      imageContainer.style.color = "white";
      imageContainer.style.fontFamily = "Arial, sans-serif";
      imageContainer.style.textAlign = "center"
    };
    
    avatar.onload = () => {
      // Image loaded successfully
    };
    
    imageContainer.appendChild(avatar);
    contentWrapper.appendChild(imageContainer);
    
    const fbTitle = document.createElement("div");
    fbTitle.style.fontSize = "16px";
    fbTitle.style.fontWeight = "600";
    fbTitle.textContent = media.title || "Facebook";
    contentWrapper.appendChild(fbTitle);
    
    const fbDesc = document.createElement("div");
    fbDesc.style.fontSize = "13px";
    fbDesc.style.opacity = "0.95";
    fbDesc.textContent = "Nhấn nút dưới để mở trang Facebook";
    contentWrapper.appendChild(fbDesc);
    
    fbPreview.appendChild(contentWrapper);
    content.appendChild(fbPreview);
  } else if (media.mediaType === "web") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = media.title || "Web";
    iframe.height = "600";
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.borderRadius = "6px";
    content.appendChild(iframe);
  } else {
    const note = document.createElement("div");
    note.style.color = "#d7d7d7";
    note.style.fontSize = "13px";
    note.textContent = "Không thể xem trực tiếp. Nhấn 🔗 để mở trong tab mới.";
    content.appendChild(note);
  }
  
  overlayEl.appendChild(content);
  
  // Link/Button section
  const buttonSection = document.createElement("div");
  buttonSection.style.display = "flex";
  buttonSection.style.gap = "8px";
  buttonSection.style.marginTop = "12px";
  
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.className = "media-overlay-link";
    link.textContent = "🔗 Mở trong tab mới";
    buttonSection.appendChild(link);
  }
  
  // For Facebook, add "Mở Facebook" button
  if (media.mediaType === "facebook") {
    const fbButton = document.createElement("button");
    fbButton.style.flex = "1";
    fbButton.style.padding = "8px 12px";
    fbButton.style.background = "#1877f2";
    fbButton.style.color = "white";
    fbButton.style.border = "none";
    fbButton.style.borderRadius = "6px";
    fbButton.style.fontSize = "12px";
    fbButton.style.fontWeight = "600";
    fbButton.style.cursor = "pointer";
    fbButton.style.transition = "background 0.2s ease";
    fbButton.textContent = "👍 Mở Facebook";
    
    fbButton.onmouseover = () => fbButton.style.background = "#165bc0";
    fbButton.onmouseout = () => fbButton.style.background = "#1877f2";
    
    fbButton.onclick = () => {
      window.open(media.mediaUrl, '_blank');
    };
    
    buttonSection.appendChild(fbButton);
  }
  
  if (buttonSection.childNodes.length > 0) {
    overlayEl.appendChild(buttonSection);
  }
  
  // Create hotspot using Marzipano positioning
  activeMediaHotspotOverlay = container.createHotspot(overlayEl, {
    yaw: yaw,
    pitch: pitch
  });
}

export function hideMediaOverlay() {
  if (!mediaOverlay) return;
  mediaOverlay.classList.add("hidden");
  if (mediaOverlayContent) mediaOverlayContent.innerHTML = "";
  if (mediaOverlayLink) mediaOverlayLink.href = "#";
  
  // remove active hotspot overlay in container? 
  // actually hideMediaOverlay doesn't destroy the hotspot overlay, 
  // only createMediaHotspotOverlay handles activeMediaHotspotOverlay destruction or closing when X is clicked.
}

export function showMediaOverlay(media) {
  if (!mediaOverlay) return;
  const url = normalizeMediaUrl(media.mediaUrl);

  if (mediaOverlayTitle) mediaOverlayTitle.textContent = media.title || "Tư liệu";
  if (mediaOverlayDescription) {
    mediaOverlayDescription.textContent = media.description || "";
    mediaOverlayDescription.style.display = media.description ? "block" : "none";
  }

  if (mediaOverlayContent) {
    mediaOverlayContent.innerHTML = "";

    if (media.mediaType === "image") {
    const img = new Image();
    img.src = url;
    img.alt = media.title || "Media";
    mediaOverlayContent.appendChild(img);
  } else if (media.mediaType === "3d") {
    const model = document.createElement("model-viewer");
    model.src = url;
    model.alt = media.title || "3D Model";
    model.autoRotate = true;
    model.cameraControls = true;
    model.style.width = "100%";
    model.style.height = "320px";
    model.style.background = "linear-gradient(#ffffff, #ada996)"; 
    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
      model.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
    });
    mediaOverlayContent.appendChild(model);
  } else if (media.mediaType === "gallery") {
    let urls = [];
    if (media.gallery && Array.isArray(media.gallery)) {
      urls = media.gallery;
    } else if (media.mediaUrl) {
      urls = media.mediaUrl.split(',').map(u => u.trim()).filter(u => u);
    }
    
    if (urls.length > 0) {
      let currentIndex = 0;
      
      const galleryWrapper = document.createElement("div");
      galleryWrapper.style.position = "relative";
      galleryWrapper.style.width = "100%";
      galleryWrapper.style.height = "320px";
      galleryWrapper.style.display = "flex";
      galleryWrapper.style.alignItems = "center";
      galleryWrapper.style.justifyContent = "center";
      galleryWrapper.style.background = "#000";
      
      const img = new Image();
      img.src = normalizeMediaUrl(urls[0]);
      img.style.maxHeight = "100%";
      img.style.maxWidth = "100%";
      img.style.objectFit = "contain";
      
      galleryWrapper.appendChild(img);
      
      if (urls.length > 1) {
        const createBtn = (text, isPrev) => {
          const btn = document.createElement("button");
          btn.textContent = text;
          btn.style.position = "absolute";
          btn.style[isPrev ? 'left' : 'right'] = "10px";
          btn.style.background = "rgba(0,0,0,0.5)";
          btn.style.color = "white";
          btn.style.border = "none";
          btn.style.borderRadius = "50%";
          btn.style.width = "40px";
          btn.style.height = "40px";
          btn.style.cursor = "pointer";
          btn.style.zIndex = "10";
          return btn;
        };

        const prevBtn = createBtn("◀", true);
        prevBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex - 1 + urls.length) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        const nextBtn = createBtn("▶", false);
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          currentIndex = (currentIndex + 1) % urls.length;
          img.src = normalizeMediaUrl(urls[currentIndex]);
        };
        
        galleryWrapper.appendChild(prevBtn);
        galleryWrapper.appendChild(nextBtn);
      }
      mediaOverlayContent.appendChild(galleryWrapper);
    } else {
      const err = document.createElement("div");
      err.textContent = "Gallery trống";
      mediaOverlayContent.appendChild(err);
    }
  } else if (media.mediaType === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.src = url;
      video.style.maxHeight = "320px";
      mediaOverlayContent.appendChild(video);
    } else if (media.mediaType === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "PDF";
      iframe.height = "320";
      mediaOverlayContent.appendChild(iframe);
    } else if (media.mediaType === "web") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.title = media.title || "Web";
      iframe.height = "450";
      iframe.style.width = "100%";
      iframe.style.border = "none";
      iframe.style.borderRadius = "6px";
      mediaOverlayContent.appendChild(iframe);
    } else {
      const note = document.createElement("div");
      note.style.color = "#d7d7d7";
      note.style.fontSize = "13px";
      note.textContent = "Không thể xem trực tiếp. Nhấn " + "\u27a1\ufe0f" + " để mở trong tab mới.";
      mediaOverlayContent.appendChild(note);
    }
  }

  if (mediaOverlayLink) {
    mediaOverlayLink.href = url || "#";
    mediaOverlayLink.style.display = url ? "inline-flex" : "none";
  }

  mediaOverlay.classList.remove("hidden");
}


export let activeNoteHotspotEl = null;

export function clearActiveNoteHotspot() {
  if (activeNoteHotspotEl) {
    activeNoteHotspotEl.classList.remove("visible");
    activeNoteHotspotEl = null;
  }
}

export function resetActiveNoteHotspot() {
  activeNoteHotspotEl = null;
}

export function createMediaHotspotElement(media, onClickHandler) {
  function getYouTubeVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^?&\n]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  let el;

  if (media.mediaType === "note") {
    el = document.createElement("div");
    el.className = "note-hotspot info-hotspot";
    el.setAttribute("aria-label", media.title || "Ghi chú");
    el.textContent = "";
    el.style.cursor = "pointer";
    
    const header = document.createElement("div");
    header.className = "info-hotspot-header";

    const iconWrap = document.createElement("div");
    iconWrap.className = "info-hotspot-icon-wrapper";
    const icon = document.createElement("img");
    icon.className = "info-hotspot-icon";
    icon.src = "images/info.png";
    icon.alt = "Info";
    iconWrap.appendChild(icon);

    const titleWrap = document.createElement("div");
    titleWrap.className = "info-hotspot-title-wrapper";
    const title = document.createElement("div");
    title.className = "info-hotspot-title";
    title.textContent = media.title || "Ghi chú";
    titleWrap.appendChild(title);

    const closeWrap = document.createElement("div");
    closeWrap.className = "info-hotspot-close-wrapper";
    closeWrap.setAttribute("role", "button");
    closeWrap.setAttribute("aria-label", "Đóng ghi chú");
    const closeIcon = document.createElement("span");
    closeIcon.className = "info-hotspot-close-icon";
    closeIcon.textContent = "×";
    closeWrap.appendChild(closeIcon);

    header.appendChild(iconWrap);
    header.appendChild(titleWrap);
    header.appendChild(closeWrap);

    const content = document.createElement("div");
    content.className = "info-hotspot-text";
    content.textContent = media.mediaUrl || media.description || "Không có nội dung";

    el.appendChild(header);
    el.appendChild(content);

    closeWrap.addEventListener("click", (e) => {
      e.stopPropagation();
      el.classList.remove("visible");
      if (activeNoteHotspotEl === el) activeNoteHotspotEl = null;
    });

    header.addEventListener("click", (e) => {
      e.stopPropagation();

      if (activeNoteHotspotEl && activeNoteHotspotEl !== el) {
        activeNoteHotspotEl.classList.remove("visible");
      }

      const willOpen = !el.classList.contains("visible");
      el.classList.toggle("visible", willOpen);
      activeNoteHotspotEl = willOpen ? el : null;
    });

    el.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    ["mousedown", "pointerdown", "touchstart", "wheel"].forEach((eventName) => {
      content.addEventListener(eventName, (e) => e.stopPropagation(), { passive: false });
    });
  } else if (media.mediaType === "youtube") {
    const videoId = getYouTubeVideoId(media.mediaUrl);
    if (videoId) {
      el = document.createElement("div");
      el.className = "media-hotspot youtube-hotspot";
      el.setAttribute("aria-label", media.title || "YouTube Video");
      
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
      iframe.title = media.title || "YouTube Video";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "6px";
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      
      el.appendChild(iframe);
    } else {
      el = document.createElement("div");
      el.className = "media-hotspot";
      el.setAttribute("aria-label", media.title || "Tư liệu");
      el.textContent = "❌";
    }
  } else {
    el = document.createElement("div");
    el.className = "media-hotspot";
    el.setAttribute("aria-label", media.title || "Tư liệu");
    
    if (media.mediaType === "facebook") {
      el.setAttribute("data-fb", "true");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("fill", "white");
      
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z");
      svg.appendChild(path);
      el.appendChild(svg);
    } else if (media.mediaType === "3d") {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("width", "26");
      svg.setAttribute("height", "26");
      // Align SVG slightly to look perfectly centered
      svg.style.transform = "translateY(1px)";
      
      svg.innerHTML = `
        <!-- Left Face -->
        <path d="M50 90 L15 70 L15 35 L50 55 Z" fill="#3b82f6" />
        <!-- Right Face -->
        <path d="M50 90 L85 70 L85 35 L50 55 Z" fill="#2563eb" />
        <!-- Top Face -->
        <path d="M50 15 L85 35 L50 55 L15 35 Z" fill="#7ce4fb" />
        
        <!-- Sparkles (Stars/Dots) -->
        <circle cx="27" cy="48" r="2.5" fill="white" opacity="0.9"/>
        <circle cx="36" cy="65" r="1.8" fill="white" opacity="0.7"/>
        <circle cx="68" cy="46" r="2.2" fill="white" opacity="0.8"/>
        <circle cx="75" cy="62" r="1.5" fill="white" opacity="0.6"/>
        <circle cx="50" cy="30" r="2" fill="white" opacity="0.8"/>
        <circle cx="64" cy="24" r="1.2" fill="white" opacity="0.6"/>
        <circle cx="34" cy="26" r="1.5" fill="white" opacity="0.5"/>
      `;
      el.appendChild(svg);
    } else {
      el.textContent = MEDIA_ICONS[media.mediaType] || "📁";
    }

    el.onclick = (e) => {
      e.stopPropagation();
      if (onClickHandler) onClickHandler(media);
    };
  }

  return el;
}

/**
 * Creates a 3D highlight polygon element for Marzipano.
 * Renders an SVG polygon with blue fill + white glow, anchored at the centroid.
 * @param {Object} media - media hotspot data with highlightPolygon: [[yaw,pitch],...]
 * @returns {{ el: HTMLElement, anchorYaw: number, anchorPitch: number } | null}
 */
export function create3DHighlightElement(media) {
  const points = media.highlightPolygon;
  if (!points || points.length < 3) return null;

  // Compute centroid in yaw/pitch space
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;

  const SCALE = 10; // px per degree
  const OFFSET = 500; // SVG center
  const SIZE = 1000;

  const svgPoints = points.map(([y, p]) => {
    const sx = OFFSET + (y - cx) * SCALE;
    const sy = OFFSET - (p - cy) * SCALE;
    return `${sx},${sy}`;
  }).join(' ');

  const el = document.createElement('div');
  el.className = 'highlight-3d-hotspot';
  el.style.cssText = 'position:absolute;pointer-events:none;width:0;height:0;overflow:visible;';

  el.innerHTML = `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
         xmlns="http://www.w3.org/2000/svg"
         style="position:absolute;left:-${OFFSET}px;top:-${OFFSET}px;overflow:visible;pointer-events:none;">
      <defs>
        <filter id="glow-3d-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Outer glow -->
      <polygon points="${svgPoints}"
        fill="none"
        stroke="rgba(60,160,255,0.45)"
        stroke-width="10"
        stroke-linejoin="round"
        opacity="0.7"/>
      <!-- Main polygon -->
      <polygon points="${svgPoints}"
        fill="rgba(30,100,255,0.25)"
        stroke="rgba(255,255,255,0.88)"
        stroke-width="2.5"
        stroke-linejoin="round"
        filter="url(#glow-3d-filter)"
        class="highlight-3d-polygon"/>
    </svg>
  `.trim();

  return { el, anchorYaw: cx, anchorPitch: cy };
}
