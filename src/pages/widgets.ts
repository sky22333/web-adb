import { html, nothing, TemplateResult } from 'lit';
import type { ConnectionStatus } from '../core/state/app-store';

export function pageHead(title: string, desc: string, actions: unknown = nothing): TemplateResult {
  return html`<div class="page-head">
    <div><h1>${title}</h1><p>${desc}</p></div>
    <div class="page-actions">${actions}</div>
  </div>`;
}

export function metric(label: string, value: string): TemplateResult {
  return html`<div class="metric"><span>${label}</span><strong class="mono">${value}</strong></div>`;
}

export function empty(text: string): TemplateResult {
  return html`<div class="empty">${text}</div>`;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: '未连接',
  connecting: '连接中',
  connected: '已连接',
  disconnecting: '断开中',
  error: '异常',
};

export function statusLabel(status: ConnectionStatus): string {
  return STATUS_LABELS[status] ?? status;
}
