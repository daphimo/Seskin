import Splide from '@theme/splide';

const instances = new WeakMap();

function readOptions(root) {
  const slideCount = root.querySelectorAll('.splide__slide').length;
  const transition = root.dataset.splideTransition === 'fade' ? 'fade' : 'slide';
  const shouldLoop = root.dataset.splideLoop === 'true';

  return {
    type: transition === 'fade' ? 'fade' : shouldLoop ? 'loop' : 'slide',
    rewind: shouldLoop,
    perPage: 1,
    perMove: 1,
    speed: Number.parseInt(root.dataset.splideSpeed || '700', 10),
    autoplay: slideCount > 1 && root.dataset.splideAutoplay === 'true',
    interval: Number.parseInt(root.dataset.splideInterval || '5000', 10),
    pauseOnHover: root.dataset.splidePauseOnHover === 'true',
    pauseOnFocus: true,
    resetProgress: true,
    arrows: slideCount > 1 && root.dataset.splideArrows === 'true',
    pagination: false,
    drag: slideCount > 1,
    keyboard: 'focused',
    i18n: {
      prev: root.dataset.splidePreviousLabel || 'Previous slide',
      next: root.dataset.splideNextLabel || 'Next slide',
      play: root.dataset.splidePlayLabel || 'Play slideshow',
      pause: root.dataset.splidePauseLabel || 'Pause slideshow',
    },
    reducedMotion: {
      speed: 0,
      rewindSpeed: 0,
      autoplay: 'pause',
    },
  };
}

/**
 * Mounts one reusable Splide instance and prevents duplicate initialization.
 * @param {HTMLElement} root
 * @param {object} [overrides]
 * @param {object} [hooks]
 * @returns {Splide | null}
 */
export function mountCustomSplide(root, overrides = {}, hooks = {}) {
  const existing = instances.get(root);
  if (existing) return existing;

  const splide = new Splide(root, { ...readOptions(root), ...overrides });
  const events = ['mounted', 'ready', 'move', 'moved', 'active', 'autoplay:play', 'autoplay:pause', 'autoplay:playing'];

  for (const eventName of events) {
    const hook = hooks[eventName];
    if (typeof hook === 'function') splide.on(eventName, hook);
  }

  splide.on('destroy', () => instances.delete(root));
  instances.set(root, splide);
  splide.mount();
  return splide;
}

/**
 * Destroys the reusable Splide instance mounted on a root.
 * @param {HTMLElement} root
 */
export function destroyCustomSplide(root) {
  instances.get(root)?.destroy(true);
  instances.delete(root);
}

/**
 * Initializes every unmounted slider below a scope.
 * @param {ParentNode} [scope]
 * @returns {Splide[]}
 */
export function initializeCustomSplides(scope = document) {
  const roots = scope.querySelectorAll('[data-custom-splide]');
  return Array.from(roots, (root) => mountCustomSplide(root)).filter(Boolean);
}
