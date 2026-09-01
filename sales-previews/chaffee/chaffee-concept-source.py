from PIL import Image, ImageDraw, ImageFont

W,H=1440,1080
INK=(17,24,21); IVORY=(243,239,231); COPPER=(184,109,69); MUTED=(76,80,77); WHITE=(255,255,255)
REG='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def f(n,b=False): return ImageFont.truetype(BOLD if b else REG,n)
def crop(path,size):
    im=Image.open(path).convert('RGB'); ratio=max(size[0]/im.width,size[1]/im.height)
    im=im.resize((round(im.width*ratio),round(im.height*ratio)),Image.Resampling.LANCZOS)
    x=(im.width-size[0])//2; y=(im.height-size[1])//2
    return im.crop((x,y,x+size[0],y+size[1]))
def txt(d,xy,s,n,color,b=False,spacing=0):
    if not spacing: d.text(xy,s,font=f(n,b),fill=color)
    else:
        x,y=xy
        for c in s: d.text((x,y),c,font=f(n,b),fill=color); x+=d.textlength(c,font=f(n,b))+spacing
def button(d,box,label,fill):
    d.rounded_rectangle(box,5,fill=fill); bb=d.textbbox((0,0),label,font=f(14,True));
    d.text(((box[0]+box[2]-bb[2])/2,(box[1]+box[3]-bb[3])/2-2),label,font=f(14,True),fill=WHITE)

def io():
    im=Image.new('RGB',(W,H),IVORY); d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,112),fill=INK); txt(d,(88,31),'iO',38,IVORY,True); txt(d,(145,47),'GROUP CONSTRUCTION',16,IVORY,True,1.5)
    for x,s in [(760,'SERVICES'),(875,'PROJECTS'),(990,'ABOUT')]: txt(d,(x,50),s,13,(216,212,204),True,1)
    button(d,(1100,32,1350,82),'START A PROJECT',COPPER)
    txt(d,(88,176),'CHICAGO DESIGN + BUILD',14,COPPER,True,2)
    for y,s,c in [(224,'DESIGN WITH',INK),(302,'PURPOSE.',INK),(380,'BUILD WITH',INK),(458,'CONFIDENCE.',COPPER)]: txt(d,(88,y),s,72,c,True)
    txt(d,(88,560),'Family-owned construction led by experienced builders,',21,MUTED)
    txt(d,(88,593),'from thoughtful residential renovations to commercial work.',21,MUTED)
    button(d,(88,664,326,724),'EXPLORE PROJECTS',INK); txt(d,(370,683),'OUR STORY  →',14,INK,True,1)
    hero=crop('io-hero.jpg',(570,620)); mask=Image.new('L',hero.size); ImageDraw.Draw(mask).rounded_rectangle((0,0,*hero.size),24,fill=255)
    im.paste(hero,(780,150),mask)
    d.rounded_rectangle((824,650,1306,728),8,fill=IVORY); txt(d,(850,668),'FEATURED PROJECT',12,COPPER,True,1.5); txt(d,(850,696),'Jackson Kitchen  ·  Chicago',20,INK,True)
    d.rectangle((0,826,W,968),fill=INK); txt(d,(88,852),'BUILT ON TRUST',12,(174,179,175),True,1.5); txt(d,(88,894),'Family-owned',22,WHITE,True)
    d.line((345,860,345,930),fill=(58,66,62),width=2); txt(d,(405,852),'LED BY EXPERIENCE',12,(174,179,175),True,1.5); txt(d,(405,894),'20+ years',22,WHITE,True)
    d.line((682,860,682,930),fill=(58,66,62),width=2); txt(d,(742,852),'FULL-SERVICE EXPERTISE',12,(174,179,175),True,1.5); txt(d,(742,894),'Residential + commercial',22,WHITE,True)
    txt(d,(88,1020),'UNSOLICITED HOMEPAGE CONCEPT · PREPARED BY BONEBRAKE WEB DESIGN',12,(119,125,121),False,1)
    im.resize((760,570),Image.Resampling.LANCZOS).save('io-group-concept-email.jpg',quality=88,optimize=True)

def chaffee():
    NAVY=(24,34,48); RED=(176,52,46); PAPER=(247,245,240); GOLD=(202,158,87)
    im=Image.new('RGB',(W,H),PAPER); d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,106),fill=NAVY); txt(d,(76,27),'CHAFFEE',34,WHITE,True,1); txt(d,(78,67),'CONSTRUCTION · RESTORATION',11,GOLD,True,1.8)
    for x,s in [(660,'SERVICES'),(780,'PROJECTS'),(900,'ABOUT'),(1005,'REVIEWS')]: txt(d,(x,47),s,13,WHITE,True,1)
    button(d,(1132,27,1364,78),'REQUEST AN ESTIMATE',RED)
    hero=crop('chaffee-hero.jpg',(1440,632)); im.paste(hero,(0,106)); overlay=Image.new('RGBA',(W,632),(0,0,0,0)); od=ImageDraw.Draw(overlay); od.rectangle((0,0,900,632),fill=(17,26,38,210)); im.paste(overlay,(0,106),overlay)
    txt(d,(78,165),'CHICAGOLAND MASONRY SPECIALISTS',14,GOLD,True,2)
    txt(d,(78,224),'RESTORE THE',70,WHITE,True); txt(d,(78,300),'CHARACTER.',70,WHITE,True); txt(d,(78,376),'STRENGTHEN',70,WHITE,True); txt(d,(78,452),'THE FUTURE.',70,GOLD,True)
    txt(d,(78,548),'Union masonry craftsmanship for restoration, repair,',20,(225,229,232)); txt(d,(78,580),'and enduring exterior work across Chicagoland.',20,(225,229,232))
    button(d,(78,642,326,702),'VIEW OUR WORK',RED); txt(d,(366,662),'CALL (708) 927-7936',14,WHITE,True,1)
    d.rectangle((0,738,W,968),fill=PAPER); txt(d,(78,786),'BUILT TO LAST',13,RED,True,2); txt(d,(78,825),'Experienced restoration. Clear communication.',34,NAVY,True)
    for x,head,sub in [(78,'MASONRY RESTORATION','Preserve what matters.'),(505,'CHIMNEYS + TUCKPOINTING','Repair with precision.'),(965,'COMMERCIAL WORK','Built for demanding sites.')]:
        d.line((x,890,x+330,890),fill=GOLD,width=3); txt(d,(x,908),head,16,NAVY,True); txt(d,(x,938),sub,14,(83,89,97))
    txt(d,(78,1020),'UNSOLICITED HOMEPAGE CONCEPT · PREPARED BY BONEBRAKE WEB DESIGN',12,(119,125,121),False,1)
    im.resize((760,570),Image.Resampling.LANCZOS).save('chaffee-concept-email.jpg',quality=88,optimize=True)

io(); chaffee()
