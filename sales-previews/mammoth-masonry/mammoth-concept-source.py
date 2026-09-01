from PIL import Image, ImageDraw, ImageFont

W,H=1440,1080
REG='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def f(n,b=False): return ImageFont.truetype(BOLD if b else REG,n)
def crop(path,size):
    im=Image.open(path).convert('RGB'); r=max(size[0]/im.width,size[1]/im.height)
    im=im.resize((round(im.width*r),round(im.height*r)),Image.Resampling.LANCZOS)
    x=(im.width-size[0])//2; y=(im.height-size[1])//2
    return im.crop((x,y,x+size[0],y+size[1]))
def text(d,xy,s,n,c,b=False): d.text(xy,s,font=f(n,b),fill=c)
def btn(d,box,label,fill,fg=(255,255,255)):
    d.rounded_rectangle(box,5,fill=fill); bb=d.textbbox((0,0),label,font=f(14,True))
    d.text(((box[0]+box[2]-bb[2])/2,(box[1]+box[3]-bb[3])/2-2),label,font=f(14,True),fill=fg)

def mammoth():
    ink=(24,25,23); paper=(244,239,229); brick=(148,45,31); sand=(204,175,124); white=(255,255,255)
    im=Image.new('RGB',(W,H),paper); d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,112),fill=ink); text(d,(76,27),'MAMMOTH',30,white,True); text(d,(78,67),'MASONRY CONSTRUCTION',11,sand,True)
    for x,s in [(720,'EXPERTISE'),(850,'PROJECTS'),(980,'ABOUT')]: text(d,(x,49),s,13,white,True)
    btn(d,(1130,28,1364,80),'REQUEST A BID',brick)
    hero=crop('mammoth-hero.jpg',(1440,660)); im.paste(hero,(0,112))
    ov=Image.new('RGBA',(W,660),(0,0,0,0)); od=ImageDraw.Draw(ov); od.rectangle((0,0,810,660),fill=(19,21,19,220)); im.paste(ov,(0,112),ov)
    text(d,(76,168),'NORTH CAROLINA · COMMERCIAL MASONRY',14,sand,True)
    text(d,(76,232),'MASONRY',76,white,True); text(d,(76,312),'THAT CARRIES',76,white,True); text(d,(76,392),'WEIGHT.',76,sand,True)
    text(d,(76,505),'Family-owned craftsmanship for commercial, multifamily,',20,(225,225,220)); text(d,(76,537),'industrial, and residential construction.',20,(225,225,220))
    btn(d,(76,610,302,672),'VIEW PROJECTS',brick); text(d,(342,632),'CALL 704-500-8143',14,white,True)
    d.rectangle((0,772,W,972),fill=paper); text(d,(76,815),'CAPABILITIES',13,brick,True); text(d,(76,851),'Built for demanding projects.',34,ink,True)
    for x,h,s in [(76,'COMMERCIAL','Schools · offices · facilities'),(500,'MULTIFAMILY','Apartments · condos · townhomes'),(970,'SPECIAL PROJECTS','Restoration · custom masonry')]:
        d.line((x,916,x+330,916),fill=sand,width=3); text(d,(x,932),h,16,ink,True); text(d,(x,960),s,13,(88,86,80))
    text(d,(76,1023),'UNSOLICITED HOMEPAGE CONCEPT · BONEBRAKE WEB DESIGN',12,(115,111,103))
    im.resize((760,570),Image.Resampling.LANCZOS).save('mammoth-concept-email.jpg',quality=89,optimize=True)

def santi():
    ink=(28,31,32); paper=(246,243,235); gold=(226,171,16); bronze=(151,119,38); white=(255,255,255)
    im=Image.new('RGB',(W,H),paper); d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,112),fill=ink); text(d,(76,24),'SANTI',36,gold,True); text(d,(78,67),'CONSTRUCTION + DESIGN',11,white,True)
    for x,s in [(725,'SERVICES'),(850,'GALLERY'),(965,'OUR TEAM')]: text(d,(x,49),s,13,white,True)
    btn(d,(1120,28,1364,80),'REQUEST AN ESTIMATE',gold,ink)
    hero=crop('santi-hero.jpg',(670,632)); im.paste(hero,(770,112))
    d.rectangle((0,112,770,744),fill=ink)
    text(d,(76,171),'LAKE VILLA, ILLINOIS · SINCE 1985',14,gold,True)
    text(d,(76,238),'40 YEARS OF',68,white,True); text(d,(76,314),'BUILDING',68,white,True); text(d,(76,390),'RELATIONSHIPS.',68,gold,True)
    text(d,(76,498),'Family-owned design and construction for homes,',20,(224,226,225)); text(d,(76,530),'remodels, additions, and commercial projects.',20,(224,226,225))
    btn(d,(76,608,294,670),'EXPLORE OUR WORK',gold,ink); text(d,(336,630),'847-223-2740',14,white,True)
    d.rectangle((0,744,W,972),fill=paper); text(d,(76,790),'ONE TEAM · START TO FINISH',13,bronze,True); text(d,(76,830),'Design. Build. Take care of every detail.',33,ink,True)
    for x,h,s in [(76,'CONSTRUCTION','Foundation through custom finishes'),(500,'DESIGN','Ideas shaped into a clear plan'),(970,'SERVICE','Communication built on relationships')]:
        d.line((x,908,x+330,908),fill=gold,width=3); text(d,(x,924),h,16,ink,True); text(d,(x,953),s,13,(88,86,80))
    text(d,(76,1023),'UNSOLICITED HOMEPAGE CONCEPT · BONEBRAKE WEB DESIGN',12,(115,111,103))
    im.resize((760,570),Image.Resampling.LANCZOS).save('santi-concept-email.jpg',quality=89,optimize=True)

mammoth(); santi()
