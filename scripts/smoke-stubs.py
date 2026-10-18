import re,os,glob,json
import os.path
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pk={}
for f in glob.glob(root+'/server/src/**/*.ts',recursive=True)+glob.glob(root+'/shared/**/*.ts',recursive=True):
    s=open(f).read()
    for m in re.finditer(r"import\s+(?!type)([^;]*?)\s+from\s+'([^.'][^']*)'",s):
        spec,name=m.group(1),m.group(2)
        if name.startswith('node:'): continue
        e=pk.setdefault(name,set())
        mm=re.search(r'\{([^}]*)\}',spec)
        if mm:
            for n in mm.group(1).split(','):
                n=n.strip().replace('type ','')
                if n: e.add(n.split(' as ')[0].strip())
    for m in re.finditer(r"await import\('([^.'][^']*)'\)",s):
        pk.setdefault(m.group(1),set()).add('InputFile')
P='''const f=function(){return P};const P=new Proxy(f,{get:(t,k)=>k===Symbol.toPrimitive?()=>"":k==="then"?undefined:P,apply:()=>P,construct:()=>P});'''
for name,names in pk.items():
    d=os.path.join(root,'node_modules',name); os.makedirs(d,exist_ok=True)
    src=P+'export default P;\n'+''.join(f'export const {n}=P;\n' for n in sorted(names) if n.isidentifier())
    open(d+'/index.mjs','w').write(src)
    json.dump({"name":name,"type":"module","main":"index.mjs","exports":"./index.mjs"},open(d+'/package.json','w'))
print(sorted(pk))
