/**
 * Monaco Editor Environment Configuration
 * 
 * Configures Monaco's Web Workers to work properly in Electron environment.
 * This fixes the "Unexpected usage" error that occurs when Monaco tries to
 * load language services in Electron's sandboxed renderer.
 * 
 * The monaco-editor-webpack-plugin handles worker bundling and sets MonacoEnvironment.getWorkerUrl
 * We need to ensure it works correctly in Electron by providing a fallback
 * that returns null for workers that aren't available, preventing "Unexpected usage" errors
 */
import * as monaco from 'monaco-editor'

// Disable TypeScript/JavaScript features completely to prevent worker loading errors
// These are not needed for a Markdown editor
try {
  // Disable JavaScript and TypeScript compilers to prevent TS worker loading
  monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false
  })
  monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false
  })
  monaco.languages.typescript?.javascriptDefaults?.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    lib: ['es2020']
  })
  monaco.languages.typescript?.typescriptDefaults?.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    lib: ['es2020']
  })
} catch (e) {
  // TypeScript language service may not be available if excluded from bundle
  console.warn('[Monaco Env] TypeScript configuration skipped:', e.message)
}

// Configure MonacoEnvironment with fallback paths
const originalGetWorkerUrl = typeof window !== 'undefined' ? window.MonacoEnvironment?.getWorkerUrl : null

window.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    // If MonacoWebpackPlugin already set this up, use it
    if (originalGetWorkerUrl) {
      try {
        return originalGetWorkerUrl(moduleId, label)
      } catch (e) {
        console.warn('[Monaco Env] Worker URL fallback triggered:', label)
      }
    }
    
    // Fallback for bundled workers - these paths are relative to the webpack output
    const basePath = './'
    
    if (label === 'json') return `${basePath}json.worker.js`
    if (label === 'css' || label === 'scss' || label === 'less') return `${basePath}css.worker.js`
    if (label === 'html' || label === 'handlebars' || label === 'razor') return `${basePath}html.worker.js`
    // For TypeScript/JavaScript, return null to prevent loading attempts
    if (label === 'typescript' || label === 'javascript') return null
    
    return `${basePath}editor.worker.js`
  },
  
  // Disable inline workers to avoid Electron sandbox issues
  getWorker: function (workerId, label) {
    // Return null for TS/JS workers to prevent errors
    if (label === 'typescript' || label === 'javascript') {
      return null
    }
    return null  // Disable all inline workers
  }
}
