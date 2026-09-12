import type { SupportedLocale, TranslationDictionary, TranslationRepository } from "@/shared/i18n/domain/translation-dictionary";

/** Loads locale dictionaries through the public HTTP boundary. */
export class HttpTranslationRepository implements TranslationRepository {
  async load(locale:SupportedLocale,signal?:AbortSignal):Promise<TranslationDictionary>{
    const response=await fetch(`/i18n/${locale}.json`,{signal,cache:"no-cache"});
    if(!response.ok)throw new Error(`Translation dictionary ${locale} could not be loaded.`);
    const workspaceResponse=await fetch(`/i18n/workspace/${locale}.json`,{signal,cache:"no-cache"});
    if(!workspaceResponse.ok)throw new Error(`Workspace translations ${locale} could not be loaded.`);
    const collaborationResponse=await fetch(`/i18n/collaboration/${locale}.json`,{signal,cache:"no-cache"});
    if(!collaborationResponse.ok)throw new Error("Collaboration translations could not be loaded.");
    return {...await response.json(),...await workspaceResponse.json(),...await collaborationResponse.json()} as TranslationDictionary;
  }
}
