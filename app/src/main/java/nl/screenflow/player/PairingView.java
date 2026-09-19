package nl.screenflow.player;

import android.content.Context;
import android.graphics.*;
import android.view.View;
import java.time.Instant;

/** Native, offline-ready presentation only. No registration, credentials or playback logic. */
public final class PairingView extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Bitmap background;
    private String code = "", expires = "", message = "Player voorbereiden…", network = "Verbinding maken…";
    private boolean online;
    private static final int MUTED = Color.rgb(179,196,229);
    public PairingView(Context context) {
        super(context);
        background = BitmapFactory.decodeResource(getResources(), R.drawable.pairing_background);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
    }
    public void pending(String value, String expiry) { code=value; expires=expiry; message="Wacht op koppeling…"; refresh(); }
    /** Never show an old pairing code after an identity reset or revoked session. */
    public void reset(String value) { code=""; expires=""; message=value; refresh(); }
    public void message(String value) { message=value; refresh(); }
    public void network(String value, boolean connected) { network=value; online=connected; refresh(); }
    private boolean expired() { try { return !expires.isEmpty() && !Instant.parse(expires).isAfter(Instant.now()); } catch(Exception e) { return !expires.isEmpty(); } }
    private void refresh() { setContentDescription("NarrowVision. "+message+". "+(expired()?"Koppelcode verlopen":code)+". "+network); invalidate(); }
    private void text(Canvas c,String value,float x,float y,float size,int color,boolean bold,Paint.Align align) {
        p.setShader(null);p.setStyle(Paint.Style.FILL);p.setColor(color);p.setTextSize(size);p.setTextAlign(align);
        p.setTypeface(bold?Typeface.create("sans-serif",Typeface.BOLD):Typeface.create("sans-serif",Typeface.NORMAL));c.drawText(value,x,y,p);
    }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c); c.drawColor(Color.rgb(3,10,28));
        float scale=Math.min(getWidth()/1672f,getHeight()/941f);
        c.save();c.translate((getWidth()-1672*scale)/2,(getHeight()-941*scale)/2);c.scale(scale,scale);
        p.reset();p.setAntiAlias(true);c.drawBitmap(background,null,new RectF(0,0,1672,941),p);
        text(c,"NarrowVision Player",52,48,17,MUTED,false,Paint.Align.LEFT);
        p.setColor(online?Color.rgb(68,235,158):Color.rgb(231,186,91));c.drawCircle(58,73,5,p);
        text(c,message,74,79,17,MUTED,false,Paint.Align.LEFT);
        text(c,"v"+BuildConfig.VERSION_NAME,1620,48,17,MUTED,false,Paint.Align.RIGHT);
        text(c,network,1620,77,16,MUTED,false,Paint.Align.RIGHT);
        // Brand geometry uses native paths, so it remains crisp at every screen resolution.
        c.save();c.translate(774,55);c.scale(1.12f,1.12f);
        Path left=new Path();left.moveTo(0,5);left.quadTo(0,0,6,3);left.lineTo(36,22);left.lineTo(36,75);left.lineTo(6,95);left.quadTo(0,99,0,92);left.close();
        p.setShader(new LinearGradient(0,0,35,97,new int[]{0xff368fff,0xff5933ff,0xff21d4ff},null,Shader.TileMode.CLAMP));c.drawPath(left,p);
        Path right=new Path();right.moveTo(74,20);right.lineTo(103,2);right.quadTo(110,-2,110,5);right.lineTo(110,92);right.quadTo(110,99,104,95);right.lineTo(74,75);right.close();
        p.setShader(new LinearGradient(74,0,110,97,0xffe84deb,0xff5625f3,Shader.TileMode.CLAMP));c.drawPath(right,p);
        Path diagonal=new Path();diagonal.moveTo(0,5);diagonal.lineTo(110,73);diagonal.lineTo(110,92);diagonal.quadTo(110,99,104,95);diagonal.lineTo(0,29);diagonal.close();
        p.setShader(new LinearGradient(0,0,110,100,0xff3679ff,0xffda42f3,Shader.TileMode.CLAMP));c.drawPath(diagonal,p);c.restore();
        text(c,"Narrow",851,218,53,Color.WHITE,true,Paint.Align.RIGHT);text(c,"Vision",851,218,53,0xff9546ff,true,Paint.Align.LEFT);
        text(c,"S H O W   W H A T   M A T T E R S",836,247,14,MUTED,true,Paint.Align.CENTER);
        text(c,"Koppel dit scherm aan uw account",836,320,38,Color.WHITE,true,Paint.Align.CENTER);
        text(c,"Ga naar uw NarrowVision omgeving en voeg een nieuwe player toe.",836,357,22,MUTED,false,Paint.Align.CENTER);
        RectF card=new RectF(406,398,1266,580);
        p.setColor(0xc009142e);c.drawRoundRect(card,24,24,p);
        p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(2);p.setShader(new LinearGradient(406,398,1266,580,0xff9737ff,0xff518bff,Shader.TileMode.CLAMP));c.drawRoundRect(card,24,24,p);p.setStyle(Paint.Style.FILL);
        text(c,expired()?"K O P P E L C O D E   V E R L O P E N":"U W   K O P P E L C O D E",836,443,18,MUTED,true,Paint.Align.CENTER);
        String shown=expired()?"Code verlopen":code.isEmpty()?"Even geduld…":format(code);
        float size=code.isEmpty()||expired()?46:74;p.setTypeface(Typeface.create("sans-serif",Typeface.BOLD));p.setTextSize(size);
        if(p.measureText(shown)>800)size*=800/p.measureText(shown);
        text(c,shown,836,539,size,Color.WHITE,true,Paint.Align.CENTER);
        String[] steps={"Log in op uw", "Ga naar", "Kies Player toevoegen"};String[] lines={"NarrowVision omgeving", "Players", "en vul de code in"};
        for(int i=0;i<3;i++){float x=432+i*315;p.setShader(null);p.setColor(0xff923bff);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(3);c.drawCircle(x,640,21,p);p.setStyle(Paint.Style.FILL);text(c,""+(i+1),x,649,25,0xffc87aff,true,Paint.Align.CENTER);text(c,steps[i],x+40,632,18,MUTED,false,Paint.Align.LEFT);text(c,lines[i],x+40,658,18,Color.WHITE,false,Paint.Align.LEFT);}
        text(c,expired()?"Vraag uw beheerder om hulp. Deze player blijft geregistreerd.":"De player start automatisch zodra de koppeling gereed is.",836,712,17,MUTED,false,Paint.Align.CENTER);
        text(c,"Hulp nodig? Neem contact op met uw beheerder.",52,861,17,MUTED,false,Paint.Align.LEFT);
        text(c,"D I G I T A L   S I G N A G E",1620,854,12,MUTED,false,Paint.Align.RIGHT);
        text(c,"F O R   A   B R I G H T E R   T O M O R R O W",1620,878,12,MUTED,false,Paint.Align.RIGHT);
        c.restore();
        if(!expires.isEmpty()&&!expired())postInvalidateDelayed(1000);
    }
    static String format(String code) {String clean=code.replaceAll("[^A-Za-z0-9]","");return clean.replaceAll("(.{4})(?!$)","$1-");}
}
