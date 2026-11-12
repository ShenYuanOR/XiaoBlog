/** 原生预览不进页面层叠。遮挡层打开前先摘掉，避免盖住命令面板和对话框。 */
export function concealNativePreview(): void {
  void window.xiao.preview.hideDock();
  void window.xiao.preview.editor('', null);
}
