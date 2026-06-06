import DatabaseClient from 'src/utils/DatabaseClient'
import { OFFLINE_ROOT_CATEGORY } from 'src/utils/constants'

export function createLocalDocGuid () {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

export async function saveOfflineImportedNote ({ title, text, now, category = OFFLINE_ROOT_CATEGORY }) {
  const localDocGuid = createLocalDocGuid()
  const note = await DatabaseClient.notes.create({
    doc_guid: localDocGuid,
    title,
    content: text,
    category,
    data_created: now,
    data_modified: now,
    local_modified: now
  })

  return {
    localDocGuid,
    note,
    currentNote: {
      _isRawMarkdown: true,
      info: {
        docGuid: localDocGuid,
        kbGuid: '',
        title,
        category,
        dataCreated: now,
        dataModified: now
      },
      html: text,
      resources: []
    }
  }
}

export async function createLocalDraftNote ({
  docGuid = createLocalDocGuid(),
  kbGuid = '',
  title,
  content,
  category = OFFLINE_ROOT_CATEGORY,
  now,
  dataCreated = now,
  dataModified = now
}) {
  const note = await DatabaseClient.notes.create({
    doc_guid: docGuid,
    kb_guid: kbGuid,
    title,
    content,
    category,
    data_created: dataCreated,
    data_modified: dataModified,
    local_modified: now
  })

  return {
    note,
    localNoteId: note?.id || null,
    docGuid
  }
}

export async function promoteLocalDraftToCloudGuid ({ localNoteId, docGuid, source = 'wiznote' }) {
  if (!localNoteId || !docGuid) return

  await DatabaseClient.notes.update(localNoteId, {
    doc_guid: docGuid
  })
  await DatabaseClient.sync.createGuidMapping(localNoteId, docGuid, source)
}

export async function upsertLocalNoteByDocGuid ({
  docGuid,
  title,
  content,
  category,
  now,
  dataCreated = now,
  dataModified = now
}) {
  const localNote = await DatabaseClient.notes.getByDocGuid(docGuid)
  if (localNote) {
    const updatedNote = await DatabaseClient.notes.update(localNote.id, {
      title,
      content,
      category,
      local_modified: now
    })

    return {
      action: 'updated',
      localNote,
      note: updatedNote,
      localNoteId: localNote.id,
      docGuid: localNote.doc_guid || docGuid
    }
  }

  const created = await DatabaseClient.notes.create({
    doc_guid: docGuid,
    title,
    content,
    category,
    data_created: dataCreated,
    data_modified: dataModified,
    local_modified: now
  })

  return {
    action: 'created',
    localNote: created,
    note: created,
    localNoteId: created?.id || null,
    docGuid: created?.doc_guid || docGuid
  }
}
