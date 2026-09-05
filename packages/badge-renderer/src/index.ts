export type BadgeStyle = 'flat' | 'flat-square' | 'for-the-badge';

export interface BadgeOptions {
  label: string;
  count: number;
  style: BadgeStyle;
  color: string;
  labelColor: string;
  compact: boolean;
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character);
}

export function formatCount(value: number, compact = false): string {
  const count = Math.max(0, Math.floor(value));
  if (!compact) return count.toLocaleString('en-US');
  if (count < 1_000) return String(count);
  const units: Array<[number, string]> = [[1_000_000_000, 'B'], [1_000_000, 'M'], [1_000, 'K']];
  const [divisor, suffix] = units.find(([threshold]) => count >= threshold) ?? units[2]!;
  return `${Number((count / divisor).toPrecision(3))}${suffix}`;
}

export function textWidth(text: string, style: BadgeStyle): number {
  const fontSize = style === 'for-the-badge' ? 11 : 11;
  const letterSpacing = style === 'for-the-badge' ? 1 : 0;
  return Math.ceil([...text].reduce((width, char) => width + (/\s/.test(char) ? 3.5 : /[MW@#%]/.test(char) ? 8 : /[ilI1.,]/.test(char) ? 3.5 : 6.2), 0) + Math.max(0, text.length - 1) * letterSpacing + fontSize);
}

export function renderBadge(options: BadgeOptions): string {
  const label = options.style === 'for-the-badge' ? options.label.toUpperCase() : options.label;
  const value = formatCount(options.count, options.compact);
  const leftWidth = textWidth(label, options.style);
  const rightWidth = textWidth(value, options.style);
  const width = leftWidth + rightWidth;
  const height = options.style === 'for-the-badge' ? 28 : 20;
  const radius = options.style === 'flat-square' ? 0 : 3;
  const baseline = options.style === 'for-the-badge' ? 18 : 14;
  const fontWeight = options.style === 'for-the-badge' ? 700 : 600;
  const safeLabel = escapeXml(label);
  const safeValue = escapeXml(value);
  const safeLabelColor = escapeXml(options.labelColor);
  const safeColor = escapeXml(options.color);
  const title = `${safeLabel}: ${safeValue}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${title}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient>
  <clipPath id="r"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
  <g clip-path="url(#r)"><rect width="${leftWidth}" height="${height}" fill="#${safeLabelColor}"/><rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="#${safeColor}"/><rect width="${width}" height="${height}" fill="url(#s)"/></g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" font-weight="${fontWeight}">
    <text x="${leftWidth / 2}" y="${baseline}" fill="#010101" fill-opacity=".3">${safeLabel}</text><text x="${leftWidth / 2}" y="${baseline - 1}">${safeLabel}</text>
    <text x="${leftWidth + rightWidth / 2}" y="${baseline}" fill="#010101" fill-opacity=".3">${safeValue}</text><text x="${leftWidth + rightWidth / 2}" y="${baseline - 1}">${safeValue}</text>
  </g>
</svg>`;
}
