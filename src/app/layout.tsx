import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ShopProvider } from "@/components/ShopProvider";
import { StoreHeader } from "@/components/StoreHeader";
import { StoreFooter } from "@/components/StoreFooter";
import { AskDrawer, CartDrawer } from "@/components/Drawers";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Circuit — keyboards, mice, monitors",
  description: "A desk shop in Indiranagar. Pay on Razorpay test mode.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <ShopProvider>
          <StoreHeader />
          <div className="flex-1">{children}</div>
          <StoreFooter />
          <CartDrawer />
          <AskDrawer />
        </ShopProvider>
      </body>
    </html>
  );
}
