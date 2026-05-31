import { LitElement } from 'lit';
import { state } from 'lit/decorators.js';
import { AppState, appStore } from '../core/state/app-store';
import { sharedStyles } from '../styles/shared';

export abstract class StorePage extends LitElement {
  static styles = sharedStyles;
  @state() protected app: AppState = appStore.state;

  private onStoreChange = () => {
    this.app = appStore.state;
  };

  connectedCallback(): void {
    super.connectedCallback();
    appStore.addEventListener('change', this.onStoreChange);
  }

  disconnectedCallback(): void {
    appStore.removeEventListener('change', this.onStoreChange);
    super.disconnectedCallback();
  }
}
