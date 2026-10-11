import { Component } from '@theme/component';
import { destroyCustomSplide, mountCustomSplide } from '@theme/custom-splide';

class PremiumHeroSlider extends Component {
  /** @type {import('@theme/splide').default | null} */
  #splide = null;

  /** @type {HTMLElement | null} */
  #root = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  /** @type {MediaQueryList} */
  #mobileMedia = window.matchMedia('(max-width: 749px)');

  /** @type {IntersectionObserver | null} */
  #visibilityObserver = null;

  /** @type {Set<string>} */
  #autoplayPauseReasons = new Set();

  /** @type {boolean} */
  #resumeAfterPause = false;

  connectedCallback() {
    super.connectedCallback();
    this.#root = this.querySelector('[data-custom-splide]');
    if (!this.#root) return;

    this.addEventListener('click', this.#handleClick);
    this.addEventListener('shopify:block:select', this.#handleBlockSelect);
    this.addEventListener('shopify:block:deselect', this.#handleBlockDeselect);
    this.#mobileMedia.addEventListener('change', this.#handleMediaChange);
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);
    this.#resizeObserver = new ResizeObserver(() => this.#syncAutoHeight(this.#splide?.index || 0));
    this.#resizeObserver.observe(this);

    if (this.hasAttribute('data-pause-when-out-of-view')) {
      this.#visibilityObserver = new IntersectionObserver(this.#handleIntersection, { threshold: 0.15 });
      this.#visibilityObserver.observe(this);
    }

    this.#splide = mountCustomSplide(this.#root, {}, {
      mounted: () => this.#updateActiveState(0),
      move: (index) => this.#updateActiveState(index),
      moved: (index) => this.#syncAutoHeight(index),
      'autoplay:playing': (rate) => this.#updateProgress(rate),
      'autoplay:pause': () => this.toggleAttribute('data-autoplay-paused', true),
      'autoplay:play': () => this.toggleAttribute('data-autoplay-paused', false),
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('shopify:block:select', this.#handleBlockSelect);
    this.removeEventListener('shopify:block:deselect', this.#handleBlockDeselect);
    this.#mobileMedia.removeEventListener('change', this.#handleMediaChange);
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
    this.#resizeObserver?.disconnect();
    this.#visibilityObserver?.disconnect();
    this.#autoplayPauseReasons.clear();
    this.#resumeAfterPause = false;
    if (this.#root) destroyCustomSplide(this.#root);
    this.#splide = null;
    this.#root = null;
  }

  #handleClick = (event) => {
    if (!(event.target instanceof Element) || !this.#splide) return;

    const pagination = event.target.closest('[data-hero-pagination]');
    if (!(pagination instanceof HTMLButtonElement)) return;
    const index = Number.parseInt(pagination.dataset.heroPagination || '', 10);
    if (!Number.isFinite(index)) return;
    this.#updateProgress(0);
    this.#splide.go(index);
    if (this.#root?.dataset.splideAutoplay === 'true') this.#splide.Components.Autoplay?.play();
  };

  #handleMediaChange = () => this.#syncAutoHeight(this.#splide?.index || 0);

  #handleVisibilityChange = () => {
    if (document.hidden) {
      this.#pauseAutoplay('document-hidden');
    } else {
      this.#resumeAutoplay('document-hidden');
    }
  };

  #handleIntersection = ([entry]) => {
    if (!entry) return;
    if (entry.isIntersecting) this.#resumeAutoplay('out-of-view');
    else this.#pauseAutoplay('out-of-view');
  };

  #handleBlockSelect = (event) => {
    if (!(event.target instanceof Element) || !this.#splide) return;
    const slide = event.target.closest('[data-premium-hero-slide]');
    if (!(slide instanceof HTMLElement)) return;
    const slideComponent = this.#splide.Components.Slides.get(true).find((item) => item.slide === slide);
    if (!slideComponent) return;
    this.#pauseAutoplay('theme-editor');
    this.#splide.go(slideComponent.index);
  };

  #handleBlockDeselect = () => this.#resumeAutoplay('theme-editor');

  #pauseAutoplay(reason) {
    if (!this.#splide || this.#root?.dataset.splideAutoplay !== 'true') return;
    if (this.#autoplayPauseReasons.size === 0) {
      this.#resumeAfterPause = this.querySelector('.splide__toggle')?.classList.contains('is-active') === true;
    }
    this.#autoplayPauseReasons.add(reason);
    this.#splide.Components.Autoplay?.pause(false);
  }

  #resumeAutoplay(reason) {
    this.#autoplayPauseReasons.delete(reason);
    if (this.#autoplayPauseReasons.size > 0 || !this.#resumeAfterPause) return;
    const toggle = this.querySelector('.splide__toggle');
    this.#resumeAfterPause = false;
    if (toggle?.classList.contains('is-active')) this.#splide?.Components.Autoplay?.play();
  }

  #updateActiveState(index) {
    const autoplay = this.#root?.dataset.splideAutoplay === 'true';
    const paginationItems = this.querySelectorAll('[data-hero-pagination]');
    for (const [itemIndex, item] of paginationItems.entries()) {
      const isActive = itemIndex === index;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-current', isActive ? 'true' : 'false');
      const fill = item.querySelector('[data-hero-progress]');
      if (fill instanceof HTMLElement) fill.style.setProperty('--premium-hero-progress', isActive && !autoplay ? '1' : '0');
    }

    this.#syncAutoHeight(index);
  }

  #updateProgress(rate) {
    const activeFill = this.querySelector('[data-hero-pagination].is-active [data-hero-progress]');
    if (activeFill instanceof HTMLElement) {
      activeFill.style.setProperty('--premium-hero-progress', String(Math.min(1, Math.max(0, rate))));
    }
  }

  #syncAutoHeight(index) {
    const adaptsAtCurrentWidth = this.#mobileMedia.matches
      ? this.hasAttribute('data-mobile-adapt')
      : this.hasAttribute('data-desktop-adapt');
    if (!adaptsAtCurrentWidth) return;
    const slide = this.querySelectorAll('.splide__slide')[index];
    if (!(slide instanceof HTMLElement)) return;
    const ratio = this.#mobileMedia.matches ? slide.dataset.mobileRatio : slide.dataset.desktopRatio;
    if (ratio) this.style.setProperty('--premium-hero-active-ratio', ratio);
  }
}

if (!customElements.get('premium-hero-slider')) {
  customElements.define('premium-hero-slider', PremiumHeroSlider);
}
