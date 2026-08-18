export function formatMoney(cents, currency = 'CLP'){
  if (cents == null) return '';
  const amount = cents/100;
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(amount);
}
