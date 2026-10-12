import { Component } from '@theme/component';
import { destroyCustomSplide, mountCustomSplide } from '@theme/custom-splide';

class PremiumProduct extends Component {
  #controller = new AbortController();
  #activeIndex = 0;
  #touchStart = 0;
  #dragStartX = 0;
  #dragScrollLeft = 0;
  #dragPointerId = null;
  #scrollFrame = 0;
  #returnFocus;

  connectedCallback() {
    super.connectedCallback();
    this.#controller.abort();
    this.#controller = new AbortController();
    const signal = this.#controller.signal;
    this.addEventListener('change', this.#onChange, { signal });
    this.addEventListener('click', this.#onClick, { signal });
    this.addEventListener('keydown', this.#onKeyDown, { signal });
    const viewport = this.querySelector('[data-gallery-viewport]');
    viewport?.addEventListener('touchstart', this.#onTouchStart, { signal, passive: true });
    viewport?.addEventListener('touchend', this.#onTouchEnd, { signal, passive: true });
    viewport?.addEventListener('pointerdown', this.#onPointerDown, { signal });
    viewport?.addEventListener('pointermove', this.#onPointerMove, { signal });
    viewport?.addEventListener('pointerup', this.#onPointerEnd, { signal });
    viewport?.addEventListener('pointercancel', this.#onPointerEnd, { signal });
    viewport?.addEventListener('scroll', this.#onGalleryScroll, { signal, passive: true });
    viewport?.addEventListener('dragstart', this.#preventNativeDrag, { signal });
    this.querySelector('[data-gallery-dialog]')?.addEventListener('click', this.#onDialogClick, { signal });
    this.querySelector('[data-size-guide-dialog]')?.addEventListener('click', this.#onSizeGuideDialogClick, { signal });
    for (const dialog of this.querySelectorAll('dialog')) dialog.addEventListener('close', this.#onDialogClose, { signal });
    this.#selectVariant();
    this.#showMedia(0, 'auto');
  }

  disconnectedCallback() {
    this.#controller.abort();
    cancelAnimationFrame(this.#scrollFrame);
    this.#unlockScroll();
    super.disconnectedCallback();
  }

  get #data() {
    const script = this.querySelector('[data-premium-product-json]');
    if (!(script instanceof HTMLScriptElement)) return { variants: [] };
    try { return JSON.parse(script.textContent || '{}'); } catch { return { variants: [] }; }
  }

  get #visibleMedia() { return [...this.querySelectorAll('[data-gallery-media]')].filter((item) => !item.hasAttribute('data-filtered')); }

  #onChange = (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.matches('[data-option-index]')) this.#selectVariant();
    if (event.target.name.startsWith('size-unit-')) this.#setUnit(event.target.value);
  };

  #onClick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.matches('[data-gallery-previous]')) this.#showMedia(this.#activeIndex - 1);
    if (target.matches('[data-gallery-next]')) this.#showMedia(this.#activeIndex + 1);
    if (target.matches('[data-dialog-open]')) this.#openDialog(target);
    if (target.matches('[data-dialog-close]')) this.#closeDialog();
    if (target.matches('[data-model-sizing-toggle]')) this.#toggleModelSizing(target);
    if (target.matches('[data-size-guide-open]')) this.#openSizeGuide(target);
    if (target.matches('[data-size-guide-close]')) this.#closeSizeGuide();
    if (target.matches('[data-tab-button]')) this.#activateTab(target);
  };

  #onKeyDown = (event) => { if (event.key === 'Escape') { this.#closeDialog(); this.#closeSizeGuide(); } };
  #onTouchStart = (event) => { this.#touchStart = event.changedTouches[0]?.clientX ?? 0; };
  #onTouchEnd = (event) => { const delta = (event.changedTouches[0]?.clientX ?? 0) - this.#touchStart; if (Math.abs(delta) > 45) this.#showMedia(this.#activeIndex + (delta < 0 ? 1 : -1)); };
  #preventNativeDrag = (event) => event.preventDefault();
  #onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLElement)) return;
    this.#dragPointerId = event.pointerId;
    this.#dragStartX = event.clientX;
    this.#dragScrollLeft = viewport.scrollLeft;
    viewport.setPointerCapture(event.pointerId);
    viewport.toggleAttribute('data-dragging', true);
  };
  #onPointerMove = (event) => {
    if (event.pointerId !== this.#dragPointerId) return;
    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLElement)) return;
    event.preventDefault();
    viewport.scrollLeft = this.#dragScrollLeft - (event.clientX - this.#dragStartX);
  };
  #onPointerEnd = (event) => {
    if (event.pointerId !== this.#dragPointerId) return;
    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLElement)) return;
    this.#dragPointerId = null;
    viewport.toggleAttribute('data-dragging', false);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    this.#snapToClosestMedia();
  };
  #onGalleryScroll = () => {
    cancelAnimationFrame(this.#scrollFrame);
    this.#scrollFrame = requestAnimationFrame(() => this.#syncActiveMediaFromScroll());
  };
  #onDialogClick = (event) => { if (event.target === event.currentTarget) this.#closeDialog(); };
  #onSizeGuideDialogClick = (event) => { if (event.target === event.currentTarget) this.#closeSizeGuide(); };
  #onDialogClose = () => { if (!this.querySelector('dialog[open]')) this.#unlockScroll(); };

  #selectedOptions() {
    const options = [];
    for (const input of this.querySelectorAll('[data-option-index]:checked')) if (input instanceof HTMLInputElement) options[Number(input.dataset.optionIndex)] = input.value;
    return options;
  }

  #selectVariant() {
    const options = this.#selectedOptions();
    const variant = this.#data.variants.find((item) => item.options.every((value, index) => value === options[index]));
    if (!variant) return;
    const idInput = this.querySelector('[data-variant-id-input]');
    if (idInput instanceof HTMLInputElement) idInput.value = String(variant.id);
    for (const label of this.querySelectorAll('[data-selected-option-label]')) label.textContent = options[Number(label.getAttribute('data-selected-option-label'))] || '';
    const currentPrice = this.querySelector('[data-current-price]');
    if (currentPrice) currentPrice.textContent = variant.priceFormatted;
    const compare = this.querySelector('[data-compare-price]');
    const sale = this.querySelector('[data-sale-badge]');
    const discounted = variant.compareAt > variant.price;
    if (compare) { compare.textContent = variant.compareFormatted; compare.toggleAttribute('hidden', !discounted); }
    if (sale) { sale.toggleAttribute('hidden', !discounted); if (discounted) sale.textContent = this.dataset.saleFormat === 'amount' ? `Save ${variant.savingFormatted}` : `${Math.round((variant.compareAt - variant.price) * 100 / variant.compareAt)}% off`; }
    const add = this.querySelector('[data-add-to-cart]');
    if (add instanceof HTMLButtonElement) { add.disabled = !variant.available; const label = add.querySelector('[data-add-label]'); if (label) label.textContent = variant.available ? this.dataset.addLabel || 'Add to cart' : this.dataset.soldOutLabel || 'Sold out'; }
    const url = new URL(window.location.href); url.searchParams.set('variant', variant.id); history.replaceState({}, '', url);
    const groupIndex = [...this.querySelectorAll('.premium-variants__option')].findIndex((item) => item.querySelector('input')?.closest('[data-productswatch-id]'));
    this.#filterMedia(groupIndex >= 0 ? options[groupIndex] : '');
  }

  #filterMedia(value) {
    const id = this.#normalize(value);
    const all = [...this.querySelectorAll('[data-gallery-media]')];
    const hasMatch = id && all.some((item) => item.dataset.galleryimageId === id);
    for (const item of [...this.querySelectorAll('[data-gallery-media], [data-modal-media]')]) {
      const mediaId = item.dataset.galleryimageId || '';
      item.toggleAttribute('data-filtered', Boolean(hasMatch && mediaId && mediaId !== id));
    }
    this.#activeIndex = 0;
    this.#showMedia(0);
  }

  #normalize(value) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  #showMedia(index, behavior = 'smooth') {
    const media = this.#visibleMedia;
    if (!media.length) return;
    this.#activeIndex = (index + media.length) % media.length;
    for (const item of media) item.hidden = false;
    const viewport = this.querySelector('[data-gallery-viewport]');
    const selectedMedia = media[this.#activeIndex];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (viewport instanceof HTMLElement && selectedMedia instanceof HTMLElement) {
      viewport.scrollTo({ left: selectedMedia.offsetLeft, behavior: reducedMotion ? 'auto' : behavior });
    }
    this.#updateGalleryProgress(media.length);
  }

  #syncActiveMediaFromScroll() {
    const viewport = this.querySelector('[data-gallery-viewport]');
    const media = this.#visibleMedia;
    if (!(viewport instanceof HTMLElement) || !media.length) return;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [index, item] of media.entries()) {
      if (!(item instanceof HTMLElement)) continue;
      const distance = Math.abs(item.offsetLeft - viewport.scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    this.#activeIndex = closestIndex;
    this.#updateGalleryProgress(media.length);
  }

  #snapToClosestMedia() {
    this.#syncActiveMediaFromScroll();
    this.#showMedia(this.#activeIndex);
  }

  #updateGalleryProgress(mediaCount) {
    const progress = this.querySelector('[data-gallery-progress]');
    if (progress instanceof HTMLElement) progress.style.width = `${((this.#activeIndex + 1) / mediaCount) * 100}%`;
  }

  #openDialog(button) { const dialog = this.querySelector(`#${CSS.escape(button.dataset.dialogOpen || '')}`); if (!(dialog instanceof HTMLDialogElement)) return; this.#returnFocus = button; dialog.showModal(); document.documentElement.classList.add('premium-modal-open'); const activeMediaId = this.#visibleMedia[this.#activeIndex]?.getAttribute('data-media-id'); const modalMedia = activeMediaId ? dialog.querySelector(`[data-modal-media][data-media-id="${CSS.escape(activeMediaId)}"]`) : null; modalMedia?.scrollIntoView({ block: 'start' }); }
  #closeDialog() { const dialog = this.querySelector('[data-gallery-dialog]'); if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close(); this.#unlockScroll(); this.#returnFocus?.focus(); }
  #openSizeGuide(button) { const dialog = this.querySelector('[data-size-guide-dialog]'); if (!(dialog instanceof HTMLDialogElement)) return; this.#returnFocus = button; dialog.showModal(); document.documentElement.classList.add('premium-modal-open'); }
  #closeSizeGuide() { const dialog = this.querySelector('[data-size-guide-dialog]'); if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close(); this.#unlockScroll(); this.#returnFocus?.focus(); }
  #unlockScroll() { document.documentElement.classList.remove('premium-modal-open'); }
  #toggleModelSizing(button) { const popover = this.querySelector('[data-model-sizing]'); if (!(popover instanceof HTMLElement)) return; const open = popover.hidden; popover.hidden = !open; button.setAttribute('aria-expanded', String(open)); }
  #activateTab(button) { const index = button.dataset.tabButton; for (const tab of this.querySelectorAll('[data-tab-button]')) tab.setAttribute('aria-selected', String(tab === button)); for (const panel of this.querySelectorAll('[data-tab-panel]')) panel.toggleAttribute('hidden', panel.dataset.tabPanel !== index); }
  #setUnit(unit) { for (const cell of this.querySelectorAll('[data-measurement]')) { const source = cell.dataset.inchValue || ''; cell.textContent = unit === 'cm' ? source.replace(/\d+(?:\.\d+)?/g, (value) => String(Math.round(Number(value) * 2.54 * 10) / 10)) : source; } }
}

class PremiumCollectionSlider extends Component {
  /** @type {HTMLElement | null} */
  #root = null;

  connectedCallback() {
    super.connectedCallback();
    this.#root = this.querySelector('[data-custom-splide]');
    if (!this.#root) return;

    const desktopItems = Number.parseInt(this.dataset.desktopItems || '4', 10);
    const mobileItems = Number.parseInt(this.dataset.mobileItems || '2', 10);
    const gap = `${Number.parseInt(this.dataset.slideGap || '4', 10)}px`;

    mountCustomSplide(this.#root, {
      type: 'slide',
      rewind: false,
      perPage: desktopItems,
      perMove: 1,
      gap,
      pagination: false,
      breakpoints: {
        749: {
          perPage: mobileItems,
          gap,
        },
      },
    });
  }

  disconnectedCallback() {
    if (this.#root) destroyCustomSplide(this.#root);
    this.#root = null;
    super.disconnectedCallback();
  }
}

if (!customElements.get('premium-product')) customElements.define('premium-product', PremiumProduct);
if (!customElements.get('premium-collection-slider')) customElements.define('premium-collection-slider', PremiumCollectionSlider);
