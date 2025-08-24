'use client'

import { Editable, EditModeToggle } from '@sightedit/react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// Mock blog posts data - in a real app, this would come from a database
const blogPosts = {
  '1': {
    id: '1',
    title: 'Getting Started with SightEdit',
    content: `<p>SightEdit is a powerful visual editing system that transforms any website into a visual editor by adding a single JavaScript file and data attributes.</p>

<h2>What makes SightEdit special?</h2>

<p>Unlike traditional content management systems, SightEdit works with any framework and backend. You don't need to rebuild your entire application - just add data attributes to make content editable.</p>

<h3>Key Features</h3>

<ul>
<li><strong>Framework Agnostic</strong> - Works with React, Vue, vanilla HTML, or any framework</li>
<li><strong>Zero Configuration</strong> - Add data-sight attributes and you're ready to go</li>
<li><strong>Visual Editing</strong> - Edit content directly on your live website</li>
<li><strong>Type Safety</strong> - Full TypeScript support with comprehensive type definitions</li>
</ul>

<p>To get started, simply install the SightEdit package for your framework and follow the integration guide.</p>`,
    author: 'John Doe',
    date: '2024-01-15',
    image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&h=600&fit=crop',
    tags: ['tutorial', 'nextjs', 'sightedit'],
    readTime: '5 min read'
  },
  '2': {
    id: '2',
    title: 'Building a Modern Blog Platform',
    content: `<p>Creating a modern blog platform requires careful consideration of user experience, performance, and maintainability. In this article, we'll explore the architecture and features that make a blog platform truly modern.</p>

<h2>Modern Blog Architecture</h2>

<p>Today's blog platforms need to be fast, scalable, and easy to maintain. Here are the key components:</p>

<h3>Frontend Technologies</h3>

<ul>
<li><strong>Next.js</strong> - For server-side rendering and static generation</li>
<li><strong>Tailwind CSS</strong> - For responsive, utility-first styling</li>
<li><strong>TypeScript</strong> - For type safety and better developer experience</li>
</ul>

<h3>Content Management</h3>

<p>With SightEdit integration, content editors can modify blog posts directly on the live site without touching code or learning complex admin interfaces.</p>`,
    author: 'Jane Smith',
    date: '2024-01-10',
    image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&h=600&fit=crop',
    tags: ['architecture', 'blog', 'development'],
    readTime: '8 min read'
  },
  '3': {
    id: '3',
    title: 'The Future of Content Management',
    content: `<p>Content management is evolving rapidly. The days of complex admin panels and technical barriers are giving way to intuitive, visual editing experiences.</p>

<h2>Visual Editing Revolution</h2>

<p>The future of content management lies in visual editing - the ability to edit content directly on the website where it appears. This approach eliminates the disconnect between editing and presentation.</p>

<h3>Benefits of Visual Editing</h3>

<ul>
<li><strong>WYSIWYG</strong> - What you see is exactly what your visitors will see</li>
<li><strong>Context Aware</strong> - Edit content in its actual context and layout</li>
<li><strong>Non-technical</strong> - Anyone can edit content without technical knowledge</li>
<li><strong>Faster Workflows</strong> - No switching between admin panels and live sites</li>
</ul>

<p>Tools like SightEdit are pioneering this approach, making websites instantly editable with minimal technical overhead.</p>`,
    author: 'Mike Johnson',
    date: '2024-01-05',
    image: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&h=600&fit=crop',
    tags: ['cms', 'future', 'innovation'],
    readTime: '6 min read'
  }
}

interface BlogPostPageProps {
  params: {
    id: string
  }
}

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = blogPosts[params.id as keyof typeof blogPosts]
  
  if (!post) {
    notFound()
  }

  return (
    <div className="min-h-screen">
      {/* Edit Mode Toggle */}
      <div className="fixed bottom-4 right-4 z-50">
        <EditModeToggle className="bg-primary-600 text-white px-4 py-2 rounded-full shadow-lg hover:bg-primary-700 transition-colors">
          Edit Mode
        </EditModeToggle>
      </div>

      {/* Hero Image */}
      <div className="relative h-64 md:h-96 w-full">
        <Image
          src={post.image}
          alt={post.title}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black bg-opacity-30" />
      </div>

      {/* Article Content */}
      <article className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <nav className="mb-8">
          <Link 
            href="/" 
            className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            ← Back to Home
          </Link>
        </nav>

        {/* Article Header */}
        <header className="mb-8 space-y-4">
          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 text-sm font-medium rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Title */}
          <Editable sight={`blog-${post.id}-title`} type="text">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              {post.title}
            </h1>
          </Editable>

          {/* Meta Info */}
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 text-sm">
            <div className="flex items-center space-x-4">
              <Editable sight={`blog-${post.id}-author`} type="text">
                <span>By {post.author}</span>
              </Editable>
              <span>•</span>
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
              <span>•</span>
              <span>{post.readTime}</span>
            </div>
          </div>
        </header>

        {/* Article Body */}
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <Editable sight={`blog-${post.id}-content`} type="richtext">
            <div dangerouslySetInnerHTML={{ __html: post.content }} />
          </Editable>
        </div>

        {/* Article Footer */}
        <footer className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="space-y-6">
            {/* Author Bio */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                About the Author
              </h3>
              <Editable sight={`author-${post.author.toLowerCase().replace(' ', '-')}-bio`} type="richtext">
                <p className="text-gray-600 dark:text-gray-300">
                  {post.author} is a passionate developer and writer who loves exploring new technologies and sharing knowledge with the community.
                </p>
              </Editable>
            </div>

            {/* Share Buttons */}
            <div className="flex items-center space-x-4">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Share:</span>
              <button className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                Twitter
              </button>
              <button className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                LinkedIn
              </button>
              <button className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                Facebook
              </button>
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}