'use client'

import { Editable } from '@sightedit/react'
import Image from 'next/image'

const Hero = () => {
  return (
    <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-primary-600 to-primary-800 text-white">
      <div className="absolute inset-0 bg-black opacity-20"></div>
      <div className="relative z-10 px-8 py-16 md:py-24">
        <div className="max-w-3xl">
          <Editable sight="hero-badge" type="text">
            <span className="inline-block px-3 py-1 mb-4 text-sm font-semibold bg-white/20 rounded-full">
              Welcome to NextBlog
            </span>
          </Editable>
          
          <Editable sight="hero-title" type="text">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Share Your Stories with the World
            </h1>
          </Editable>
          
          <Editable sight="hero-description" type="richtext">
            <p className="text-lg md:text-xl mb-8 text-white/90">
              Create beautiful blog posts with our intuitive visual editor. 
              No coding required - just click and edit any content directly on the page.
            </p>
          </Editable>
          
          <div className="flex flex-wrap gap-4">
            <button className="px-6 py-3 bg-white text-primary-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
              Get Started
            </button>
            <button className="px-6 py-3 bg-white/20 text-white font-semibold rounded-lg hover:bg-white/30 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </div>
      
      {/* Decorative Pattern */}
      <div className="absolute right-0 top-0 w-1/2 h-full opacity-10">
        <svg className="w-full h-full" viewBox="0 0 400 400" fill="none">
          <circle cx="300" cy="100" r="100" fill="white" />
          <circle cx="350" cy="250" r="80" fill="white" />
          <circle cx="250" cy="350" r="120" fill="white" />
        </svg>
      </div>
    </section>
  )
}

export default Hero