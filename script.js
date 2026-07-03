const FRAME_EXTENSION = ".png";
const SMOOTHING = 12;
const JOHANNESBURG_TIME_ZONE = "Africa/Johannesburg";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function initializeJohannesburgClock() {
  const clock = document.querySelector(".intro-nav-time");

  if (!clock) {
    return;
  }

  const timeFormatter = new Intl.DateTimeFormat("en-ZA", {
    timeZone: JOHANNESBURG_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function renderClock() {
    const parts = timeFormatter.formatToParts(new Date());
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    const meridiem = Number(hour) >= 12 ? "pm" : "am";

    clock.textContent = `Johannesburg · ${hour}:${minute}${meridiem}`;
  }

  renderClock();
  window.setInterval(renderClock, 1000);
}

function initializeSectionBackgroundVideos() {
  const videos = document.querySelectorAll(
    ".section-four__video, .section-five__video"
  );

  videos.forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;

    const attemptPlay = () => {
      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    };

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      video.addEventListener("loadeddata", attemptPlay, { once: true });
    }
  });
}

function createSequencePlayer(shell) {
  const framePath = shell.dataset.framePath;
  const frameCount = Number(shell.dataset.frameCount);
  const frameScale = Number(shell.dataset.frameScale || 1);
  const canvas = shell.querySelector(".sequence-canvas");
  const context = canvas.getContext("2d");
  const frames = [];
  const animatedItems = Array.from(
    shell.querySelectorAll("[data-sequence-reveal]")
  );

  let currentFrame = 0;
  let targetFrame = 0;
  let rafId = 0;
  let lastTimestamp = 0;

  function frameSource(index) {
    return `${framePath}${String(index + 1).padStart(3, "0")}${FRAME_EXTENSION}`;
  }

  function getNearestLoadedFrame(index) {
    if (frames[index]?.complete) {
      return frames[index];
    }

    for (let offset = 1; offset < frameCount; offset += 1) {
      const previous = index - offset;
      const next = index + offset;

      if (previous >= 0 && frames[previous]?.complete) {
        return frames[previous];
      }

      if (next < frameCount && frames[next]?.complete) {
        return frames[next];
      }
    }

    return null;
  }

  function drawFrame(index) {
    const image = getNearestLoadedFrame(index);

    if (!image) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale =
      Math.max(
        viewportWidth / image.naturalWidth,
        viewportHeight / image.naturalHeight
      ) * frameScale;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const x = (viewportWidth - drawWidth) / 2;
    const y = (viewportHeight - drawHeight) / 2;

    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.drawImage(image, x, y, drawWidth, drawHeight);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(dpr, dpr);
    updateTargetFrame();
    drawFrame(Math.round(currentFrame));
  }

  function updateTargetFrame() {
    const shellScrollDistance = Math.max(shell.offsetHeight - window.innerHeight, 1);
    const shellTop = shell.getBoundingClientRect().top;
    const progress = clamp(-shellTop / shellScrollDistance, 0, 1);

    targetFrame = progress * (frameCount - 1);
  }

  function updateAnimatedItems(progress) {
    animatedItems.forEach((item) => {
      const revealStart = Number(item.dataset.revealStart ?? 0);
      const revealEnd = Number(item.dataset.revealEnd ?? 1);
      const span = Math.max(revealEnd - revealStart, 0.0001);
      const reveal = clamp((progress - revealStart) / span, 0, 1);
      const revealEased = easeOutCubic(reveal);

      item.style.setProperty("--reveal", reveal.toFixed(4));
      item.style.setProperty("--reveal-eased", revealEased.toFixed(4));
      item.style.setProperty("--reveal-inv", (1 - revealEased).toFixed(4));
    });
  }

  function animate(timestamp) {
    const deltaSeconds = lastTimestamp
      ? (timestamp - lastTimestamp) / 1000
      : 1 / 60;
    const easing = REDUCED_MOTION
      ? 1
      : 1 - Math.exp(-SMOOTHING * deltaSeconds);

    lastTimestamp = timestamp;
    currentFrame += (targetFrame - currentFrame) * easing;

    if (Math.abs(targetFrame - currentFrame) < 0.001) {
      currentFrame = targetFrame;
    }

    const smoothProgress =
      frameCount > 1 ? currentFrame / (frameCount - 1) : 0;

    shell.style.setProperty("--sequence-progress", smoothProgress.toFixed(4));
    updateAnimatedItems(smoothProgress);
    drawFrame(Math.round(currentFrame));
    rafId = window.requestAnimationFrame(animate);
  }

  function loadFrame(index) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.decoding = "async";
      image.onload = () => {
        frames[index] = image;
        resolve(image);
      };
      image.onerror = reject;
      image.src = frameSource(index);
    });
  }

  async function preloadFrames() {
    await loadFrame(0);
    resizeCanvas();

    Array.from({ length: frameCount - 1 }, (_, index) => index + 1).forEach(
      (index) => {
        loadFrame(index).catch((error) => {
          console.error(`Failed to load frame ${index + 1}:`, error);
        });
      }
    );
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("scroll", updateTargetFrame, { passive: true });

  preloadFrames()
    .then(() => {
      if (!rafId) {
        animate();
      }
    })
    .catch((error) => {
      console.error("Failed to preload frames:", error);
    });
}

document.querySelectorAll(".sequence-shell").forEach(createSequencePlayer);
initializeJohannesburgClock();
initializeSectionBackgroundVideos();
