/** Build a mailto URL that opens a BCC draft without exposing recipients. */
export function buildTicketBuyerEmailDraft(emails: string[]): string | null {
  const uniqueEmails = [...new Set(emails.map((email) => email.trim()).filter(Boolean))];
  if (uniqueEmails.length === 0) return null;

  const query = new URLSearchParams({ bcc: uniqueEmails.join(",") });
  return `mailto:?${query.toString()}`;
}
