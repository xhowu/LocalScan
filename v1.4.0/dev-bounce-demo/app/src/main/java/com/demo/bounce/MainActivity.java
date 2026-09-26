package com.demo.bounce;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;

/**
 * 极简回弹对照 Demo。
 *
 * 唯一目的：验证「内层滚动容器 + overscroll-behavior 配方」在这台设备的
 * WebView 上能否得到原生 stretch 回弹。若本 Demo 有回弹而码上记没有，
 * 问题在码上记的页面结构；若本 Demo 也没有，则是设备 WebView 不支持，
 * 只能回到 JS 橡皮筋方案。
 *
 * 注意：故意不调用 setOverScrollMode(OVER_SCROLL_NEVER) ——
 * 默认 OVER_SCROLL_ALWAYS 才允许 overscroll 效果。
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }
}
