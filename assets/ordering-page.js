import { Component } from '@theme/component';

/**
 * @typedef {object} OrderingAccordionRefs
 * @property {HTMLButtonElement[]} trigger
 * @property {HTMLElement[]} panel
 *
 * @extends {Component<OrderingAccordionRefs>}
 */
class OrderingAccordionComponent extends Component {
  #controller = new AbortController();

  /** @type {Map<HTMLElement, number>} */
  #animationFrames = new Map();

  connectedCallback() {
    super.connectedCallback();
    this.#initializePanels();
    this.addEventListener('transitionend', this.#handleTransitionEnd, { signal: this.#controller.signal });
  }

  updatedCallback() {
    super.updatedCallback();
    this.#initializePanels();
  }

  disconnectedCallback() {
    for (const frame of this.#animationFrames.values()) cancelAnimationFrame(frame);
    this.#animationFrames.clear();
    this.#controller.abort();
    super.disconnectedCallback();
  }

  /** @param {MouseEvent} event */
  toggle(event) {
    const trigger = event.target;
    if (!(trigger instanceof HTMLButtonElement)) return;

    const panelId = trigger.getAttribute('aria-controls');
    const panel = panelId ? this.querySelector(`#${CSS.escape(panelId)}`) : null;
    if (!(panel instanceof HTMLElement)) return;

    const shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';

    if (shouldOpen) {
      for (const otherTrigger of this.refs.trigger ?? []) {
        if (otherTrigger !== trigger && otherTrigger.getAttribute('aria-expanded') === 'true') {
          const otherPanelId = otherTrigger.getAttribute('aria-controls');
          const otherPanel = otherPanelId ? this.querySelector(`#${CSS.escape(otherPanelId)}`) : null;
          if (otherPanel instanceof HTMLElement) this.#close(otherTrigger, otherPanel);
        }
      }
      this.#open(trigger, panel);
    } else {
      this.#close(trigger, panel);
    }
  }

  #initializePanels() {
    let hasOpenPanel = false;
    for (const trigger of this.refs.trigger ?? []) {
      const panelId = trigger.getAttribute('aria-controls');
      const panel = panelId ? this.querySelector(`#${CSS.escape(panelId)}`) : null;
      if (!(panel instanceof HTMLElement)) continue;

      const isOpen = trigger.getAttribute('aria-expanded') === 'true' && !hasOpenPanel;
      if (isOpen) hasOpenPanel = true;
      trigger.setAttribute('aria-expanded', String(isOpen));
      panel.style.height = isOpen ? 'auto' : '0px';
      panel.setAttribute('aria-hidden', String(!isOpen));
      panel.inert = !isOpen;
    }
  }

  /** @param {HTMLButtonElement} trigger @param {HTMLElement} panel */
  #open(trigger, panel) {
    this.#cancelFrame(panel);
    trigger.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    panel.inert = false;

    panel.style.height = `${panel.getBoundingClientRect().height}px`;
    void panel.offsetHeight;
    const frame = requestAnimationFrame(() => {
      panel.style.height = `${panel.scrollHeight}px`;
      this.#animationFrames.delete(panel);
    });
    this.#animationFrames.set(panel, frame);
  }

  /** @param {HTMLButtonElement} trigger @param {HTMLElement} panel */
  #close(trigger, panel) {
    this.#cancelFrame(panel);
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;

    panel.style.height = `${panel.getBoundingClientRect().height}px`;
    void panel.offsetHeight;
    const frame = requestAnimationFrame(() => {
      panel.style.height = '0px';
      this.#animationFrames.delete(panel);
    });
    this.#animationFrames.set(panel, frame);
  }

  /** @param {TransitionEvent} event */
  #handleTransitionEnd = (event) => {
    if (event.propertyName !== 'height' || !(event.target instanceof HTMLElement)) return;
    const panel = event.target;
    if (!panel.classList.contains('ordering-accordion__panel')) return;

    const trigger = this.querySelector(`[aria-controls="${CSS.escape(panel.id)}"]`);
    if (!(trigger instanceof HTMLButtonElement)) return;

    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    panel.style.height = isOpen ? 'auto' : '0px';
    panel.inert = !isOpen;
  };

  /** @param {HTMLElement} panel */
  #cancelFrame(panel) {
    const frame = this.#animationFrames.get(panel);
    if (frame !== undefined) cancelAnimationFrame(frame);
    this.#animationFrames.delete(panel);
  }
}

if (!customElements.get('ordering-accordion-component')) {
  customElements.define('ordering-accordion-component', OrderingAccordionComponent);
}
