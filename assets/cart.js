// First define the handleVariantChange utility function that's used by the DOMContentLoaded listener
function handleVariantChange(event) {
  console.log('Variant change triggered', event);
  const form = event.target.closest('.custom-product-form');
  if (!form) {
    console.log('No form found');
    return;
  }

  const selectedOptions = Array.from(form.querySelectorAll('input[type="radio"]:checked'))
    .map(input => input.value);
  console.log('Selected options:', selectedOptions);

  const variantScript = form.querySelector('script[type="application/json"]');
  if (!variantScript) {
    console.log('No variant script found');
    return;
  }

  try {
    const variants = JSON.parse(variantScript.textContent);
    const currentVariant = variants.find(variant => 
      variant.options.every((option, index) => option === selectedOptions[index])
    );
    console.log('Current variant:', currentVariant);

    const submitButton = form.querySelector('.quick-add__submit');
    if (!submitButton) {
      console.log('No submit button found');
      return;
    }

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
  } catch (e) {
    console.error('Error updating variant:', e);
  }
}


// First, let's create a debounced update manager
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

// Update lastCartUpdate whenever cart changes
document.addEventListener('cart:updated', () => {
  lastCartUpdate = Date.now();
});

// Define CartItems only once
if (!customElements.get('cart-items')) {
  class CartItems extends HTMLElement {
    constructor() {
      super();
      this.updateManager = new CartUpdateManager();
      this.lineItemStatusElement = document.getElementById('shopping-cart-line-item-status') || 
                                  document.getElementById('CartDrawer-LineItemStatus');

      this.debouncedOnChange = debounce((event) => {
        this.onChange(event);
      }, 500);

      this.addEventListener('change', this.debouncedOnChange.bind(this));
    }

    connectedCallback() {
      if (this.cartUpdateUnsubscriber) {
        this.cartUpdateUnsubscriber();
      }

      this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
        if (event.source === 'cart-items') return;
        this.updateManager.queueUpdate(() => this.onCartUpdate());
      });

      this.initializeVariantHandlers();
    }

    disconnectedCallback() {
      if (this.cartUpdateUnsubscriber) {
        this.cartUpdateUnsubscriber();
      }
      this.removeVariantHandlers();
    }

    onChange(event) {
      this.updateQuantity(
        event.target.dataset.index,
        event.target.value,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }

    async onCartUpdate() {
      const endpoint = this.tagName === 'CART-DRAWER-ITEMS' 
        ? `${routes.cart_url}?section_id=cart-drawer`
        : `${routes.cart_url}?section_id=main-cart-items`;

      try {
        const response = await fetch(endpoint);
        const responseText = await response.text();
        const html = new DOMParser().parseFromString(responseText, 'text/html');

        if (this.tagName === 'CART-DRAWER-ITEMS') {
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          selectors.forEach(selector => {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          });
        } else {
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        }

        this.initializeVariantHandlers();

        // Call calculateDiscount and ensure it's queued properly
        // if (typeof calculateDiscount === 'function') {
        //   await this.updateManager.queueUpdate(async () => {
        //     await calculateDiscount();
        //   });
        // }
      } catch (e) {
        console.error('Cart update failed:', e);
      }
    }

    // Variant handlers
    initializeVariantHandlers() {
      const products = document.querySelectorAll('.custom-product-form');
      products.forEach(form => {
        const radioInputs = form.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
          input.removeEventListener('change', this.handleVariantChange);
          input.addEventListener('change', this.handleVariantChange.bind(this));
        });
        this.setupInitialVariant(form);
      });
    }

    removeVariantHandlers() {
      const products = document.querySelectorAll('.custom-product-form');
      products.forEach(form => {
        const radioInputs = form.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
          input.removeEventListener('change', this.handleVariantChange);
        });
      });
    }

    handleVariantChange(event) {
      const form = event.target.closest('.custom-product-form');
      const selectedOptions = Array.from(form.querySelectorAll('input[type="radio"]:checked'))
        .map(input => input.value);
      
      const variantScript = form.querySelector('script[type="application/json"]');
      if (!variantScript) return;

      const variants = JSON.parse(variantScript.textContent);
      const currentVariant = variants.find(variant => 
        variant.options.every((option, index) => option === selectedOptions[index])
      );

      const submitButton = form.querySelector('.quick-add__submit');
      const submitText = submitButton.querySelector('span');
      const soldOutMessage = submitButton.querySelector('.sold-out-message');

      if (currentVariant) {
        form.querySelector('[name="id"]').value = currentVariant.id;
        submitText.classList.remove('hidden');
        soldOutMessage.classList.add('hidden');
      } else {
        submitText.classList.add('hidden');
        soldOutMessage.classList.remove('hidden');
      }
    }

    setupInitialVariant(form) {
      const variantIdInput = form.querySelector('[name="id"]');
      if (!variantIdInput) return;

      const currentVariantId = parseInt(variantIdInput.value);
      const variantScript = form.querySelector('script[type="application/json"]');
      if (!variantScript) return;

      const variants = JSON.parse(variantScript.textContent);
      const currentVariant = variants.find(variant => variant.id === currentVariantId);
      
      if (currentVariant) {
        currentVariant.options.forEach((optionValue, index) => {
          const radio = form.querySelector(`input[type="radio"][value="${optionValue}"]`);
          if (radio) radio.checked = true;
        });
      }
    }

    async updateQuantity(line, quantity, name, variantId) {
      console.log('Updating quantity:', { line, quantity, name, variantId });
      
      await this.updateManager.queueUpdate(async () => {
        this.enableLoading(line);
        
        try {
          const body = JSON.stringify({
            line,
            quantity,
            sections: this.getSectionsToRender().map((section) => section.section),
            sections_url: window.location.pathname,
          });

          const response = await fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } });
          const state = await response.json();

          if (state.errors) {
            this.handleQuantityUpdateError(line, state.errors);
            return;
          }

          // Update cart state and UI
          await this.handleQuantityUpdateResponse(state, line, name, variantId);

          // Ensure calculateDiscount runs after cart update
          // if (typeof calculateDiscount === 'function') {
          //   await calculateDiscount();
          // }

        } catch (error) {
          console.error('Error in updateQuantity:', error);
          this.handleQuantityUpdateError(line);
        } finally {
          this.disableLoading(line);
        }
      });
    }

    handleQuantityUpdateResponse(parsedState, line, name, variantId) {
      if (!parsedState) return;
    
      this.classList.toggle('is-empty', parsedState.item_count === 0);
      const cartDrawerWrapper = document.querySelector('cart-drawer');
      const cartFooter = document.getElementById('main-cart-footer');
    
      if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
      if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);
    
      this.getSectionsToRender().forEach((section) => {
        const elementToReplace = document.getElementById(section.id)?.querySelector(section.selector) || 
                               document.getElementById(section.id);
        if (elementToReplace) {
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        }
      });
    
      publish(PUB_SUB_EVENTS.cartUpdate, {
        source: 'cart-items',
        cartData: parsedState,
        variantId: variantId
      });
    
      // Add delay to ensure DOM is updated before calculating discount
      // setTimeout(async () => {
      //   if (typeof calculateDiscount === 'function') {
      //     console.log('Calling calculateDiscount after quantity update');
      //     try {
      //       await calculateDiscount();
      //       console.log('calculateDiscount completed after quantity update');
      //     } catch (error) {
      //       console.error('Error in calculateDiscount:', error);
      //     }
      //   }
      // }, 100);
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

    getSectionInnerHTML(html, selector = '.shopify-section') {
      return new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelector(selector).innerHTML;
    }

    enableLoading(line) {
      const mainCartItems = document.getElementById('main-cart-items') || 
                           document.getElementById('CartDrawer-CartItems');
      mainCartItems?.classList.add('cart__items--disabled');

      const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
      const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

      [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay?.classList.remove('hidden'));

      document.activeElement.blur();
      this.lineItemStatusElement?.setAttribute('aria-hidden', false);
    }

    disableLoading(line) {
      const mainCartItems = document.getElementById('main-cart-items') || 
                           document.getElementById('CartDrawer-CartItems');
      mainCartItems?.classList.remove('cart__items--disabled');

      const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
      const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

      cartItemElements.forEach((overlay) => overlay?.classList.add('hidden'));
      cartDrawerItemElements.forEach((overlay) => overlay?.classList.add('hidden'));
    }

    updateLiveRegions(line, message) {
      const lineItemError = document.getElementById(`Line-item-error-${line}`) || 
                           document.getElementById(`CartDrawer-LineItemError-${line}`);
      if (lineItemError) {
        lineItemError.querySelector('.cart-item__error-text').innerHTML = message;
      }

      this.lineItemStatusElement?.setAttribute('aria-hidden', true);

      const cartStatus = document.getElementById('cart-live-region-text') || 
                        document.getElementById('CartDrawer-LiveRegionText');
      cartStatus?.setAttribute('aria-hidden', false);

      setTimeout(() => {
        cartStatus?.setAttribute('aria-hidden', true);
      }, 1000);
    }

    handleQuantityUpdateResponse(parsedState, line, name, variantId) {
      if (!parsedState) return;

      const items = document.querySelectorAll('.cart-item');

      if (parsedState.errors) {
        const quantityElement = document.getElementById(`Quantity-${line}`) || 
                               document.getElementById(`Drawer-quantity-${line}`);
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
        const elementToReplace = document.getElementById(section.id)?.querySelector(section.selector) || 
                               document.getElementById(section.id);
        if (elementToReplace) {
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        }
      });

      publish(PUB_SUB_EVENTS.cartUpdate, {
        source: 'cart-items',
        cartData: parsedState,
        variantId: variantId
      });
    
      // if (typeof calculateDiscount === 'function') {
      //   calculateDiscount();
      // }
    }

    handleQuantityUpdateError(line) {
      const errors = document.getElementById('cart-errors') || 
                    document.getElementById('CartDrawer-CartErrors');
      if (errors) {
        errors.textContent = window.cartStrings.error;
      }
    }
  }

  customElements.define('cart-items', CartItems);
}
// Modify CartRemoveButton to trigger proper events
if (!customElements.get('cart-remove-button')) {
  class CartRemoveButton extends HTMLElement {
    constructor() {
      super();
      this.setupEventListeners();
    }

    setupEventListeners() {
      const handleRemove = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        console.log('Starting cart item removal process');
        
        const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
        if (!cartItems) return;

        const line = this.dataset.index;
        if (!line) return;

        try {
          // Update cart
          await cartItems.updateQuantity(line, 0);
          
          console.log('Cart item removed, triggering update event');
          
          // Dispatch cart update event
          document.dispatchEvent(new CustomEvent('cart:updated', {
            bubbles: true,
            detail: { source: 'remove-button' }
          }));

          // If calculateDiscount exists, call it after a delay
          if (typeof calculateDiscount === 'function') {
            setTimeout(async () => {
              await calculateDiscount();
            }, 1000);
          }

        } catch (error) {
          console.error('Error in removal process:', error);
        }
      };

      // Add click handlers
      this.addEventListener('click', handleRemove);
      
      const button = this.querySelector('button');
      if (button) {
        button.addEventListener('click', handleRemove);
      }
    }
  }

  customElements.define('cart-remove-button', CartRemoveButton);
}

// Define CartNote
if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'change',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}

// Initialize forms when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('.custom-product-form');
  forms.forEach(form => {
    form.querySelectorAll('input[type="radio"]').forEach(input => {
      input.addEventListener('change', handleVariantChange);
    });
  });
});

