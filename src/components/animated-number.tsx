"use client";

import {useEffect,useState} from "react";

type Props={value:number;duration?:number;format?:(value:number)=>string;className?:string};

export function AnimatedNumber({value,duration=700,format=(n)=>Math.round(n).toLocaleString(),className=""}:Props){
 const [display,setDisplay]=useState(0);
 useEffect(()=>{
  const target=Number.isFinite(value)?value:0;
  const start=performance.now();
  let frame=0;
  const tick=(now:number)=>{
   const progress=Math.min(1,(now-start)/duration);
   const eased=1-Math.pow(1-progress,3);
   setDisplay(target*eased);
   if(progress<1)frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[value,duration]);
 return <span className={className}>{format(display)}</span>;
}
