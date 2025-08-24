import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const STORAGE_FILE = path.join(process.cwd(), 'data', 'sightedit.json')

interface SaveData {
  sight: string
  value: string
  type: string
  url?: string
  context?: Record<string, any>
}

interface BatchRequest {
  changes: SaveData[]
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
    const body: BatchRequest = await request.json()
    
    if (!body.changes || !Array.isArray(body.changes)) {
      return NextResponse.json(
        { error: 'Missing or invalid changes array' },
        { status: 400 }
      )
    }

    const storage = await loadData()
    const results: { sight: string; success: boolean; error?: string }[] = []
    
    for (const change of body.changes) {
      try {
        if (!change.sight || change.value === undefined) {
          results.push({
            sight: change.sight || 'unknown',
            success: false,
            error: 'Missing required fields: sight, value'
          })
          continue
        }

        storage[change.sight] = {
          value: change.value,
          type: change.type,
          url: change.url,
          context: change.context,
          updatedAt: new Date().toISOString()
        }

        results.push({
          sight: change.sight,
          success: true
        })
      } catch (error) {
        results.push({
          sight: change.sight || 'unknown',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    await saveData(storage)

    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    return NextResponse.json({
      success: failedCount === 0,
      total: results.length,
      successful: successCount,
      failed: failedCount,
      results
    })
  } catch (error) {
    console.error('Batch save error:', error)
    return NextResponse.json(
      { error: 'Failed to process batch save' },
      { status: 500 }
    )
  }
}