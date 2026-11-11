"use client";
import {useEffect} from "react";
import {useAction} from "convex/react";
import {api} from "../../convex/_generated/api";

// Idempotently refreshes permission definitions for the designated preview administrator.
export default function EnsureCentralAdminBootstrap(){
 const bootstrap=useAction(api.bootstrapAction.bootstrapFirstCentralAdmin);
 useEffect(()=>{void bootstrap({}).catch(()=>undefined);},[bootstrap]);
 return null;
}
