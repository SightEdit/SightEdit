'use client'

import { Editable, EditModeToggle } from '@sightedit/react'
import BlogCard from '@/components/BlogCard'
import Hero from '@/components/Hero'

const blogPosts = [
  {
    id: '1',
    title: 'Getting Started with SightEdit',
    excerpt: 'Learn how to integrate SightEdit into your Next.js application for visual content editing.',
    author: 'John Doe',
    date: '2024-01-15',
    image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=400&fit=crop',
    tags: ['tutorial', 'nextjs', 'sightedit']
  },
  {
    id: '2',
    title: 'Building a Modern Blog Platform',
    excerpt: 'Explore the architecture and features of a modern blog platform with visual editing capabilities.',
    author: 'Jane Smith',
    date: '2024-01-10',
    image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=400&fit=crop',
    tags: ['architecture', 'blog', 'development']
  },
  {
    id: '3',
    title: 'The Future of Content Management',
    excerpt: 'How visual editing is transforming the way we manage and create content on the web.',
    author: 'Mike Johnson',
    date: '2024-01-05',
    image: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&h=400&fit=crop',
    tags: ['cms', 'future', 'innovation']
  }
]

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Edit Mode Toggle */}
      <div className="fixed bottom-4 right-4 z-50">
        <EditModeToggle className="bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-primary-700 transition-colors">
          Edit Mode
        </EditModeToggle>
      </div>

      {/* Hero Section */}
      <Hero />

      {/* Featured Section */}
      <section className="space-y-6">
        <Editable sight="featured-title" type="text">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Featured Articles
          </h2>
        </Editable>
        
        <Editable sight="featured-description" type="richtext">
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Discover our latest insights on web development, content management, and visual editing technologies.
          </p>
        </Editable>
      </section>

      {/* Blog Posts Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {blogPosts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </section>

      {/* Newsletter Section */}
      <section className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center space-y-4">
        <Editable sight="newsletter-title" type="text">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Subscribe to Our Newsletter
          </h3>
        </Editable>
        
        <Editable sight="newsletter-description" type="text">
          <p className="text-gray-600 dark:text-gray-300">
            Get the latest articles and updates delivered straight to your inbox.
          </p>
        </Editable>
        
        <form className="flex max-w-md mx-auto gap-4">
          <input
            type="email"
            placeholder="Enter your email"
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          />
          <button
            type="submit"
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Subscribe
          </button>
        </form>
      </section>
    </div>
  )
}