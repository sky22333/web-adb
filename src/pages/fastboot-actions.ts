import { fastbootClient } from '../core/fastboot/fastboot-client';
import { normalizeFastbootCommand } from '../core/fastboot/fastboot-protocol';
import { appStore } from '../core/state/app-store';
import { confirmDialog } from '../core/ui/feedback';

const DANGEROUS = /^(erase|flashing|oem unlock|oem lock)/i;

export async function executeFastboot(command: string): Promise<{ normalized: string; result: string } | null> {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (DANGEROUS.test(trimmed)) {
    const ok = await confirmDialog({ message: `确认执行危险 Fastboot 命令？\n${trimmed}`, danger: true });
    if (!ok) return null;
  }
  const normalized = normalizeFastbootCommand(trimmed);
  const task = appStore.task(`Fastboot：${trimmed}`);
  try {
    const result = await fastbootClient.command(normalized);
    task.done('Fastboot 命令完成');
    appStore.log(`Fastboot: ${trimmed}`, 'ok');
    return { normalized, result };
  } catch (error) {
    task.fail('Fastboot 命令失败');
    throw error;
  }
}
