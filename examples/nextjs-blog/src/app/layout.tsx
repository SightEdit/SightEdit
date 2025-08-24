import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SightEditProvider } from '@sightedit/react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Next.js Blog with SightEdit',
  description: 'A blog powered by Next.js with visual editing capabilities',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SightEditProvider 
          config={{
            endpoint: '/api/sightedit',
            debug: process.env.NODE_ENV === 'development',
            theme: {
              primaryColor: '#3b82f6',
              fontFamily: 'Inter, sans-serif',
            }
          }}
        >
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8">
              {children}
            </main>
            <Footer />
          </div>
        </SightEditProvider>
      </body>
    </html>
  )
}