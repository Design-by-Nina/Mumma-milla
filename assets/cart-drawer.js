// cart-drawer.js

// Remove CartUpdateManager and CartManager definitions since they're in cart-utilities.js

if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.form.querySelector('[name=id]').disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      async onSubmitHandler(evt) {
        evt.preventDefault();
        
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();
        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        try {
          const formData = new FormData(this.form);
          if (this.cart) {
            formData.append(
              'sections',
              this.cart.getSectionsToRender().map((section) => section.id)
            );
            formData.append('sections_url', window.location.pathname);
            this.cart.setActiveElement(document.activeElement);
          }

          const config = {
            ...fetchConfig('javascript'),
            body: formData
          };
          delete config.headers['Content-Type'];
          
          const response = await fetch(`${routes.cart_add_url}`, config);
          const responseData = await response.json();

          if (responseData.status) {
            this.handleErrorResponse(responseData, formData);
            return;
          }

          if (!this.cart) {
            window.location = window.routes.cart_url;
            return;
          }

          await this.handleSuccessResponse(responseData, formData);

        } catch (error) {
          console.error('Error submitting form:', error);
        } finally {
          this.submitButton.classList.remove('loading');
          if (this.cart?.classList.contains('is-empty')) {
            this.cart.classList.remove('is-empty');
          }
          if (!this.error) {
            this.submitButton.removeAttribute('aria-disabled');
          }
          this.querySelector('.loading__spinner').classList.add('hidden');
          
          // Use CartManager to update variants
          await CartManager.updateManager.queueUpdate(() => {
            CartManager.initializeProductForms();
          });
        }
      }

      async handleSuccessResponse(response, formData) {
        if (!this.error) {
          publish(PUB_SUB_EVENTS.cartUpdate, {
            source: 'product-form',
            productVariantId: formData.get('id'),
            cartData: response
          });
        }
        
        this.error = false;
        const quickAddModal = this.closest('quick-add-modal');
        
        if (quickAddModal) {
          document.body.addEventListener('modalClosed', () => {
            setTimeout(() => {
              this.cart.renderContents(response);
            });
          }, { once: true });
          quickAddModal.hide(true);
        } else {
          await this.cart.renderContents(response);
        }
      }

      handleErrorResponse(response, formData) {
        publish(PUB_SUB_EVENTS.cartError, {
          source: 'product-form',
          productVariantId: formData.get('id'),
          errors: response.errors || response.description,
          message: response.message,
        });
        
        this.handleErrorMessage(response.description);

        const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
        if (!soldOutMessage) return;
        
        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.querySelector('span').classList.add('hidden');
        soldOutMessage.classList.remove('hidden');
        this.error = true;
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper = this.errorMessageWrapper || 
          this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        
        this.errorMessage = this.errorMessage || 
          this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);
        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }
    }
  );
}

if (!customElements.get('cart-drawer')) {
  customElements.define('cart-drawer', class CartDrawer extends HTMLElement {
    constructor() {
      super();
      this.bindEvents();
    }

    bindEvents() {
      this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
      this.querySelector('#CartDrawer-Overlay')?.addEventListener('click', this.close.bind(this));
      this.setHeaderCartIconAccessibility();
    }

    setHeaderCartIconAccessibility() {
      const cartLink = document.querySelector('#cart-icon-bubble');
      if (!cartLink) return;
      
      cartLink.setAttribute('role', 'button');
      cartLink.setAttribute('aria-haspopup', 'dialog');
      cartLink.addEventListener('click', (event) => {
        event.preventDefault();
        this.open(cartLink);
      });
      cartLink.addEventListener('keydown', (event) => {
        if (event.code.toUpperCase() === 'SPACE') {
          event.preventDefault();
          this.open(cartLink);
        }
      });
    }

    open(triggeredBy) {
      if (triggeredBy) this.setActiveElement(triggeredBy);
      const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
      if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) {
        this.setSummaryAccessibility(cartDrawerNote);
      }
      
      setTimeout(() => {
        this.classList.add('animate', 'active');
      });

      this.addEventListener('transitionend', () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      }, { once: true });

      document.body.classList.add('overflow-hidden');
    }

    close() {
      this.classList.remove('active');
      removeTrapFocus(this.activeElement);
      document.body.classList.remove('overflow-hidden');
    }

    setSummaryAccessibility(cartDrawerNote) {
      cartDrawerNote.setAttribute('role', 'button');
      cartDrawerNote.setAttribute('aria-expanded', 'false');

      if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
        cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
      }

      cartDrawerNote.addEventListener('click', (event) => {
        event.currentTarget.setAttribute('aria-expanded', 
          !event.currentTarget.closest('details').hasAttribute('open'));
      });

      cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
    }

    async renderContents(parsedState) {
      if (this.querySelector('.drawer__inner')?.classList.contains('is-empty')) {
        this.querySelector('.drawer__inner').classList.remove('is-empty');
      }
      
      this.productId = parsedState.id;
      
      try {
        await CartManager.updateManager.queueUpdate(async () => {
          this.getSectionsToRender().forEach((section) => {
            const sectionElement = section.selector
              ? document.querySelector(section.selector)
              : document.getElementById(section.id);
            if (sectionElement) {
              sectionElement.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.id],
                section.selector
              );
            }
          });

          this.querySelector('#CartDrawer-Overlay')?.addEventListener('click', this.close.bind(this));
          this.open();
          
          // Initialize product forms after render
          CartManager.initializeProductForms();
        });
      } catch (error) {
        console.error('Error rendering cart contents:', error);
      }
    }

    getSectionInnerHTML(html, selector = '.shopify-section') {
      return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
    }

    getSectionsToRender() {
      return [
        {
          id: 'cart-drawer',
          selector: '#CartDrawer',
        },
        {
          id: 'cart-icon-bubble',
        },
      ];
    }

    getSectionDOM(html, selector = '.shopify-section') {
      return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
    }

    setActiveElement(element) {
      this.activeElement = element;
    }
  });
}

if (!customElements.get('cart-drawer-items')) {
  customElements.define('cart-drawer-items', class CartDrawerItems extends CartItems {
    getSectionsToRender() {
      return [
        {
          id: 'CartDrawer',
          section: 'cart-drawer',
          selector: '.drawer__inner',
        },
        {
          id: 'cart-icon-bubble',
          section: 'cart-icon-bubble',
          selector: '.shopify-section',
        },
      ];
    }
  });
}