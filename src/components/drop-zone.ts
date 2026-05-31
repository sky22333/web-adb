import { LitElement, css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

@customElement('drop-zone')
export class DropZone extends LitElement {
  @property() heading = '选择或拖拽文件';
  @property() hint = '';
  @property() accept = '';
  @property({ type: Boolean }) multiple = false;
  @state() private over = false;
  @query('input') private input!: HTMLInputElement;

  static styles = css`
    :host {
      display: block;
    }
    label {
      min-height: 104px;
      display: grid;
      place-items: center;
      gap: 6px;
      padding: 16px;
      border: 1px dashed var(--md-sys-color-outline-variant);
      border-radius: 16px;
      color: var(--md-sys-color-on-surface);
      background: var(--app-row-bg, var(--md-sys-color-surface-container-low));
      cursor: pointer;
      text-align: center;
      transition:
        transform var(--app-duration-fast) var(--app-easing),
        background var(--app-duration) var(--app-easing),
        border-color var(--app-duration) var(--app-easing);
    }
    label:hover,
    label.over {
      border-color: var(--md-sys-color-primary);
      background: var(--md-sys-color-surface-container);
    }
    label.over {
      transform: scale(1.01);
    }
    span.hint {
      color: var(--md-sys-color-outline);
      font-size: 13px;
    }
    input {
      display: none;
    }
  `;

  render() {
    return html`
      <label
        class=${this.over ? 'over' : ''}
        @dragover=${this.onDragOver}
        @dragleave=${this.onDragLeave}
        @drop=${this.onDrop}
      >
        <input type="file" accept=${this.accept} ?multiple=${this.multiple} @change=${this.onChange} />
        <strong>${this.heading}</strong>
        ${this.hint ? html`<span class="hint">${this.hint}</span>` : ''}
      </label>
    `;
  }

  private onChange = (event: Event) => {
    this.emit(Array.from((event.target as HTMLInputElement).files ?? []));
    this.input.value = '';
  };

  private onDragOver = (event: DragEvent) => {
    event.preventDefault();
    this.over = true;
  };

  private onDragLeave = () => {
    this.over = false;
  };

  private onDrop = (event: DragEvent) => {
    event.preventDefault();
    this.over = false;
    this.emit(Array.from(event.dataTransfer?.files ?? []));
  };

  private emit(files: File[]): void {
    if (!files.length) return;
    this.dispatchEvent(new CustomEvent<File[]>('files', { detail: this.multiple ? files : files.slice(0, 1) }));
  }
}
