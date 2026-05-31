"use client";

import dynamic from "next/dynamic";
import { useAppStore } from "@/lib/store";

// Dynamically import heavy components
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });
const Toolbar = dynamic(() => import("@/components/Toolbar"), { ssr: false });
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });
const ImageList = dynamic(() => import("@/components/ImageList"), { ssr: false });

export default function Home() {
  const images = useAppStore((s) => s.images);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Toolbar */}
        <Toolbar />

        {/* Canvas Area */}
        <Canvas />

        {/* Bottom Image Strip */}
        <ImageList />
      </div>
    </div>
  );
}
