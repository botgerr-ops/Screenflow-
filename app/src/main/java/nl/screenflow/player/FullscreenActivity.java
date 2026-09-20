package nl.screenflow.player;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.VideoView;

/**
 * TEST-only presentation layer around the existing player logic. Keep the same
 * application ID, SharedPreferences, credentials, caches, and playback engine.
 * Images and videos fill the display by cropping edges, never stretching.
 */
public final class FullscreenActivity extends MainActivity {
    private OtaPolling ota;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ota = new OtaPolling(this);
        ota.start();
    }

    @Override protected void onDestroy() {
        if (ota != null) ota.stop();
        super.onDestroy();
    }

    @Override public void setContentView(View view) {
        if (view instanceof FrameLayout) {
            FrameLayout root = (FrameLayout) view;
            if (root.getChildCount() == 2 && root.getChildAt(0) instanceof FrameLayout
                    && root.getChildAt(1) instanceof TextView
                    && "NARROWVISION PLAYER".contentEquals(((TextView) root.getChildAt(1)).getText())) {
                root.removeViewAt(1);
                root.setBackgroundColor(Color.BLACK);
                FrameLayout surface = (FrameLayout) root.getChildAt(0);
                surface.setBackgroundColor(Color.BLACK);
                surface.setClipChildren(true);
                surface.setClipToPadding(true);
                surface.setOnHierarchyChangeListener(new ViewGroup.OnHierarchyChangeListener() {
                    @Override public void onChildViewAdded(View parent, View child) {
                        if (child instanceof ImageView) {
                            ((ImageView) child).setScaleType(ImageView.ScaleType.CENTER_CROP);
                        } else if (child instanceof VideoView) {
                            VideoView video = (VideoView) child;
                            video.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,oright,ob) -> cropVideo(surface, video));
                            surface.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,oright,ob) -> cropVideo(surface, video));
                            video.post(() -> cropVideo(surface, video));
                        }
                    }
                    @Override public void onChildViewRemoved(View parent, View child) {
                        if (child instanceof VideoView) {
                            child.setScaleX(1f);
                            child.setScaleY(1f);
                        }
                    }
                });
            }
        }
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        super.setContentView(view);
    }

    private static void cropVideo(FrameLayout surface, VideoView video) {
        if (video.getParent() != surface) return;
        final int vw = video.getWidth(), vh = video.getHeight();
        final int sw = surface.getWidth(), sh = surface.getHeight();
        if (vw <= 0 || vh <= 0 || sw <= 0 || sh <= 0) return;
        final float scale = Math.max((float) sw / vw, (float) sh / vh);
        video.setPivotX(vw / 2f);
        video.setPivotY(vh / 2f);
        video.setScaleX(scale);
        video.setScaleY(scale);
    }
}
