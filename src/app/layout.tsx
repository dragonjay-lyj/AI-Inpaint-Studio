import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Inpaint Studio - 专业图像局部重绘工具",
  description: "基于 AI 的图像局部重绘工具，支持框选区域、多模型、批量处理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hans" suppressHydrationWarning>
      <body className="antialiased h-screen overflow-hidden flex flex-col">
        {children}
      </body>
    </html>
  );
}
