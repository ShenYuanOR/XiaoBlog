/**
 * Monaco worker 只登记一次。文章编辑器和页面编辑台共用，避免谁先打开谁才有 worker。
 */
export function installMonaco(): void {
  if (self.MonacoEnvironment) return;
  self.MonacoEnvironment = {
    getWorker: () =>
      new Worker(
        new URL(
          '../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js',
          import.meta.url,
        ),
        { type: 'module' },
      ),
  };
}
