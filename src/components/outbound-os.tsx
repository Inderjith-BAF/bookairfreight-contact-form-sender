"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { BarChart3, CalendarDays, ChevronDown, CircleHelp, FileSpreadsheet, Gauge, History, LogOut, Mail, Menu, Plus, RefreshCw, Send, Shield, Sparkles, Target, Users, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { OutboundActivity, OutboundProfile, Sequence } from "@/lib/outbound-types";

type Tab="command"|"daily"|"weekly"|"monthly"|"my"|"forms"|"import"|"team";
type Row=Partial<OutboundActivity>&{account:string; subject:string; content:string; email_account_text:string; sequence_id:string; freshness:"fresh"|"recycled"; country:string; positive_entry:string; neutral_entry:string; negative_entry:string};

const today=new Date().toISOString().slice(0,10);
const RESPONSE_OPTIONS=Array.from({length:21},(_,i)=>String(i));
const RESPONSE_PC_OPTIONS=Array.from({length:21},(_,i)=>i>0?String(i)+"pc":null).filter(Boolean) as string[];
const RESPONSE_CHOICES=["0",...RESPONSE_OPTIONS.slice(1),"PC_SEPARATOR",...RESPONSE_PC_OPTIONS];
const COUNTRIES=["US","AU","EU","Saudi","UK","Canada","UAE"];
function sequenceLabel(s:Sequence){const m:Record<string,string>={"Email 1":"Fresh Outreach","Email 2":"Follow-Up 2","Follow-up 1":"Follow-Up 3","Follow-up 2":"Follow-Up 4","Follow-up 3":"Follow-Up 5"};return m[s.name]||s.name}
function allowedSequences(list:Sequence[]){return list.filter(s=>["Fresh Outreach","Follow-Up 2","Follow-Up 3","Follow-Up 4","Follow-Up 5","Email 1","Email 2","Follow-up 1","Follow-up 2","Follow-up 3"].includes(s.name))}
function responseCount(v:string){return n(v.replace(/pc$/,""))}
function isPC(v:string){return /pc$/i.test(v)}
function responseMeta(note:string){try{const x=JSON.parse(note||"{}");return {positive:n(x.positive),neutral:n(x.neutral),negative:n(x.negative)}}catch{return {positive:0,neutral:0,negative:0}}}

const blankRow=():Row=>({account:"",subject:"",content:"",email_account_text:"",outreach_volume:10,open_count:0,open_rate:0,positive_replies:0,neutral_replies:0,negative_replies:0,unsubscribes:0,bounced:0,auto_responses:0,clicks:0,qualified_leads:0,follow_ups:0,bounce_rate:0,channel:"cold_email",activity_date:today,freshness:"fresh",sequence_id:"",country:"",positive_entry:"0",neutral_entry:"0",negative_entry:"0",response_note:""});
