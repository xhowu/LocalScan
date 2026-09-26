import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type Rect = { x: number; y: number; w: number; h: number };

type OverlayPlugin = {
  startOverlay(rect: Rect): Promise<void>;
  moveOverlay(rect: Rect): Promise<void>;
  stopOverlay(): Promise<void>;
  setTorch(options: { on: boolean }): Promise<void>;
  addListener(
    eventName: 'barcodeHit',
    cb: (hit: { code: string; format: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'cameraError',
    cb: (e: { error: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
};

const Overlay = registerPlugin<OverlayPlugin>('LocalscanCameraOverlay');

/** 相机浮层可用（仅 App 内） */
export function isCameraOverlayAvailable() {
  return Capacitor.isNativePlatform();
}

/** 在页面取景框的位置放置原生相机浮层（浮于 WebView 之上） */
export function startCameraOverlay(rect: Rect) {
  return Overlay.startOverlay(rect);
}

/** 视口尺寸变化时更新浮层位置 */
export function moveCameraOverlay(rect: Rect) {
  return Overlay.moveOverlay(rect);
}

/** 移除浮层并停掉相机 */
export function stopCameraOverlay() {
  return Overlay.stopOverlay();
}

export function setCameraOverlayTorch(on: boolean) {
  return Overlay.setTorch({ on });
}

/** 监听识别命中 */
export function onBarcodeHit(cb: (hit: { code: string; format: string }) => void) {
  return Overlay.addListener('barcodeHit', cb);
}

/** 监听相机异常 */
export function onCameraError(cb: (e: { error: string }) => void) {
  return Overlay.addListener('cameraError', cb);
}
