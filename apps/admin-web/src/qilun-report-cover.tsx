/** Reuses the approved QiLun mark without recoloring or distorting it.
 * All framing is code-native; no generated substitute logo is introduced. */
export function QilunReportCoverArt(){
 return <svg viewBox="0 0 806 539" role="img" aria-label="齐论品牌元素：红色交织标识与六边形连接线" xmlns="http://www.w3.org/2000/svg">
  <rect width="806" height="539" fill="#fff"/>
  <g fill="none" strokeLinejoin="round">
   <path d="M403 30 613 150V390L403 510 193 390V150Z" stroke="#e9dfdc" strokeWidth="1.5"/>
   <path d="M403 67 581 169V371L403 473 225 371V169Z" stroke="#f0e8e5" strokeWidth="1"/>
   <path d="M193 150 114 106H61M613 150 692 106H745M193 390 114 434H61M613 390 692 434H745" stroke="#e8dddd" strokeWidth="1.5"/>
   <path d="M403 30V4M403 510V535" stroke="#b31217" strokeWidth="2"/>
   <path d="M193 150 269 194M613 390 537 346" stroke="#fd8770" strokeWidth="2"/>
  </g>
  <g fill="#b31217"><circle cx="193" cy="150" r="4"/><circle cx="613" cy="390" r="4"/></g>
  <g fill="#fd8770"><circle cx="613" cy="150" r="3"/><circle cx="193" cy="390" r="3"/></g>
  <g fill="#d8ceca"><circle cx="61" cy="106" r="2.5"/><circle cx="745" cy="106" r="2.5"/><circle cx="61" cy="434" r="2.5"/><circle cx="745" cy="434" r="2.5"/></g>
  <svg x="268" y="112" width="270" height="298" viewBox="0 0 250 276" overflow="hidden">
   <image href="/brand/qilun-logo-light.png" width="790" height="350"/>
  </svg>
  <text x="403" y="434" textAnchor="middle" fill="#969595" fontFamily="Arial,sans-serif" fontSize="15" letterSpacing="6">QILUN AI</text>
 </svg>;
}
