import DatabaseClient from 'src/utils/DatabaseClient'
import { OFFLINE_ROOT_CATEGORY } from 'src/utils/constants'
import {
  buildCategoryTreeFromNotes,
  formatYmd,
  getCalendarNoteTimestamp,
  mapLocalNoteToSummary
} from 'src/store/server/noteTree'
import { getNoteTagList, parseLocalTagId } from 'src/store/server/localSyncMigration'

export async function loadLocalWorkspaceData () {
  await DatabaseClient.categories.ensureOfflineRoot()
  const notes = await DatabaseClient.notes.getAll()
  const categories = await DatabaseClient.categories.getAll({})
  const tree = buildCategoryTreeFromNotes(notes, categories)

  return {
    notes,
    categories,
    tree
  }
}

export async function getOfflineNotesByCategory (category = OFFLINE_ROOT_CATEGORY) {
  const localNotes = await DatabaseClient.notes.getAll({
    category: category || OFFLINE_ROOT_CATEGORY
  })

  return (localNotes || [])
    .filter(note => note.title && note.title !== 'Untitled')
    .map(note => mapLocalNoteToSummary(note, category || OFFLINE_ROOT_CATEGORY))
    .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineCalendarNotes ({ basis, dayStart, dayEnd }) {
  const localNotes = await DatabaseClient.notes.getAll()

  return (localNotes || [])
    .filter(note => note.title && note.title !== 'Untitled')
    .filter(note => {
      const ts = getCalendarNoteTimestamp(note, basis)
      return ts >= dayStart && ts < dayEnd
    })
    .map(note => mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
    .sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineCalendarDates ({ basis, monthStart, monthEnd }) {
  const localNotes = await DatabaseClient.notes.getAll()
  const dateSet = new Set()

  for (const note of (localNotes || [])) {
    const ts = getCalendarNoteTimestamp(note, basis)
    if (ts >= monthStart && ts < monthEnd) {
      dateSet.add(formatYmd(ts))
    }
  }

  return Array.from(dateSet).sort()
}

export async function getOfflineTagNotes (tagGuid) {
  const localTagId = parseLocalTagId(tagGuid)
  if (!localTagId) {
    return []
  }

  const taggedLocalNotes = await DatabaseClient.notes.getAll()
  const localTagNotes = []

  for (const note of (taggedLocalNotes || [])) {
    const noteTags = getNoteTagList(note)
    if (noteTags.includes(tagGuid)) {
      localTagNotes.push(mapLocalNoteToSummary(note, note.category || OFFLINE_ROOT_CATEGORY))
    }
  }

  return localTagNotes.sort((a, b) => (b.dataModified || 0) - (a.dataModified || 0))
}

export async function getOfflineTagsWithCounts (currentDocGuid) {
  const tags = await DatabaseClient.tags.getAll()
  const countMap = {}
  const allNotes = await DatabaseClient.notes.getAll()

  for (const tag of tags) {
    let count = 0
    for (const note of (allNotes || [])) {
      const noteTags = getNoteTagList(note)
      if (noteTags.includes(tag.tagGuid)) {
        count++
      }
    }
    countMap[tag.tagGuid] = count
  }

  let currentNoteTags = null
  if (currentDocGuid && currentDocGuid.startsWith('local_')) {
    const localNote = await DatabaseClient.notes.getByDocGuid(currentDocGuid)
    if (localNote) {
      const noteTags = await DatabaseClient.tags.getNoteTags(localNote.id)
      currentNoteTags = noteTags.map(tag => tag.tagGuid).join('*')
    }
  }

  return {
    tags,
    countMap,
    currentNoteTags
  }
}
