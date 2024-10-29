class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    
    // Wait for the component to be connected to the DOM
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.mainDetailsToggle = this.querySelector('details');
    
    // Add error handling for missing elements
    if (!this.mainDetailsToggle) {
      console.warn('DetailsDisclosure: No <details> element found');
      return;
    }

    const summary = this.mainDetailsToggle.querySelector('summary');
    if (!summary) {
      console.warn('DetailsDisclosure: No <summary> element found');
      return;
    }

    this.content = summary.nextElementSibling;
    if (!this.content) {
      console.warn('DetailsDisclosure: No content element found after <summary>');
      return;
    }

    // Only add event listeners if we have all required elements
    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.content) return;
    
    if (!this.animations) {
      this.animations = this.content.getAnimations();
    }

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach(animation => animation.play());
    } else {
      this.animations.forEach(animation => animation.cancel());
    }
  }

  close() {
    if (!this.mainDetailsToggle) return;
    
    this.mainDetailsToggle.removeAttribute('open');
    const summary = this.mainDetailsToggle.querySelector('summary');
    if (summary) {
      summary.setAttribute('aria-expanded', false);
    }
  }
}

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');
    
    if (!this.header) {
      console.warn('HeaderMenu: No .header-wrapper element found');
    }
  }

  onToggle() {
    if (!this.header || !this.mainDetailsToggle) return;
    
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    
    document.documentElement.style.setProperty(
      '--header-bottom-position-desktop',
      `${Math.floor(this.header.getBoundingClientRect().bottom)}px`
    );
  }
}

customElements.define('details-disclosure', DetailsDisclosure);
customElements.define('header-menu', HeaderMenu);