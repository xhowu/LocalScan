package com.localscan.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalscanWebviewPlugin.class);
        registerPlugin(LocalscanScannerPlugin.class);
        registerPlugin(LocalscanCameraOverlayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
