import type { SupportedLocale, TranslationDictionary, TranslationRepository } from "@/shared/i18n/domain/translation-dictionary";

/** Loads locale dictionaries through the public HTTP boundary. */
export class HttpTranslationRepository implements TranslationRepository {
  async load(locale:SupportedLocale,signal?:AbortSignal):Promise<TranslationDictionary>{
    const response=await fetch(`/i18n/${locale}.json`,{signal,cache:"no-cache"});
    if(!response.ok)throw new Error(`Translation dictionary ${locale} could not be loaded.`);
    return await response.json() as TranslationDictionary;
  }
}
