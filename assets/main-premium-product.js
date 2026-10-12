import { Component } from '@theme/component';

class PremiumProduct extends Component {
  #controller = new AbortController();
  #activeIndex = 0;
  #touchStart = 0;
  #returnFocus;

  connectedCallback() {
    super.connectedCallback();
    const signal = this.#controller.signal;
    this.addEventListener('change', this.#onChange, { signal });
    this.addEventListener('click', this.#onClick, { signal });
    this.addEventListener('keydown', this.#onKeyDown, { signal });
    this.querySelector('[data-gallery-viewport]')?.addEventListener('touchstart', this.#onTouchStart, { signal, passive: true });
    this.querySelector('[data-gallery-viewport]')?.addEventListener('touchend', this.#onTouchEnd, { signal, passive: true });
    this.querySelector('[data-gallery-dialog]')?.addEventListener('click', this.#onDialogClick, { signal });
    this.#selectVariant();
    this.#showMedia(0);
  }

  disconnectedCallback() {
    this.#controller.abort();
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
  #onDialogClick = (event) => { if (event.target === event.currentTarget) this.#closeDialog(); };

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
    this.querySelector('[data-current-price]').textContent = variant.priceFormatted;
    const compare = this.querySelector('[data-compare-price]');
    const sale = this.querySelector('[data-sale-badge]');
    const discounted = variant.compareAt > variant.price;
    if (compare) { compare.textContent = variant.compareFormatted; compare.toggleAttribute('hidden', !discounted); }
    if (sale) { sale.toggleAttribute('hidden', !discounted); if (discounted) sale.textContent = this.dataset.saleFormat === 'amount' ? `Save ${variant.savingFormatted}` : `${Math.round((variant.compareAt - variant.price) * 100 / variant.compareAt)}% off`; }
    const add = this.querySelector('[data-add-to-cart]');
    if (add instanceof HTMLButtonElement) { add.disabled = !variant.available; const label = add.querySelector('[data-add-label]'); if (label) label.textContent = variant.available ? 'Add to cart' : 'Sold out'; }
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

  #showMedia(index) {
    const media = this.#visibleMedia;
    if (!media.length) return;
    this.#activeIndex = (index + media.length) % media.length;
    for (const item of this.querySelectorAll('[data-gallery-media]')) item.hidden = item !== media[this.#activeIndex];
    const progress = this.querySelector('[data-gallery-progress]');
    if (progress instanceof HTMLElement) progress.style.width = `${((this.#activeIndex + 1) / media.length) * 100}%`;
  }

  #openDialog(button) { const dialog = this.querySelector(`#${CSS.escape(button.dataset.dialogOpen || '')}`); if (!(dialog instanceof HTMLDialogElement)) return; this.#returnFocus = button; dialog.showModal(); document.documentElement.classList.add('premium-modal-open'); }
  #closeDialog() { const dialog = this.querySelector('[data-gallery-dialog]'); if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close(); this.#unlockScroll(); this.#returnFocus?.focus(); }
  #openSizeGuide(button) { const dialog = this.querySelector('[data-size-guide-dialog]'); if (!(dialog instanceof HTMLDialogElement)) return; this.#returnFocus = button; dialog.showModal(); document.documentElement.classList.add('premium-modal-open'); }
  #closeSizeGuide() { const dialog = this.querySelector('[data-size-guide-dialog]'); if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close(); this.#unlockScroll(); this.#returnFocus?.focus(); }
  #unlockScroll() { document.documentElement.classList.remove('premium-modal-open'); }
  #toggleModelSizing(button) { const popover = this.querySelector('[data-model-sizing]'); if (!(popover instanceof HTMLElement)) return; const open = popover.hidden; popover.hidden = !open; button.setAttribute('aria-expanded', String(open)); }
  #activateTab(button) { const index = button.dataset.tabButton; for (const tab of this.querySelectorAll('[data-tab-button]')) tab.setAttribute('aria-selected', String(tab === button)); for (const panel of this.querySelectorAll('[data-tab-panel]')) panel.toggleAttribute('hidden', panel.dataset.tabPanel !== index); }
  #setUnit(unit) { for (const cell of this.querySelectorAll('[data-measurement]')) { const source = cell.dataset.inchValue || ''; cell.textContent = unit === 'cm' ? source.replace(/\d+(?:\.\d+)?/g, (value) => String(Math.round(Number(value) * 2.54 * 10) / 10)) : source; } }
}

class PremiumCollectionSlider extends HTMLElement {
  connectedCallback() { this.addEventListener('click', this.#click); }
  disconnectedCallback() { this.removeEventListener('click', this.#click); }
  #click = (event) => { const button = event.target instanceof Element ? event.target.closest('button') : null; const track = this.querySelector('[data-collection-track]'); if (!(button instanceof HTMLButtonElement) || !(track instanceof HTMLElement)) return; const direction = button.hasAttribute('data-collection-next') ? 1 : -1; track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' }); };
}

if (!customElements.get('premium-product')) customElements.define('premium-product', PremiumProduct);
if (!customElements.get('premium-collection-slider')) customElements.define('premium-collection-slider', PremiumCollectionSlider);
