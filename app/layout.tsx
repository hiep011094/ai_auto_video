import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientProviders } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tỉnh Thức AI — ĐƯỜNG VỀ TỈNH THỨC Studio",
  description:
    "Nền tảng AI tự động viết kịch bản, tạo visual prompt, và đóng gói project CapCut cho video Phật pháp và trí tuệ Phật giáo.",
  keywords: [
    "AI video",
    "Phật giáo",
    "CapCut automation",
    "video generation",
    "trí tuệ Phật giáo",
    "Đường Về Tỉnh Thức",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Dark mode: prevent flash of unstyled content */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ClientProviders>
          {children}
        </ClientProviders>
        <ThemeToggle />
      </body>
    </html>
  );
}

function ThemeToggle() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          document.addEventListener('DOMContentLoaded', function() {
            var btn = document.createElement('button');
            btn.className = 'theme-toggle';
            btn.setAttribute('aria-label', 'Toggle theme');
            btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
            btn.addEventListener('click', function() {
              var current = document.documentElement.getAttribute('data-theme');
              var next = current === 'dark' ? 'light' : 'dark';
              document.documentElement.setAttribute('data-theme', next);
              localStorage.setItem('theme', next);
              btn.textContent = next === 'dark' ? '☀️' : '🌙';
            });
            document.body.appendChild(btn);
          });
        `,
      }}
    />
  );
}
