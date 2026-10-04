// Minimal renderer for the .dc.html design component: evaluates renderVals() and expands holes.
const fs=require('fs');
const [,, file, out, stateJson] = process.argv;
const src=fs.readFileSync(file,'utf8');
const body=src.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1].replace(/<\/?helmet>/g,'');
const script=src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic{constructor(p,s){this.props=p;this.state=s}setState(){}}
const Component=eval(script+';Component');
const vals=new Component({accent:'#FF2B2B'},JSON.parse(stateJson||'{}')).renderVals();
function get(ctx,path){return path.split('.').reduce((o,k)=>o==null?o:o[k],ctx)}
function expand(html,ctx){
  // innermost-first: loop until no sc-for/sc-if remain
  for(let i=0;i<50;i++){
    const before=html;
    html=html.replace(/<sc-for list="\{\{([\w.]+)\}\}" as="(\w+)"[^>]*>((?:(?!<sc-for)[\s\S])*?)<\/sc-for>/g,(m,list,as,inner)=>{
      const arr=get(ctx,list)||[];return arr.map(item=>expand(inner,{...ctx,[as]:item})).join('')});
    html=html.replace(/<sc-if value="\{\{([\w.]+)\}\}"[^>]*>((?:(?!<sc-if)[\s\S])*?)<\/sc-if>/g,(m,path,inner)=>get(ctx,path)?inner:'');
    if(html===before)break;
  }
  return html.replace(/\{\{([\w.]+)\}\}/g,(m,path)=>{const v=get(ctx,path);return v==null||typeof v==='function'?'':String(v)});
}
fs.writeFileSync(out,`<!doctype html><html><head><meta charset="utf-8">${expand(body,vals)}</body></html>`.replace(/ on[A-Z]\w+="[^"]*"/g,''));
