import documentsJson from '../data/documents.json'
import type { Document, FileItem, FileKind } from './types'

export const documents = documentsJson as Document[]

const kindByExtension: Record<string, FileKind> = {
  docx: 'word',
  xlsx: 'excel',
  pptx: 'powerpoint',
  pdf: 'pdf',
  txt: 'text',
  png: 'image',
  jpg: 'image',
  mp4: 'video',
  zip: 'zip',
}

function kindOf(filename: string): FileKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return kindByExtension[ext] ?? 'text'
}

const encoder = new TextEncoder()

/**
 * Turns the flat document list into a folder tree of FileItems.
 * Folders come from each document's `folder` path, e.g. "Payroll BE / Procedures".
 */
function buildLibrary(docs: Document[]): FileItem[] {
  const folders = new Map<string, FileItem>()
  const files: FileItem[] = []

  function ensureFolder(path: string[]): string | null {
    if (path.length === 0) return null
    const id = `folder:${path.join('/')}`
    if (!folders.has(id)) {
      const parentId = ensureFolder(path.slice(0, -1))
      folders.set(id, { id, parentId, name: path[path.length - 1], kind: 'folder', size: 0, modified: '', modifiedBy: '' })
    }
    return id
  }

  for (const doc of docs) {
    const path = doc.folder.split('/').map((p) => p.trim()).filter(Boolean)
    files.push({
      id: doc.id,
      parentId: ensureFolder(path),
      name: doc.filename,
      kind: kindOf(doc.filename),
      size: encoder.encode(doc.text).length,
      modified: doc.modified,
      modifiedBy: doc.history[0]?.author ?? '',
      document: doc,
    })
  }

  // A folder shows the most recent change of anything inside it.
  for (const file of files) {
    let parentId = file.parentId
    while (parentId) {
      const folder = folders.get(parentId)!
      if (file.modified > folder.modified) {
        folder.modified = file.modified
        folder.modifiedBy = file.modifiedBy
      }
      parentId = folder.parentId
    }
  }

  return [...folders.values(), ...files]
}

export const libraryItems = buildLibrary(documents)
