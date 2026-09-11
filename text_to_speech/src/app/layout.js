import "./globals.css";

export const metadata = {
  title: "CapCut Text-to-Speech Automation & Extractor",
  description: "Dễ dàng chèn kịch bản và trích xuất giọng đọc AI chất lượng cao từ CapCut PC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
