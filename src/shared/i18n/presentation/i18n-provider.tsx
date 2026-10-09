"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SupportedLocale, TranslationDictionary } from "@/shared/i18n/domain/translation-dictionary";
import { HttpTranslationRepository } from "@/shared/i18n/infrastructure/http-translation-repository";

interface I18nContextValue { locale:SupportedLocale; loading:boolean; t:(key:string,fallback?:string)=>string; }
const I18nContext=createContext<I18nContextValue|null>(null);
const repository=new HttpTranslationRepository();

function normalizeLocale(value?:string):SupportedLocale{if(value?.toLowerCase().startsWith("en"))return"en";if(value?.toLowerCase().startsWith("pt"))return"pt";return"es";}
function subscribeLocale(notify:()=>void){window.addEventListener("ark:preferences-changed",notify);return()=>window.removeEventListener("ark:preferences-changed",notify);}
function getLocaleSnapshot(){return normalizeLocale(document.documentElement.dataset.locale??document.documentElement.lang);}

/** Injects HTTP-loaded translations and reacts to persisted preference changes. */
export function I18nProvider({children}:{children:ReactNode}){
  const locale=useSyncExternalStore(subscribeLocale,getLocaleSnapshot,()=>"es" as const);
  const [loaded,setLoaded]=useState<{locale:SupportedLocale|null;dictionary:TranslationDictionary}>({locale:null,dictionary:{}});
  useEffect(()=>{const controller=new AbortController();void repository.load(locale,controller.signal).then((dictionary)=>setLoaded({locale,dictionary})).catch((error:unknown)=>{if((error as Error).name!=="AbortError")setLoaded({locale,dictionary:{}});});return()=>controller.abort();},[locale]);
  const dictionary=useMemo(()=>loaded.locale===locale?loaded.dictionary:{},[loaded,locale]);const loading=loaded.locale!==locale;
  const t=useCallback((key:string,fallback?:string)=>dictionary[key]??fallback??key,[dictionary]);
  const value=useMemo(()=>({locale,loading,t}),[locale,loading,t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){const context=useContext(I18nContext);if(!context)throw new Error("useI18n must be used inside I18nProvider.");return context;}
