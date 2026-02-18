import type { Asset } from '@/types';
import { displayPath } from './paths';

export function generateManifestJSON(
  assets: Asset[],
  projectName: string,
  subjectName: string,
  filterInfo: { picked_up?: string; package?: string }
) {
  return {
    project: projectName,
    subject: subjectName,
    exported_at: new Date().toISOString(),
    filter: { picked_up: filterInfo.picked_up ?? 'all', package: filterInfo.package ?? 'all' },
    asset_count: assets.length,
    assets: assets.map(a => ({
      filename: a.filename,
      disk_path: displayPath(a.disk_path),
      proxy_path: a.proxy_path ? displayPath(a.proxy_path) : null,
      width: a.width,
      height: a.height,
      codec: a.codec,
      duration_seconds: a.duration_seconds,
      tags: a.tags,
      picked_up: a.picked_up,
    })),
  };
}

export function generateCSV(assets: Asset[]): string {
  const header = 'filename,disk_path,proxy_path,width,height,codec,duration_seconds,tags,picked_up';
  const rows = assets.map(a => {
    const tags = `"${a.tags.join(', ')}"`;
    return [a.filename, displayPath(a.disk_path), a.proxy_path ? displayPath(a.proxy_path) : '', a.width ?? '', a.height ?? '', a.codec ?? '', a.duration_seconds ?? '', tags, a.picked_up].join(',');
  });
  return [header, ...rows].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function copyPathsToClipboard(assets: Asset[]): string {
  const paths = assets.map(a => displayPath(a.disk_path)).join('\n');
  navigator.clipboard.writeText(paths);
  return paths;
}
