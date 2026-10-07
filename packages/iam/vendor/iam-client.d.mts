export function createIAM(options: {issuer:string;clientId:string;clientSecret:string;origin:string;webhookSecret:string;systemId:string;database:string;onIdentity:(identity:unknown)=>Promise<unknown>}): {
 handle(request:Request):Promise<Response>;
 current(request:Request):Promise<{local:unknown;csrf:string}|null>;
 close():void;
};
