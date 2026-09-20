package nl.screenflow.player;

import android.content.Context;
import android.graphics.*;
import android.view.View;

/** Native, offline-ready 3840x2160 pairing presentation. No animation or OTA changes. */
public final class PairingView extends View {
    private static final float ARTBOARD_W = 3840f, ARTBOARD_H = 2160f;
    private static final float LAYOUT_W = 1672f, LAYOUT_H = 941f;
    private static final int MUTED = Color.rgb(179,196,229);
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private String code = "", expires = "", message = "Player voorbereiden…", network = "Verbinding maken…";
    private boolean online;

    public PairingView(Context context) {
        super(context);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
    }

    // The authenticated server owns code expiry and rotation. Do not rely on device wall clock.
    public void pending(String value, String expiry) { code=value; expires=expiry; message="Wacht op koppeling…"; refresh(); }
    /** Never show an old pairing code after an identity reset or revoked session. */
    public void reset(String value) { code=""; expires=""; message=value; refresh(); }
    public void message(String value) { message=value; refresh(); }
    public void network(String value, boolean connected) { network=value; online=connected; refresh(); }
    private void refresh() { setContentDescription("NarrowVision. "+message+". "+code+". "+network); invalidate(); }

    private void text(Canvas c,String value,float x,float y,float size,int color,boolean bold,Paint.Align align) {
        p.setShader(null);p.setStyle(Paint.Style.FILL);p.setColor(color);p.setTextSize(size);p.setTextAlign(align);
        p.setTypeface(Typeface.create("sans-serif",bold?Typeface.BOLD:Typeface.NORMAL));c.drawText(value,x,y,p);
    }

    /** Vector backdrop avoids enlarging the old 1672x941 bitmap on a UHD display. */
    private void drawBackground(Canvas c) {
        p.reset();p.setAntiAlias(true);p.setStyle(Paint.Style.FILL);
        p.setShader(new LinearGradient(0,0,LAYOUT_W,LAYOUT_H,
            new int[]{0xff050c21,0xff12183c,0xff060c23},new float[]{0f,0.56f,1f},Shader.TileMode.CLAMP));
        c.drawRect(0,0,LAYOUT_W,LAYOUT_H,p);
        p.setShader(new RadialGradient(1320,120,880,
            new int[]{0x55472c9a,0x00472c9a},null,Shader.TileMode.CLAMP));
        c.drawRect(0,0,LAYOUT_W,LAYOUT_H,p);
        p.setShader(new RadialGradient(230,830,710,
            new int[]{0x3330638a,0x0030638a},null,Shader.TileMode.CLAMP));
        c.drawRect(0,0,LAYOUT_W,LAYOUT_H,p);
        p.setShader(null);
    }

    /** Exact three N paths, control points and gradient stops from NarrowVision_logo_vector.svg. */
    private void drawOriginalN(Canvas c) {
        c.save();c.translate(782,55);c.scale(0.247f,0.247f);c.translate(-415,-205);
        p.setShader(null);p.setStyle(Paint.Style.FILL);
        Path left=new Path();left.moveTo(415,232);left.quadTo(415,216,429,209);left.quadTo(437,205,447,212);
        left.lineTo(558,293);left.lineTo(558,516);left.quadTo(558,527,548,533);left.lineTo(438,597);
        left.quadTo(415,610,415,585);left.close();
        p.setShader(new LinearGradient(415,205,558,610,0xff3e72ff,0xff5a48ff,Shader.TileMode.CLAMP));c.drawPath(left,p);
        Path right=new Path();right.moveTo(686,303);right.lineTo(797,238);right.quadTo(817,226,827,235);
        right.quadTo(832,240,832,252);right.lineTo(832,598);right.quadTo(832,617,819,624);
        right.quadTo(811,628,801,621);right.lineTo(686,538);right.close();
        p.setShader(new LinearGradient(686,226,686,628,0xffc34cf2,0xff5b20f3,Shader.TileMode.CLAMP));c.drawPath(right,p);
        Path diagonal=new Path();diagonal.moveTo(415,235);diagonal.quadTo(415,217,429,209);
        diagonal.quadTo(437,205,447,212);diagonal.lineTo(820,484);diagonal.quadTo(832,493,832,508);
        diagonal.lineTo(832,607);diagonal.quadTo(832,623,819,629);diagonal.quadTo(811,633,801,626);
        diagonal.lineTo(426,351);diagonal.quadTo(415,343,415,329);diagonal.close();
        p.setShader(new LinearGradient(415,269,832,569,
            new int[]{0xff4b7bff,0xff7852ff,0xffd149f5},new float[]{0f,0.48f,1f},Shader.TileMode.CLAMP));
        c.drawPath(diagonal,p);p.setShader(null);c.restore();
    }

    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);c.drawColor(Color.rgb(3,10,28));
        if(getWidth()<=0||getHeight()<=0)return;
        // Native 4K virtual canvas, aspect-fit on both 1080p and 3840x2160 physical screens.
        float scale=Math.min(getWidth()/ARTBOARD_W,getHeight()/ARTBOARD_H);
        c.save();c.translate((getWidth()-ARTBOARD_W*scale)/2,(getHeight()-ARTBOARD_H*scale)/2);
        c.scale(scale*ARTBOARD_W/LAYOUT_W,scale*ARTBOARD_H/LAYOUT_H);
        drawBackground(c);
        text(c,"NarrowVision Player",52,48,17,MUTED,false,Paint.Align.LEFT);
        p.setShader(null);p.setColor(online?Color.rgb(68,235,158):Color.rgb(231,186,91));c.drawCircle(58,73,5,p);
        text(c,message,74,79,17,MUTED,false,Paint.Align.LEFT);
        text(c,"v"+BuildConfig.VERSION_NAME,1620,48,17,MUTED,false,Paint.Align.RIGHT);
        text(c,network,1620,77,16,MUTED,false,Paint.Align.RIGHT);
        drawOriginalN(c);
        text(c,"Narrow",851,218,53,Color.WHITE,true,Paint.Align.RIGHT);
        text(c,"Vision",851,218,53,0xff9546ff,true,Paint.Align.LEFT);
        text(c,"S H O W   W H A T   M A T T E R S",836,247,14,MUTED,true,Paint.Align.CENTER);
        text(c,"Koppel dit scherm aan uw account",836,320,38,Color.WHITE,true,Paint.Align.CENTER);
        text(c,"Ga naar uw NarrowVision omgeving en voeg een nieuwe player toe.",836,357,22,MUTED,false,Paint.Align.CENTER);
        RectF card=new RectF(406,398,1266,580);
        p.setColor(0xc009142e);c.drawRoundRect(card,24,24,p);
        p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);
        p.setShader(new LinearGradient(406,398,1266,580,0xff9737ff,0xff518bff,Shader.TileMode.CLAMP));
        c.drawRoundRect(card,24,24,p);p.setShader(null);p.setStyle(Paint.Style.FILL);
        text(c,"U W   K O P P E L C O D E",836,443,18,MUTED,true,Paint.Align.CENTER);
        String shown=code.isEmpty()?"Even geduld…":format(code);
        float size=code.isEmpty()?46:74;p.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));p.setTextSize(size);
        if(p.measureText(shown)>800)size*=800/p.measureText(shown);
        text(c,shown,836,539,size,Color.WHITE,true,Paint.Align.CENTER);
        String[] steps={"Log in op uw", "Ga naar", "Kies Player toevoegen"};
        String[] lines={"NarrowVision omgeving", "Players", "en vul de code in"};
        for(int i=0;i<3;i++){
            float x=432+i*315;p.setShader(null);p.setColor(0xff923bff);p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(3);c.drawCircle(x,640,21,p);p.setStyle(Paint.Style.FILL);
            text(c,""+(i+1),x,649,25,0xffc87aff,true,Paint.Align.CENTER);
            text(c,steps[i],x+40,632,18,MUTED,false,Paint.Align.LEFT);
            text(c,lines[i],x+40,658,18,Color.WHITE,false,Paint.Align.LEFT);
        }
        text(c,"De player start automatisch zodra de koppeling gereed is.",836,712,17,MUTED,false,Paint.Align.CENTER);
        text(c,"Hulp nodig? Neem contact op met uw beheerder.",52,861,17,MUTED,false,Paint.Align.LEFT);
        text(c,"D I G I T A L   S I G N A G E",1620,854,12,MUTED,false,Paint.Align.RIGHT);
        text(c,"F O R   A   B R I G H T E R   T O M O R R O W",1620,878,12,MUTED,false,Paint.Align.RIGHT);
        c.restore();
    }
    static String format(String code) {
        String clean=code.replaceAll("[^A-Za-z0-9]","");
        return clean.replaceAll("(.{4})(?!$)","$1-");
    }
}
