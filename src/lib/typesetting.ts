// ============================================================
// Basic Typesetting Engine
// Canvas-based text layout with CJK/Latin line-breaking
// ============================================================

export interface TypesettingOptions {
  fontFamily: string;
  fontSize: number;
  maxWidth: number;
  maxHeight: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  direction: 'horizontal' | 'vertical';
  color: string;
  bold: boolean;
  italic: boolean;
}

export function computeTextLayout(text: string, options: TypesettingOptions): Array<{ text: string; x: number; y: number; width: number }> {
  // Simple line-breaking: split by characters (for CJK) or words (for Latin)
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
  const chars = isCJK ? text.split('') : text.split(/\s+/);

  const lines: string[] = [];
  let currentLine = '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${options.bold ? 'bold ' : ''}${options.italic ? 'italic ' : ''}${options.fontSize}px ${options.fontFamily}`;

  for (const char of chars) {
    const testLine = currentLine + (isCJK ? char : ' ' + char);
    const metrics = ctx.measureText(testLine);
    if (metrics.width > options.maxWidth && currentLine) {
      lines.push(currentLine.trim());
      currentLine = isCJK ? char : char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const results: Array<{ text: string; x: number; y: number; width: number }> = [];
  const totalHeight = lines.length * options.lineHeight * options.fontSize;
  const startY = options.alignment === 'center' ? (options.maxHeight - totalHeight) / 2 : 0;

  for (let i = 0; i < lines.length; i++) {
    const metrics = ctx.measureText(lines[i]);
    const x = options.alignment === 'center' ? (options.maxWidth - metrics.width) / 2 : options.alignment === 'right' ? options.maxWidth - metrics.width : 0;
    results.push({ text: lines[i], x, y: startY + i * options.lineHeight * options.fontSize, width: metrics.width });
  }

  return results;
}
