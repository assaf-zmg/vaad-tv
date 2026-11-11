import json,re,html,sys
S=sys.argv[1]
F=json.load(open(S+'/news-filter.json'))
PREF='ובלמהשכ'
def norm(t): return t.replace('״','"').replace('׳',"'").replace('–',' ').replace('—',' ')
def tokens(t):
    out=[]
    for w in re.split(r'[\s,.:;!?()\[\]/\-]+',norm(t)):
        w=w.lstrip('"\'').rstrip('"')  # strip outer quotes; keep inner gershayim (צה"ל) and a trailing geresh (סמוטריץ')
        if not w: continue
        # Strip only valid Hebrew prefix sequences, in order: ו? (ש|כש|מש)? [בכלמ]? ה?
        # e.g. "והמחבלים" -> "מחבלים", but "הכירו" -> "כירו" only (never "ירו").
        c=[w]
        m=re.match(r'^(ו)?(ש|כש|מש)?([בכלמ])?(ה)?',w)
        parts=[g for g in m.groups() if g] if m else []
        x=w
        for g in parts:
            if len(x)-len(g)>=2 and x.startswith(g): x=x[len(g):]; c.append(x)
            else: break
        out.append(c)
    return out
def hit(title, L):
    t=norm(title)
    for p in L.get('phrases',[]):
        if p in t: return 'phrase:'+p
    for cands in tokens(title):
        for c in cands:
            if c in L.get('words',[]): return 'word:'+c
            for s in L.get('stems',[]):
                if len(s)<=2:
                    if c==s: return 'stem='+s
                elif c.startswith(s): return 'stem:'+s
    return None
keep=[];drop=[]
for f in F['feeds']:
    s=open(f"{S}/feed_{f['id']}.xml",encoding='utf-8').read()
    for it in re.findall(r'<item>(.*?)</item>',s,re.S)[:30]:
        t=re.search(r'<title>(.*?)</title>',it,re.S).group(1)
        t=html.unescape(re.sub(r'<!\[CDATA\[|\]\]>','',t)).strip()
        b=hit(t,F['block'])
        if b: drop.append((f['name'],b,t)); continue
        p=hit(t,F['prefer'])
        if not f['soft'] and not p: drop.append((f['name'],'main-no-prefer',t)); continue
        keep.append((f['name'],p or '',t))
print('KEEP',len(keep),'DROP',len(drop))
for k in keep: print('  +',k[0],'|',k[1],'|',k[2])
if '-d' in sys.argv:
    for d in drop: print('  -',d[0],'|',d[1],'|',d[2])
