package com.localscan.app;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 原生全屏扫码插件：打开 ScannerActivity（原生相机预览 + ML Kit 识别）。
 * 之所以不再走「WebView 透明 + 相机在背后」的旧方案，是因为那条路在
 * 部分机型上状态栏区域会随透明 WebView 反复重绘（闪状态栏 / 闪 logo），
 * 沉浸式与遮罩都压不住 —— 原生 Activity 里这些问题不存在。
 */
@CapacitorPlugin(name = "LocalscanScanner")
public class LocalscanScannerPlugin extends Plugin {

    @PluginMethod
    public void startScan(final PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), ScannerActivity.class);
            startActivityForResult(call, intent, "scanResult");
        } catch (Throwable t) {
            // 打不开原生页（极少数机型）：回传错误而不是让 App 崩溃
            JSObject ret = new JSObject();
            ret.put("cancelled", false);
            ret.put("error", "无法打开扫码页：" + t);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopScan(final PluginCall call) {
        // 识别到条码后 Activity 会自行 finish；保留空方法以备将来中断用
        call.resolve();
    }

    @ActivityCallback
    private void scanResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        String error = data == null ? null : data.getStringExtra("error");
        if (error != null) {
            // Activity 初始化/相机异常：把错误带给 JS 层提示
            ret.put("cancelled", false);
            ret.put("error", error);
        } else if (result.getResultCode() == android.app.Activity.RESULT_OK
                && data != null
                && data.getStringExtra("code") != null) {
            ret.put("cancelled", false);
            ret.put("code", data.getStringExtra("code"));
            ret.put("format", data.getStringExtra("format"));
        } else {
            ret.put("cancelled", true);
        }
        call.resolve(ret);
    }
}
