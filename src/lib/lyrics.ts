// ============================================================
// 歌词解析模块 — 支持 .lrc 格式
// ============================================================

export interface LyricLine {
  time: number;   // 毫秒
  text: string;
}

/**
 * 解析 LRC 歌词文本
 * 格式: [mm:ss.xx] 歌词文本
 */
export function parseLRC(content: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/;

  const rawLines = content.split(/\r?\n/);
  for (const raw of rawLines) {
    const match = raw.match(regex);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({
      time: minutes * 60000 + seconds * 1000 + ms,
      text,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 根据当前播放时间获取应显示的歌词行索引
 */
export function getCurrentLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) return i;
  }
  return -1;
}

/**
 * 读取文件内容为文本
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
