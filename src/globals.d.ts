// Build-time constants injected by Vite (Epic 79: Reproducible Builds)
// CI sets these from SOURCE_DATE_EPOCH and GITHUB_SHA; dev builds use defaults
declare const __BUILD_TIME__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_VERSION__: string
