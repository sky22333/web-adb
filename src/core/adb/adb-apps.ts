import { runShellText } from './adb-shell';
import { adbClient } from './adb-client';
import { PackageManager } from '@yume-chan/android-bin';
import { WrapReadableStream } from '@yume-chan/stream-extra';
import { shellQuote } from '../utils/shell-quote';

export async function listPackages(type: string, filter = ''): Promise<string[]> {
  const arg = type === 'all' ? '' : `-${type}`;
  const output = await runShellText(`pm list packages ${arg}`);
  const keyword = filter.trim().toLowerCase();
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean)
    .filter((name) => !keyword || name.toLowerCase().includes(keyword));
}

export async function packageAction(
  action: 'open' | 'stop' | 'clear' | 'uninstall' | 'disable' | 'enable',
  packageName: string,
): Promise<string> {
  const commands = {
    open: `monkey -p ${shellQuote(packageName)} -c android.intent.category.LAUNCHER 1`,
    stop: `am force-stop ${shellQuote(packageName)}`,
    clear: `pm clear ${shellQuote(packageName)}`,
    uninstall: `pm uninstall ${shellQuote(packageName)}`,
    disable: `pm disable-user ${shellQuote(packageName)}`,
    enable: `pm enable ${shellQuote(packageName)}`,
  };
  return runShellText(commands[action]);
}

export async function packageDetail(packageName: string): Promise<string> {
  return runShellText(
    [
      `echo PACKAGE=${shellQuote(packageName)}`,
      `dumpsys package ${shellQuote(packageName)} | sed -n '1,120p'`,
      `echo`,
      `echo APK_PATHS:`,
      `pm path ${shellQuote(packageName)}`,
    ].join('; '),
  );
}

export async function packageApkPaths(packageName: string): Promise<string[]> {
  const output = await runShellText(`pm path ${shellQuote(packageName)}`);
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
}

export async function installApk(
  file: File,
  args: string[],
  onProgress?: (percent: number, label: string) => void,
): Promise<void> {
  const adb = adbClient.ensure();
  const pm = new PackageManager(adb);
  onProgress?.(8, '准备安装会话');
  await pm.installStream(file.size, new WrapReadableStream(file.stream() as any), {
    grantRuntimePermissions: args.includes('-g'),
  });
  onProgress?.(100, '安装完成');
}
