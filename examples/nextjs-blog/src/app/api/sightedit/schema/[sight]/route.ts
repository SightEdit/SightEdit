import { NextRequest, NextResponse } from 'next/server'

// Schema definitions for different content types
const SCHEMAS = {
  // Hero section schemas
  'hero-badge': {
    type: 'text',
    maxLength: 50,
    required: true,
    placeholder: 'Welcome badge text'
  },
  'hero-title': {
    type: 'text',
    maxLength: 100,
    required: true,
    placeholder: 'Main hero title'
  },
  'hero-description': {
    type: 'richtext',
    maxLength: 300,
    allowedTags: ['p', 'strong', 'em', 'br'],
    placeholder: 'Hero description text'
  },

  // Site branding
  'site-title': {
    type: 'text',
    maxLength: 30,
    required: true,
    placeholder: 'Site title'
  },

  // Featured section
  'featured-title': {
    type: 'text',
    maxLength: 80,
    required: true,
    placeholder: 'Featured section title'
  },
  'featured-description': {
    type: 'richtext',
    maxLength: 200,
    allowedTags: ['p', 'strong', 'em'],
    placeholder: 'Featured section description'
  },

  // Newsletter section
  'newsletter-title': {
    type: 'text',
    maxLength: 60,
    required: true,
    placeholder: 'Newsletter section title'
  },
  'newsletter-description': {
    type: 'text',
    maxLength: 150,
    placeholder: 'Newsletter description'
  },

  // Footer
  'footer-about': {
    type: 'richtext',
    maxLength: 300,
    allowedTags: ['p', 'strong', 'em', 'a'],
    placeholder: 'About section content'
  },
  'footer-copyright': {
    type: 'text',
    maxLength: 100,
    required: true,
    placeholder: 'Copyright notice'
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { sight: string } }
) {
  try {
    const sight = params.sight

    if (!sight) {
      return NextResponse.json(
        { error: 'Sight parameter is required' },
        { status: 400 }
      )
    }

    // Check if we have a specific schema for this sight
    const schema = SCHEMAS[sight as keyof typeof SCHEMAS]
    
    if (schema) {
      return NextResponse.json({
        sight,
        schema
      })
    }

    // Generate dynamic schema based on sight pattern
    let dynamicSchema = null

    if (sight.startsWith('blog-') && sight.includes('-title')) {
      dynamicSchema = {
        type: 'text',
        maxLength: 120,
        required: true,
        placeholder: 'Blog post title'
      }
    } else if (sight.startsWith('blog-') && sight.includes('-excerpt')) {
      dynamicSchema = {
        type: 'richtext',
        maxLength: 300,
        allowedTags: ['p', 'strong', 'em'],
        placeholder: 'Blog post excerpt'
      }
    } else if (sight.startsWith('blog-') && sight.includes('-author')) {
      dynamicSchema = {
        type: 'text',
        maxLength: 50,
        required: true,
        placeholder: 'Author name'
      }
    }

    if (dynamicSchema) {
      return NextResponse.json({
        sight,
        schema: dynamicSchema
      })
    }

    // Default schema for unknown sights
    return NextResponse.json({
      sight,
      schema: {
        type: 'text',
        maxLength: 500,
        placeholder: 'Enter content'
      }
    })
  } catch (error) {
    console.error('Schema error:', error)
    return NextResponse.json(
      { error: 'Failed to get schema' },
      { status: 500 }
    )
  }
}