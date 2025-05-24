// excalidraw-wrapper.js
import { Excalidraw } from "@excalidraw/excalidraw";
import React from "react";
import { createRoot } from "react-dom/client";

class ExcalidrawElement extends HTMLElement {
  constructor() {
    super();
    this.root = null;
  }

  // Called when the element is added to the DOM
  connectedCallback() {
    // Create a React root inside this custom element
    this.root = createRoot(this);
    
    // Render the Excalidraw React component
    this.root.render(React.createElement(Excalidraw, {
      // Convert HTML attributes to React props
      initialData: this.getAttribute('initial-data') ? 
        JSON.parse(this.getAttribute('initial-data')) : undefined,
      
      // Handle Excalidraw events and convert them to DOM events
      onChange: (elements, appState) => {
        // Dispatch a custom DOM event that Vue can listen to
        this.dispatchEvent(new CustomEvent('excalidraw-change', {
          detail: { elements, appState },
          bubbles: true
        }));
      },
      
      onPointerUpdate: (payload) => {
        this.dispatchEvent(new CustomEvent('excalidraw-pointer-update', {
          detail: payload,
          bubbles: true
        }));
      }
    }));
  }

  // Called when the element is removed from the DOM
  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
    }
  }

  // Called when attributes change
  attributeChangedCallback(name, oldValue, newValue) {
    if (this.root && oldValue !== newValue) {
      // Re-render with new props when attributes change
      this.connectedCallback();
    }
  }

  // Define which attributes to watch
  static get observedAttributes() {
    return ['initial-data', 'theme'];
  }
}

// Register the custom element with the browser
customElements.define('excalidraw-element', ExcalidrawElement);