import { appStore } from '../state/app-store';
import { toAppError } from '../utils/errors';

export type ToastType = 'info' | 'ok' | 'warn' | 'err';

let toastHost: HTMLElement | null = null;

function ensureToastHost(): HTMLElement {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function notify(message: string, type: ToastType = 'info'): void {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener('click', remove);
  host.appendChild(el);
  setTimeout(remove, 3600);
}

export function reportError(error: unknown): void {
  const appError = toAppError(error);
  notify(appError.suggestion ? `${appError.message} ${appError.suggestion}` : appError.message, 'err');
  appStore.log(appError.detail ? `${appError.message}\n${appError.detail}` : appError.message, 'err');
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement('md-dialog') as unknown as HTMLDialogElement;

    const headline = document.createElement('div');
    headline.slot = 'headline';
    headline.textContent = options.title ?? '请确认操作';

    const content = document.createElement('div');
    content.slot = 'content';
    content.style.whiteSpace = 'pre-wrap';
    content.textContent = options.message;

    const actions = document.createElement('div');
    actions.slot = 'actions';

    const cancel = document.createElement('md-text-button');
    cancel.textContent = options.cancelLabel ?? '取消';
    cancel.addEventListener('click', () => dialog.close('cancel'));

    const confirmBtn = document.createElement('md-filled-button');
    confirmBtn.textContent = options.confirmLabel ?? '确认';
    if (options.danger) confirmBtn.setAttribute('data-danger', '');
    confirmBtn.addEventListener('click', () => dialog.close('ok'));

    actions.append(cancel, confirmBtn);
    dialog.append(headline, content, actions);
    dialog.addEventListener('closed', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });

    document.body.appendChild(dialog);
    dialog.show();
  });
}
