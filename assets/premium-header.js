import { Component } from '@theme/component';
import { lockScroll, unlockScroll } from '@theme/utilities';
import { trapFocus, removeTrapFocus } from '@theme/focus';
import { getScrollTop, getScrollEventTarget, scrollContainerMediaQuery } from '@theme/scroll-container';

class PremiumHeader extends Component {
  requiredRefs = ['mobileDrawer', 'searchDialog', 'searchInput', 'searchResults', 'searchEmpty'];

  /** @type {AbortController | null} */
  #listeners = null;

  /** @type {AbortController | null} */
  #searchRequest = null;

  /** @type {number | null} */
  #searchTimer = null;

  /** @type {number | null} */
  #scrollFrame = null;

  /** @type {EventTarget | null} */
  #scrollContainer = null;

  /** @type {HTMLElement | null} */
  #returnFocus = null;

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  /** @type {boolean | null} */
  #isPastScrolled = null;

  connectedCallback() {
    super.connectedCallback();
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;

    this.addEventListener('click', this.#handleClick, { signal });
    this.addEventListener('pointerover', this.#handlePointerOver, { signal });
    this.addEventListener('pointerleave', this.#closeMenus, { signal });
    this.addEventListener('keydown', this.#handleKeydown, { signal });
    this.refs.searchInput.addEventListener('input', this.#handleSearchInput, { signal });
    this.#bindScrollContainer(signal);
    scrollContainerMediaQuery.addEventListener('change', this.#handleScrollContainerChange, { signal });
    const main = this.querySelector('.premium-header__main');
    const utility = this.querySelector('.premium-header__utility');
    const mobileSearch = this.querySelector('.premium-header__mobile-search-trigger');
    const shell = this.querySelector('.premium-header__shell');
    this.#resizeObserver = new ResizeObserver(this.#measureHeader);
    for (const element of [main, utility, mobileSearch, shell]) {
      if (element instanceof HTMLElement) this.#resizeObserver.observe(element);
    }
    this.#measureHeader();
  }

  disconnectedCallback() {
    this.classList.remove('scrolled-past');
    this.closest('.premium-header-section')?.classList.remove('scrolled-past');
    this.#isPastScrolled = null;
    super.disconnectedCallback();
    this.#listeners?.abort();
    this.#scrollContainer = null;
    this.#searchRequest?.abort();
    this.#resizeObserver?.disconnect();
    if (this.#searchTimer !== null) window.clearTimeout(this.#searchTimer);
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame);
    removeTrapFocus();
    unlockScroll(this);
  }

  #handleClick = (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target === this.refs.searchDialog) {
      this.#closeDialog(this.refs.searchDialog);
      return;
    }
    if (event.target === this.refs.mobileDrawer) {
      this.#closeDialog(this.refs.mobileDrawer);
      return;
    }
    const menuToggle = event.target.closest('[data-menu-toggle]');
    if (menuToggle instanceof HTMLButtonElement) {
      event.preventDefault();
      const item = menuToggle.closest('[data-menu-item]');
      if (item instanceof HTMLElement) this.#toggleMenu(item);
      return;
    }

    const openDrawer = event.target.closest('[data-open-drawer]');
    if (openDrawer instanceof HTMLElement) {
      this.#openDialog(this.refs.mobileDrawer, openDrawer);
      openDrawer.setAttribute('aria-expanded', 'true');
      return;
    }

    if (event.target.closest('[data-close-drawer]')) {
      this.#closeDialog(this.refs.mobileDrawer);
      return;
    }

    const openSearch = event.target.closest('[data-open-search]');
    if (openSearch instanceof HTMLElement) {
      this.#openDialog(this.refs.searchDialog, openSearch);
      openSearch.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => this.refs.searchInput.focus());
      return;
    }

    if (event.target.closest('[data-close-search]')) this.#closeDialog(this.refs.searchDialog);
  };

  #handlePointerOver = (event) => {
    if (!window.matchMedia('(hover: hover) and (min-width: 750px)').matches) return;
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('[data-menu-item]');
    if (item instanceof HTMLElement && item.querySelector('[data-menu-panel]')) this.#openMenu(item);
  };

  #handleKeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (this.refs.searchDialog.open) this.#closeDialog(this.refs.searchDialog);
    else if (this.refs.mobileDrawer.open) this.#closeDialog(this.refs.mobileDrawer);
    else this.#closeMenus();
  };

  #toggleMenu(item) {
    if (item.classList.contains('is-open')) this.#closeMenus();
    else this.#openMenu(item);
  }

  #openMenu(item) {
    this.#closeMenus();
    const toggle = item.querySelector('[data-menu-toggle]');
    const panel = item.querySelector('[data-menu-panel]');
    if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;
    item.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }

  #closeMenus = () => {
    for (const item of this.querySelectorAll('[data-menu-item].is-open')) {
      item.classList.remove('is-open');
      item.querySelector('[data-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      const panel = item.querySelector('[data-menu-panel]');
      if (panel instanceof HTMLElement) panel.hidden = true;
    }
  };

  #openDialog(dialog, trigger) {
    if (this.refs.mobileDrawer.open) this.#closeDialog(this.refs.mobileDrawer, false);
    if (this.refs.searchDialog.open) this.#closeDialog(this.refs.searchDialog, false);
    this.#returnFocus = trigger;
    dialog.showModal();
    lockScroll(this);
    trapFocus(dialog);
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  }

  #closeDialog(dialog, restoreFocus = true) {
    if (!dialog.open) return;
    if (!restoreFocus) {
      dialog.close();
      removeTrapFocus();
      return;
    }
    dialog.classList.remove('is-open');
    window.setTimeout(() => {
      dialog.close();
      removeTrapFocus();
      unlockScroll(this);
      for (const trigger of this.querySelectorAll('[aria-expanded="true"]')) trigger.setAttribute('aria-expanded', 'false');
      this.#returnFocus?.focus();
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  }

  #handleScroll = () => {
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = null;
      this.#updateScrollState();
    });
  };

  #bindScrollContainer(signal) {
    this.#scrollContainer?.removeEventListener('scroll', this.#handleScroll);
    this.#scrollContainer = getScrollEventTarget();
    this.#scrollContainer.addEventListener('scroll', this.#handleScroll, { passive: true, signal });
  }

  #handleScrollContainerChange = () => {
    const signal = this.#listeners?.signal;
    if (!signal) return;
    this.#bindScrollContainer(signal);
    this.#updateScrollState();
  };

  #updateScrollState() {
    const threshold = Number.parseInt(this.dataset.scrollThreshold || '48', 10);
    const isPastScrolled = getScrollTop() > threshold;
    if (this.#isPastScrolled === isPastScrolled) return;

    const mobileSearch = this.querySelector('.premium-header__mobile-search-trigger');
    const shouldAnimate = mobileSearch instanceof HTMLElement && window.matchMedia('(max-width: 749px) and (prefers-reduced-motion: no-preference)').matches;
    const previousRect = shouldAnimate ? mobileSearch.getBoundingClientRect() : null;

    this.#isPastScrolled = isPastScrolled;
    this.classList.toggle('scrolled-past', isPastScrolled);
    this.closest('.premium-header-section')?.classList.toggle('scrolled-past', isPastScrolled);

    if (mobileSearch instanceof HTMLElement && previousRect) {
      const nextRect = mobileSearch.getBoundingClientRect();
      mobileSearch.getAnimations().forEach((animation) => animation.cancel());
      mobileSearch.animate(
        [
          {
            transform: `translate(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px)`,
            width: `${previousRect.width}px`,
          },
          { transform: 'translate(0, 0)', width: `${nextRect.width}px` },
        ],
        { duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }

  #measureHeader = () => {
    const main = this.querySelector('.premium-header__main');
    const utility = this.querySelector('.premium-header__utility');
    const mainHeight = main instanceof HTMLElement ? main.offsetHeight : 0;
    const utilityHeight = utility instanceof HTMLElement ? utility.offsetHeight : 0;
    const shellHeight = mainHeight + utilityHeight;

    document.body.style.setProperty('--header-height', `${Math.round(mainHeight + utilityHeight)}px`);
    this.style.setProperty('--premium-main-height', `${Math.round(mainHeight)}px`);
    this.style.setProperty('--premium-shell-height', `${Math.round(shellHeight)}px`);
    this.#updateScrollState();
  };

  #handleSearchInput = () => {
    if (this.#searchTimer !== null) window.clearTimeout(this.#searchTimer);
    const query = this.refs.searchInput.value.trim();
    this.refs.searchInput.setAttribute('aria-expanded', query.length >= 2 ? 'true' : 'false');
    if (query.length < 2) {
      this.#searchRequest?.abort();
      this.refs.searchResults.replaceChildren();
      return;
    }
    this.#searchTimer = window.setTimeout(() => this.#fetchSearch(query), 180);
  };

  async #fetchSearch(query) {
    this.#searchRequest?.abort();
    this.#searchRequest = new AbortController();
    const url = new URL(Theme.routes.predictive_search_url, window.location.origin);
    url.searchParams.set('q', query);
    url.searchParams.set('section_id', 'predictive-search');
    url.searchParams.set('resources[limit_scope]', 'each');

    try {
      const response = await fetch(url, { signal: this.#searchRequest.signal });
      if (!response.ok) throw new Error(`Predictive search failed: ${response.status}`);
      const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
      const results = documentFragment.querySelector('#predictive-search-results');
      this.refs.searchResults.replaceChildren();
      if (results) {
        for (const routedElement of results.querySelectorAll('[on\\:keydown]')) routedElement.removeAttribute('on:keydown');
        this.refs.searchResults.append(results);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.refs.searchResults.textContent = this.dataset.searchError || '';
    }
  }
}

if (!customElements.get('premium-header')) customElements.define('premium-header', PremiumHeader);
