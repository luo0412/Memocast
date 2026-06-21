import path from 'path'
import fs from 'fs-extra'

export default {
  async generateSidebarJson (blogDir, noteFields) {
    const sidebarPath = path.join(blogDir, 'sidebar.json')
    const sidebarData = {}

    noteFields.forEach(note => {
      const filename = note.title.replace(/\.md$/i, '')
      const postsDir = '_posts'
      if (!sidebarData[postsDir]) {
        sidebarData[postsDir] = []
      }
      sidebarData[postsDir].push({
        title: filename,
        path: `${postsDir}/${filename}.md`
      })
    })

    await fs.writeJson(sidebarPath, sidebarData, { spaces: 2 })
  },

  async writeBlogPosts (blogDir, notes, theme = 'default') {
    const postsDir = path.join(blogDir, '_posts')
    await fs.ensureDir(postsDir)

    for (const note of notes) {
      const filename = `${note.title.replace(/\.md$/i, '')}.md`
      const filepath = path.join(postsDir, filename)
      const frontmatter = this.buildFrontmatter(note, theme)
      const content = frontmatter + '\n\n' + note.content
      await fs.writeFile(filepath, content)
    }
  },

  buildFrontmatter (note, theme = 'default') {
    const date = new Date().toISOString().split('T')[0]
    const title = note.title.replace(/\.md$/i, '')
    if (theme === 'vdoing') {
      return `---\ntitle: ${title}\ndate: ${date}\nsidebar: auto\n---\n`
    }
    return `---\ntitle: ${title}\ndate: ${date}\n---\n`
  }
}
