/**
 * 全局编译期常量（由 vite.config.ts 的 define 注入）。
 * 必须是「无 import/export 的脚本文件」才能声明全局变量。
 */

/** 是否联网版构建（npm run build:online） */
declare const __ONLINE__: boolean;
