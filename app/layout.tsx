import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
title: 'EditaCTF Terminal',
description: 'Terminal-based CTF platform',
}

export default function RootLayout({
children,
}: Readonly<{
children: React.ReactNode
}>) {
return (
  <html lang="en">
    <body className="font-mono bg-black text-emerald-200">{children}</body>
  </html>
)
}
