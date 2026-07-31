// Stub for `prismjs` (demo 暂不需要代码高亮的输出)
// Memo: Muya 源码 import Prism from 'prismjs'
const Stub = new Proxy(function () {}, {
  get () {
    return Stub
  },
  apply () {
    return ''
  }
})
export default Stub
export const highlight = () => ''
export const languages = {}