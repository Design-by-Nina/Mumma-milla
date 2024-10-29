// First, define CartItems base class
class CartItems extends HTMLElement {
    constructor() {
      super();
      this.lineItemStatusElement = 
        document.getElementById('shopping-cart-line-item-status') || 
        document.getElementById('CartDrawer-LineItemStatus');
  
      const debouncedOnChange = debounce((event) => {
        this.onChange(event);
      }, 300);
  
      this.addEventListener('change', debouncedOnChange.bind(this));
    }
  
    cartUpdateUnsubscriber = undefined;
  
    connectedCallback() {
      this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
        if (event.source === 'cart-items') {
          return;
        }
        this.onCartUpdate();
      });
    }
  
    disconnectedCallback() {
      if (this.cartUpdateUnsubscriber) {
        this.cartUpdateUnsubscriber();
      }
    }
  
    onChange(event) {
      this.updateQuantity(
        event.target.dataset.index, 
        event.target.value, 
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  
    onCartUpdate() {
      if (this.tagName === 'CART-DRAWER-ITEMS') {
        fetch(`${routes.cart_url}?section_id=cart-drawer`)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
            for (const selector of selectors) {
              const targetElement = document.querySelector(selector);
              const sourceElement = html.querySelector(selector);
              if (targetElement && sourceElement) {
                targetElement.replaceWith(sourceElement);
              }
            }
            CartManager.initializeProductForms();
          })
          .catch((e) => {
            console.error(e);
          });
      } else {
        fetch(`${routes.cart_url}?section_id=main-cart-items`)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            const sourceQty = html.querySelector('cart-items');
            this.innerHTML = sourceQty.innerHTML;
            CartManager.initializeProductForms();
          })
          .catch((e) => {
            console.error(e);
          });
      }
    }
  
    getSectionsToRender() {
      return [
        {
          id: 'main-cart-items',
          section: document.getElementById('main-cart-items')?.dataset.id,
          selector: '.js-contents',
        },
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section',
        },
        {
          id: 'cart-live-region-text',
          section: 'cart-live-region-text',
          selector: '.shopify-section',
        },
        {
          id: 'main-cart-footer',
          section: document.getElementById('main-cart-footer')?.dataset.id,
          selector: '.js-contents',
        }
      ];
    }
  
    updateQuantity(line, quantity, name, variantId) {
      this.enableLoading(line);
  
      const body = JSON.stringify({
        line,
        quantity,
        sections: this.getSectionsToRender().map((section) => section.section),
        sections_url: window.location.pathname,
      });
  
      fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
        .then((response) => response.text())
        .then((state) => {
          const parsedState = JSON.parse(state);
          const quantityElement =
            document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
          const items = document.querySelectorAll('.cart-item');
  
          if (parsedState.errors) {
            quantityElement.value = quantityElement.getAttribute('value');
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }
  
          this.classList.toggle('is-empty', parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector('cart-drawer');
          const cartFooter = document.getElementById('main-cart-footer');
  
          if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);
  
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace =
              document.getElementById(section.id)?.querySelector(section.selector) || 
              document.getElementById(section.id);
            if (elementToReplace) {
              elementToReplace.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.section],
                section.selector
              );
            }
          });
  
          const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
          let message = '';
          if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
            if (typeof updatedValue === 'undefined') {
              message = window.cartStrings.error;
            } else {
              message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
            }
          }
          this.updateLiveRegions(line, message);
  
          const lineItem =
            document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
  
          if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper
              ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
              : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
            trapFocus(
              cartDrawerWrapper.querySelector('.drawer__inner-empty'),
              cartDrawerWrapper.querySelector('a')
            );
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
  
          publish(PUB_SUB_EVENTS.cartUpdate, {
            source: 'cart-items',
            cartData: parsedState,
            variantId: variantId
          });
        })
        .catch(() => {
          this.setActiveElement(document.activeElement);
          const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
          errors.textContent = window.cartStrings.error;
        })
        .finally(() => {
          this.disableLoading(line);
          CartManager.initializeProductForms();
        });
    }
  
    updateLiveRegions(line, message) {
      const lineItemError =
        document.getElementById(`Line-item-error-${line}`) || 
        document.getElementById(`CartDrawer-LineItemError-${line}`);
      if (lineItemError) {
        lineItemError.querySelector('.cart-item__error-text').innerHTML = message;
      }
  
      this.lineItemStatusElement.setAttribute('aria-hidden', true);
  
      const cartStatus =
        document.getElementById('cart-live-region-text') || 
        document.getElementById('CartDrawer-LiveRegionText');
      cartStatus.setAttribute('aria-hidden', false);
  
      setTimeout(() => {
        cartStatus.setAttribute('aria-hidden', true);
      }, 1000);
    }
  
    getSectionInnerHTML(html, selector = '.shopify-section') {
      return new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelector(selector).innerHTML;
    }
  
    enableLoading(line) {
      const mainCartItems = document.getElementById('main-cart-items') || 
                           document.getElementById('CartDrawer-CartItems');
      mainCartItems.classList.add('cart__items--disabled');
  
      const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
      const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);
  
      [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));
  
      document.activeElement.blur();
      this.lineItemStatusElement.setAttribute('aria-hidden', false);
    }
  
    disableLoading(line) {
      const mainCartItems = document.getElementById('main-cart-items') || 
                           document.getElementById('CartDrawer-CartItems');
      mainCartItems.classList.remove('cart__items--disabled');
  
      const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
      const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);
  
      cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
      cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    }
  }
  
  // Check if we already have CartUpdateManager defined
if (!window.CartUpdateManager) {
    // Simple PubSub implementation if not already defined
    const PubSub = {
      events: {},
      subscribe(event, callback) {
        if (!this.events[event]) {
          this.events[event] = [];
        }
        this.events[event].push(callback);
        return () => {
          this.events[event] = this.events[event].filter(cb => cb !== callback);
        };
      },
      publish(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
      }
    };
  
    // Define PUB_SUB_EVENTS if not already defined
    window.PUB_SUB_EVENTS = window.PUB_SUB_EVENTS || {
      cartUpdate: 'cart:update',
      cartError: 'cart:error'
    };
  
    // Define subscribe and publish functions globally if not already defined
    window.subscribe = window.subscribe || function(event, callback) {
      return PubSub.subscribe(event, callback);
    };
  
    window.publish = window.publish || function(event, data) {
      PubSub.publish(event, data);
    };
  
    // Define the debounce utility if not already defined
    window.debounce = window.debounce || function(fn, wait) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    };
  
    // CartUpdateManager definition
    class CartUpdateManager {
      constructor() {
        this.isUpdating = false;
        this.updateQueue = [];
        this.lastUpdateTime = 0;
        this.MIN_UPDATE_INTERVAL = 500;
      }
  
      canUpdate() {
        const now = Date.now();
        return !this.isUpdating && (now - this.lastUpdateTime) > this.MIN_UPDATE_INTERVAL;
      }
  
      async queueUpdate(updateFn) {
        if (this.canUpdate()) {
          this.isUpdating = true;
          try {
            await updateFn();
            this.lastUpdateTime = Date.now();
          } finally {
            this.isUpdating = false;
            this.processQueue();
          }
        } else {
          this.updateQueue.push(updateFn);
        }
      }
  
      processQueue() {
        if (this.updateQueue.length > 0 && this.canUpdate()) {
          const nextUpdate = this.updateQueue.shift();
          this.queueUpdate(nextUpdate);
        }
      }
    }
  
    // Make CartUpdateManager available globally
    window.CartUpdateManager = CartUpdateManager;
  
    // Cart Manager definition
    const CartManager = {
      updateManager: new CartUpdateManager(),
      
      handleVariantUpdate(form) {
        if (!form) return;
        
        const radioInputs = form.querySelectorAll('input[type="radio"]:checked');
        const selectedOptions = Array.from(radioInputs).map(input => input.value);
        
        const variantScript = form.querySelector('script[type="application/json"]');
        if (!variantScript) return;
  
        try {
          const variants = JSON.parse(variantScript.textContent);
          const currentVariant = variants.find(variant => 
            variant.options.every((option, index) => option === selectedOptions[index])
          );
  
          const submitButton = form.querySelector('.quick-add__submit');
          if (submitButton) {
            const submitText = submitButton.querySelector('span');
            const soldOutMessage = submitButton.querySelector('.sold-out-message');
  
            if (currentVariant) {
              form.querySelector('[name="id"]').value = currentVariant.id;
              submitText?.classList.remove('hidden');
              soldOutMessage?.classList.add('hidden');
            } else {
              submitText?.classList.add('hidden');
              soldOutMessage?.classList.remove('hidden');
            }
          }
        } catch (e) {
          console.error('Error updating variant:', e);
        }
      },
  
      initializeProductForms() {
        const forms = document.querySelectorAll('.custom-product-form');
        forms.forEach(form => {
          const radioInputs = form.querySelectorAll('input[type="radio"]');
          radioInputs.forEach(input => {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
          });
  
          const variantId = form.querySelector('[name="id"]')?.value;
          if (variantId) {
            this.handleVariantUpdate(form);
          }
  
          form.querySelectorAll('input[type="radio"]').forEach(input => {
            input.addEventListener('change', () => this.handleVariantUpdate(form));
          });
        });
      }
    };
  
    // Make CartManager available globally
    window.CartManager = CartManager;
  }
  
  // Define utility functions if not already defined
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  
  // Make these available globally
  window.CartItems = CartItems;
  window.CartManager = CartManager;
  window.CartUpdateManager = CartUpdateManager;
  
  // Initialize forms when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    CartManager.initializeProductForms();
  });