package com.localscan.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 1) 扫码期间把 WebView、父容器与 DecorView 背景置为透明，
 *    让位于其下方的 ML Kit 相机预览（ScanActivity）透出来；结束扫码时恢复。
 * 2) 把状态栏/导航栏所在区域的底色同步为 App 主题色。
 * 3) 扫码全屏时隐藏系统栏（沉浸式）。必须走 WindowInsetsControllerCompat ——
 *    在 Android 15 的目标版本下旧的 SYSTEM_UI_FLAG_FULLSCREEN 已被忽略，
 *    所以 @capacitor/status-bar 的 StatusBar.hide() 不起作用，状态栏会一直留着
 *    并跟着透明 WebView 反复重绘（表现为状态栏闪烁 / 闪 logo）。
 *
 * 关于第 2 点：Capacitor 的 SystemBars 在老 WebView 上会给 DecorView 加 padding，
 * 让出的那条区域显示的是 DecorView（而不是 Window）的背景。只调用
 * Window#setBackgroundDrawable 在部分机型上不生效（主题已设 windowBackground
 * 资源时会被忽略），所以这里直接落在 DecorView 上，并顺带刷 content 容器与
 * WebView 父容器，做到深浅色都不留白边。
 *
 * JS 侧用法见 src/lib/native-scan.ts。
 */
@CapacitorPlugin(name = "LocalscanWebview")
public class LocalscanWebviewPlugin extends Plugin {

    private Drawable originalWebViewBackground;
    private Drawable originalParentBackground;
    private boolean transparent = false;
    private boolean immersive = false;
    /** 最近一次要求的外观底色，恢复时用它而不是透明（否则会露出黑底） */
    private int lastChromeColor = Color.parseColor("#fafafa");

    /**
     * 沉浸式：隐藏状态栏（和导航栏）。用 WindowInsetsControllerCompat 实现，
     * 兼容 Android 11~15；BELOW 行为让用户从边缘上滑时临时露出系统栏。
     */
    @PluginMethod
    public void setImmersive(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                View decor = window.getDecorView();
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, decor);
                if (on) {
                    controller.hide(WindowInsetsCompat.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    immersive = true;
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars());
                    immersive = false;
                }
            } catch (Throwable ignored) {
                /* 极端机型上失败就退化为不沉浸 */
            }
        });
        call.resolve();
    }


    private WebView webView() {
        if (getBridge() == null) {
            return null;
        }
        return getBridge().getWebView();
    }

    private View decorView() {
        if (getActivity() == null) {
            return null;
        }
        return getActivity().getWindow().getDecorView();
    }

    private ViewGroup parentOf(WebView webView) {
        if (webView == null) {
            return null;
        }
        return webView.getParent() instanceof ViewGroup ? (ViewGroup) webView.getParent() : null;
    }

    private void captureOriginals() {
        WebView webView = webView();
        ViewGroup parent = parentOf(webView);
        if (originalWebViewBackground == null && webView != null) {
            originalWebViewBackground = webView.getBackground();
        }
        if (originalParentBackground == null && parent != null) {
            originalParentBackground = parent.getBackground();
        }
    }

    @PluginMethod
    public void setTransparent(final PluginCall call) {
        final WebView webView = webView();
        if (webView == null) {
            call.reject("WebView 不可用");
            return;
        }
        captureOriginals();
        transparent = true;
        final ViewGroup parent = parentOf(webView);
        final View decor = decorView();

        getActivity().runOnUiThread(() -> {
            webView.setBackgroundColor(Color.TRANSPARENT);
            if (parent != null) {
                parent.setBackgroundColor(Color.TRANSPARENT);
            }
            if (decor != null) {
                decor.setBackgroundColor(Color.TRANSPARENT);
            }
            getActivity().getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        });
        call.resolve();
    }

    @PluginMethod
    public void setOpaque(final PluginCall call) {
        final WebView webView = webView();
        if (webView == null) {
            call.reject("WebView 不可用");
            return;
        }
        transparent = false;
        final ViewGroup parent = parentOf(webView);
        final View decor = decorView();
        final View content =
            getActivity() == null ? null : getActivity().findViewById(android.R.id.content);
        final Drawable webViewBackground = originalWebViewBackground;
        final Drawable parentBackground = originalParentBackground;
        // 关键：恢复成外观底色，绝不能恢复成透明
        final int chrome = lastChromeColor;

        getActivity().runOnUiThread(() -> {
            webView.setBackgroundColor(chrome);
            if (webViewBackground instanceof ColorDrawable && ((ColorDrawable) webViewBackground).getColor() != Color.TRANSPARENT) {
                webView.setBackground(webViewBackground);
            }
            if (parent != null) {
                parent.setBackgroundColor(chrome);
                if (parentBackground instanceof ColorDrawable && ((ColorDrawable) parentBackground).getColor() != Color.TRANSPARENT) {
                    parent.setBackground(parentBackground);
                }
            }
            if (decor != null) {
                decor.setBackgroundColor(chrome);
            }
            if (content != null) {
                content.setBackgroundColor(chrome);
            }
        });
        call.resolve();
    }

    /**
     * 同步系统栏区域底色（浅色 #fafafa / 深色 #303030）。
     */
    @PluginMethod
    public void setChromeColor(final PluginCall call) {
        String hex = call.getString("color", "#fafafa");
        int color;
        try {
            color = Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            color = Color.parseColor("#fafafa");
        }
        final int resolved = color;
        lastChromeColor = resolved;

        if (transparent) {
            // 扫码进行中：只记下颜色，等 setOpaque 时再落地
            JSObject skipped = new JSObject();
            skipped.put("color", hex);
            skipped.put("skipped", true);
            call.resolve(skipped);
            return;
        }

        final WebView webView = webView();
        final ViewGroup parent = parentOf(webView);
        final View decor = decorView();
        final View content =
            getActivity() == null ? null : getActivity().findViewById(android.R.id.content);

        getActivity().runOnUiThread(() -> {
            if (decor != null) {
                decor.setBackgroundColor(resolved);
            }
            if (content != null) {
                content.setBackgroundColor(resolved);
            }
            if (parent != null) {
                parent.setBackgroundColor(resolved);
            }
            // WebView 自身底色也跟主题走，页面转场/安全区露底时不会闪白
            if (webView != null) {
                webView.setBackgroundColor(resolved);
            }
        });

        JSObject ret = new JSObject();
        ret.put("color", hex);
        call.resolve(ret);
    }
}
