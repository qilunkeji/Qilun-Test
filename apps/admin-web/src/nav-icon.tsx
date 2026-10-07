export function NavIcon({id}:{id:string}){
 const paths:Record<string,string>={dashboard:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',talents:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',jobs:'M8 6V3h8v3M3 7h18v14H3zM3 12h18M10 12v3h4v-3',assessments:'M8 5H5v17h14V5h-3M8 3h8v4H8zM8 11h8M8 15h8M8 19h5',ai:'M5 7h14v13H5zM12 3v4M8 12h1M15 12h1M8 16h8M2 11v5M22 11v5',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6'};
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]??paths.dashboard}/></svg>;
}
