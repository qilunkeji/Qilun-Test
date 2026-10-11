/** Explicit, guarded single-process hosting; local defaults stay unchanged. */
export function deploymentConfig(env:NodeJS.ProcessEnv){
 const production=env.NODE_ENV==='production';
 const port=Number(env.PORT??3100),host=env.LISTEN_HOST??'127.0.0.1',origin=env.PUBLIC_ORIGIN??`http://127.0.0.1:${port}`;
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid application port');
  if(production){
  const url=new URL(origin);
  const dataBackend=env.DATABASE_URL?.startsWith('postgres')||env.DATA_DIR?.startsWith('/');
  if(env.SINGLE_INSTANCE_HTTPS!=='1'||host!=='127.0.0.1'||url.protocol!=='https:'||url.origin!==origin||url.hostname==='localhost'||url.hostname==='127.0.0.1'||env.H5_ORIGIN!==origin||!dataBackend)throw new Error('Production requires explicit single-instance HTTPS, loopback upstream, identical public/H5 origins and either a PostgreSQL URL or an absolute dedicated data directory');
 }
 return {production,port,host,origin};
}
