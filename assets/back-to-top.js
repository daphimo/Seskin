import { Component } from '@theme/component';
import { getScrollEventTarget, getScrollTop, scrollContainerMediaQuery, scrollTo } from '@theme/scroll-container';

class BackToTop extends Component {
  requiredRefs = ['button'];

  /** @type {EventTarget | null} */
  #scrollContainer = null;

  /** @type {number | null} */
  #scrollFrame = null;

  connectedCallback() {
    super.connectedCallback();
    this.#bindScrollContainer();
    scrollContainerMediaQuery.addEventListener('change', this.#handleScrollContainerChange);
    this.#updateVisibility();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#scrollContainer?.removeEventListener('scroll', this.#handleScroll);
    scrollContainerMediaQuery.removeEventListener('change', this.#handleScrollContainerChange);
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    this.#scrollContainer = null;
    this.#scrollFrame = null;
  }

  #bindScrollContainer() {
    this.#scrollContainer?.removeEventListener('scroll', this.#handleScroll);
    this.#scrollContainer = getScrollEventTarget();
    this.#scrollContainer.addEventListener('scroll', this.#handleScroll, { passive: true });
  }

  #handleScrollContainerChange = () => {
    this.#bindScrollContainer();
    this.#updateVisibility();
  };

  #handleScroll = () => {
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#updateVisibility();
    });
  };

  #updateVisibility() {
    this.refs.button.hidden = getScrollTop() <= 300;
  }

  scrollToTop() {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    scrollTo({ top: 0, behavior });
  }
}

if (!customElements.get('back-to-top')) {
  customElements.define('back-to-top', BackToTop);
}
