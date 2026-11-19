import type {
  AppInfo,
  IpcResult,
  RuntimeExitEvent,
  RuntimeKind,
  RuntimeLogEvent,
  RuntimeStart,
} from '@xiao/core/ipc';
import type {
  MediaDeleteResult,
  MediaItem,
  MediaRenameResult,
  MediaUploadInput,
  MediaUploadResult,
} from '../../main/media.ts';

export interface CanvasNode {
  id: string;
  name: string;
  kind: string;
  text: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: CanvasNode[];
}

export interface CanvasPropOption {
  value: string;
  label: string;
}

export interface CanvasField {
  name: string;
  label: string;
  type: string;
  options?: CanvasPropOption[];
  default?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  group?: string;
  placeholder?: string;
  advanced?: boolean;
}

/** 文章正文格式：index.md 或 index.html。 */
export type ContentFormat = 'markdown' | 'html';

export interface ContentPost {
  slug: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  draft: boolean;
  date: string;
  cover: string;
  format: ContentFormat;
}

export interface PostContent {
  text: string;
  format: ContentFormat;
}

export interface ArticleCss {
  css: string;
  colorScheme: 'auto' | 'light' | 'dark';
  breakpoints: { id: string; label: string }[];
}

export interface SavedSection {
  name: string;
  label: string;
  file: string;
  refs: number;
}

export type ThemeOptionValue = string | boolean | string[];

/** 站点 src/theme.json：主题信息、它提供的配色、它开放的自定义项（D-99）。 */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  summary?: string;
  palettes: {
    default: string;
    items: {
      id: string;
      name: string;
      summary?: string;
      light: Record<string, string>;
      dark: Record<string, string>;
    }[];
  };
  options: ThemeOptionDef[];
}

export interface ThemeOptionDef {
  key: string;
  group?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type: 'select' | 'segmented' | 'switch' | 'text' | 'textarea' | 'checks';
  default: ThemeOptionValue;
  choices?: { value: string; label: string }[];
  when?: { key: string; value: string };
}

export interface XiaoApi {
  section: {
    list: (siteDir: string) => Promise<IpcResult<SavedSection[]>>;
    save: (
      siteDir: string,
      file: string,
      nodeId: string,
      label: string,
    ) => Promise<IpcResult<SavedSection>>;
    usage: (siteDir: string, names: string[]) => Promise<IpcResult<Record<string, number>>>;
  };
  article: {
    css: (siteDir: string) => Promise<IpcResult<ArticleCss>>;
  };
  canvas: {
    components: () => Promise<IpcResult<string[]>>;
    outline: (siteDir: string, file: string) => Promise<IpcResult<CanvasNode[]>>;
    insert: (
      siteDir: string,
      parentId: string,
      index: number,
      name: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    move: (
      siteDir: string,
      nodeId: string,
      parentId: string,
      index: number,
      file: string,
    ) => Promise<IpcResult<null>>;
    remove: (siteDir: string, nodeId: string, file: string) => Promise<IpcResult<null>>;
    duplicate: (siteDir: string, nodeId: string, file: string) => Promise<IpcResult<null>>;
    wrap: (
      siteDir: string,
      nodeId: string,
      wrapperSnippet: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    canNest: (parentName: string, childName: string) => Promise<IpcResult<boolean>>;
    undo: (siteDir: string, file: string) => Promise<IpcResult<null>>;
    redo: (siteDir: string, file: string) => Promise<IpcResult<null>>;
    props: (name: string) => Promise<IpcResult<CanvasField[]>>;
    setText: (
      siteDir: string,
      nodeId: string,
      text: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    setVisual: (
      siteDir: string,
      elementId: string,
      text: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    setProp: (
      siteDir: string,
      nodeId: string,
      name: string,
      value: string | number | boolean,
      file: string,
    ) => Promise<IpcResult<null>>;
  };
  publish: {
    changes: (siteDir: string) => Promise<
      IpcResult<{
        posts: {
          slug: string;
          title: string;
          status: 'added' | 'modified' | 'deleted' | 'renamed';
          files: { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; from?: string }[];
        }[];
        pages: { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; from?: string }[];
        settings: { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; from?: string }[];
        settingsStatus: 'added' | 'modified' | 'deleted' | 'renamed' | null;
        other: { path: string; status: 'added' | 'modified' | 'deleted' | 'renamed'; from?: string }[];
      }>
    >;
    history: (siteDir: string) => Promise<
      IpcResult<{
        rows: {
          at: string;
          repo: string;
          sha?: string;
          result?: string;
          ms?: number;
          steps?: { key: 'check' | 'push' | 'build' | 'live'; label: string; state: 'ok' | 'fail' | 'wait' | 'run'; ms: number }[];
        }[];
        persisted: boolean;
      }>
    >;
    record: (
      siteDir: string,
      item:
        | {
            at: string;
            repo: string;
            sha?: string;
            result?: string;
            ms?: number;
            steps?: { key: 'check' | 'push' | 'build' | 'live'; label: string; state: 'ok' | 'fail' | 'wait' | 'run'; ms: number }[];
          }
        | string,
    ) => Promise<
      IpcResult<{
        rows: { at: string; repo: string; sha?: string; result?: string; ms?: number }[];
        persisted: boolean;
      }>
    >;
    follow: (
      siteDir: string,
      sha: string,
    ) => Promise<
      IpcResult<{
        build: { phase: 'build' | 'live'; state: 'run' | 'ok' | 'fail'; detail: string; log?: string; url?: string };
        live: { phase: 'build' | 'live'; state: 'run' | 'ok' | 'fail'; detail: string; log?: string; url?: string } | null;
        buildMs: number;
        liveMs: number;
      }>
    >;
    target: (siteDir: string) => Promise<
      IpcResult<{
        provider: 'gitea' | 'github';
        remoteUrl: string;
        branch: string;
        login?: string;
        siteUrl?: string;
        actionsState?: 'ready' | 'disabled' | 'no-runner' | 'unknown';
        actionsDetail?: string;
      } | null>
    >;
    connect: (
      siteDir: string,
      provider: 'gitea' | 'github',
      remoteUrl: string,
      login: string,
      token: string,
      siteUrl?: string,
    ) => Promise<
      IpcResult<{
        provider: 'gitea' | 'github';
        remoteUrl: string;
        branch: string;
        login?: string;
        siteUrl?: string;
        actionsState?: 'ready' | 'disabled' | 'no-runner' | 'unknown';
        actionsDetail?: string;
        persisted?: boolean;
      }>
    >;
    setSiteUrl: (
      siteDir: string,
      siteUrl: string,
    ) => Promise<
      IpcResult<{
        provider: 'gitea' | 'github';
        remoteUrl: string;
        branch: string;
        login?: string;
        siteUrl?: string;
      }>
    >;
    start: (
      siteDir: string,
      force?: boolean,
    ) => Promise<
      IpcResult<{
        id: string;
        siteDir: string;
        status: 'running' | 'ok' | 'fail';
        steps: {
          key: 'check' | 'push' | 'build' | 'live';
          label: string;
          state: 'wait' | 'run' | 'ok' | 'fail' | 'skip';
          startedAt: number;
          ms: number;
          detail: string;
          more: string;
          url: string;
          action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
          slug: string;
        }[];
        sha: string;
        pushRejected: boolean;
        startedAt: number;
        finishedAt: number;
        siteUrl: string;
        code: string;
        checks: {
          key: 'url' | 'workflow' | 'build' | 'seo';
          ok: boolean;
          label: string;
          detail: string;
          more: string;
          slug: string;
          action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
        }[];
      }>
    >;
    job: (siteDir: string) => Promise<
      IpcResult<{
        id: string;
        siteDir: string;
        status: 'running' | 'ok' | 'fail';
        steps: {
          key: 'check' | 'push' | 'build' | 'live';
          label: string;
          state: 'wait' | 'run' | 'ok' | 'fail' | 'skip';
          startedAt: number;
          ms: number;
          detail: string;
          more: string;
          url: string;
          action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
          slug: string;
        }[];
        sha: string;
        pushRejected: boolean;
        startedAt: number;
        finishedAt: number;
        siteUrl: string;
        code: string;
        checks: {
          key: 'url' | 'workflow' | 'build' | 'seo';
          ok: boolean;
          label: string;
          detail: string;
          more: string;
          slug: string;
          action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
        }[];
      } | null>
    >;
    dismiss: (siteDir: string) => Promise<IpcResult<null>>;
    onJob: (
      callback: (payload: {
        siteDir: string;
        job: {
          id: string;
          siteDir: string;
          status: 'running' | 'ok' | 'fail';
          steps: {
            key: 'check' | 'push' | 'build' | 'live';
            label: string;
            state: 'wait' | 'run' | 'ok' | 'fail' | 'skip';
            startedAt: number;
            ms: number;
            detail: string;
            more: string;
            url: string;
            action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
            slug: string;
          }[];
          sha: string;
          pushRejected: boolean;
          startedAt: number;
          finishedAt: number;
          siteUrl: string;
          code: string;
          checks: {
            key: 'url' | 'workflow' | 'build' | 'seo';
            ok: boolean;
            label: string;
            detail: string;
            more: string;
            slug: string;
            action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
          }[];
        } | null;
      }) => void,
    ) => () => void;
    verify: (siteDir: string) => Promise<
      IpcResult<{
        status: 'valid' | 'invalid' | 'expired';
        account: string;
        kind: 'github-classic' | 'github-fine' | 'gitea';
        expiresAt: string;
        message: string;
        capabilities: { key: string; label: string; state: 'ok' | 'missing' | 'unknown'; how: string }[];
      }>
    >;
    replaceToken: (
      siteDir: string,
      token: string,
    ) => Promise<
      IpcResult<{
        status: 'valid' | 'invalid' | 'expired';
        account: string;
        kind: 'github-classic' | 'github-fine' | 'gitea';
        expiresAt: string;
        message: string;
        capabilities: { key: string; label: string; state: 'ok' | 'missing' | 'unknown'; how: string }[];
      }>
    >;
    preflight: (siteDir: string, force?: boolean) => Promise<
      IpcResult<{
        blocked: boolean;
        checkedAt: number;
        cached: boolean;
        items: {
          key: 'url' | 'workflow' | 'build' | 'seo';
          ok: boolean;
          label: string;
          detail: string;
          more?: string;
          slug?: string;
          action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
        }[];
      }>
    >;
    push: (
      siteDir: string,
      force?: boolean,
    ) => Promise<
      IpcResult<{
        committed: boolean;
        forced: boolean;
        warnings: string[];
        message: string;
        remote: string;
        branch: string;
        sha: string;
      }>
    >;
    disconnect: (siteDir: string) => Promise<IpcResult<null>>;
    repair: (siteDir: string) => Promise<IpcResult<{ backup: string; files: number }>>;
  };
  wizard: {
    write: (
      siteDir: string,
      owner: string,
      repo: string,
      branch: string,
    ) => Promise<IpcResult<null>>;
  };
  secret: {
    save: (repo: string, token: string, expires: string) => Promise<IpcResult<null>>;
    list: () => Promise<IpcResult<{ repo: string; expires: string }[]>>;
    remove: (repo: string) => Promise<IpcResult<null>>;
  };
  github: {
    repo: (owner: string, name: string) => Promise<IpcResult<{ status: number }>>;
  };
  dev: {
    files: (siteDir: string) => Promise<IpcResult<string[]>>;
    read: (siteDir: string, file: string) => Promise<IpcResult<string>>;
    write: (siteDir: string, file: string, content: string) => Promise<IpcResult<null>>;
    lint: (
      siteDir: string,
      file: string,
    ) => Promise<IpcResult<{ line: number; message: string }[]>>;
  };
  page: {
    list: (siteDir: string) => Promise<IpcResult<string[]>>;
    create: (
      siteDir: string,
      template: 'blank' | 'landing' | 'about',
      slug: string,
    ) => Promise<IpcResult<string>>;
    href: (siteDir: string, file: string) => Promise<IpcResult<string>>;
    styleRead: (
      siteDir: string,
      slug: string,
    ) => Promise<IpcResult<{ css: string; exists: boolean }>>;
    styleWrite: (siteDir: string, slug: string, css: string) => Promise<IpcResult<null>>;
    styleReset: (siteDir: string, slug: string) => Promise<IpcResult<null>>;
  };
  seo: {
    check: (
      siteDir: string,
    ) => Promise<IpcResult<{ level: string; rule: string; detail: string }[]>>;
    audit: (siteDir: string) => Promise<
      IpcResult<{
        code: number;
        buildFailed: boolean;
        report: {
          generatedAt: string;
          siteUrl: string;
          pageCount: number;
          issues: { level: string; rule: string; route: string; detail: string }[];
          pages: {
            route: string;
            title: string;
            description: string;
            canonical: string;
            ogImage: string;
          }[];
        } | null;
        message: string;
        log: string;
        previewError: string;
      }>
    >;
    report: (siteDir: string) => Promise<IpcResult<Record<string, unknown> | null>>;
  };
  settings: {
    read: (siteDir: string) => Promise<IpcResult<Record<string, unknown>>>;
    patch: (
      siteDir: string,
      patch: { set?: Record<string, unknown>; unset?: string[] },
    ) => Promise<IpcResult<string[]>>;
  };
  theme: {
    /** 站点 src/theme.json；旧模板没有这个文件时返回 null。 */
    read: (siteDir: string) => Promise<IpcResult<ThemeManifest | null>>;
  };
  content: {
    list: (siteDir: string) => Promise<IpcResult<ContentPost[]>>;
    create: (
      siteDir: string,
      title: string,
      category: string,
      format?: ContentFormat,
      standalone?: boolean,
    ) => Promise<IpcResult<ContentPost>>;
    customize: (siteDir: string, slug: string) => Promise<IpcResult<string>>;
    layoutRead: (
      siteDir: string,
      slug: string,
    ) => Promise<
      IpcResult<{ custom: boolean; defaultText: string; customText: string; file: string }>
    >;
    resetLayout: (siteDir: string, slug: string) => Promise<IpcResult<{ backup: string }>>;
    remove: (siteDir: string, slug: string) => Promise<IpcResult<null>>;
    rename: (
      siteDir: string,
      from: string,
      to: string,
    ) => Promise<IpcResult<{ from: string; to: string }>>;
    /** 兼容旧调用方：只返回全文。 */
    read: (siteDir: string, slug: string) => Promise<IpcResult<string>>;
    /** 双格式：返回正文全文与格式（format 由实际存在 index.md / index.html 决定）。 */
    readPost: (siteDir: string, slug: string) => Promise<IpcResult<PostContent>>;
    write: (siteDir: string, slug: string, markdown: string) => Promise<IpcResult<null>>;
    saveImage: (
      siteDir: string,
      slug: string,
      name: string,
      base64: string,
    ) => Promise<IpcResult<string>>;
  };
  media: {
    /** 扫描 `src/content/posts/**` 与 `public/**` 的图片，并统计文本里的引用数。 */
    list: (siteDir: string) => Promise<IpcResult<MediaItem[]>>;
    /** 上传图片（bytes 支持 Uint8Array / number[]）；默认写 `public/media/<年份>/`。 */
    upload: (
      siteDir: string,
      files: MediaUploadInput[],
      target?: string,
    ) => Promise<IpcResult<MediaUploadResult>>;
    /** 移动到 `.xiao/trash/`；有引用时必须传 `force: true`。 */
    delete: (
      siteDir: string,
      relPaths: string[],
      force?: boolean,
    ) => Promise<IpcResult<MediaDeleteResult>>;
    /** 同目录改名，并尽力更新 md/html/astro/css 里的引用。 */
    rename: (
      siteDir: string,
      relPath: string,
      newName: string,
    ) => Promise<IpcResult<MediaRenameResult>>;
  };
  preview: {
    set: (
      mode: 'phone' | 'tablet' | 'pc' | 'custom' | 'side',
      url: string,
      customWidth?: number,
    ) => Promise<IpcResult<number[]>>;
    focus: (
      file: string,
      offset: string,
      label?: string,
      handles?: { width?: boolean; pad?: boolean },
    ) => Promise<IpcResult<null>>;
    focusSelector: (selector: string) => Promise<IpcResult<null>>;
    hit: (
      x: number,
      y: number,
    ) => Promise<
      IpcResult<{
        file: string;
        offset: string;
        place: 'before' | 'after' | 'into';
        tag: string;
      } | null>
    >;
    drop: (
      hit: { file: string; offset: string; place: 'before' | 'after' | 'into'; tag: string } | null,
    ) => Promise<IpcResult<null>>;
    zoom: (value: number) => Promise<IpcResult<null>>;
    onPick: (callback: (payload: { file: string; offset: string }) => void) => () => void;
    onResize: (callback: (payload: { prop: 'width' | 'pad'; px: number }) => void) => () => void;
    onCamera: (callback: (payload: { zoom: number }) => void) => () => void;
    onText: (
      callback: (payload: { file: string; offset: string; text: string }) => void,
    ) => () => void;
    editor: (
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
      interactive?: boolean,
    ) => Promise<IpcResult<null>>;
    dock: (input: {
      enabled: boolean;
      url: string;
      device: 'phone' | 'tablet' | 'pc' | 'side';
      bounds: { x: number; y: number; width: number; height: number };
      zoom?: number;
      interactive?: boolean;
    }) => Promise<IpcResult<null>>;
    expect: (name: string, url: string) => Promise<IpcResult<null>>;
    reload: () => Promise<IpcResult<null>>;
    hideDock: () => Promise<IpcResult<null>>;
    catalog: (items: { name: string; label: string }[]) => void;
    onInsertBlock: (
      callback: (payload: {
        file: string;
        offset: string;
        name: string;
        place: 'before' | 'after' | 'into';
      }) => void,
    ) => () => void;
    windowOpen: () => Promise<IpcResult<boolean>>;
    onWindow: (callback: (payload: { open: boolean }) => void) => () => void;
  };
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    openExternal: (url: string) => Promise<IpcResult<null>>;
    setTitleBarOverlay: (overlay: {
      color: string;
      symbolColor: string;
      height: number;
    }) => Promise<IpcResult<null>>;
  };
  project: {
    recent: () => Promise<IpcResult<{ dir: string; title: string; openedAt: string }[]>>;
    pick: () => Promise<IpcResult<string | null>>;
    create: (
      parent: string,
      title: string,
      author: string,
    ) => Promise<IpcResult<{ dir: string; title: string }>>;
    open: (dir?: string) => Promise<IpcResult<{ dir: string; title: string } | null>>;
    markDirty: (file: string, content: string) => Promise<IpcResult<null>>;
    noteWrite: (file: string, content: string) => Promise<IpcResult<null>>;
    resolve: (
      file: string,
      action: 'keep' | 'load',
    ) => Promise<IpcResult<{ file: string; content: string } | null>>;
    onReload: (callback: (payload: { file: string; content: string }) => void) => () => void;
    onConflict: (
      callback: (payload: { file: string; mine: string; disk: string }) => void,
    ) => () => void;
  };
  runtime: {
    start: (kind: RuntimeKind, siteDir: string) => Promise<IpcResult<RuntimeStart>>;
    cancel: (taskId: string) => Promise<IpcResult<null>>;
    onLog: (callback: (payload: RuntimeLogEvent) => void) => () => void;
    onStart: (callback: (payload: RuntimeStart) => void) => () => void;
    onReady: (callback: (payload: { taskId: string; url: string }) => void) => () => void;
    onExit: (callback: (payload: RuntimeExitEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    xiao: XiaoApi;
    __csp?: string[];
  }
}

export {};
