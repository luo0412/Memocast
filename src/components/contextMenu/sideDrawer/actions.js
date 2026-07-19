import { EVENTS as events } from 'src/utils/eventsConst'
import { packClickFunction } from 'src/components/contextMenu/utils'

export const openTierRanking = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.openTierRanking)
}

export const renameCategory = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.renameCategory)
}

export const createCategory = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.createCategory)
}

export const createNote = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.createNote)
}

export const openImport = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.openImport)
}

export const exportCategoryAsMarkdown = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.exportCategory.markdown)
}

export const deleteCategory = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.delete)
}

export const exportToBlog = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.exportToBlog)
}

export const copyMarkdown = (menuItem, browserWindow) => {
  return packClickFunction(events.SIDE_DRAWER_CONTEXT_MENU.copyMarkdown)
}
