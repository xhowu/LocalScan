package com.localscan.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.core.TorchState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 原生全屏扫码页（微信扫一扫同构）。
 *
 * 为什么存在：之前扫码是「WebView 整页透明，相机画在 WebView 背后」，
 * 这条路在部分机型上状态栏区域会跟着透明 WebView 反复重绘（闪状态栏 / 闪 logo），
 * 沉浸式、遮罩、Portal 都压不住。现在直接开一个不透明的原生 Activity：
 * 相机预览、识别、UI 全部在原生层，WebView 完全不参与，闪烁无从发生。
 *
 * UI：暗色遮罩 + 居中红框 + 红色扫描线 + 右上角红色关闭钮 + 闪光灯 + 底部「扫码」。
 * 识别成功：震动 + 提示音，setResult 回传 code/format 后结束。
 */
public class ScannerActivity extends AppCompatActivity {

    /** 扫码取景框边长（dp） */
    private static final int FRAME_SIDE_DP = 258;

    private PreviewView previewView;
    private View scanLine;
    private android.animation.ValueAnimator lineAnimator;
    private Camera camera;
    private ProcessCameraProvider cameraProvider;
    private final AtomicBoolean handled = new AtomicBoolean(false);
    private ExecutorService analyzerExecutor;
    private BarcodeScanner scanner;

    @SuppressLint("SetTextI18n")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            setup();
        } catch (Throwable t) {
            // 任何初始化异常都回传给调用方显示，绝不让 App 闪退
            finishWithError("扫码页初始化失败：" + t);
        }
    }

    private void setup() {
        // 沉浸式：原生 Activity 里收系统栏是稳定可靠的（WebView 里不可靠）
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat insets =
                WindowCompat.getInsetsController(window, window.getDecorView());
        insets.hide(WindowInsetsCompat.Type.systemBars());
        insets.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_scanner);
        previewView = findViewById(R.id.scanner_preview);
        scanLine = findViewById(R.id.scanner_line);

        findViewById(R.id.scanner_close).setOnClickListener(v -> finish());
        View torch = findViewById(R.id.scanner_torch);
        torch.setOnClickListener(v -> toggleTorch(torch));

        // 返回键 = 关闭
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });

        layoutDimAndFrame();
        startLineAnimation();

        analyzerExecutor = Executors.newSingleThreadExecutor();
        BarcodeScannerOptions options =
                new BarcodeScannerOptions.Builder()
                        .setBarcodeFormats(
                                Barcode.FORMAT_EAN_13,
                                Barcode.FORMAT_EAN_8,
                                Barcode.FORMAT_UPC_A,
                                Barcode.FORMAT_UPC_E,
                                Barcode.FORMAT_CODE_128,
                                Barcode.FORMAT_CODE_39,
                                Barcode.FORMAT_CODE_93,
                                Barcode.FORMAT_ITF,
                                Barcode.FORMAT_CODABAR,
                                Barcode.FORMAT_QR_CODE,
                                Barcode.FORMAT_DATA_MATRIX)
                        .build();
        scanner = BarcodeScanning.getClient(options);
        startCamera();
    }

    /** 带错误信息结束：上层（插件）会把信息转成提示，而不是闪退 */
    private void finishWithError(String message) {
        try {
            Intent data = new Intent();
            data.putExtra("error", message);
            setResult(RESULT_OK, data);
        } catch (Throwable ignored) {
            // setResult 失败就只能结束
        }
        finish();
    }

    /** 遮罩四块与红框按屏幕实际高度摆放，扫描线在框内循环移动 */
    private void layoutDimAndFrame() {
        View root = findViewById(R.id.scanner_root);
        final int side = dp(FRAME_SIDE_DP);
        root.post(() -> {
            try {
                int screenH = root.getHeight();
                int dimH = Math.max(0, (screenH - side) / 2);
                setHeight(R.id.dim_top, dimH);
                setHeight(R.id.dim_bottom, dimH);
                // dim_middle 是 LinearLayout：高度固定为取景框边长，
                // 左右两块遮罩用 match_parent 跟随（wrap_content 会让它们塌成 0）
                View middle = findViewById(R.id.dim_middle);
                ViewGroup.LayoutParams mp = middle.getLayoutParams();
                mp.height = side;
                middle.setLayoutParams(mp);
                // 注意不能强转成 FrameLayout.LayoutParams —— frame 的父容器
                // 是 LinearLayout，强转会在打开瞬间 ClassCastException 闪退（上版真机崩溃根因）
                View frame = findViewById(R.id.scanner_frame);
                ViewGroup.LayoutParams fp = frame.getLayoutParams();
                fp.width = side;
                fp.height = side;
                frame.setLayoutParams(fp);
                findViewById(R.id.scanner_torch).setTranslationY(side / 2f + dp(56));
            } catch (Throwable ignored) {
                // 布局微调失败不影响扫码主流程
            }
        });
    }

    private void setHeight(int viewId, int h) {
        View v = findViewById(viewId);
        ViewGroup.LayoutParams p = v.getLayoutParams();
        p.height = h;
        v.setLayoutParams(p);
    }

    private void startLineAnimation() {
        final float travel = dp(FRAME_SIDE_DP - 8);
        lineAnimator = android.animation.ValueAnimator.ofFloat(0, travel);
        lineAnimator.setDuration(1600);
        lineAnimator.setRepeatCount(android.animation.ValueAnimator.INFINITE);
        lineAnimator.setRepeatMode(android.animation.ValueAnimator.REVERSE);
        lineAnimator.setInterpolator(new android.view.animation.LinearInterpolator());
        lineAnimator.addUpdateListener(a -> {
            if (scanLine != null) {
                scanLine.setTranslationY(dp(4) + (float) a.getAnimatedValue());
            }
        });
        lineAnimator.start();
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                ImageAnalysis analysis =
                        new ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build();
                analysis.setAnalyzer(analyzerExecutor, this::analyze);
                cameraProvider.unbindAll();
                camera =
                        cameraProvider.bindToLifecycle(
                                this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
            } catch (Exception e) {
                // 相机起不来：把原因回传给上层提示，而不是闪退
                finishWithError("相机启动失败：" + e);
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void analyze(@NonNull ImageProxy proxy) {
        if (handled.get()) {
            proxy.close();
            return;
        }
        try {
            @SuppressWarnings("deprecation")
            int rotation = proxy.getImageInfo().getRotationDegrees();
            InputImage image = InputImage.fromMediaImage(proxy.getImage(), rotation);
            scanner
                    .process(image)
                    .addOnSuccessListener(barcodes -> {
                        if (handled.get() || barcodes == null) return;
                        for (Barcode b : barcodes) {
                            String value = b.getRawValue();
                            if (value == null || value.isEmpty()) continue;
                            handled.set(true);
                            feedback();
                            Intent data = new Intent();
                            data.putExtra("code", value);
                            data.putExtra("format", String.valueOf(b.getFormat()));
                            setResult(RESULT_OK, data);
                            finish();
                            break;
                        }
                    })
                    .addOnCompleteListener(t -> proxy.close());
        } catch (Throwable t) {
            // 帧异常：丢帧继续
            proxy.close();
        }
    }

    /** ML Kit 回调本来就在主线程，无需额外包装 */

    private void feedback() {
        try {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
            } else if (v != null) {
                v.vibrate(30);
            }
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_SYSTEM, 60);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 120);
        } catch (Throwable ignored) {
            // 震动/提示音失败不影响扫码结果
        }
    }

    private void toggleTorch(View btn) {
        if (camera == null) return;
        boolean on = camera.getCameraInfo().getTorchState().getValue() != null
                && camera.getCameraInfo().getTorchState().getValue() == TorchState.ON;
        camera.getCameraControl().enableTorch(!on);
        btn.setAlpha(!on ? 1f : 0.62f);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (lineAnimator != null) lineAnimator.cancel();
        if (analyzerExecutor != null) analyzerExecutor.shutdown();
        if (cameraProvider != null) {
            try {
                cameraProvider.unbindAll();
            } catch (Throwable ignored) {
                // 生命周期末尾解绑失败无影响
            }
        }
    }
}
