import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// Simple file-based storage for demo purposes
const STORAGE_FILE = path.join(process.cwd(), 'data', 'sightedit.json')

interface SaveData {
  sight: string
  value: string
  type: string
  url?: string
  context?: Record<string, any>
}

async function ensureStorageFile() {
  const dir = path.dirname(STORAGE_FILE)
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }
  
  try {
    await fs.access(STORAGE_FILE)
  } catch {
    await fs.writeFile(STORAGE_FILE, JSON.stringify({}))
  }
}

async function loadData(): Promise<Record<string, any>> {
  await ensureStorageFile()
  try {
    const content = await fs.readFile(STORAGE_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

async function saveData(data: Record<string, any>) {
  await ensureStorageFile()
  await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2))
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveData = await request.json()
    
    if (!body.sight || body.value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: sight, value' },
        { status: 400 }
      )
    }

    const storage = await loadData()
    storage[body.sight] = {
      value: body.value,
      type: body.type,
      url: body.url,
      context: body.context,
      updatedAt: new Date().toISOString()
    }

    await saveData(storage)

    return NextResponse.json({ 
      success: true,
      sight: body.sight,
      message: 'Content saved successfully'
    })
  } catch (error) {
    console.error('Save error:', error)
    return NextResponse.json(
      { error: 'Failed to save content' },
      { status: 500 }
    )
  }
}