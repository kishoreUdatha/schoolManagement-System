import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { PreviewInteractions } from "@/components/preview/PreviewInteractions";
import "@/styles/styles.css";
import "@/styles/app.css";

export const metadata: Metadata = { title: "BrightCampus · School ERP" };

// Self-hosted by Next at build time; no request to Google from the browser.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <div className="toast" id="toast" role="status" aria-live="polite" />
        <div className="modal-backdrop" id="modal">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title" />
            <p id="modal-body" />
            <div className="actions">
              <button className="btn primary" data-close-modal="">
                Close
              </button>
            </div>
          </section>
        </div>
        <PreviewInteractions />
      </body>
    </html>
  );
}
