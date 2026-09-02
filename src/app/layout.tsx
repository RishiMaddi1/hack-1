import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ShopProvider } from "@/components/ShopProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { StoreHeader } from "@/components/StoreHeader";
import { StoreFooter } from "@/components/StoreFooter";
import { AskDrawer, CartDrawer } from "@/components/Drawers";

const themeBoot = `(function(){try{var t=localStorage.getItem("circuit-theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`;

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
  title: "Circuit · u402",
  description: "Mandate-gated agentic commerce on Razorpay — shop UI + MCP for any AI buyer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <ThemeProvider>
          <ShopProvider>
            <StoreHeader />
            <div className="flex-1">{children}</div>
            <StoreFooter />
            <CartDrawer />
            <AskDrawer />
          </ShopProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
