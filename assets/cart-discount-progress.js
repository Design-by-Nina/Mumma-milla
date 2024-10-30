(function() {
    class ProgressBarManager {
        constructor() {
            this.wrapper = document.querySelector('.cart-discount__wrapper');
            this.threshold = window.freeShippingThreshold || 0;
            this.currentWidth = null;
            this.progressBar = this.wrapper?.querySelector('.cart-discountThreshold__progress');
            this.bindEvents();
        }

        bindEvents() {
            // Cart update events
            document.addEventListener('cart:updated', () => this.handleCartEvent('cart:updated'));
            document.addEventListener('cart:refresh', () => this.handleCartEvent('cart:refresh'));
            
            // Quantity change events
            document.body.addEventListener('change', (event) => {
                if (event.target.matches('[name^="updates["]')) {
                    console.log('Quantity change detected');
                    this.handleCartEvent('quantity-change');
                }
            });

            // Remove button events
            document.body.addEventListener('click', (event) => {
                if (event.target.matches('cart-remove-button, .cart-remove-button')) {
                    console.log('Remove button clicked');
                    this.handleCartEvent('item-removed');
                }
            });
        }

        async handleCartEvent(eventType) {
            console.log(`Handling cart event: ${eventType}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.refreshProgress();
        }

        async refreshProgress() {
            try {
                const cartData = await this.getLatestCartData();
                if (cartData) {
                    console.log('Cart data fetched:', cartData);
                    await this.updateProgress(cartData.total_price);
                }
            } catch (error) {
                console.error('Error refreshing progress:', error);
            }
        }

        async getLatestCartData() {
            try {
                const response = await fetch('/cart.js');
                const data = await response.json();
                console.log('Latest cart data:', data);
                return data;
            } catch (error) {
                console.error('Error fetching cart data:', error);
                return null;
            }
        }

        async updateProgress(cartTotal) {
            if (!this.wrapper || !this.progressBar) {
                console.log('Missing wrapper or progress bar elements');
                return;
            }

            try {
                console.log('Updating progress bar with cart total:', cartTotal);

                this.wrapper.style.display = cartTotal === 0 ? 'none' : 'block';

                if (cartTotal > 0) {
                    const percentage = Math.min((cartTotal / this.threshold) * 100, 100);
                    const width = `${percentage}%`;
                    
                    console.log(`Setting progress width to: ${width}`);
                    this.progressBar.style.width = width;
                    this.currentWidth = width;
                    console.log(this.progressBar)
                }
            } catch (error) {
                console.error('Error updating progress bar:', error);
            }
        }
    }

    class CartDiscountManager {
        constructor() {
            this.isProcessing = false;
            this.progressBar = new ProgressBarManager();
        }

        async initializeCartListeners() {
            console.log('Initializing cart listeners');
            await this.handleCartUpdate();
        }

        async getLatestCartData() {
            try {
                const response = await fetch('/cart.js');
                const cartData = await response.json();
                console.log('Latest cart data:', cartData);
                return cartData;
            } catch (error) {
                console.error('Error fetching cart data:', error);
                throw error;
            }
        }

        async handleCartUpdate() {
            if (this.isProcessing) {
                console.log('Already processing cart update, skipping');
                return;
            }
            
            console.log('Starting cart update process');
            this.isProcessing = true;
            
            try {
                const cartData = await this.getLatestCartData();
                const cartTotal = cartData.total_price;
                
                console.log('Current cart total:', cartTotal);

                const discountItems = document.querySelectorAll('.cart_discount__item');
                const updates = [];

                for (const item of discountItems) {
                    const threshold = parseFloat(item.dataset.price) * 100;
                    const variantId = parseInt(item.dataset.id);
                    const existingItem = cartData.items.find(i => i.variant_id === variantId);

                    if (cartTotal >= threshold && !existingItem) {
                        console.log(`Adding item ${variantId} to cart`);
                        updates.push({ id: variantId, quantity: 1 });
                        item.classList.add('active_discount');
                    } else if (cartTotal < threshold && existingItem) {
                        console.log(`Removing item ${variantId} from cart`);
                        updates.push({ id: variantId, quantity: 0 });
                        item.classList.remove('active_discount');
                    }
                }

                if (updates.length > 0) {
                    await this.updateCart(updates);
                }

                await this.progressBar.refreshProgress();

            } catch (error) {
                console.error('Error handling cart update:', error);
            } finally {
                this.isProcessing = false;
                console.log('Cart update process completed');
            }
        }

        async updateCart(updates) {
            for (const update of updates) {
                try {
                    if (update.quantity > 0) {
                        const response = await fetch('/cart/add.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                items: [{ id: update.id, quantity: update.quantity }]
                            })
                        });

                        if (!response.ok) throw new Error('Cart add failed');
                    } else {
                        const response = await fetch('/cart/change.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: update.id,
                                quantity: 0
                            })
                        });

                        if (!response.ok) throw new Error('Cart remove failed');
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (error) {
                    console.error('Error updating cart:', error);
                }
            }
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Initializing cart discount system');
        window.cartManager = new CartDiscountManager();
        window.cartManager.initializeCartListeners();
    });

    // Set up global cart update listener
    document.addEventListener('change', async (event) => {
        if (event.target.matches('[name^="updates["]')) {
            console.log('Cart quantity changed');
            await window.cartManager?.handleCartUpdate();
        }
    });

    // Listen for cart removals
    document.addEventListener('click', async (event) => {
        if (event.target.matches('cart-remove-button, .cart-remove-button')) {
            console.log('Cart item removal detected');
            await window.cartManager?.handleCartUpdate();
        }
    });
})();