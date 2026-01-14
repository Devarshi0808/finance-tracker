export function dollarsToCents(amount: number) {
  // Convert float dollars to integer cents safely.
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

