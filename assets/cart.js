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
    this.MIN_UPDATE_INTERVAL = 500; // Minimum time between updates in ms
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

// Define CartItems only once
if (!customElements.get('cart-items')) {
  class CartItems extends HTMLElement {
    constructor() {
      super();
      this.updateManager = new CartUpdateManager();
      this.lineItemStatusElement = document.getElementById('shopping-cart-line-item-status') || 
                                  document.getElementById('CartDrawer-LineItemStatus');

      // Debounce the change handler
      this.debouncedOnChange = debounce((event) => {
        this.onChange(event);
      }, 500);

      this.addEventListener('change', this.debouncedOnChange.bind(this));
    }

    connectedCallback() {
      // Clean up any existing subscription
      if (this.cartUpdateUnsubscriber) {
        this.cartUpdateUnsubscriber();
      }

      // Add new subscription with debouncing
      this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
        if (event.source === 'cart-items') return;
        this.updateManager.queueUpdate(() => this.onCartUpdate());
      });

      // Initialize variant handlers once
      this.initializeVariantHandlers();
    }

    disconnectedCallback() {
      if (this.cartUpdateUnsubscriber) {
        this.cartUpdateUnsubscriber();
      }
      // Clean up variant handlers
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

        // Call calculate discount only once
        await this.updateManager.queueUpdate(() => calculateDiscount());
        
        // Initialize variant handlers after update
        this.initializeVariantHandlers();
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
      console.log('updateQuantity called with:', { line, quantity, name, variantId });
      
      await this.updateManager.queueUpdate(async () => {
        console.log('Starting update process for line:', line);
        this.enableLoading(line);
        
        try {
          const sections = this.getSectionsToRender().map((section) => section.section);
          console.log('Sections to render:', sections);
          
          const body = JSON.stringify({
            line,
            quantity,
            sections,
            sections_url: window.location.pathname,
          });
          console.log('Request body:', body);
  
          const response = await fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } });
          console.log('Response status:', response.status);
          
          const state = await response.json();
          console.log('Response state:', state);
  
          await this.handleQuantityUpdateResponse(state, line, name, variantId);
        } catch (error) {
          console.error('Error in updateQuantity:', error);
          this.handleQuantityUpdateError(line);
        } finally {
          this.disableLoading(line);
          console.log('Update process completed');
        }
      });
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

// Replace your current CartRemoveButton with this debugged version
if (!customElements.get('cart-remove-button')) {
  class CartRemoveButton extends HTMLElement {
    constructor() {
      super();
      console.log('CartRemoveButton initialized');

      const handleRemove = (event) => {
        console.log('Remove button clicked');
        console.log('Event target:', event.target);
        console.log('Button data-index:', this.dataset.index);
        
        event.preventDefault();
        event.stopPropagation();

        const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
        console.log('Found cartItems:', cartItems);
        console.log('CartItems tagName:', cartItems?.tagName);
        
        if (!cartItems) {
          console.error('No cart-items found');
          return;
        }

        const line = this.dataset.index;
        console.log('Line to remove:', line);
        
        if (!line) {
          console.error('No line index found');
          return;
        }

        console.log('Calling updateQuantity with line:', line);
        try {
          cartItems.updateQuantity(line, 0);
        } catch (error) {
          console.error('Error in updateQuantity:', error);
        }
      };

      // Listen for clicks on both the component and button
      this.addEventListener('click', (event) => {
        console.log('Outer component clicked');
        handleRemove(event);
      });

      const button = this.querySelector('button');
      if (button) {
        console.log('Inner button found');
        button.addEventListener('click', (event) => {
          console.log('Inner button clicked');
          event.preventDefault();
          event.stopPropagation();
          handleRemove(event);
        });
      } else {
        console.log('No inner button found');
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