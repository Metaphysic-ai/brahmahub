function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getTagColor(tag: string): { bg: string; text: string } {
  const hue = hashString(tag) % 360;
  return {
    bg: `hsl(${hue}, 40%, 20%)`,
    text: `hsl(${hue}, 60%, 75%)`,
  };
}

export function getPackageColor(packageId: string): { border: string } {
  const hue = hashString(packageId) % 360;
  return {
    border: `hsl(${hue}, 45%, 40%)`,
  };
}
