/** Assessment internals are not part of the recruiting HR workflow.
 * IAM maps this role only after checking talent.view + talent.manage.
 * Never trust a role supplied in the request body or query string. */
export function canManageAssessment(role:string):boolean {
 return role==='talent_lead';
}
