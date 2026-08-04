import type { Metadata, Viewport } from 'next';
import './globals.css';
import { inter, plusJakartaSans } from './fonts';

// "Spendifico", the name decided on 2026-08-02 and now carried everywhere in
// the repo. The Figma file is the one holdout and still says "Expensa"
// throughout; see "The Figma file still says Expensa" in docs/TODO.md.
export const metadata: Metadata = {
  title: 'Spendifico',
  description: 'Track what you spend, see where it goes, and stay on budget.',
};

// Only light mode is designed, so declare it at the platform level as well as
// in globals.css. No dark or alternate theme ships alongside it.
export const viewport: Viewport = {
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables have to sit on <html>: that is where :root resolves,
    // and the --font-display / --font-sans theme tokens dereference them.
    <html lang="en" className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}>
      {/* Body/M is the default UI text style; there is no text-base anymore. */}
      <body className="text-body-m flex min-h-full flex-col">{children}</body>
    </html>
  );
}
