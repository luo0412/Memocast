// Stub for `file-icons-js` (fileIcons plugin 用，demo 不挂载 file 图标)
const Stub = {
  getClass: () => '',
  getClassWithColor: () => ({ className: '', color: '' })
}
const Proxy = new Proxy(Stub, {
  get (target, prop) {
    if (prop === 'default') return Stub
    return target[prop]
  }
})
export default Proxy