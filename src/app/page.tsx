"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAppStore, hydrateFromIndexedDB } from "@/lib/store";
import { Menu, X } from "lucide-react";

// Dynamically import heavy components
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });
const Toolbar = dynamic(() => import("@/components/Toolbar"), { ssr: false });
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const ImageList = dynamic(() => import("@/components/ImageList"), { ssr: false });
const Onboarding = dynamic(() => import("@/components/Onboarding"), { ssr: false });
const MusicPlayer = dynamic(() => import("@/components/MusicPlayer"), { ssr: false });
const FindReplace = dynamic(() => import("@/components/FindReplace"), { ssr: false });

export default function Home() {
  const showOnboarding = useAppStore((s) => s.showOnboarding);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const toggleSidebar = () => setMobileSidebarOpen((prev) => !prev);

  // 启动时从 IndexedDB 恢复批量任务
  useEffect(() => { hydrateFromIndexedDB(); }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Sidebar — mobile overlay controlled by toggle */}
      <div
        className={
          mobileSidebarOpen
            ? "max-md:block"
            : "max-md:hidden"
        }
      >
        <Sidebar />
        {/* Mobile close button — above sidebar */}
        <button
          className="md:hidden fixed top-3 right-3 z-[60] w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white"
          onClick={toggleSidebar}
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile hamburger menu button — overlays toolbar on mobile */}
        <button
          className="md:hidden absolute top-1 left-1 p-1 text-foreground z-40"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Top Toolbar */}
        <div className="max-md:px-2">
          <Toolbar />
        </div>

        {/* Canvas Area */}
        <Canvas />

        {/* Bottom Image Strip */}
        <ImageList />
      </div>

      {/* Onboarding overlay */}
      {showOnboarding && <Onboarding />}

      {/* Find / Replace overlay */}
      <FindReplace />

      {/* Music Player — fixed bottom bar */}
      <MusicPlayer />
    </div>
  );
}
