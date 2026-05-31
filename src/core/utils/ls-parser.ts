import { joinPath } from './path';

export interface RemoteFile {
  typeChar: string;
  isDir: boolean;
  size: number;
  time: string;
  name: string;
  path: string;
}

export function parseLsOutput(output: string, currentPath = '/sdcard/'): RemoteFile[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('total '))
    .map((line) => {
      const parsed = parseLsLine(line);
      if (!parsed) return null;
      const name = parsed.name.replace(/ -> .+$/, '');
      if (name === '.' || name === '..') return null;
      return {
        typeChar: parsed.typeChar,
        isDir: parsed.typeChar === 'd',
        size: parsed.size,
        time: parsed.time,
        name,
        path: joinPath(currentPath, name),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b!.isDir) - Number(a!.isDir) || a!.name.localeCompare(b!.name)) as RemoteFile[];
}

function parseLsLine(line: string): Pick<RemoteFile, 'typeChar' | 'size' | 'time' | 'name'> | null {
  const tokens = line.split(/\s+/);
  if (tokens.length < 7 || !/^[-dlbcps][rwxstST-]{9}/.test(tokens[0])) return null;
  const sizeIndex = tokens.findIndex((token, index) => index >= 3 && /^\d+$/.test(token));
  if (sizeIndex < 0 || tokens.length <= sizeIndex + 2) return null;

  const typeChar = tokens[0][0];
  const size = Number(tokens[sizeIndex]);
  const remaining = tokens.slice(sizeIndex + 1);
  const timeTokenCount = /^\d{4}-\d{2}-\d{2}$/.test(remaining[0]) ? 2 : 3;
  if (remaining.length <= timeTokenCount) return null;

  return {
    typeChar,
    size,
    time: remaining.slice(0, timeTokenCount).join(' '),
    name: remaining.slice(timeTokenCount).join(' '),
  };
}
