"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Music,
  Upload,
  FolderOpen,
  X,
  ChevronUp,
  EyeOff,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { parseLRC, getCurrentLyricIndex, readFileAsText, type LyricLine } from "@/lib/lyrics";

type PlayMode = "sequential" | "shuffle" | "repeat1";

interface Track {
  id: string;
  name: string;
  url: string;
  lyrics: LyricLine[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>("sequential");
  const [volume, setVolume] = useState(0.7);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lrcInputRef = useRef<HTMLInputElement>(null);

  const currentTrack = tracks[currentIndex] || null;
  const totalTracks = tracks.length;

  // 加载本地文件
  const loadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newTracks: Track[] = [];
    const lrcMap = new Map<string, string>(); // baseName → lrc content

    // 先收集歌词文件
    for (const file of fileArray) {
      if (file.name.endsWith(".lrc")) {
        const text = await readFileAsText(file);
        const baseName = file.name.replace(/\.lrc$/i, "");
        lrcMap.set(baseName, text);
      }
    }

    // 处理音频文件
    for (const file of fileArray) {
      if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a)$/i)) continue;

      const url = URL.createObjectURL(file);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      let lyrics: LyricLine[] = [];

      // 查找同名歌词
      const lrcContent = lrcMap.get(baseName) || lrcMap.get(file.name);
      if (lrcContent) {
        lyrics = parseLRC(lrcContent);
      }

      newTracks.push({
        id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        url,
        lyrics,
      });
    }

    if (newTracks.length > 0) {
      setTracks((prev) => [...prev, ...newTracks]);
      if (currentIndex < 0) setCurrentIndex(0);
    }
  }, [currentIndex]);

  // 加载歌词文件到当前歌曲
  const loadLyricsForCurrent = useCallback(async (file: File) => {
    if (!currentTrack) return;
    const text = await readFileAsText(file);
    const lyrics = parseLRC(text);
    setTracks((prev) =>
      prev.map((t, i) => (i === currentIndex ? { ...t, lyrics } : t))
    );
  }, [currentTrack, currentIndex]);

  // 播放/暂停
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentTrack]);

  // 切换歌曲
  const playIndex = useCallback((index: number) => {
    if (index < 0 || index >= tracks.length) return;
    setCurrentIndex(index);
    setIsPlaying(true);
  }, [tracks.length]);

  const next = useCallback(() => {
    if (tracks.length === 0) return;
    if (playMode === "shuffle") {
      const indices = tracks.map((_, i) => i).filter((i) => i !== currentIndex);
      if (indices.length === 0) return;
      playIndex(indices[Math.floor(Math.random() * indices.length)]);
    } else {
      playIndex((currentIndex + 1) % tracks.length);
    }
  }, [tracks, currentIndex, playMode, playIndex]);

  const prev = useCallback(() => {
    if (tracks.length === 0) return;
    if (currentTime > 3000) {
      audioRef.current!.currentTime = 0;
      return;
    }
    playIndex((currentIndex - 1 + tracks.length) % tracks.length);
  }, [tracks, currentIndex, currentTime, playIndex]);

  // 音频事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      if (playMode === "repeat1") {
        audio.currentTime = 0;
        audio.play();
      } else if (currentIndex < tracks.length - 1 || playMode === "sequential") {
        next();
      } else {
        setIsPlaying(false);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [currentIndex, playMode, tracks.length, next]);

  // 切换歌曲时自动播放
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = currentTrack.url;
    audio.volume = volume;
    audio.play().catch(() => setIsPlaying(false));
  }, [currentTrack, volume]);

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && e.ctrlKey) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  // 当前歌词
  const currentLyricIndex = currentTrack?.lyrics.length
    ? getCurrentLyricIndex(currentTrack.lyrics, currentTime * 1000)
    : -1;

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const ModeIcon =
    playMode === "shuffle" ? Shuffle :
    playMode === "repeat1" ? Repeat1 : Repeat;
  const modeColor =
    playMode === "sequential" ? "text-muted-foreground" : "text-primary";

  if (totalTracks === 0 && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border shadow-lg hover:shadow-xl transition-shadow"
        title="音乐播放器"
      >
        <Music className="w-5 h-5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <>
      <audio ref={audioRef} preload="auto" />

      {/* 浮动歌词 */}
      <AnimatePresence>
        {showLyrics && currentTrack && currentTrack.lyrics.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-1">
              {currentTrack.lyrics.map((line, i) => {
                const isCurrent = i === currentLyricIndex;
                const isNear = Math.abs(i - currentLyricIndex) <= 1;
                if (!isNear && !isCurrent) return null;
                return (
                  <motion.p
                    key={i}
                    animate={{
                      scale: isCurrent ? 1.2 : 0.9,
                      opacity: isCurrent ? 1 : isNear ? 0.5 : 0,
                      color: isCurrent ? "#ffffff" : "#888888",
                    }}
                    transition={{ duration: 0.3 }}
                    className="text-center font-bold drop-shadow-lg"
                    style={{
                      fontSize: isCurrent ? "28px" : "18px",
                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                    }}
                  >
                    {line.text}
                  </motion.p>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 播放器栏 */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-lg border-t border-border shadow-2xl",
          expanded ? "h-auto" : "h-16"
        )}
      >
        {/* 收起状态 — 迷你栏 */}
        {!expanded && (
          <div className="flex items-center h-full px-4 gap-3">
            <Music className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium truncate flex-1">
              {currentTrack?.name || "未选择歌曲"}
            </span>
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setExpanded(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 展开状态 */}
        {expanded && (
          <div className="px-4 py-3 max-md:px-2 max-md:py-2 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                音乐播放器 {totalTracks > 0 && `(${currentIndex + 1}/${totalTracks})`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowLyrics(!showLyrics)}
                  className={cn("p-1 rounded transition-colors", showLyrics ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                  title="浮动歌词"
                >
                  {showLyrics ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setExpanded(false)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 歌曲名 + 进度条 */}
            <div className="space-y-1">
              <p className="text-sm font-medium truncate">{currentTrack?.name || "拖拽音频文件到此处"}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (audioRef.current) audioRef.current.currentTime = t;
                    setCurrentTime(t);
                  }}
                  className="flex-1 h-1 accent-primary cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground w-8 tabular-nums">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPlayMode(playMode === "sequential" ? "shuffle" : playMode === "shuffle" ? "repeat1" : "sequential")}
                className={cn("p-1 rounded transition-colors", modeColor)}
                title={playMode === "sequential" ? "顺序" : playMode === "shuffle" ? "随机" : "单曲循环"}
              >
                <ModeIcon className="w-4 h-4" />
              </button>
              <button onClick={prev} className="p-1 rounded text-foreground hover:text-primary transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlay}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={next} className="p-1 rounded text-foreground hover:text-primary transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1 ml-2">
                {volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-muted-foreground" /> : <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (audioRef.current) audioRef.current.volume = v;
                  }}
                  className="w-16 h-1 accent-primary cursor-pointer"
                />
              </div>
            </div>

            {/* 歌词进度 */}
            {currentTrack && currentTrack.lyrics.length > 0 && currentLyricIndex >= 0 && (
              <p className="text-center text-xs text-muted-foreground truncate">
                {currentTrack.lyrics[currentLyricIndex]?.text}
              </p>
            )}

            {/* 上传按钮 */}
            <div className="flex gap-2 pt-1">
              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs max-md:text-[10px] font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                上传音乐
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && loadFiles(e.target.files)}
                />
              </label>
              <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs max-md:text-[10px] font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 cursor-pointer transition-colors">
                <FolderOpen className="w-3.5 h-3.5" />
                上传文件夹
                <input
                  type="file"
                  /* @ts-ignore */
                  webkitdirectory=""
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && loadFiles(e.target.files)}
                />
              </label>
              <label className="flex items-center justify-center gap-1 px-3 py-2 text-xs max-md:text-[10px] font-medium rounded-lg border border-border text-sidebar-foreground hover:bg-sidebar-accent/50 cursor-pointer transition-colors">
                歌词
                <input
                  ref={lrcInputRef}
                  type="file"
                  accept=".lrc"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) loadLyricsForCurrent(file);
                  }}
                />
              </label>
            </div>

            {/* 播放列表 */}
            {tracks.length > 1 && (
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {tracks.map((track, i) => (
                  <div
                    key={track.id}
                    onClick={() => playIndex(i)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition-colors",
                      i === currentIndex
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <Music className="w-3 h-3 shrink-0" />
                    <span className="truncate">{track.name}</span>
                    {track.lyrics.length > 0 && (
                      <span className="text-[9px] text-primary/60 shrink-0">LRC</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
