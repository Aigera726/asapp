const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,deps,window){const m={exports:{}};new Function('require','module','exports','window',ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>{if(!(n in deps))throw Error('Unmocked '+n);return deps[n];},m,m.exports,window);return m.exports;}
function fixture({granted=true,platform='ios',selection={canceled:false,assets:[{uri:'file:///gallery.heic',width:4000,height:3000}]},prepare=async a=>'jpeg:'+a.uri}={}){
 let cursor=0,value='previous-photo',pickerCalls=0;const hooks=[],notices=[];
 const jsx=(type,props)=>({type,props});const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=initial;return [hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},useRef(initial){const i=cursor++;return hooks[i]||=( {current:initial} );},useEffect(){cursor++;}};
 const rn={StyleSheet:{create:x=>x,absoluteFill:{position:'absolute',top:0,bottom:0,left:0,right:0}},Platform:{OS:platform},Keyboard:{dismiss(){}}};
 for(const type of ['View','Text','Image','Modal','TouchableOpacity','ActivityIndicator'])rn[type]=type;
 const component=load('src/components/ReportPhotoInput.tsx',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':rn,'expo-camera':{CameraView:'CameraView',useCameraPermissions:()=>[{granted},async()=>({granted})]},
  'expo-image-picker':{launchImageLibraryAsync:async opts=>{pickerCalls++;assert.deepEqual(opts.mediaTypes,['images']);return typeof selection==='function'?selection():selection;}},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:54,bottom:34})},'@/i18n':{useTranslation:()=>({t:k=>k})},
  '@/lib/alert':{notify:(...args)=>notices.push(args)},'@/lib/report-image':{prepareReportImage:prepare},'./Icon':{Icon:'Icon'},'@/theme/ecopro':{ECO:{}}
 },{isSecureContext:false}).default;
 const render=()=>{cursor=0;return component({value,onChange:v=>{value=v;}});};
 function nodes(tree){const out=[];const walk=(node,parent)=>{if(!node||typeof node!=='object')return;out.push({node,parent});const c=node.props?.children;for(const child of Array.isArray(c)?c:[c])walk(child,node);};walk(tree,null);return out;}
 const byId=(tree,id)=>nodes(tree).find(x=>x.node.props?.testID===id)?.node;
 const byType=(tree,type)=>nodes(tree).find(x=>x.node.type===type)?.node;
 return {render,nodes,byId,byType,notices,value:()=>value,pickerCalls:()=>pickerCalls};
}
test('camera capture has a visible labelled sibling footer, respects safe area and waits for readiness',async()=>{
 const f=fixture();await f.byId(f.render(),'report-camera').props.onPress();let tree=f.render();assert.equal(f.byType(tree,'Modal').props.visible,true);
 const camera=f.byType(tree,'CameraView');assert.equal(camera.props.children,undefined);assert.equal(f.byId(tree,'capture-photo').props.disabled,true);
 camera.props.ref.current={takePictureAsync:async()=>({uri:'file:///camera.jpg',width:3000,height:4000})};camera.props.onCameraReady();tree=f.render();const capture=f.byId(tree,'capture-photo');assert.equal(capture.props.disabled,false);
 const footer=f.nodes(tree).find(n=>n.node===capture).parent;assert.equal(footer.type,'View');assert(footer.props.style.some(s=>s.paddingBottom===34));assert(capture.props.children.some(n=>n?.props?.children==='report.capture'));
 await capture.props.onPress();assert.equal(f.value(),'jpeg:file:///camera.jpg');assert.equal(f.byType(f.render(),'Modal').props.visible,false);
});
test('gallery selects a photo without camera permission and replaces it only after JPEG preparation',async()=>{
 const f=fixture({granted:false});await f.byId(f.render(),'report-gallery').props.onPress();assert.equal(f.value(),'jpeg:file:///gallery.heic');assert.equal(f.pickerCalls(),1);assert.equal(f.notices.length,0);
});
test('gallery cancellation preserves the attached photo',async()=>{
 const f=fixture({selection:{canceled:true,assets:null}});await f.byId(f.render(),'report-gallery').props.onPress();assert.equal(f.value(),'previous-photo');assert.equal(f.notices.length,0);
});
test('an unreadable gallery image shows a friendly error and preserves the previous photo',async()=>{
 const f=fixture({prepare:async()=>{throw Error('decoder failed');}});await f.byId(f.render(),'report-gallery').props.onPress();assert.equal(f.value(),'previous-photo');assert.deepEqual(f.notices,[['common.error','photo.galleryError']]);
});
test('camera denial and mount failure offer gallery fallback without throwing',async()=>{
 const denied=fixture({granted:false});await denied.byId(denied.render(),'report-camera').props.onPress();assert.equal(denied.byType(denied.render(),'Modal').props.visible,false);assert.equal(denied.notices[0][0],'report.noCameraTitle');
 const f=fixture();await f.byId(f.render(),'report-camera').props.onPress();f.byType(f.render(),'CameraView').props.onMountError({message:'native failure'});const tree=f.render();assert.equal(f.byType(tree,'CameraView'),undefined);assert.equal(f.byId(tree,'capture-photo').props.disabled,true);assert(f.nodes(tree).some(n=>n.node.props?.children==='photo.cameraUnavailable'));
});
test('HTTP browser camera shows instructions while gallery attachment still works',async()=>{
 const f=fixture({platform:'web'});await f.byId(f.render(),'report-camera').props.onPress();assert.equal(f.notices[0][1],'photo.secureCamera');await f.byId(f.render(),'report-gallery').props.onPress();assert.equal(f.value(),'jpeg:file:///gallery.heic');
});
test('rapid gallery taps launch only one system picker',async()=>{
 let release;const gate=new Promise(ok=>{release=ok;});const f=fixture({selection:()=>gate});const click=f.byId(f.render(),'report-gallery').props.onPress;const one=click(),two=click();assert.equal(f.pickerCalls(),1);release({canceled:true});await Promise.all([one,two]);
});

test('gallery PNG/HEIC and camera inputs become JPEG with bounded size and native references are released',async()=>{
 for(const [uri,width,height,size]of [['file:///photo.heic',6000,4000,{width:2048}],['file:///photo.png',3000,5000,{height:2048}],['file:///photo.jpg',640,480,null]]){
  const calls=[];let released=0;const prepare=load('src/lib/report-image.ts',{'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate:u=>{assert.equal(u,uri);return {resize:s=>calls.push(s),renderAsync:async()=>({saveAsync:async opts=>{assert.equal(opts.format,'jpeg');assert.equal(opts.compress,0.8);return {uri:'normalized.jpg'};},release(){released++;}}),release(){released++;}};}}}}).prepareReportImage;
  assert.equal(await prepare({uri,width,height}),'normalized.jpg');assert.deepEqual(calls,size?[size]:[]);assert.equal(released,2);
 }
});
test('image conversion failure releases the context instead of returning a false successful photo',async()=>{
 let released=false;const prepare=load('src/lib/report-image.ts',{'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},ImageManipulator:{manipulate:()=>({renderAsync:async()=>{throw Error('unsupported image');},release(){released=true;}})}}}).prepareReportImage;
 await assert.rejects(prepare({uri:'bad.heic',width:10,height:10}),/unsupported image/);assert(released);
});
