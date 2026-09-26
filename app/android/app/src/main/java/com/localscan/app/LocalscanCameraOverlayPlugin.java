package com.localscan.app;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.core.TorchState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 相机取景浮层：在 WebView **之上**放一个小尺寸原生相机预览（PreviewView），
 * 位置由 JS 按页面取景框的屏幕坐标指定 —— 相机只出现在扫码框里，
 * WebView 保持完全不透明。
 *
 * 与旧方案（WebView 整页透明、相机画在背后）的本质区别：
 * 旧方案要求 WebView 与相机逐帧混合，状态栏区域随之反复重绘（闪状态栏/闪 logo）；
 * 本方案 WebView 不透明、合成关系简单，闪烁没有发生条件。
 *
 * 浮层容器 = PreviewView + 四角红角标 + 红色扫描线（复用扫码 Activity 的 drawable）。
 * 识别命中通过 barcodeHit 事件回传 JS。
 */
@CapacitorPlugin(name = "LocalscanCameraOverlay")
public class LocalscanCameraOverlayPlugin extends Plugin {

    private FrameLayout overlay;
    private PreviewView previewView;
    private View scanLine;
    private ViewGroup reticle;
    private ViewGroup torchBtn;
    private boolean torchOn = false;
    private ValueAnimator lineAnimator;
    private Camera camera;
    private ProcessCameraProvider cameraProvider;
    private BarcodeScanner scanner;
    private ExecutorService analyzerExecutor;
    private final AtomicBoolean emitting = new AtomicBoolean(false);
    private long lastEmitAt = 0;

    @PluginMethod
    public void startOverlay(final PluginCall call) {
        final double x = call.getDouble("x", 0d);
        final double y = call.getDouble("y", 0d);
        final double w = call.getDouble("w", 0d);
        final double h = call.getDouble("h", 0d);
        getActivity().runOnUiThread(() -> {
            try {
                ensureView();
                positionOverlay(x, y, w, h);
                bindCamera();
                call.resolve();
            } catch (Throwable t) {
                stopInternal();
                call.reject("相机浮层启动失败：" + t);
            }
        });
    }

    @PluginMethod
    public void moveOverlay(final PluginCall call) {
        final double x = call.getDouble("x", 0d);
        final double y = call.getDouble("y", 0d);
        final double w = call.getDouble("w", 0d);
        final double h = call.getDouble("h", 0d);
        getActivity().runOnUiThread(() -> {
            if (overlay != null && overlay.getParent() != null) {
                try {
                    positionOverlay(x, y, w, h);
                } catch (Throwable ignored) {
                    // 位置微调失败不影响画面
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void stopOverlay(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void setTorch(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (camera != null) {
                camera.getCameraControl().enableTorch(on);
            }
            call.resolve();
        });
    }

    @SuppressLint("ResourceType")
    private void ensureView() {
        if (overlay != null && overlay.getParent() != null) return;

        WebView web = getBridge().getWebView();
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        float d = web.getResources().getDisplayMetrics().density;

        overlay = new FrameLayout(getContext());
        // 圆角取景卡：背景遮罩 + outline 裁剪，相机画面/角标/扫描线都按 22dp 圆角裁切
        //（与识别文字框同为圆角矩形，CSS 的 border-radius 管不到原生浮层）
        overlay.setBackgroundResource(R.drawable.scanner_mask);
        overlay.setClipToOutline(true);

        previewView = new PreviewView(getContext());
        previewView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.addView(previewView);

        // 取景区：内缩的圆角矩形区域（对照原版设计），四角红角标与扫描线画在它里面
        reticle = new FrameLayout(getContext());
        FrameLayout.LayoutParams rlp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        rlp.leftMargin = Math.round(46 * d);
        rlp.rightMargin = Math.round(46 * d);
        rlp.topMargin = Math.round(92 * d);
        rlp.bottomMargin = Math.round(136 * d);
        overlay.addView(reticle, rlp);

        // 四角红角标（复用扫码 Activity 的 drawable，贴取景区四角）
        int[][] grav = {
                {Gravity.TOP | Gravity.START, R.drawable.scanner_corner_tl},
                {Gravity.TOP | Gravity.END, R.drawable.scanner_corner_tr},
                {Gravity.BOTTOM | Gravity.START, R.drawable.scanner_corner_bl},
                {Gravity.BOTTOM | Gravity.END, R.drawable.scanner_corner_br},
        };
        int side = Math.round(26 * d);
        for (int[] g : grav) {
            View corner = new View(getContext());
            corner.setBackgroundResource(g[1]);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(side, side);
            lp.gravity = g[0];
            reticle.addView(corner, lp);
        }

        // 红色扫描线（在取景区内往返）
        scanLine = new View(getContext());
        scanLine.setBackgroundResource(R.drawable.scanner_line);
        FrameLayout.LayoutParams llp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(2, Math.round(2 * d)));
        llp.leftMargin = Math.round(8 * d);
        llp.rightMargin = Math.round(8 * d);
        llp.topMargin = Math.round(6 * d);
        reticle.addView(scanLine, llp);

        // 手电筒钮：框内右上角白圆（点击由原生直接切换闪光灯）
        torchBtn = new FrameLayout(getContext());
        torchBtn.setBackgroundResource(R.drawable.scanner_torch_bg);
        ImageView torchIcon = new ImageView(getContext());
        torchIcon.setImageResource(R.drawable.ic_scanner_torch_dark);
        torchIcon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(
                Math.round(22 * d), Math.round(22 * d));
        ilp.gravity = Gravity.CENTER;
        torchBtn.addView(torchIcon, ilp);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(
                Math.round(42 * d), Math.round(42 * d));
        tlp.gravity = Gravity.TOP | Gravity.END;
        tlp.topMargin = Math.round(14 * d);
        tlp.rightMargin = Math.round(14 * d);
        torchBtn.setOnClickListener(v -> toggleTorchNative());
        overlay.addView(torchBtn, tlp);

        // 框内底部提示胶囊
        TextView hint = new TextView(getContext());
        hint.setText("对准条码即可识别");
        hint.setTextColor(Color.WHITE);
        hint.setTextSize(13.5f);
        hint.setIncludeFontPadding(false);
        hint.setBackgroundResource(R.drawable.scanner_hint_bg);
        FrameLayout.LayoutParams hlp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hlp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        hlp.bottomMargin = Math.round(20 * d);
        int hpad = Math.round(12 * d);
        int vpad = Math.round(7 * d);
        hint.setPadding(hpad, vpad, hpad, vpad);
        overlay.addView(hint, hlp);

        content.addView(overlay, new FrameLayout.LayoutParams(1, 1));
        startLineAnimation();
    }

    /** 原生直接切换闪光灯（无需回 JS），并更新按钮状态 */
    private void toggleTorchNative() {
        torchOn = !torchOn;
        if (camera != null) {
            camera.getCameraControl().enableTorch(torchOn);
        }
        if (torchBtn != null) {
            torchBtn.setBackgroundResource(
                    torchOn ? R.drawable.scanner_torch_bg_on : R.drawable.scanner_torch_bg);
        }
    }

    private void positionOverlay(double x, double y, double w, double h) {
        WebView web = getBridge().getWebView();
        ViewGroup content = getActivity().findViewById(android.R.id.content);
        float d = web.getResources().getDisplayMetrics().density;

        int[] wLoc = new int[2];
        web.getLocationOnScreen(wLoc);
        int[] cLoc = new int[2];
        content.getLocationOnScreen(cLoc);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                Math.max(1, Math.round((float) (w * d))),
                Math.max(1, Math.round((float) (h * d))));
        lp.leftMargin = (wLoc[0] - cLoc[0]) + Math.round((float) (x * d));
        lp.topMargin = (wLoc[1] - cLoc[1]) + Math.round((float) (y * d));
        overlay.setLayoutParams(lp);
    }

    private void startLineAnimation() {
        lineAnimator = ValueAnimator.ofFloat(0, 1);
        lineAnimator.setDuration(1700);
        lineAnimator.setRepeatCount(ValueAnimator.INFINITE);
        lineAnimator.setRepeatMode(ValueAnimator.REVERSE);
        lineAnimator.setInterpolator(new LinearInterpolator());
        lineAnimator.addUpdateListener(a -> {
            if (scanLine != null && reticle != null && reticle.getHeight() > 0) {
                float frac = (float) a.getAnimatedValue();
                float range = reticle.getHeight() - scanLine.getHeight() - scanLine.getTop() * 2f;
                scanLine.setTranslationY(range * frac);
            }
        });
        lineAnimator.start();
    }

    private synchronized void bindCamera() {
        if (cameraProvider != null) return; // 已绑定
        ListenableFuture<ProcessCameraProvider> future =
                ProcessCameraProvider.getInstance(getContext());
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis =
                        new ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build();
                if (analyzerExecutor == null) analyzerExecutor = Executors.newSingleThreadExecutor();
                if (scanner == null) {
                    scanner = BarcodeScanning.getClient(
                            new BarcodeScannerOptions.Builder()
                                    .setBarcodeFormats(
                                            Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
                                            Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
                                            Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39,
                                            Barcode.FORMAT_CODE_93, Barcode.FORMAT_ITF,
                                            Barcode.FORMAT_CODABAR, Barcode.FORMAT_QR_CODE,
                                            Barcode.FORMAT_DATA_MATRIX)
                                    .build());
                }
                analysis.setAnalyzer(analyzerExecutor, this::analyze);
                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(
                        getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
            } catch (Throwable t) {
                stopInternal();
                JSObject ret = new JSObject();
                ret.put("error", "相机启动失败：" + t);
                notifyListeners("cameraError", ret);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private void analyze(@NonNull ImageProxy proxy) {
        if (emitting.get()) {
            proxy.close();
            return;
        }
        try {
            int rotation = proxy.getImageInfo().getRotationDegrees();
            InputImage image = InputImage.fromMediaImage(proxy.getImage(), rotation);
            scanner.process(image)
                    .addOnSuccessListener(barcodes -> {
                        if (barcodes == null) return;
                        long now = System.currentTimeMillis();
                        if (now - lastEmitAt < 1200) return;
                        for (Barcode b : barcodes) {
                            String value = b.getRawValue();
                            if (value == null || value.isEmpty()) continue;
                            lastEmitAt = now;
                            JSObject ret = new JSObject();
                            ret.put("code", value);
                            ret.put("format", String.valueOf(b.getFormat()));
                            notifyListeners("barcodeHit", ret);
                            break;
                        }
                    })
                    .addOnCompleteListener(t -> proxy.close());
        } catch (Throwable t) {
            proxy.close();
        }
    }

    private void stopInternal() {
        emitting.set(false);
        if (lineAnimator != null) {
            lineAnimator.cancel();
            lineAnimator = null;
        }
        if (cameraProvider != null) {
            try {
                cameraProvider.unbindAll();
            } catch (Throwable ignored) {
                // 解绑失败无影响
            }
            cameraProvider = null;
        }
        camera = null;
        if (overlay != null && overlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) overlay.getParent()).removeView(overlay);
        }
        overlay = null;
        previewView = null;
        scanLine = null;
        reticle = null;
        torchBtn = null;
        torchOn = false;
    }
}
