/** Keep line boundaries and evidence IDs stable. Do not redact salary/role IDs. */
export function redactContacts(text:string){
 return text.replace(/(?<![A-Za-z0-9])\d{17}[\dXx](?![A-Za-z0-9])/g,'[已隐去证件号]')
 .replace(/(?<![A-Za-z0-9])(?:\+?86[- ]?)?1[3-9]\d{9}(?![A-Za-z0-9])/g,'[已隐去手机号]')
 .replace(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/g,'[已隐去邮箱]')
 .replace(/(?:微信(?:号)?|WeChat)\s*[:：]\s*[^\s,，;；]+/gi,'[已隐去微信]');
}
