import { css } from 'lit';

export const sharedStyles = css`
  * {
    box-sizing: border-box;
  }
  :host {
    display: block;
    font-size: 14px;
    line-height: 1.45;
    font-family: var(--app-font);
    color: var(--md-sys-color-on-surface);
  }
  button,
  input,
  select,
  textarea {
    color: inherit;
    font: inherit;
  }
  .mono {
    font-family: var(--app-mono);
  }
  md-filled-button,
  md-outlined-button {
    --md-filled-button-container-height: 36px;
    --md-outlined-button-container-height: 36px;
    --md-filled-button-container-shape: 12px;
    --md-outlined-button-container-shape: 12px;
    --md-filled-button-label-text-weight: 760;
    --md-outlined-button-label-text-weight: 760;
    --md-outlined-button-label-text-color: var(--md-sys-color-primary);
    --md-outlined-button-outline-color: var(--md-sys-color-outline-variant);
  }
  md-outlined-text-field,
  md-outlined-select {
    --md-outlined-text-field-container-height: 44px;
    --md-outlined-select-text-field-container-height: 44px;
    --md-outlined-text-field-container-shape: 12px;
    --md-outlined-select-text-field-container-shape: 12px;
    --md-outlined-text-field-focus-outline-color: var(--md-sys-color-primary);
    --md-outlined-select-text-field-focus-outline-color: var(--md-sys-color-primary);
    --md-outlined-text-field-input-text-color: var(--md-sys-color-on-surface);
    --md-outlined-text-field-label-text-color: var(--md-sys-color-outline);
    --md-outlined-select-text-field-input-text-color: var(--md-sys-color-on-surface);
    --md-outlined-select-text-field-label-text-color: var(--md-sys-color-outline);
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--app-gap);
    width: min(1180px, 100%);
    margin: 0 auto 82px;
    animation: enter var(--app-duration) var(--app-easing);
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  h1 {
    margin: 0;
    font-size: clamp(22px, 2.6vw, 30px);
  }
  .page-head p {
    max-width: 760px;
    margin: 6px 0 0;
    line-height: 1.6;
    font-size: 13px;
    color: var(--md-sys-color-outline);
  }
  .page-actions,
  .toolbar,
  .actions,
  .chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  .toolbar md-outlined-text-field {
    flex: 1 1 280px;
  }
  .toolbar md-outlined-select {
    flex: 0 1 190px;
    min-width: 160px;
  }
  .grid {
    display: grid;
    gap: 12px;
  }
  .two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .metric {
    border: 0;
    border-radius: 16px;
    min-height: 78px;
    padding: 14px;
    background: var(--app-row-bg);
  }
  .metric span {
    display: block;
    color: var(--md-sys-color-outline);
    font-size: 12px;
    margin-bottom: 6px;
  }
  .metric strong {
    font-size: 16px;
    overflow-wrap: anywhere;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card-title {
    font-weight: 750;
    font-size: 14px;
    color: var(--md-sys-color-on-surface);
  }
  .log-panel {
    overflow: auto;
    min-height: 190px;
    margin: 0;
    padding: 12px;
    border-radius: 14px;
    color: var(--app-log-fg);
    background: var(--app-log-bg);
    border: 1px solid var(--app-log-border);
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--app-mono);
    font-size: 12px;
    line-height: 1.55;
  }
  .log-panel.tall {
    min-height: 360px;
  }
  .log-lines {
    display: flex;
    flex-direction: column;
  }
  .log-lines .ln {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .log-lines .err {
    color: var(--md-sys-color-error);
  }
  .log-lines .warn {
    color: var(--app-warning);
  }
  .log-lines .ok {
    color: var(--app-success);
  }
  .log-lines .info {
    color: var(--app-log-fg);
  }
  .table,
  .queue,
  .vid-list {
    display: grid;
    gap: 10px;
  }
  .table-row,
  .queue-row,
  .vid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: 14px;
    color: var(--md-sys-color-on-surface);
    background: var(--app-row-bg);
  }
  .table-row > div,
  .queue-row > div {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .table-row button,
  .queue-row button,
  .vid button {
    border: 0;
    border-radius: 12px;
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    min-height: 32px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .file {
    grid-template-columns: minmax(200px, 1fr) 92px 132px 132px;
  }
  .file-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .queue-row {
    grid-template-columns: minmax(200px, 1fr) 170px 76px auto auto;
  }
  .queue-row input {
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 12px;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
  }
  .queue-row b {
    justify-self: center;
    color: var(--md-sys-color-outline);
    font-size: 12px;
    font-weight: 700;
  }
  .queue-row small {
    display: block;
    margin-top: 2px;
  }
  .queue-row.done b {
    color: var(--app-success);
  }
  .queue-row.failed b {
    color: var(--md-sys-color-error);
  }
  .vid {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .danger-text {
    color: var(--md-sys-color-error) !important;
  }
  .danger-zone .card-title {
    color: var(--md-sys-color-error);
  }
  .chip {
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 999px;
    color: var(--md-sys-color-on-surface);
    background: var(--app-row-bg);
    min-height: 32px;
    padding: 6px 11px;
    font-size: 13px;
    cursor: pointer;
    transition:
      transform var(--app-duration-fast) var(--app-easing),
      background var(--app-duration);
  }
  .chip.danger {
    color: var(--md-sys-color-error);
  }
  .chip:active {
    transform: scale(0.96);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .key-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .key {
    min-height: 38px;
    border: 0;
    border-radius: 14px;
    background: var(--md-sys-color-secondary-container);
    color: var(--md-sys-color-on-secondary-container);
    cursor: pointer;
    transition: transform var(--app-duration-fast) var(--app-easing);
  }
  .key:active {
    transform: scale(0.96);
  }
  .screen-card {
    display: grid;
    min-height: 320px;
    place-items: center;
    border-radius: 16px;
    background: var(--app-log-bg);
  }
  .screen-card img {
    max-width: 100%;
    max-height: 70vh;
    border-radius: 12px;
  }
  .empty {
    display: grid;
    min-height: 84px;
    place-items: center;
    gap: 6px;
    border-radius: 16px;
    color: var(--md-sys-color-outline);
    background: var(--app-row-bg);
    text-align: center;
  }
  .full {
    width: 100%;
  }
  .field-stack {
    display: grid;
    gap: 16px;
  }
  label {
    color: var(--md-sys-color-on-surface);
  }
  :focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
  @media (max-width: 1040px) {
    .two,
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .page-head,
    .toolbar,
    .page-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .toolbar md-outlined-text-field,
    .toolbar md-outlined-select {
      flex-basis: auto;
      width: 100%;
    }
    .table-row,
    .queue-row,
    .file {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 10px;
    }
    .table-row > div,
    .queue-row > div {
      justify-content: flex-start;
    }
    .queue-row input {
      width: 100%;
    }
    .key-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .metric-grid,
    .two {
      grid-template-columns: 1fr;
    }
    .log-panel {
      min-height: 240px;
    }
    .log-panel.tall {
      min-height: 300px;
    }
  }
`;
