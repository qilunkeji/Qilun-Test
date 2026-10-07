/** Decimal HALF_UP at explicit source rounding points, including negative ties. */
export function halfUp(value:number,places=0){
 if(!Number.isFinite(value)||!Number.isInteger(places)||places<0||places>6)throw new Error('INVALID_ROUND_INPUT');
 const [mantissa,exponent='0']=Math.abs(value).toString().split('e');
 const [whole,fraction='']=mantissa.split('.');
 const digits=BigInt(whole+fraction),power=places+Number(exponent)-fraction.length;
 const units=power>=0?digits*10n**BigInt(power):(digits+10n**BigInt(-power)/2n)/10n**BigInt(-power);
 return Number(units)/10**places*(value<0?-1:1);
}
