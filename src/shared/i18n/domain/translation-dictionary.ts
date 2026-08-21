export type SupportedLocale="es"|"en"|"pt";
export type TranslationDictionary=Record<string,string>;

export interface TranslationRepository {
  load(locale:SupportedLocale,signal?:AbortSignal):Promise<TranslationDictionary>;
}
