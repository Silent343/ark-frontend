"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY="teluria.active-project";
const CHANGE_EVENT="teluria:active-project-change";

/** Stores the workspace selection without coupling navigation to Project Management internals. */
export function selectActiveProject(projectId:string){
  if(typeof window==="undefined")return;
  window.localStorage.setItem(STORAGE_KEY,projectId);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:projectId}));
}

/** Resolves the currently selected project and synchronizes direct project routes. */
export function useActiveProject(pathname:string){
  const routeProject=pathname.match(/^\/projects\/([^/]+)\/(?:editor|model|simulation)/)?.[1]??null;
  const storedProject=useSyncExternalStore(
    (notify)=>{window.addEventListener(CHANGE_EVENT,notify);window.addEventListener("storage",notify);return()=>{window.removeEventListener(CHANGE_EVENT,notify);window.removeEventListener("storage",notify);};},
    ()=>window.localStorage.getItem(STORAGE_KEY),
    ()=>null,
  );
  useEffect(()=>{if(routeProject&&storedProject!==routeProject)selectActiveProject(routeProject);},[routeProject,storedProject]);
  return routeProject??storedProject;
}
